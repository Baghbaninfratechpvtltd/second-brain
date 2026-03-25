// ✅ Simple & Safe Service Worker

self.addEventListener("install", (event) => {
  console.log("SW Installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("SW Activated");
});

// ❌ fetch intercept मत करो (important)
