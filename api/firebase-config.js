module.exports = function firebaseConfig(request, response) {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  };

  const required = ["apiKey", "databaseURL", "projectId", "appId"];
  if (required.some((key) => !config[key])) {
    response.status(500).json({ error: "Firebase configuration is incomplete." });
    return;
  }

  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "https://1math2-subsub-tschool.vercel.app");
  response.setHeader("Vary", "Origin");
  response.status(200).json(config);
};
