// Minimal service worker so Chrome on Android installs the kiosk as a full-screen app.
// It caches nothing: every request goes to the network as usual, and /api (the live
// assistant's stream and messages) is never touched.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request));
});
