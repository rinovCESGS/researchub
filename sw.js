/* Research Hub service worker.
 *
 * Its only job is notifications. Chrome on Android refuses to show a
 * notification created by a page with new Notification(), and accepts it only
 * from a service worker, so without this file the dashboard can show
 * notifications on a desktop browser but never on an Android phone.
 *
 * There is deliberately no caching here. The bundles under /assets carry a
 * content hash and are already cached by the browser for a year, and caching
 * index.html in a service worker is the classic way to serve a build that is
 * three versions old to a user who cannot work out why.
 *
 * There is also no push subscription. Without a push server, notifications are
 * raised by the dashboard itself while it is open or while its tab is still
 * running in the background. When the app is closed completely, nothing can
 * arrive. That is a property of the design, not a bug to hunt.
 *
 * Place this file next to index.html, in the same folder. The dashboard
 * registers it as 'sw.js' relative to the page.
 */

self.addEventListener('install', (event) => {
  // Take over straight away rather than waiting for every old tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* Tapping a notification should land the user on the item it refers to. If a
   window is already open, focus it and tell the page which item to open. If
   none is open, launch one. */
self.addEventListener('notificationclick', (event) => {
  const data = (event.notification && event.notification.data) || {};
  event.notification.close();

  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if ('focus' in client) {
        await client.focus();
        try {
          client.postMessage({ type: 'buka-notif', id: data.id, aksi: data.aksi, arg: data.arg });
        } catch (e) { /* the page may be mid-reload, the notification is closed either way */ }
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(self.registration.scope);
    }
  })());
});

/* A push handler is included so that adding a real push server later is a
   server-side change only. Nothing sends these today. */
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }
  const title = payload.judul || 'Research Hub';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.isi || '',
    tag: payload.id || 'rh',
    data: { id: payload.id, aksi: payload.aksi, arg: payload.arg }
  }));
});
