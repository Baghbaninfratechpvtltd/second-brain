const CACHE = 'sb3-v2';
const ASSETS = ['./index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});

// Handle notification click
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./index.html'));
});

// Handle reminder messages from main thread
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE_REMINDER') {
    const { title, body, delay } = e.data;
    setTimeout(() => {
      // FIX: icon was set to manifest.json (wrong) — now using empty string
      self.registration.showNotification(title, {
        body: body || 'Second Brain Reminder',
        vibrate: [200, 100, 200],
        tag: 'sb3-reminder',
        requireInteraction: true,
        actions: [{ action: 'open', title: 'App Kholo' }]
      });
    }, delay);
  }
});
