const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const admin = require("firebase-admin");

// Firebase Admin init
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (() => {
        let key = process.env.FIREBASE_PRIVATE_KEY || '';
        // Sab tarah ke formats handle karo
        key = key.replace(/\\n/g, '\n');  // literal \n
        key = key.replace(/\\\\n/g, '\n'); // double escaped
        // Agar key mein actual newlines nahi hain to add karo
        if (!key.includes('\n')) {
          key = key.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
                   .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
        }
        // Quotes hata do agar hain
        key = key.replace(/^["']|["']$/g, '');
        return key;
      })()
    })
  });
  console.log("✅ Firebase Admin initialized");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/ping", (req, res) => res.send("OK"));

const MONGO_URI         = process.env.MONGO_URI         || "YOUR_MONGODB_URI";
const JWT_SECRET        = process.env.JWT_SECRET        || "supersecretkey123";
const ADMIN_EMAIL       = process.env.ADMIN_EMAIL        || "";
const OPENROUTER_KEY    = process.env.OPENROUTER_KEY    || "YOUR_OPENROUTER_KEY";
const GEMINI_KEY        = process.env.GEMINI_KEY         || "";
const GOOGLE_SEARCH_KEY = process.env.GOOGLE_SEARCH_KEY || "YOUR_GOOGLE_KEY";   // optional backup
const GOOGLE_CX         = process.env.GOOGLE_CX         || "YOUR_GOOGLE_CX";    // optional backup

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

// ── MODELS
// FCM tokens store karne ke liye
const FCMToken = mongoose.model("FCMToken", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token:  { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
}));

const User = mongoose.model("User", new mongoose.Schema({
  email:    { type: String, unique: true, required: true },
  password: { type: String, required: true },
  isAdmin:  { type: Boolean, default: false }
}));

// Memory model — AI ki personal memory
const Memory = mongoose.model("Memory", new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type:      { type: String, enum: ["fact","preference","habit","goal"], default: "fact" },
  content:   { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}));

const Note = mongoose.model("Note", new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title:     { type: String, required: true },
  body:      { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
}));

// ── AUTH MIDDLEWARE
function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Pehle login karo" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Token invalid hai" }); }
}

// ── SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email aur password chahiye" });
    if (await User.findOne({ email })) return res.status(400).json({ error: "Email already registered hai" });
    const isAdmin = ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    await User.create({ email, password: await bcrypt.hash(password, 10), isAdmin });
    res.json({ message: "Account ban gaya ✅" });
  } catch (e) { res.status(500).json({ error: "Signup fail: " + e.message }); }
});

// ── LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User nahi mila" });
    if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error: "Password galat hai" });
    const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, email: user.email });
  } catch (e) { res.status(500).json({ error: "Login fail: " + e.message }); }
});

// ── NOTES
app.post("/notes", authMiddleware, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title) return res.status(400).json({ error: "Title chahiye" });
    res.json(await Note.create({ userId: req.user.id, title, body }));
  } catch { res.status(500).json({ error: "Note save fail" }); }
});

app.get("/notes", authMiddleware, async (req, res) => {
  try { res.json(await Note.find({ userId: req.user.id }).sort({ createdAt: -1 })); }
  catch { res.status(500).json({ error: "Notes load fail" }); }
});

app.delete("/notes/:id", authMiddleware, async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user.id });
    if (!note) return res.status(404).json({ error: "Note nahi mila" });
    await note.deleteOne();
    res.json({ message: "Deleted ✅" });
  } catch { res.status(500).json({ error: "Delete fail" }); }
});

