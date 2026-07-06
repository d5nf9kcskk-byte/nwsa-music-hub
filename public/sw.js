/* NWSA Music Hub service worker (#43): app shell + assets cached for offline.
   Data still comes live from Firestore (its SDK has its own offline handling);
   this makes the APP LOAD on a bus, in a practice room, or in a dead zone. */
const CACHE = 'nwsa-hub-v1';
const BASE = '/nwsa-music-hub';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([`${BASE}/`, `${BASE}/manifest.json`])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Hashed assets: cache-first (immutable filenames).
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }))
    );
    return;
  }

  // Navigations: network-first, fall back to cached shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(`${BASE}/`, copy));
        return res;
      }).catch(() => caches.match(`${BASE}/`))
    );
  }
});
