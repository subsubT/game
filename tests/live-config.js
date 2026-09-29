export async function liveApiKey() {
  if (process.env.MATH3_FIREBASE_WEB_API_KEY) return process.env.MATH3_FIREBASE_WEB_API_KEY;
  await import('../firebase-config.js');
  const key = globalThis.MATH3_FIREBASE_CONFIG?.apiKey;
  if (!key) throw new Error('Set MATH3_FIREBASE_WEB_API_KEY or provide the ignored firebase-config.js');
  return key;
}
