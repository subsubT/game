import { createHash, randomBytes, createCipheriv, createDecipheriv, verify } from 'node:crypto';
import { ApiError } from './error.js';

export const opaque = () => randomBytes(32).toString('base64url');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const pkceChallenge = verifier => createHash('sha256').update(verifier).digest('base64url');

function keyOf(secret) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new ApiError('GOOGLE_NOT_CONFIGURED', undefined, 503);
  const key = Buffer.from(secret, 'base64url');
  if (key.length !== 32) throw new ApiError('GOOGLE_NOT_CONFIGURED', undefined, 503);
  return key;
}
// AAD prevents moving ciphertext between teachers, epochs, or secret purposes.
export function seal(value, secret, context) {
  const iv = randomBytes(12), actual = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  actual.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([actual.update(Buffer.from(value)), actual.final()]);
  return ['v1', iv.toString('base64url'), actual.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}
export function unseal(envelope, secret, context) {
  try {
    const [version, iv, tag, body, extra] = envelope.split('.');
    if (version !== 'v1' || extra || !body) throw Error();
    const cipher = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64url'));
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([cipher.update(Buffer.from(body, 'base64url')), cipher.final()]).toString();
  } catch { throw new ApiError('REAUTH_REQUIRED'); }
}

let cachedKeys, keysExpiry = 0;
export async function verifyGoogleIdToken(token, clientId, nonce, fetcher = fetch, clock = Date.now) {
  try {
    if (typeof token !== 'string' || token.length > 16384) throw Error();
    const parts = token.split('.'); if (parts.length !== 3) throw Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const time = Math.floor(clock() / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || claims.aud !== clientId ||
        (claims.azp && claims.azp !== clientId) || !Number.isInteger(claims.exp) || claims.exp <= time ||
        !Number.isInteger(claims.iat) || claims.iat > time + 60 || claims.nonce !== nonce ||
        typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)) throw Error();
    if (!cachedKeys || keysExpiry <= clock() || !cachedKeys.keys.some(k => k.kid === header.kid)) {
      const response = await fetcher('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error();
      cachedKeys = await response.json(); keysExpiry = clock() + 300000;
    }
    const jwk = cachedKeys.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    const { createPublicKey } = await import('node:crypto');
    if (!jwk || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw Error();
    return claims.sub;
  } catch { throw new ApiError('GOOGLE_IDENTITY_INVALID'); }
}
