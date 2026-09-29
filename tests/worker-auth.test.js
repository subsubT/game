import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyFirebaseIdToken, getFirestoreAccessToken, parseServiceAccount } from '../worker/src/auth.js';
import { handleRequest } from '../worker/src/index.js';
import { FirestoreRest } from '../worker/src/firestore-rest.js';

const projectId = 'demo-1math3-checkpoint3';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
function idToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', kid: 'local-test-key' });
  const payload = encode({ aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: 'student-uid', exp: now + 3600, iat: now - 5, auth_time: now - 5, ...overrides });
  return `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')}`;
}
const certFetch = async () => new Response(JSON.stringify({ 'local-test-key': publicKey }), { status: 200, headers: { 'cache-control': 'public, max-age=300' } });

test('Firebase ID tokens require a valid signature, project, issuer and lifetime', async () => {
  assert.equal(await verifyFirebaseIdToken(idToken(), projectId, certFetch), 'student-uid');
  const altered = idToken().split('.'); altered[1] = encode({ ...JSON.parse(Buffer.from(altered[1], 'base64url')), sub: 'other-student' });
  await assert.rejects(verifyFirebaseIdToken(altered.join('.'), projectId, certFetch));
  await assert.rejects(verifyFirebaseIdToken(idToken({ aud: 'another-project' }), projectId, certFetch));
  await assert.rejects(verifyFirebaseIdToken(idToken({ exp: 1 }), projectId, certFetch));
});

test('service account OAuth assertion uses the Firestore scope', async () => {
  const account = parseServiceAccount(JSON.stringify({ type: 'service_account', project_id: projectId, client_email: 'worker-test@example.iam.gserviceaccount.com', private_key: privateKey }), projectId);
  assert.equal(parseServiceAccount(`\uFEFF${JSON.stringify(account)}\n`, projectId).client_email, account.client_email);
  const token = await getFirestoreAccessToken(account, async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    const assertion = new URLSearchParams(options.body).get('assertion');
    const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url'));
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/datastore');
    return new Response(JSON.stringify({ access_token: 'local-only-token', expires_in: 3600 }), { status: 200 });
  });
  assert.equal(token, 'local-only-token');
  assert.throws(() => parseServiceAccount(JSON.stringify({ ...account, project_id: 'wrong-project' }), projectId));
});

test('Worker fails closed without secrets and limits browser origins', async () => {
  const env = { FIREBASE_PROJECT_ID: projectId, ALLOWED_ORIGINS: 'https://game.example', MATH3_SERVER_SECRET: '', FIREBASE_SERVICE_ACCOUNT_JSON: '' };
  const request = origin => new Request('https://worker.example/api/getStudentStatus', { method: 'POST', headers: { origin, authorization: 'Bearer fake', 'content-type': 'application/json' }, body: '{"data":{}}' });
  assert.equal((await handleRequest(request('https://game.example'), env)).status, 503);
  assert.equal((await handleRequest(request('https://other.example'), env)).status, 403);
  const preflight = await handleRequest(new Request('https://worker.example/api/getStudentStatus', { method: 'OPTIONS', headers: { origin: 'https://game.example' } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://game.example');
});

test('Worker rejects oversized JSON before reaching Firestore', async () => {
  const env = { FIREBASE_PROJECT_ID: projectId, ALLOWED_ORIGINS: 'https://game.example', MATH3_SERVER_SECRET: 'local-only', FIREBASE_SERVICE_ACCOUNT_JSON: 'test-only' };
  const request = new Request('https://worker.example/api/getStudentStatus', { method: 'POST', headers: { origin: 'https://game.example', authorization: 'Bearer local-test', 'content-type': 'application/json' }, body: JSON.stringify({ data: { excess: 'x'.repeat(17000) } }) });
  const response = await handleRequest(request, env, { verifyToken: async () => 'student-uid' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
});

test('Firestore ranking pages preserve order and pass the opaque page token', async () => {
  const urls = [];
  const root = `projects/${projectId}/databases/(default)/documents/classBoards/board:with:colons/entries`;
  const document = id => ({ name: `${root}/${id}`, fields: { score: { integerValue: '10' } } });
  const db = new FirestoreRest(projectId, 'local', async url => {
    urls.push(new URL(url));
    return new Response(JSON.stringify(urls.length === 1 ? { documents: [document('a')], nextPageToken: 'opaque/+==' } : { documents: [document('b')] }), { status: 200 });
  });
  const entries = db.doc('classBoards/board:with:colons').collection('entries').orderBy('score', 'desc').orderBy('__name__').limit(1);
  const first = await entries.get();
  const second = await entries.startAfterToken(first.nextPageToken).get();
  assert.deepEqual([first.docs[0].id, second.docs[0].id], ['a', 'b']);
  assert.equal(urls[0].searchParams.get('orderBy'), 'score desc, __name__ asc');
  assert.equal(urls[1].searchParams.get('pageToken'), 'opaque/+==');
});
