// Small Firestore REST adapter for the subset used by the CP3 handlers.
export function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  throw new TypeError('Unsupported Firestore value');
}

export function decodeValue(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  throw new TypeError('Unsupported Firestore response value');
}

const encodeFields = data => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encodeValue(value)]));
const decodeFields = fields => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
// Firestore's REST path parser treats colons inside document IDs as data.
const encodePath = path => path.split('/').map(part => encodeURIComponent(part).replace(/%3A/gi, ':')).join('/');

export class FirestoreError extends Error {
  constructor(status, code, detail) { super(`Firestore request failed (${status} ${code || ''}): ${detail || ''}`); this.status = status; this.code = code; }
}

class DocumentSnapshot {
  constructor(ref, document) { this.ref = ref; this.id = ref.id; this.exists = Boolean(document); this.value = document ? decodeFields(document.fields) : undefined; }
  data() { return this.value; }
}

class DocumentReference {
  constructor(db, path) {
    const parts = path.split('/');
    if (parts.length % 2 || parts.some(part => !part || part === '.' || part === '..')) throw new TypeError('Invalid document path');
    this.db = db; this.path = path; this.id = parts.at(-1);
  }
  collection(name) { return new CollectionReference(this.db, `${this.path}/${name}`); }
  get() { return this.db.readDocument(this); }
  create(data) { return this.db.commit([{ update: { name: this.db.name(this.path), fields: encodeFields(data) }, currentDocument: { exists: false } }]); }
}

class CollectionReference {
  constructor(db, path, filters = [], ordering = [], maximum = null, cursor = null) {
    const parts = path.split('/');
    if (parts.length % 2 !== 1 || parts.some(part => !part || part === '.' || part === '..')) throw new TypeError('Invalid collection path');
    this.db = db; this.path = path; this.filters = filters; this.ordering = ordering; this.maximum = maximum; this.cursor = cursor;
  }
  doc(id) { return new DocumentReference(this.db, `${this.path}/${id}`); }
  next(options) { return new CollectionReference(this.db, this.path, options.filters ?? this.filters, options.ordering ?? this.ordering, options.maximum ?? this.maximum, options.cursor ?? this.cursor); }
  where(field, operator, value) {
    if (operator !== '==') throw new TypeError('Unsupported query operator');
    return this.next({ filters: [...this.filters, { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeValue(value) } }] });
  }
  orderBy(field, direction = 'asc') { return this.next({ ordering: [...this.ordering, { field: { fieldPath: field }, direction: direction === 'desc' ? 'DESCENDING' : 'ASCENDING' }] }); }
  limit(maximum) { if (!Number.isInteger(maximum) || maximum < 1 || maximum > 200) throw new TypeError('Invalid query limit'); return this.next({ maximum }); }
  startAfter(score, id) { return this.next({ cursor: { score, id } }); }
  startAfterToken(token) { return this.next({ cursor: { token } }); }
  get() { return this.db.runQuery(this); }
}

class Transaction {
  constructor(db, id) { this.db = db; this.id = id; this.writes = []; this.pending = []; this.flushScheduled = false; }
  get(ref) {
    if (ref instanceof CollectionReference) return this.db.runQuery(ref, this.id);
    return new Promise((resolve, reject) => {
      this.pending.push({ ref, resolve, reject });
      if (!this.flushScheduled) { this.flushScheduled = true; queueMicrotask(() => this.flush()); }
    });
  }
  async flush() {
    const pending = this.pending.splice(0); this.flushScheduled = false;
    if (!pending.length) return;
    try {
      const documents = pending.map(item => this.db.name(item.ref.path));
      const rows = await this.db.request(`${this.db.base}:batchGet`, { method: 'POST', body: { documents, transaction: this.id } });
      const found = new Map(rows.filter(row => row.found).map(row => [row.found.name, row.found]));
      for (const item of pending) item.resolve(new DocumentSnapshot(item.ref, found.get(this.db.name(item.ref.path))));
    } catch (error) { for (const item of pending) item.reject(error); }
  }
  create(ref, data) { this.writes.push({ update: { name: this.db.name(ref.path), fields: encodeFields(data) }, currentDocument: { exists: false } }); }
  set(ref, data) { this.writes.push({ update: { name: this.db.name(ref.path), fields: encodeFields(data) } }); }
  update(ref, data) { this.writes.push({ update: { name: this.db.name(ref.path), fields: encodeFields(data) }, updateMask: { fieldPaths: Object.keys(data) }, currentDocument: { exists: true } }); }
  delete(ref) { this.writes.push({ delete: this.db.name(ref.path) }); }
}

