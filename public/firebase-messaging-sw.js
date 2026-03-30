importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCfUbbGIy2Xt9NdZ1wLLCPGGhplId989rY",
  authDomain: "secondbrain-ai-e2193.firebaseapp.com",
  projectId: "secondbrain-ai-e2193",
  storageBucket: "secondbrain-ai-e2193.firebasestorage.app",
  messagingSenderId: "58084412193",
  appId: "1:58084412193:web:c4e8ccefe7758e27ba4c60"
});

const messaging = firebase.messaging();

// Background messages handle karo
messaging.onBackgroundMessage(payload => {
  console.log('Background FCM message:', payload);
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || '🔔 Second Brain AI', {
    body: body || 'Aapka reminder!',
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: [300, 100, 300],
    requireInteraction: true,
    actions: [
      { action: 'dismiss', title: 'Dismiss' },
      { action: 'open', title: 'App Kholo' }
    ]
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'open' || !e.action) {
    e.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        if (clientList.length > 0) return clientList[0].focus();
        return clients.openWindow('/');
      })
    );
  }
});
