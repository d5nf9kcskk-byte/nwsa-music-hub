import { initializeApp, onLog } from 'firebase/app';
import { collection, initializeFirestore, limit, memoryLocalCache, onSnapshot, persistentLocalCache, persistentMultipleTabManager, query } from 'firebase/firestore';
import { armNoPersistFallback, isQueueLatch, STUCK_CACHE_MS, storageArea, stuckCacheVerdict, wantsPersistence } from './firestoreCache';

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
 * own origin, which is the only real defence for the five unauthenticated
 * write paths (`plannedAbsences`, `parentMessages`, `assignmentSubmissions`,
 * `calendarViews`, `signupResponses`): their shapes are validated, but
 * nothing else stops a script from hammering them.
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
// Local cache: IndexedDB persistence (#37 — reads AND queued writes survive
// dead zones, so a roll taken in an auditorium basement syncs when the signal
// returns; multi-tab per audit A8) on STAFF devices only. Everyone else gets
// the memory cache: one failed IndexedDB request latches the SDK for the life
// of the page, and a student saw that latch as "INTERNAL ASSERTION FAILED
// (ID: b815)" on Submit Video. The why and the three rules: firestoreCache.ts.
const persisting = wantsPersistence(storageArea('localStorage'), storageArea('sessionStorage'));
export const db = app ? initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persisting
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : memoryLocalCache(),
}) : null;

// Rule 3: a latched queue is permanent for this page, so reload once into the
// memory cache. The SDK's own log line is the only signal it gives.
onLog(({ message }) => {
  if (isQueueLatch(message) && armNoPersistFallback(storageArea('sessionStorage'))) {
    window.location.reload();
  }
}, { level: 'error' });

// Rule 4: a persistent cache can also hang with NO error — iPad Safari froze
// the tab holding the shared connection and the visible tab showed empty
// lists forever. If the server has not answered in a visible tab, and the
// network does, reload once into memory. A dead zone fails the probe and
// keeps its cache (#37). Why and the verdict: firestoreCache.ts.
if (db && persisting) {
  let heard = false;
  const stop = onSnapshot(query(collection(db, 'ensembles'), limit(1)), { includeMetadataChanges: true },
    snap => { if (!snap.metadata.fromCache) { heard = true; stop(); } },
    () => { heard = true; }, // an error is not a hang; the status strip reports it
  );
  // The clock runs only while the tab is visible: a timer frozen in the
  // background fires the moment the tab wakes, which proves nothing.
  let timer: number | undefined;
  const judge = async () => {
    const verdict = stuckCacheVerdict(heard, document.visibilityState === 'visible');
    if (verdict !== 'probe') return; // 'wait' restarts from visibilitychange
    const reachable = await fetch('https://firestore.googleapis.com/', { mode: 'no-cors', cache: 'no-store' })
      .then(() => true, () => false);
    if (heard) return;
    if (!reachable) { timer = window.setTimeout(judge, STUCK_CACHE_MS); return; }
    if (armNoPersistFallback(storageArea('sessionStorage'))) window.location.reload();
  };
  document.addEventListener('visibilitychange', () => {
    window.clearTimeout(timer);
    if (!heard && document.visibilityState === 'visible') timer = window.setTimeout(judge, STUCK_CACHE_MS);
  });
  timer = window.setTimeout(judge, STUCK_CACHE_MS);
}
