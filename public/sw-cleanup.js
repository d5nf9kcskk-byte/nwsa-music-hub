/* One-time migration off the hand-rolled service worker (2026-08): delete its
   named caches. This runs in the NEW (Workbox) service worker's activate —
   i.e. only once it has actually taken over — because while the old SW is
   still the controller it NEEDS nwsa-hub-* for its offline fallback, and its
   fetch handler would repopulate the cache anyway. Loaded via the workbox
   `importScripts` option in vite.config.ts. Safe to keep indefinitely: once
   the caches are gone the filter matches nothing. */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('nwsa-hub-')).map((k) => caches.delete(k)),
      ))
      .catch(() => {}),
  );
});
