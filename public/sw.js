const CACHE_NAME = "second-brain-v4";
const STATIC_FILES = ["/", "/index.html", "/manifest.json", "/icon.png"];

// ── INSTALL
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
  // Background reminder check shuru karo
  startReminderCheck();
});

// ── FETCH
self.addEventListener("fetch", e => {
  if (e.request.url.includes("/chat") || e.request.url.includes("/notes") ||
      e.request.url.includes("/news") || e.request.url.includes("/login") ||
      e.request.url.includes("/signup")) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── BACKGROUND REMINDER CHECK
function startReminderCheck() {
  // Har 30 second mein check karo
  setInterval(checkReminders, 30000);
}

async function checkReminders() {
  try {
    // LocalStorage directly SW mein access nahi hoti
    // Client se reminders maango
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      // App open hai — client handle kar lega
      return;
    }
    
    // App band hai — IndexedDB se reminders lo
    const reminders = await getRemindersFromDB();
    if (!reminders || !reminders.length) return;
    
    const now = Date.now();
    for (const rem of reminders) {
      if (rem.done) continue;
      const diff = rem.time - now;
      const alertMs = (rem.alertMins || 15) * 60 * 1000;
      const window30 = 30000;
      
      // Alert time pe
      if (rem.alertMins > 0 && diff > (alertMs - window30) && diff < (alertMs + window30)) {
        const when = rem.alertMins >= 60 
          ? `${rem.alertMins/60} ghante pehle` 
          : `${rem.alertMins} minute pehle`;
        fireNotification(rem, `⏰ ${when}`);
      }
      
      // Exact time pe
      if (diff > -30000 && diff < 30000) {
        fireNotification(rem, "🔔 Abhi");
        // Mark done
        await markReminderDone(rem.id);
      }
    }
  } catch(e) {
    console.error("SW Reminder check error:", e);
  }
}

function fireNotification(rem, when) {
  self.registration.showNotification("🔔 Second Brain AI", {
    body: `${when}: ${rem.title}`,
    icon: "/icon.png",
    badge: "/icon.png",
    vibrate: [300, 100, 300],
    tag: `reminder-${rem.id}`,
    requireInteraction: true, // notification tab tak rahe jab tak user dismiss na kare
    actions: [
      { action: "dismiss", title: "Dismiss" },
      { action: "open", title: "App Kholo" }
    ]
  });
}

// ── INDEXEDDB — reminders store/get karne ke liye
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("SecondBrainDB", 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("reminders")) {
        db.createObjectStore("reminders", { keyPath: "id" });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e);
  });
}

async function getRemindersFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("reminders", "readonly");
    const store = tx.objectStore("reminders");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });
}

async function markReminderDone(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("reminders", "readwrite");
    const store = tx.objectStore("reminders");
    const req = store.get(id);
    req.onsuccess = () => {
      const rem = req.result;
      if (rem) { rem.done = true; store.put(rem); }
      resolve();
    };
  });
}

// ── MESSAGE — App se reminders sync karo
self.addEventListener("message", e => {
  if (e.data.type === "SYNC_REMINDERS") {
    saveRemindersToDB(e.data.reminders);
  }
  if (e.data.type === "START_REMINDER_CHECK") {
    startReminderCheck();
  }
});

async function saveRemindersToDB(reminders) {
  try {
    const db = await openDB();
    const tx = db.transaction("reminders", "readwrite");
    const store = tx.objectStore("reminders");
    await store.clear();
    for (const rem of reminders) {
      store.put(rem);
    }
    console.log("✅ Reminders synced to SW:", reminders.length);
  } catch(e) {
    console.error("DB save error:", e);
  }
}

// ── NOTIFICATION CLICK
self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "open" || !e.action) {
    e.waitUntil(
      clients.matchAll({ type: "window" }).then(clientList => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return clients.openWindow("/");
      })
    );
  }
});

// ── PUSH NOTIFICATIONS
self.addEventListener("push", e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || "Second Brain AI 🧠", {
      body: data.body || "Aapka reminder!",
      icon: "/icon.png",
      badge: "/icon.png",
      vibrate: [200, 100, 200]
    })
  );
});
