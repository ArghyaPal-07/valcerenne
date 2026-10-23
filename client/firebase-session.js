import { initializeApp } from "firebase/app";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail,
  connectAuthEmulator,
} from "firebase/auth";
let readyPromise;
async function ready() {
  if (!readyPromise)
    readyPromise = (async () => {
      const response = await fetch("/api/config", { cache: "no-store" });
      const config = await response.json();
      if (!response.ok)
        throw new Error(
          config.message || "Firebase connection has not been configured.",
        );
      if (config.provider !== "firebase") return null;
      const app = initializeApp(config.firebase),
        auth = getAuth(app);
      if (config.authEmulatorUrl)
        connectAuthEmulator(auth, config.authEmulatorUrl, {
          disableWarnings: true,
        });
      await setPersistence(auth, browserLocalPersistence);
      await auth.authStateReady();
      return auth;
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
  return readyPromise;
}
function friendly(error) {
  const messages = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Choose a stronger password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/operation-not-allowed":
      "Email/password sign-in must be enabled in Firebase Console.",
    "auth/unauthorized-domain":
      "Add this website to Firebase Authentication authorized domains.",
  };
  return new Error(
    messages[error.code] || error.message || "Authentication failed.",
  );
}
window.FirebaseSession = {
  ready,
  async token() {
    const auth = await ready();
    return auth?.currentUser ? auth.currentUser.getIdToken() : null;
  },
  async login(email, password) {
    try {
      const auth = await ready();
      if (!auth) return null;
      const result = await signInWithEmailAndPassword(auth, email, password);
      return { token: await result.user.getIdToken(), user: result.user };
    } catch (e) {
      throw friendly(e);
    }
  },
  async register({ email, password, full_name }) {
    try {
      const auth = await ready();
      if (!auth) return null;
      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await updateProfile(result.user, { displayName: full_name });
      return { token: await result.user.getIdToken(true), user: result.user };
    } catch (e) {
      throw friendly(e);
    }
  },
  async logout() {
    const auth = await ready();
    if (auth) await signOut(auth);
  },
  async password(current, next) {
    try {
      const auth = await ready();
      if (!auth) return null;
      if (!auth.currentUser) throw new Error("Please sign in.");
      await reauthenticateWithCredential(
        auth.currentUser,
        EmailAuthProvider.credential(auth.currentUser.email, current),
      );
      await updatePassword(auth.currentUser, next);
      return { success: true, message: "Password updated." };
    } catch (e) {
      throw friendly(e);
    }
  },
  async reset(email) {
    try {
      const auth = await ready();
      if (!auth)
        throw new Error(
          "Password reset is available with Firebase Authentication.",
        );
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (e) {
      throw friendly(e);
    }
  },
};
