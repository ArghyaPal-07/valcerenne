const {
  initializeApp,
  applicationDefault,
  cert,
  getApps,
} = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
let services;
function firebase() {
  if (services) return services;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId)
    throw Object.assign(
      new Error(
        "Firebase is not configured. Set FIREBASE_PROJECT_ID and server credentials; see docs/FIREBASE.md.",
      ),
      { status: 503 },
    );
  const emulator =
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator && process.env.NODE_ENV === "production")
    throw new Error(
      "Firebase emulator settings must not be used in production.",
    );
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    let account;
    try {
      account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw Object.assign(
        new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain the complete service-account JSON. See docs/FIREBASE.md."),
        { status: 503 },
      );
    }
    if (!account || typeof account !== "object")
      throw Object.assign(new Error("Invalid Firebase service-account configuration. See docs/FIREBASE.md."), { status: 503 });
    if (account.project_id !== projectId)
      throw Object.assign(
        new Error("Firebase service-account project does not match FIREBASE_PROJECT_ID."),
        { status: 503 },
      );
    try {
      credential = cert(account);
    } catch {
      throw Object.assign(
        new Error("Firebase service-account credentials are invalid. Check FIREBASE_SERVICE_ACCOUNT_JSON in the hosting settings."),
        { status: 503 },
      );
    }
  } else if (!emulator) {
    if (process.env.VERCEL && /^[a-z]:[\\/]/i.test(process.env.GOOGLE_APPLICATION_CREDENTIALS || ""))
      throw Object.assign(
        new Error("Vercel cannot read credentials from your computer. Set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel Environment Variables, remove GOOGLE_APPLICATION_CREDENTIALS there, and redeploy."),
        { status: 503 },
      );
    try {
      credential = applicationDefault();
    } catch {
      throw Object.assign(
        new Error("Firebase server credentials could not be loaded. On Vercel, configure FIREBASE_SERVICE_ACCOUNT_JSON and redeploy. See docs/FIREBASE.md."),
        { status: 503 },
      );
    }
  }
  const app =
    getApps().find((a) => a.name === "valcerenne") ||
    initializeApp(
      { projectId, ...(credential ? { credential } : {}) },
      "valcerenne",
    );
  services = { app, db: getFirestore(app), auth: getAuth(app) };
  return services;
}
function publicConfig() {
  const required = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_APP_ID",
  ];
  if (required.some((k) => !process.env[k]))
    throw Object.assign(
      new Error(
        "Firebase web configuration is missing. Follow docs/FIREBASE.md.",
      ),
      { status: 503 },
    );
  return {
    provider: "firebase",
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      appId: process.env.FIREBASE_APP_ID,
      ...(process.env.FIREBASE_STORAGE_BUCKET
        ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET }
        : {}),
    },
    ...(process.env.NODE_ENV === "test" &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST
      ? { authEmulatorUrl: "http://" + process.env.FIREBASE_AUTH_EMULATOR_HOST }
      : {}),
  };
}
module.exports = { firebase, publicConfig };
