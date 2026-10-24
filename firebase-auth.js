import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  onAuthStateChanged
} from 'firebase/auth';

/**
 * Firebase Authentication Integration Module
 * Supports Email/Password Sign Up & Login, plus Google OAuth popup.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey.length > 5 &&
  !firebaseConfig.apiKey.includes('your-') &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.includes('your-')
);

let app = null;
let auth = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    console.log('[Firebase Auth] Initialized successfully with project:', firebaseConfig.projectId);
  } catch (err) {
    console.error('[Firebase Auth] Failed to initialize Firebase:', err);
  }
} else {
  console.info('[Firebase Auth] Keys not configured in .env. Running in hybrid/direct portal auth mode.');
}

export { auth };

/**
 * Register a new Client with Email and Password
 */
export async function firebaseSignUp(email, password, displayName) {
  if (!auth) {
    throw new Error('Firebase Auth is not configured. Please add your VITE_FIREBASE_* keys to .env or use the instant portal registration.');
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  if (displayName && user) {
    try {
      await updateProfile(user, { displayName });
    } catch (e) {
      console.warn('[Firebase] Could not update profile name:', e);
    }
  }

  const idToken = await user.getIdToken();
  return {
    user,
    idToken,
    uid: user.uid,
    email: user.email,
    displayName: displayName || user.displayName || email.split('@')[0]
  };
}

/**
 * Sign In existing client with Email and Password
 */
export async function firebaseLogin(email, password) {
  if (!auth) {
    throw new Error('Firebase Auth is not configured. Please add your VITE_FIREBASE_* keys to .env or use standard sign in.');
  }

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const user = credential.user;
  const idToken = await user.getIdToken();

  return {
    user,
    idToken,
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || email.split('@')[0]
  };
}

/**
 * Sign In or Sign Up via Google OAuth Popup
 */
export async function firebaseGoogleSignIn() {
  if (!auth) {
    throw new Error('Firebase Auth is not configured. Please configure Firebase Google provider in Firebase console and .env.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  const idToken = await user.getIdToken();

  return {
    user,
    idToken,
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email.split('@')[0],
    photoURL: user.photoURL
  };
}

/**
 * Sign Out from Firebase
 */
export async function firebaseSignOut() {
  if (auth) {
    await signOut(auth);
  }
}

/**
 * Listen for Firebase Auth State Changes
 */
export function onFirebaseAuthStateChange(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}