export class FirestoreRest {
  constructor(projectId, accessToken, fetcher = fetch, endpoint = 'https://firestore.googleapis.com/v1') {
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new TypeError('Invalid Firebase project ID');
    this.projectId = projectId; this.accessToken = accessToken;
    // Workers' native fetch rejects invocation with a REST adapter as `this`.
    this.fetcher = (url, options) => fetcher(url, options);
    this.base = `${endpoint}/projects/${projectId}/databases/(default)/documents`;
    this.database = `projects/${projectId}/databases/(default)`;
  }
  name(path) { return `${this.database}/documents/${path}`; }
  doc(path) { return new DocumentReference(this, path); }
  collection(path) { return new CollectionReference(this, path); }
  async getAll(...refs) {
    const rows = await this.request(`${this.base}:batchGet`, { method: 'POST', body: { documents: refs.map(ref => this.name(ref.path)) } });
    const found = new Map(rows.filter(row => row.found).map(row => [row.found.name, row.found]));
    return refs.map(ref => new DocumentSnapshot(ref, found.get(this.name(ref.path))));
  }
  async request(url, { method = 'GET', body } = {}) {
    const response = await this.fetcher(url, { method, headers: { authorization: `Bearer ${this.accessToken}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok) {
      let code, detail;
      try { const parsed = (await response.json()).error; code = parsed?.status; detail = parsed?.message; } catch { /* no response details */ }
      throw new FirestoreError(response.status, code, detail);
    }
    return response.json();
  }
  async readDocument(ref, transaction) {
    const query = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
    const document = await this.request(`${this.base}/${encodePath(ref.path)}${query}`);
    return new DocumentSnapshot(ref, document);
  }
  async runQuery(ref, transaction) {
    const segments = ref.path.split('/'), collectionId = segments.pop();
    const parent = segments.length ? `/${encodePath(segments.join('/'))}` : '';
    if (collectionId === 'entries' && !ref.filters.length) {
      const params = new URLSearchParams({ pageSize: String(ref.maximum || 50) });
      if (ref.ordering.length) params.set('orderBy', ref.ordering.map(order => `${order.field.fieldPath} ${order.direction === 'DESCENDING' ? 'desc' : 'asc'}`).join(', '));
      if (ref.cursor?.token) params.set('pageToken', ref.cursor.token);
      if (transaction) params.set('transaction', transaction);
      const query = [...params].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
      const page = await this.request(`${this.base}/${encodePath(ref.path)}?${query}`);
      const docs = (page.documents || []).map(document => new DocumentSnapshot(ref.doc(document.name.split('/').at(-1)), document));
      return { docs, size: docs.length, empty: !docs.length, nextPageToken: page.nextPageToken || null };
    }
    const structuredQuery = { from: [{ collectionId }] };
    if (ref.filters.length === 1) structuredQuery.where = ref.filters[0];
    else if (ref.filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters: ref.filters } };
    if (ref.ordering.length) structuredQuery.orderBy = ref.ordering;
    if (ref.maximum) structuredQuery.limit = ref.maximum;
    if (ref.cursor) structuredQuery.startAt = { before: false, values: [encodeValue(ref.cursor.score), { referenceValue: this.name(`${ref.path}/${ref.cursor.id}`) }] };
    const rows = await this.request(`${this.base}${parent}:runQuery`, { method: 'POST', body: { structuredQuery, ...(transaction ? { transaction } : {}) } });
    const docs = rows.filter(row => row.document).map(row => {
      const id = row.document.name.split('/').at(-1);
      return new DocumentSnapshot(ref.doc(id), row.document);
    });
    return { docs, size: docs.length, empty: !docs.length };
  }
  commit(writes, transaction) { return this.request(`${this.base}:commit`, { method: 'POST', body: { writes, ...(transaction ? { transaction } : {}) } }); }
  async runTransaction(callback) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const start = await this.request(`${this.base}:beginTransaction`, { method: 'POST', body: { options: { readWrite: {} } } });
      const tx = new Transaction(this, start.transaction);
      try {
        const result = await callback(tx);
        await tx.flush();
        await this.commit(tx.writes, tx.id);
        return result;
      } catch (error) {
        await this.request(`${this.base}:rollback`, { method: 'POST', body: { transaction: tx.id } }).catch(() => {});
        if (error instanceof FirestoreError && error.code === 'ABORTED' && attempt < 4) continue;
        throw error;
      }
    }
    throw new FirestoreError(409, 'ABORTED');
  }
}
