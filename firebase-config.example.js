// Copy to firebase-config.js and fill in a separate 1math3 Firebase project.
// Firebase web config is public; never put service account credentials here.
globalThis.MATH3_FIREBASE_CONFIG = {
  apiKey: 'YOUR_WEB_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_WEB_APP_ID',
  region: 'asia-northeast3',
  // Enable only after configuring Firebase Authentication > Google provider.
  // This is identity linking, separate from the Worker's Drive/Sheets consent.
  enableGoogleProvider: false,
  // When the Worker is deployed and verified, add:
  // workerApiOrigin: 'https://YOUR-DEV-WORKER.workers.dev'
  // For local Emulator testing: emulators: { host: '127.0.0.1', auth: 9099, functions: 5001 }
};
