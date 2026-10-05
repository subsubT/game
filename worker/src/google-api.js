import { ApiError } from './error.js';
export const GOOGLE_SCOPES = Object.freeze(['openid', 'https://www.googleapis.com/auth/drive.file']);
export const CALLBACK_PATH = '/oauth/google/callback';
export const START_PATH = '/oauth/google/start';
export const TABS = Object.freeze(['안내', '학생요약', '회차', '문항']);

export class GoogleApi {
  constructor(env, fetcher = fetch) { this.env = env; this.fetcher = fetcher; }
  async token(params) {
    let response;
    try {
      response = await this.fetcher('https://oauth2.googleapis.com/token', {
        method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: this.env.GOOGLE_CLIENT_ID, client_secret: this.env.GOOGLE_CLIENT_SECRET, ...params })
      });
    } catch { throw new ApiError('GOOGLE_UNAVAILABLE', undefined, 503); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(['invalid_grant', 'invalid_token'].includes(data.error) ? 'REAUTH_REQUIRED' : 'GOOGLE_UNAVAILABLE', undefined, 503);
    if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new ApiError('GOOGLE_UNAVAILABLE', undefined, 503);
    return data;
  }
  exchange(code, verifier) { return this.token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: this.env.GOOGLE_REDIRECT_URI }); }
  refresh(refreshToken) { return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken }); }
  async revoke(token) {
    try {
      const response = await this.fetcher('https://oauth2.googleapis.com/revoke', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
      return response.ok || response.status === 400;
    } catch { return false; }
  }
  async request(path, token, method = 'GET', body) {
    let response;
    const url = path.startsWith('sheets/v4/') ? `https://sheets.googleapis.com/v4/${path.slice('sheets/v4/'.length)}` : `https://www.googleapis.com/${path}`;
    try { response = await this.fetcher(url, { method, signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new ApiError('GOOGLE_UNAVAILABLE', undefined, 503); }
    if (response.status === 401) throw new ApiError('REAUTH_REQUIRED');
    if (response.status === 403) throw new ApiError('GOOGLE_ACCESS_DENIED');
    if (response.status === 404) throw new ApiError('SHEET_UNAVAILABLE');
    if (!response.ok) throw new ApiError('GOOGLE_UNAVAILABLE', undefined, 503);
    return response.json();
  }
  async find(exportId, token) {
    // exportId is a hex digest, never a user-controlled Drive query string.
    const params = new URLSearchParams({ q: `trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet' and appProperties has { key='math3ExportId' and value='${exportId}' }`, fields: 'files(id,createdTime),nextPageToken', pageSize: '100', orderBy: 'createdTime' });
    const result = await this.request(`drive/v3/files?${params}`, token);
    if (result.nextPageToken || result.files?.length > 1) throw new ApiError('SHEET_DUPLICATES');
    return result.files?.[0]?.id || null;
  }
  async create(exportId, title, token) {
    const file = await this.request('drive/v3/files?fields=id', token, 'POST', { name: title, mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { math3ExportId: exportId, math3ExportVersion: '1' } });
    return file.id;
  }
  async write(id, tables, token) {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new ApiError('SHEET_UNAVAILABLE');
    const sheet = await this.request(`sheets/v4/spreadsheets/${id}?fields=sheets.properties`, token);
    const existing = sheet.sheets || [], used = new Set(existing.map(s => s.properties.sheetId));
    const requests = [];
    for (let i = 0; i < TABS.length; i++) {
      const title = TABS[i], found = existing.find(s => s.properties.title === title);
      let sheetId = found?.properties.sheetId;
      if (sheetId === undefined) { sheetId = i + 100; while (used.has(sheetId)) sheetId++; used.add(sheetId); requests.push({ addSheet: { properties: { sheetId, title } } }); }
      const values = tables[title], rowCount = Math.max(1000, values.length), columnCount = Math.max(26, ...values.map(r => r.length));
      requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount, columnCount, frozenRowCount: 1 } }, fields: 'gridProperties' } });
      requests.push({ repeatCell: { range: { sheetId }, cell: {}, fields: 'userEnteredValue' } });
      // Typed stringValue is literal (the batchUpdate equivalent of RAW). One atomic
      // batch clears stale rows and replaces all app tabs; it never uses formulaValue.
      requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: values.map(row => ({ values: row.map(value => ({ userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: String(value ?? '') } })) })), fields: 'userEnteredValue' } });
    }
    await this.request(`sheets/v4/spreadsheets/${id}:batchUpdate`, token, 'POST', { requests });
  }
}
