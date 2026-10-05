import { ApiError } from './error.js';
import { verifyFirebaseIdToken, parseServiceAccount, getFirestoreAccessToken } from './auth.js';
import { FirestoreRest } from './firestore-rest.js';
import { createHandlers, handlerNames } from './generated-handlers.js';
import { createSheetService, sheetHandlerNames } from './sheets.js';
import { START_PATH, CALLBACK_PATH } from './google-api.js';

const noStore = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' };
const body = (value, status, headers = {}) => new Response(JSON.stringify(value), { status, headers: { ...noStore, ...headers } });
async function readBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 16384 || !request.body) throw new ApiError('INVALID_REQUEST');
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel().catch(() => {}); throw new ApiError('INVALID_REQUEST'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ApiError('INVALID_REQUEST'); }
}

export async function handleRequest(request, env, dependencies = {}) {
  const requestUrl = new URL(request.url);
  // Navigation callbacks have no Firebase bearer token; the consumed state and
  // top-level HttpOnly cookie identify the initiating, still-active teacher.
  if (request.method === 'GET' && [START_PATH, CALLBACK_PATH].includes(requestUrl.pathname)) {
    try {
      if (requestUrl.origin !== new URL(env.GOOGLE_REDIRECT_URI).origin) throw new ApiError('FORBIDDEN');
      const db = await database(env, dependencies);
      const service = createSheetService(db, env, dependencies);
      return await (requestUrl.pathname === START_PATH ? service.start(request) : service.callback(request));
    } catch(error) {
      return body({ error: { code: error instanceof ApiError ? error.code : 'OAUTH_FAILED' } }, error instanceof ApiError ? error.status : 400, { 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'" });
    }
  }
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
  const cors = origin && allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
  if (origin && !allowed.includes(origin)) return body({ error: { code: 'FORBIDDEN', message: 'Origin is not allowed' } }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-max-age': '600', 'cache-control': 'no-store' } });
  const path = new URL(request.url).pathname;
  if (request.method !== 'POST' || !/^\/api\/[A-Za-z]+$/.test(path)) return body({ error: { code: 'NOT_FOUND' } }, 404, cors);
  if (!env.FIREBASE_PROJECT_ID || !env.MATH3_SERVER_SECRET || !env.FIREBASE_SERVICE_ACCOUNT_JSON || !allowed.length || env.FIREBASE_PROJECT_ID.startsWith('REPLACE_') || allowed.some(item => item.startsWith('REPLACE_'))) return body({ error: { code: 'NOT_CONFIGURED' } }, 503, cors);
  let stage = 'request';
  const metrics = { cert: 0, oauth: 0, firestore: 0, other: 0 };
  const recordMetrics = () => { if (!dependencies.database && !dependencies.verifyToken) console.log('Worker subrequests', { operation: path.slice(5), ...metrics }); };
  try {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError('INVALID_REQUEST');
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer [^\s]+$/.test(authorization)) throw new ApiError('AUTH_REQUIRED');
    const upstream = dependencies.fetcher || fetch;
    const fetcher = (url, options) => {
      const host = new URL(url).hostname;
      if (host === 'www.googleapis.com') metrics.cert++;
      else if (host === 'oauth2.googleapis.com') metrics.oauth++;
      else if (host === 'firestore.googleapis.com') metrics.firestore++;
      else metrics.other++;
      return upstream(url, options);
    };
    const verifyToken = dependencies.verifyToken || verifyFirebaseIdToken;
    stage = 'firebase-id-token';
    const verified = await verifyToken(authorization.slice(7), env.FIREBASE_PROJECT_ID, fetcher, true);
    const uid = typeof verified === 'string' ? verified : verified.sub;
    const payload = await readBody(request);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => key !== 'data')) throw new ApiError('INVALID_REQUEST');
    const name = path.slice(5);
    if (!handlerNames.includes(name) && !sheetHandlerNames.includes(name)) throw new ApiError('NOT_FOUND');
    let db = dependencies.database;
    if (!db) {
      stage = 'service-account-config';
      const account = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON, env.FIREBASE_PROJECT_ID);
      stage = 'service-account-oauth';
      const token = await getFirestoreAccessToken(account, fetcher);
      db = new FirestoreRest(env.FIREBASE_PROJECT_ID, token, fetcher);
    }
    stage = 'firestore-handler';
    const handlers = { ...createHandlers(db, env.MATH3_SERVER_SECRET), ...createSheetService(db, env, { ...dependencies, fetcher }).handlers };
    const handler = handlers[name];
    const result = await handler(payload.data, uid, typeof verified === 'object' ? verified : {});
    recordMetrics();
    return body({ result }, 200, cors);
  } catch (error) {
    recordMetrics();
    if (error instanceof ApiError) return body({ error: { code: error.code, message: error.message } }, error.status, cors);
    const diagnostic = { stage, name: error?.name || 'Error', status: Number.isInteger(error?.status) ? error.status : undefined, code: typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : undefined };
    if (stage === 'service-account-config') diagnostic.reason = error?.message === 'Invalid FIREBASE_SERVICE_ACCOUNT_JSON' ? 'invalid-json' : error?.message === 'Service account does not match FIREBASE_PROJECT_ID' ? 'project-or-fields-mismatch' : 'unknown';
    if (dependencies.reportError) dependencies.reportError(diagnostic);
    else console.error('Worker internal error', diagnostic);
    return body({ error: { code: 'INTERNAL' } }, 500, cors);
  }
}

async function database(env, dependencies = {}) {
  if (dependencies.database) return dependencies.database;
  const fetcher = dependencies.fetcher || fetch;
  const account = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON, env.FIREBASE_PROJECT_ID);
  return new FirestoreRest(env.FIREBASE_PROJECT_ID, await getFirestoreAccessToken(account, fetcher), fetcher);
}

export default {
  fetch(request, env) { return handleRequest(request, env); },
  scheduled(_event, env, ctx) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_ENCRYPTION_KEY) return;
    ctx.waitUntil((async()=>{ const db = await database(env); await createSheetService(db, env).runJobs(); })().catch(()=>{ console.error('Sheets scheduled job failed'); }));
  }
};
