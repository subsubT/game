import { sign, verify } from 'node:crypto';
import { ApiError } from './error.js';

const certUrl = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const tokenUrl = 'https://oauth2.googleapis.com/token';
let certs = null;
let certExpiry = 0;
const serviceTokens = new Map();

const part = value => {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new ApiError('AUTH_REQUIRED'); }
};

async function publicCerts(fetcher) {
  if (certs && Date.now() < certExpiry) return certs;
  const response = await fetcher(certUrl);
  if (!response.ok) throw new Error('Firebase signing keys unavailable');
  const received = await response.json();
  if (!received || typeof received !== 'object') throw new Error('Invalid Firebase signing keys');
  const maxAge = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('cache-control') || '')?.[1] || 300);
  certs = received;
  certExpiry = Date.now() + Math.min(maxAge, 3600) * 1000;
  return certs;
}

export async function verifyFirebaseIdToken(idToken, projectId, fetcher = fetch, returnClaims = false) {
  if (typeof idToken !== 'string' || idToken.length > 8192) throw new ApiError('AUTH_REQUIRED');
  const pieces = idToken.split('.');
  if (pieces.length !== 3) throw new ApiError('AUTH_REQUIRED');
  const [header, payload] = pieces.slice(0, 2).map(part);
  if (!header || typeof header !== 'object' || Array.isArray(header) || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ApiError('AUTH_REQUIRED');
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) throw new ApiError('AUTH_REQUIRED');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` ||
      typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128 ||
      !Number.isInteger(payload.exp) || payload.exp <= now ||
      !Number.isInteger(payload.iat) || payload.iat > now ||
      !Number.isInteger(payload.auth_time) || payload.auth_time > now) throw new ApiError('AUTH_REQUIRED');
  const pem = (await publicCerts(fetcher))[header.kid];
  if (typeof pem !== 'string') throw new ApiError('AUTH_REQUIRED');
  if (!verify('RSA-SHA256', Buffer.from(`${pieces[0]}.${pieces[1]}`), pem, Buffer.from(pieces[2], 'base64url'))) throw new ApiError('AUTH_REQUIRED');
  return returnClaims ? payload : payload.sub;
}

export function parseServiceAccount(json, projectId) {
  let account;
  try { account = JSON.parse(json.replace(/^\uFEFF/, '').trim()); } catch { throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON'); }
  if (account?.type !== 'service_account' || account.project_id !== projectId ||
      typeof account.client_email !== 'string' || typeof account.private_key !== 'string' ||
      !account.private_key.includes('BEGIN PRIVATE KEY')) throw new Error('Service account does not match FIREBASE_PROJECT_ID');
  return account;
}

export async function getFirestoreAccessToken(account, fetcher = fetch) {
  const cached = serviceTokens.get(account.client_email);
  if (cached && cached.expiry > Date.now() + 60000) return cached.value;
  const issued = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const claims = encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: tokenUrl, iat: issued, exp: issued + 3600 });
  const assertion = `${header}.${claims}.${sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), account.private_key).toString('base64url')}`;
  const response = await fetcher(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!response.ok) throw new Error('Service account OAuth exchange failed');
  const data = await response.json();
  if (typeof data.access_token !== 'string' || !Number.isFinite(Number(data.expires_in))) throw new Error('Invalid service account OAuth response');
  serviceTokens.set(account.client_email, { value: data.access_token, expiry: Date.now() + Number(data.expires_in) * 1000 });
  return data.access_token;
}
