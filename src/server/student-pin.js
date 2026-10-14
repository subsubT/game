import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Four digit classroom PINs have only 10,000 possibilities. A per-student salt
// and a server-only, domain-separated pepper prevent a database-only attacker
// from enumerating them offline. Never persist an unkeyed hash or the PIN.
// Online guessing must be limited independently of anonymous Firebase UIDs.
export function validPin(pin) { return typeof pin === 'string' && /^[0-9]{4}$/.test(pin); }
const verifier = (pin, salt, context, secret) => createHmac('sha256', secret)
  .update(JSON.stringify(['student-pin-v1', context, salt, pin])).digest();
export function createPin(pin, context, secret, version = 1) {
  if (!validPin(pin)) throw new Error('INVALID_PIN');
  const salt = randomBytes(16).toString('base64url');
  return { scheme: 'hmac-sha256-pepper-v1', salt, verifier: verifier(pin, salt, context, secret).toString('base64url'), version, enabled: true };
}
export function verifyPin(pin, credential, context, secret) {
  if (!validPin(pin) || credential?.enabled !== true || credential.scheme !== 'hmac-sha256-pepper-v1' || typeof credential.salt !== 'string' || typeof credential.verifier !== 'string') return false;
  const actual = verifier(pin, credential.salt, context, secret), expected = Buffer.from(credential.verifier, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
