const CACHE_NAME = "second-brain-v3";
const STATIC_FILES = [
  "/",
  "/index.html",
  "/manifest.json"
];

// Install
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_FILES)).then(() => self.skipWaiting())
  );
});

// Activate — purana cache delete karo
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, cache fallback
self.addEventListener("fetch", e => {
  // API calls cache mat karo
  if(e.request.url.includes("/chat") || e.request.url.includes("/notes") ||
     e.request.url.includes("/news") || e.request.url.includes("/login") ||
     e.request.url.includes("/signup")) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache fresh response
        if(res && res.status === 200 && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Push notifications support
self.addEventListener("push", e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || "Second Brain 🧠", {
      body: data.body || "Aapka reminder!",
      icon: "/icon.png",
      badge: "/icon.png",
      vibrate: [200, 100, 200]
    })
  );
});
