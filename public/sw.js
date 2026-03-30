const CACHE_NAME = "second-brain-v5";
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

// ── INDEXEDDB
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
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("reminders", "readonly");
      const store = tx.objectStore("reminders");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch(e) { return []; }
}

async function markReminderDone(id) {
  try {
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
      req.onerror = () => resolve();
    });
  } catch(e) {}
}

async function saveRemindersToDB(reminders) {
  try {
    const db = await openDB();
    const tx = db.transaction("reminders", "readwrite");
    const store = tx.objectStore("reminders");
    store.clear();
    for (const rem of reminders) store.put(rem);
    console.log("✅ Reminders synced:", reminders.length);
  } catch(e) { console.error("DB save error:", e); }
}

// ── NOTIFICATION
function fireNotification(rem, when) {
  return self.registration.showNotification("🔔 Second Brain AI", {
    body: `${when}: ${rem.title}`,
    icon: "/icon.png",
    badge: "/icon.png",
    vibrate: [300, 100, 300],
    tag: `reminder-${rem.id}`,
    requireInteraction: true,
    actions: [
      { action: "dismiss", title: "Dismiss" },
      { action: "open", title: "App Kholo" }
    ]
  });
}

// ── REMINDER CHECK — har reminder ke liye alag setTimeout + repeat until dismissed
async function scheduleReminders() {
  const reminders = await getRemindersFromDB();
  if (!reminders.length) return;

  const now = Date.now();
  for (const rem of reminders) {
    if (rem.done) continue;

    // Alert time (advance warning)
    if (rem.alertMins > 0) {
      const alertMs = rem.alertMins * 60 * 1000;
      const alertTimeLeft = rem.time - alertMs - now;
      if (alertTimeLeft > 0 && alertTimeLeft < 24 * 60 * 60 * 1000) {
        const when = rem.alertMins >= 60
          ? `${rem.alertMins / 60} ghante pehle`
          : `${rem.alertMins} minute pehle`;
        setTimeout(() => {
          fireNotification(rem, `⏰ ${when}`);
        }, alertTimeLeft);
      }
    }

    // Exact time pe — aur phir har 2 minute mein repeat karo jab tak dismiss na ho
    const timeLeft = rem.time - now;
    if (timeLeft > 0 && timeLeft < 24 * 60 * 60 * 1000) {
      setTimeout(() => repeatNotification(rem, 0), timeLeft);
    }
    // Agar time nikal gaya but done nahi — abhi bhi fire karo
    if (timeLeft <= 0 && timeLeft > -30 * 60 * 1000) {
      repeatNotification(rem, 0);
    }
  }
  console.log("✅ Reminders scheduled:", reminders.filter(r => !r.done).length);
}

// Har 2 minute mein repeat karo — max 5 baar
async function repeatNotification(rem, count) {
  const reminders = await getRemindersFromDB();
  const current = reminders.find(r => r.id === rem.id);
  if (!current || current.done) return; // User ne dismiss kar diya

  await fireNotification(current, "🔔 Reminder");

  if (count < 4) { // Max 5 baar (0-4)
    setTimeout(() => repeatNotification(rem, count + 1), 2 * 60 * 1000); // 2 min baad
  }
}

// ── MESSAGE — App se reminders sync karo
self.addEventListener("message", e => {
  if (e.data.type === "SYNC_REMINDERS") {
    saveRemindersToDB(e.data.reminders).then(() => {
      scheduleReminders(); // Sync hone ke baad schedule karo
    });
  }
  if (e.data.type === "START_REMINDER_CHECK") {
    scheduleReminders();
  }
});

// ── NOTIFICATION CLICK
self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "open" || !e.action) {
    e.waitUntil(
      clients.matchAll({ type: "window" }).then(clientList => {
        if (clientList.length > 0) return clientList[0].focus();
        return clients.openWindow("/");
      })
    );
  }
});

// ── PUSH
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
