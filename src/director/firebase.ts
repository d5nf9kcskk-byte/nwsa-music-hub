import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

// ignoreUndefinedProperties: forms build save objects with optional fields set
// to `undefined` (e.g. composer || undefined). Without this, Firestore rejects
// the whole write — which is what made the repertoire form hang on "Saving…".
// persistentLocalCache (#37): reads AND queued writes survive dead zones —
// roll taken in an auditorium basement syncs when the signal returns.
export const db = app ? initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
}) : null;
export const auth = app ? getAuth(app) : null;
export const storage = app ? getStorage(app) : null;
