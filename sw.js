// Simple Service Worker — Second Brain PWA

self.addEventListener("install", (event) => {
  console.log("✅ SW Installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("✅ SW Activated");
});

// Fetch intercept mat karo — server calls block ho jaate hain
