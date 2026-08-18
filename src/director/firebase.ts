import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

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

// Exported for firebaseAuth.ts (Auth + Storage live there so the public
// bundle — which imports this module for `db` — doesn't carry them; audit A6).
export const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

/**
 * App Check (audit rec #1) — proves a write came from a real browser on our
 * own origin, which is the only real defence for the four unauthenticated
 * write paths (`plannedAbsences`, `parentMessages`, `assignmentSubmissions`,
 * `calendarViews`): their shapes are validated, but nothing else stops a
 * script from hammering them.
 *
 * Off unless VITE_RECAPTCHA_SITE_KEY is set, so nothing changes until the
 * site key exists in the Firebase console — and the SDK is dynamically
 * imported so visitors don't download it while it's off.
 *
 * ROLLOUT — read docs/security-recommendations.md before enforcing:
 *   1. ship with the key set, enforcement OFF (monitor mode);
 *   2. watch the App Check metrics until the traffic is verified;
 *   3. make sure feed generation runs credentialed (FIREBASE_SERVICE_ACCOUNT_JSON
 *      in deploy.yml) — the 4-hourly generate-feeds.mjs reads Firestore over
 *      REST and enforcement applies to it too;
 *   4. only then turn enforcement on for Firestore and Storage.
 */
const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (app && appCheckSiteKey) {
  void (async () => {
    try {
      const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
      // A debug token lets localhost and CI count as "real browser" while
      // testing; it is only honoured for tokens registered in the console.
      const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
      if (debugToken) {
        (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string })
          .FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
      }
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // A failed App Check init must never take the app down with it: with
      // enforcement off it changes nothing, and with enforcement on the
      // failure surfaces as a permission error on the write itself.
    }
  })();
}

// ignoreUndefinedProperties: forms build save objects with optional fields set
// to `undefined` (e.g. composer || undefined). Without this, Firestore rejects
// the whole write — which is what made the repertoire form hang on "Saving…".
// persistentLocalCache (#37): reads AND queued writes survive dead zones —
// roll taken in an auditorium basement syncs when the signal returns.
// Multi-tab (audit A8): with the single-tab manager, a second open tab
// silently fell back to memory-only cache and lost offline entirely.
export const db = app ? initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
}) : null;