// ── NEWS
app.get("/news", authMiddleware, async (req, res) => {
  try {
    const query = req.query.q || "India";
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=hi&gl=IN&ceid=IN:hi`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const xml = await r.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const articles = items.slice(0, 8).map(item => ({
      title: ((item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || "").replace(/<[^>]*>/g, "").trim(),
      description: ((item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || "").replace(/<[^>]*>/g, "").substring(0, 200).trim(),
      url: (item.match(/<link\/>(.*?)<item/s)?.[1]?.trim() || item.match(/<link>(.*?)<\/link>/)?.[1] || "#").trim(),
      source: (item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || "Google News").trim(),
      publishedAt: item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]
        ? new Date(item.match(/<pubDate>(.*?)<\/pubDate>/)[1]).toISOString()
        : new Date().toISOString()
    }));
    res.json({ articles });
  } catch (e) { res.status(500).json({ error: "News fetch fail", articles: [] }); }
});

// ── AI SYSTEM PROMPT — current date dynamically inject hoti hai
function getSystemPrompt() {
  const now = new Date();
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return `Tu "Brain" hai — user ka personal AI dost aur second brain. Tu ek smart, caring aur funny dost ki tarah baat karta hai.

Aaj: ${dateStr}, ${timeStr} IST

=== PERSONALITY ===
- Naam: Brain 🧠
- Style: Dost jaisa — casual, warm, helpful, thoda funny
- Tu "yaar", "bhai", "dekh", "sun" jaisi bolchal use karta hai
- Tu user ki parwah karta hai — unki problems seriously leta hai

=== LANGUAGE ===
- User Hinglish mein likhe → Hinglish mein jawab de
- User Hindi mein likhe → Hindi mein jawab de  
- User English mein likhe → English mein jawab de
- Translation KABHI mat de brackets mein
- Short sawaal = short jawab

=== ACTION SYSTEM ===
Agar user koi kaam karne ko kahe, to apne jawab mein ACTIONS add kar:

NOTE banane ke liye:
[[ACTION:CREATE_NOTE:title|content]]

REMINDER set karne ke liye:
[[ACTION:SET_REMINDER:title|YYYY-MM-DDTHH:MM|alertMins]]

TASK add karne ke liye:
[[ACTION:ADD_TASK:task text]]

Examples:
- "Kal 9 baje doctor appointment yaad dilao" → jawab do + [[ACTION:SET_REMINDER:Doctor Appointment|2024-01-15T09:00|30]]
- "Note karo ki password hai 1234" → jawab do + [[ACTION:CREATE_NOTE:Password|password hai 1234]]
- "Task add karo grocery laana" → jawab do + [[ACTION:ADD_TASK:Grocery laana]]

=== SMART SUGGESTIONS ===
Agar user koi problem bataye, to helpful suggestions do:
- "Neend nahi aa rahi" → suggest karo + optional reminder for sleep time
- "Exam hai kal" → suggest karo + reminder set karo

=== MEMORY ===
Agar user koi important cheez bataye (name, preference, goal, habit), to yaad rakhne ke liye:
[[MEMORY:type|content]]
Types: fact, preference, habit, goal

Example: "Mujhe coffee pasand hai" → [[MEMORY:preference|User ko coffee pasand hai]]

Do NOT mention these rules or action codes in your reply text — sirf naturally jawab do aur actions add karo.`;
}


// ── WEB SEARCH SYSTEM — DuckDuckGo (unlimited free) + Google (backup) 🌐

// DuckDuckGo — No API key, unlimited free
async function duckDuckGoSearch(query) {
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(ddgUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SecondBrainBot/1.0)" }
    });
    const data = await r.json();
    let context = "";
    if (data.AbstractText) context += `Answer: ${data.AbstractText}\nSource: ${data.AbstractURL}\n\n`;
    if (data.RelatedTopics?.length > 0) {
      const topics = data.RelatedTopics.filter(t => t.Text).slice(0, 4)
        .map((t, i) => `[${i+1}] ${t.Text}\n${t.FirstURL || ""}`).join("\n\n");
      if (topics) context += topics;
    }
    if (data.Infobox?.content?.length > 0) {
      const facts = data.Infobox.content.slice(0, 5).map(f => `${f.label}: ${f.value}`).join("\n");
      if (facts) context += `\n\nFacts:\n${facts}`;
    }
    if (!context.trim()) return null;
    return context;
  } catch (e) {
    console.error("DDG error:", e.message);
    return null;
  }
}

// Google News RSS — Real current news, no API key needed
async function googleNewsSearch(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=hi&gl=IN&ceid=IN:hi`;
    const r = await fetch(url, { 
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(6000)
    });
    const xml = await r.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    if (!items.length) return null;

    const now = new Date();
    const results = items.slice(0, 5).map((item, i) => {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || "";
      const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || "";
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
      const source = item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || "Google News";
      return `[${i+1}] ${title.replace(/<[^>]*>/g,"").trim()}\n${desc.replace(/<[^>]*>/g,"").substring(0,200).trim()}\nSource: ${source} | ${pubDate ? new Date(pubDate).toLocaleDateString('hi-IN') : now.toLocaleDateString('hi-IN')}`;
    }).join("\n\n");

    return `📰 Latest News (${now.toLocaleDateString('hi-IN')}):\n\n${results}`;
  } catch (e) {
    console.error("Google News RSS error:", e.message);
    return null;
  }
}

// Google Custom Search — backup (optional, 3000/month free)
async function googleSearch(query) {
  try {
    if (!GOOGLE_SEARCH_KEY || GOOGLE_SEARCH_KEY === "YOUR_GOOGLE_KEY") return null;
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}&num=5`;
    const r = await fetch(url);
    const data = await r.json();
    if (!data.items?.length) return null;
    return data.items.slice(0, 4).map((item, i) =>
      `[${i+1}] ${item.title}\n${item.snippet}\nSource: ${item.link}`
    ).join("\n\n");
  } catch (e) {
    console.error("Google search error:", e.message);
    return null;
  }
}

// Jina AI — URL se content extract (free, unlimited)
async function jinaFetch(url) {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "Accept": "text/plain", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000)
    });
    const text = await r.text();
    return text.substring(0, 800);
  } catch { return null; }
}

// Main search — News pehle, phir DDG, phir Google
async function webSearch(query) {
  console.log(`🔍 Web search [${new Date().toISOString()}]:`, query);
  
  const isNewsQuery = /news|aaj|today|latest|score|result|price|rate|election|match|ipl|vacancy|abhi|kal/i.test(query);
  
  let result = null;

  // News queries ke liye Google News RSS best hai
  if (isNewsQuery) {
    result = await googleNewsSearch(query);
  }

  // Agar news nahi mila ya non-news query, DDG try karo
  if (!result) {
    result = await duckDuckGoSearch(query);
  }

  // Dono fail — Google News try karo
  if (!result) {
    result = await googleNewsSearch(query);
  }

  // Last resort — Google Custom Search (if key available)
  if (!result) {
    result = await googleSearch(query);
  }

  // Extra content fetch karo Jina se
  if (result) {
    const urlMatch = result.match(/https?:\/\/[^\s\n]+/);
    if (urlMatch) {
      const extra = await jinaFetch(urlMatch[0]);
      if (extra) result += `\n\nDetailed:\n${extra}`;
    }
  }

  return result;
}

// ── DETECT karo ki web search chahiye ya nahi
function needsWebSearch(msg) {
  const lower = msg.toLowerCase().trim();
  
  // Simple greetings pe skip
  if (/^(hi+|hello|hey|namaste|kaise ho|kya haal|bye|ok|okay|haan|nahi|thanks)$/i.test(lower)) return false;
  
  // Question mark hai — search karo
  if (msg.includes("?")) return true;
  
  // 4 se zyada words — search karo  
  if (lower.split(" ").length > 4) return true;

  // Keywords
  const triggers = [
    "aaj","today","abhi","kal","latest","current","2024","2025","2026",
    "news","khabar","kya hua","score","result","election","match","ipl",
    "price","rate","daam","stock","sensex","crypto","petrol","gold","sona",
    "modi","president","minister","sarkar","government",
    "vacancy","recruitment","exam","sarkari","naukri",
    "weather","mausam","temperature",
    "kaun","kya hai","what is","who is","kitna","batao","explain","bताओ"
  ];
  return triggers.some(k => lower.includes(k));
}


function buildMessages(history = [], newsContext = [], msg, image, webContext = null, memories = []) {
  const messages = [{ role: "system", content: getSystemPrompt() }];
  
  // Personal memory context add karo
  if (memories && memories.length > 0) {
    const memText = memories.map(m => `- [${m.type}] ${m.content}`).join("\n");
    messages.push({ role: "system", content: `=== USER KI PERSONAL MEMORY ===\n${memText}\n\nIn facts ko dhyan mein rakhkar jawab de.` });
  }

  // 🌐 Live web search results
  if (webContext) {
    messages.push({
      role: "system",
      content: `🌐 LIVE WEB SEARCH RESULTS (aaj ka data — ${new Date().toLocaleDateString('hi-IN')}):\n\n${webContext}\n\nIn results ko use karke jawab de. Agar web mein newer info hai to wahi bata.`
    });
  }

  if (newsContext.length > 0) {
    messages.push({
      role: "system",
      content: "Latest news:\n\n" + newsContext.map((a, i) =>
        `[${i+1}] ${a.title}\n${a.description || ""}\nSource: ${a.source}`
      ).join("\n\n")
    });
  }
  for (const turn of history) {
    messages.push({ role: turn.role === "user" ? "user" : "assistant", content: turn.text });
  }
  if (image) {
    messages.push({ role: "user", content: [
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
      { type: "text", text: msg }
    ]});
  } else {
    messages.push({ role: "user", content: msg });
  }
  return messages;
}

// ── AI ENGINE — Groq primary (14400/day free) + Gemini fallback

const GROQ_KEY = process.env.GROQ_KEY || "";

const GEMINI_KEYS = [
  process.env.GEMINI_KEY  || "",
  process.env.GEMINI_KEY2 || "",
].filter(k => k.length > 0);
let geminiKeyIndex = 0;
function getGeminiKey() { return GEMINI_KEYS[geminiKeyIndex % GEMINI_KEYS.length]; }
function rotateGeminiKey() { geminiKeyIndex = (geminiKeyIndex + 1) % GEMINI_KEYS.length; }

async function callGroq(messages) {
  if (!GROQ_KEY) throw new Error("No Groq key");
  const groqMessages = messages.map(m => ({
    role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
    content: Array.isArray(m.content)
      ? m.content.find(p => p.type === "text")?.text || ""
      : m.content
  }));
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: groqMessages, max_tokens: 1024, temperature: 0.7 }),
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Groq error");
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq empty reply");
  console.log("✅ Groq success");
  return { reply, model: "llama-3.3-70b" };
}

async function callGemini(messages) {
  const systemParts = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const chatMsgs = messages.filter(m => m.role !== "system");
  const contents = chatMsgs.map((m, i) => {
    const role = m.role === "assistant" ? "model" : "user";
    let parts;
    if (Array.isArray(m.content)) {
      parts = m.content.map(p => {
        if (p.type === "image_url") {
          const base64 = p.image_url.url.includes(",") ? p.image_url.url.split(",")[1] : p.image_url.url;
          return { inlineData: { mimeType: "image/jpeg", data: base64 }};
        }
        return { text: (i === 0 && role === "user" && systemParts ? systemParts + "\n\n" : "") + (p.text || "") };
      });
    } else {
      parts = [{ text: (i === 0 && role === "user" && systemParts ? systemParts + "\n\n" : "") + m.content }];
    }
    return { role, parts };
  });
  const key = getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1024, temperature: 0.7 } }),
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) {
    if (data?.error?.status === "RESOURCE_EXHAUSTED") rotateGeminiKey();
    throw new Error(data?.error?.message || "Gemini error");
  }
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error("Gemini empty reply");
  console.log("✅ Gemini fallback success");
  return { reply, model: "gemini-2.5-flash" };
}

async function callAI(messages) {
  try { return await callGroq(messages); }
  catch(e) { console.log("⚠️ Groq failed:", e.message, "— trying Gemini..."); }
  return await callGemini(messages);
}

async function callVisionAI(messages) {
  return await callGemini(messages);
}

// ── PARSE AI ACTIONS — Note, Reminder, Task, Memory
async function parseAndExecuteActions(reply, userId) {
  const actions = [];
  let cleanReply = reply;

  // CREATE NOTE
  const noteMatches = reply.matchAll(/\[\[ACTION:CREATE_NOTE:(.*?)\|(.*?)\]\]/g);
  for (const m of noteMatches) {
    try {
      await Note.create({ userId, title: m[1].trim(), body: m[2].trim() });
      actions.push({ type: "note", title: m[1].trim() });
    } catch(e) {}
  }
  cleanReply = cleanReply.replace(/\[\[ACTION:CREATE_NOTE:.*?\]\]/g, "");

  // SET REMINDER
  const remMatches = reply.matchAll(/\[\[ACTION:SET_REMINDER:(.*?)\|(.*?)\|(.*?)\]\]/g);
  for (const m of remMatches) {
    try {
      const remObj = {
        userId,
        reminderId: Date.now(),
        title: m[1].trim(),
        time: new Date(m[2].trim()).getTime(),
        alertMins: parseInt(m[3]) || 15,
        repeatAlarm: false,
        done: false
      };
      await Reminder.create(remObj);
      actions.push({ type: "reminder", title: m[1].trim(), time: m[2].trim() });
    } catch(e) {}
  }
  cleanReply = cleanReply.replace(/\[\[ACTION:SET_REMINDER:.*?\]\]/g, "");

  // ADD TASK — frontend handle karega
  const taskMatches = [...reply.matchAll(/\[\[ACTION:ADD_TASK:(.*?)\]\]/g)];
  const tasks = taskMatches.map(m => m[1].trim());
  cleanReply = cleanReply.replace(/\[\[ACTION:ADD_TASK:.*?\]\]/g, "");

  // SAVE MEMORY
  const memMatches = reply.matchAll(/\[\[MEMORY:(.*?)\|(.*?)\]\]/g);
  for (const m of memMatches) {
    try {
      const type = ["fact","preference","habit","goal"].includes(m[1]) ? m[1] : "fact";
      await Memory.create({ userId, type, content: m[2].trim() });
      actions.push({ type: "memory", content: m[2].trim() });
    } catch(e) {}
  }
  cleanReply = cleanReply.replace(/\[\[MEMORY:.*?\]\]/g, "");

  return { cleanReply: cleanReply.trim(), actions, tasks };
}

// ── AI CHAT — Normal
app.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [], image, newsContext } = req.body;
    if (!msg) return res.status(400).json({ error: "Message chahiye" });

    let webContext = null;
    if (needsWebSearch(msg)) webContext = await webSearch(msg);

    // User ki memories load karo
    const memories = await Memory.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(20);
    const messages = buildMessages(history, newsContext, msg, image, webContext, memories);

    const result = image ? await callVisionAI(messages) : await callAI(messages);
    
    // Actions parse karo
    const { cleanReply, actions, tasks } = await parseAndExecuteActions(result.reply, req.user.id);
    
    res.json({ reply: cleanReply, actions, tasks });
  } catch (e) {
    console.error("Chat Error:", e);
    res.status(500).json({ error: "AI fail ho gaya — thodi der baad try karo" });
  }
});

// ── AI CHAT STREAMING — Word by word ⚡ with auto fallback
app.post("/chat/stream", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [], image, newsContext } = req.body;
    if (!msg) return res.status(400).json({ error: "Message chahiye" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let webContext = null;
    if (needsWebSearch(msg)) {
      res.write(`data: ${JSON.stringify({ status: "🌐 Web search ho rahi hai..." })}\n\n`);
      webContext = await webSearch(msg);
    }

    const messages = buildMessages(history, newsContext, msg, image, webContext);

    // Image ke liye non-streaming vision
    if (image) {
      const result = await callVisionAI(messages);
      res.write(`data: ${JSON.stringify({ token: result.reply })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end(); return;
    }

    // Gemini se reply lo aur word-by-word bhejo
    try {
      const memories = await Memory.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(20);
      const messages2 = buildMessages(history, newsContext, msg, image, webContext, memories);
      const result = await callAI(messages2);
      
      // Actions parse karo
      const { cleanReply, actions, tasks } = await parseAndExecuteActions(result.reply, req.user.id);
      
      // Word by word bhejo
      const words = cleanReply.split(" ");
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ token: word + " " })}\n\n`);
      }
      // Actions bhi bhejo
      if (actions.length || tasks.length) {
        res.write(`data: ${JSON.stringify({ actions, tasks })}\n\n`);
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: "AI fail ho gaya: " + e.message })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error("Stream Error:", e);
    try { res.write(`data: ${JSON.stringify({ error: "AI fail ho gaya" })}\n\n`); res.end(); } catch {}
  }
});

// ── FCM TOKEN — Save karo
app.post("/fcm-token", authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token chahiye" });
    await FCMToken.findOneAndUpdate(
      { userId: req.user.id },
      { userId: req.user.id, token, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ message: "Token saved ✅" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SEND FCM NOTIFICATION — Reminder time pe call karo
async function sendFCMNotification(userId, title, body) {
  try {
    if (!admin.apps.length) return;
    const fcmDoc = await FCMToken.findOne({ userId });
    if (!fcmDoc) return;
    
    await admin.messaging().send({
      token: fcmDoc.token,
      notification: { title, body },
      android: {
        priority: "high",
        notification: { sound: "default", channelId: "reminders" }
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          title, body,
          icon: "/icon.png",
          requireInteraction: true,
          vibrate: [300, 100, 300]
        }
      }
    });
    console.log("✅ FCM notification sent to user:", userId);
  } catch(e) {
    console.error("FCM send error:", e.message);
  }
}

// ── REMINDER SCHEDULER — Server side check every minute
const Reminder = mongoose.model("Reminder", new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reminderId: { type: Number, required: true },
  title:     { type: String, required: true },
  time:      { type: Number, required: true },
  alertMins: { type: Number, default: 15 },
  repeatAlarm: { type: Boolean, default: false },
  done:      { type: Boolean, default: false },
  notified:  { type: Boolean, default: false },
  alertNotified: { type: Boolean, default: false },
  lastNotifiedAt: { type: Number, default: 0 }
}));

// Reminders sync karo
app.post("/reminders/sync", authMiddleware, async (req, res) => {
  try {
    const { reminders } = req.body;
    if (!reminders) return res.status(400).json({ error: "Reminders chahiye" });
    // Purane delete karo
    await Reminder.deleteMany({ userId: req.user.id });
    // Naye save karo
    for (const rem of reminders) {
      await Reminder.create({
        userId: req.user.id,
        reminderId: rem.id,
        title: rem.title,
        time: rem.time,
        alertMins: rem.alertMins || 15,
        repeatAlarm: rem.repeatAlarm || false,
        done: rem.done || false
      });
    }
    res.json({ message: "Synced ✅" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Har minute check karo — server side reminder fire
setInterval(async () => {
  try {
    const now = Date.now();
    const windowMs = 65000;

    const reminders = await Reminder.find({ done: false });
    
    for (const rem of reminders) {
      const diff = rem.time - now;
      const alertMs = (rem.alertMins || 0) * 60 * 1000;

      // ── ADVANCE ALERT — 2 baar (2 min gap)
      if (rem.alertMins > 0 && !rem.alertNotified) {
        const alertDiff = rem.time - alertMs - now;
        if (alertDiff > -windowMs && alertDiff < windowMs) {
          const when = rem.alertMins >= 60 ? `${rem.alertMins/60} ghante pehle` : `${rem.alertMins} minute pehle`;
          // Pehli baar
          await sendFCMNotification(rem.userId, "⏰ " + rem.title, `${when} reminder hai!`);
          // 2 min baad doosri baar
          setTimeout(async () => {
            await sendFCMNotification(rem.userId, "⏰ " + rem.title, `${when} — Yaad rakhna!`);
          }, 2 * 60 * 1000);
          await Reminder.updateOne({ _id: rem._id }, { alertNotified: true });
        }
      }

      // ── EXACT TIME — 2 baar (2 min gap)
      if (!rem.notified && diff > -windowMs && diff < windowMs) {
        // Pehli baar
        await sendFCMNotification(rem.userId, "🔔 " + rem.title, "Reminder time ho gaya!");
        // 2 min baad doosri baar
        setTimeout(async () => {
          const current = await Reminder.findById(rem._id);
          if (current && !current.done) {
            await sendFCMNotification(rem.userId, "🔔 " + rem.title, "Abhi bhi baaki hai!");
          }
        }, 2 * 60 * 1000);
        await Reminder.updateOne({ _id: rem._id }, { notified: true, lastNotifiedAt: now });
      }
    }
  } catch(e) { console.error("Reminder check error:", e.message); }
}, 60000);

// ── DELETE INDIVIDUAL REMINDER
app.delete("/reminders/delete/:reminderId", authMiddleware, async (req, res) => {
  try {
    await Reminder.deleteMany({ userId: req.user.id, reminderId: parseInt(req.params.reminderId) });
    res.json({ message: "Deleted ✅" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MEMORY ROUTES
app.get("/memories", authMiddleware, async (req, res) => {
  try {
    const memories = await Memory.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(memories);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/memories/:id", authMiddleware, async (req, res) => {
  try {
    await Memory.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ message: "Deleted ✅" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN ROUTES — sirf stats, individual data nahi
app.get("/admin/stats", authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin access chahiye" });
    
    const totalUsers = await User.countDocuments();
    const totalNotes = await Note.countDocuments();
    const totalReminders = await Reminder.countDocuments();
    const activeReminders = await Reminder.countDocuments({ done: false });
    
    // Last 7 days new users
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsers = await User.countDocuments({ _id: { $gte: require("mongoose").Types.ObjectId.createFromTime(weekAgo/1000) }});
    
    res.json({
      totalUsers,
      totalNotes,
      totalReminders,
      activeReminders,
      newUsersThisWeek: newUsers,
      // Individual user data nahi bheja — privacy ke liye
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server port ${PORT} pe chal raha hai — Auto Fallback AI ⚡`));
