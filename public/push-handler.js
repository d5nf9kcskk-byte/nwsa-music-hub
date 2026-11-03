/* Web push for same-day schedule changes (#push). Part of the service worker
   itself, pulled in through the workbox `importScripts` option in
   vite.config.ts — the same pattern as sw-cleanup.js — so the generated sw.js
   stays byte-identical per build and this file never needs the Firebase SDK.

   The Cloud Functions send DATA-ONLY messages ({ title, body, url, tag }), so
   nothing else in the worker displays them and this handler is the one place
   a notification is drawn. It ALWAYS draws one: iOS revokes a subscription
   whose pushes arrive without a visible notification.

   No skipWaiting, no clients.claim — the prompt-flow update rules (CLAUDE.md
   PWA invariants) are untouched by this file. */
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }
  // FCM wraps data messages as { data: {...}, from, fcmMessageId, ... }.
  const d = (payload && (payload.data || payload.notification)) || {};
  const title = typeof d.title === 'string' && d.title ? d.title : 'Schedule change';
  const body = typeof d.body === 'string' ? d.body : '';
  const tag = typeof d.tag === 'string' && d.tag ? d.tag : 'change';
  const url = typeof d.url === 'string' ? d.url : '';
  // The org's own icon file name (config/orgs/*.json), resolved against this
  // worker's scope. A bare file name only; anything else is ignored.
  const icon = typeof d.icon === 'string' && /^[\w.-]+\.png$/.test(d.icon) ? d.icon : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      // A second change to the same event replaces the first, and still buzzes.
      renotify: true,
      icon,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const raw = event.notification.data && event.notification.data.url;
  // Only ever open a page of this app — never an arbitrary address a payload
  // happened to carry.
  const target = typeof raw === 'string' && raw.startsWith(scope) ? raw : scope;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(scope) && 'focus' in c) {
        try { await c.navigate(target); } catch (e) { /* cross-state navigate refused */ }
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
