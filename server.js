const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const MONGO_URI         = process.env.MONGO_URI         || "YOUR_MONGODB_URI";
const JWT_SECRET        = process.env.JWT_SECRET        || "supersecretkey123";
const OPENROUTER_KEY    = process.env.OPENROUTER_KEY    || "YOUR_OPENROUTER_KEY";
const GOOGLE_SEARCH_KEY = process.env.GOOGLE_SEARCH_KEY || "YOUR_GOOGLE_KEY";   // optional backup
const GOOGLE_CX         = process.env.GOOGLE_CX         || "YOUR_GOOGLE_CX";    // optional backup

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

// ── MODELS
const User = mongoose.model("User", new mongoose.Schema({
  email:    { type: String, unique: true, required: true },
  password: { type: String, required: true }
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
    await User.create({ email, password: await bcrypt.hash(password, 10) });
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
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
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

// ── AI SYSTEM PROMPT
const SYSTEM_PROMPT = `Tu "Brain" hai — "Second Brain" app ka AI assistant. Tu ek dost ki tarah baat karta hai.

LANGUAGE RULE:
- User Hindi mein likhe → simple bolchal wali Hindi mein jawab de (jaise "haan yaar", "dekh", "bilkul" — formal nahi)
- User English mein likhe → English mein jawab de
- User Hinglish mein likhe → Hinglish mein jawab de
- Ek hi response mein Hindi + English dono mat mix kar
- Hindi ke baad English translation bilkul mat de

STYLE: Dost jaisi boli, seedha kaam ki baat, lists/bullets jab helpful ho, code poochha to puri working code de.`;

// ── WEB SEARCH SYSTEM — DuckDuckGo (unlimited free) + Google (backup) 🌐

// DuckDuckGo — No API key, unlimited free
async function duckDuckGoSearch(query) {
  try {
    // DuckDuckGo Instant Answer API
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(ddgUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SecondBrainBot/1.0)" }
    });
    const data = await r.json();

    let context = "";

    // Abstract (main answer)
    if (data.AbstractText) {
      context += `Answer: ${data.AbstractText}\nSource: ${data.AbstractURL}\n\n`;
    }

    // Related Topics
    if (data.RelatedTopics?.length > 0) {
      const topics = data.RelatedTopics
        .filter(t => t.Text)
        .slice(0, 4)
        .map((t, i) => `[${i+1}] ${t.Text}\n${t.FirstURL || ""}`)
        .join("\n\n");
      if (topics) context += topics;
    }

    // Infobox data (facts, dates etc)
    if (data.Infobox?.content?.length > 0) {
      const facts = data.Infobox.content
        .slice(0, 5)
        .map(f => `${f.label}: ${f.value}`)
        .join("\n");
      if (facts) context += `\n\nFacts:\n${facts}`;
    }

    if (!context.trim()) return null; // koi result nahi mila
    return context;
  } catch (e) {
    console.error("DDG error:", e.message);
    return null;
  }
}

// Google Custom Search — 3000/month free (backup)
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
    return text.substring(0, 800); // first 800 chars
  } catch { return null; }
}

// Main search — DDG pehle, Google backup, Jina for content
async function webSearch(query) {
  console.log("🔍 Web search:", query);

  // Step 1: DuckDuckGo try karo
  let result = await duckDuckGoSearch(query);

  // Step 2: Agar DDG mein kuch nahi mila, Google try karo
  if (!result) {
    console.log("DDG empty, trying Google...");
    result = await googleSearch(query);
  }

  // Step 3: Agar dono se results mile, Jina se top URL ka content bhi lo
  if (result) {
    // URL extract karo pehle result se
    const urlMatch = result.match(/https?:\/\/[^\s\n]+/);
    if (urlMatch) {
      const extraContent = await jinaFetch(urlMatch[0]);
      if (extraContent) result += `\n\nDetailed content:\n${extraContent}`;
    }
  }

  return result;
}

// ── DETECT karo ki web search chahiye ya nahi
function needsWebSearch(msg) {
  const lower = msg.toLowerCase();
  // Current/recent info ke keywords
  const searchTriggers = [
    "aaj", "today", "abhi", "latest", "current", "2024", "2025", "2026",
    "news", "price", "rate", "score", "result", "winner", "election",
    "stock", "share", "weather", "match", "ipl", "world cup",
    "kab hua", "kya hua", "recently", "new", "update", "launched",
    "government", "pm modi", "president", "minister",
    "vacancy", "recruitment", "exam date", "admit card"
  ];
  return searchTriggers.some(k => lower.includes(k));
}


function buildMessages(history = [], newsContext = [], msg, image, webContext = null) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

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

// ── AI CHAT — Normal (task planner, translator ke liye bhi use hota hai)
app.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [], image, newsContext } = req.body;
    if (!msg) return res.status(400).json({ error: "Message chahiye" });

    // 🌐 Web search — agar current data chahiye
    let webContext = null;
    if (needsWebSearch(msg)) {
      webContext = await webSearch(msg);
    }

    const messages = buildMessages(history, newsContext, msg, image, webContext);
    const model = image ? "meta-llama/llama-3.2-11b-vision-instruct:free" : "google/gemini-2.0-flash-001";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages })
    });
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: "AI error: " + data.error.message });
    res.json({ reply: data?.choices?.[0]?.message?.content || "Koi jawab nahi mila." });
  } catch (e) {
    console.error("Chat Error:", e);
    res.status(500).json({ error: "AI fail ho gaya" });
  }
});

// ── AI CHAT STREAMING — Word by word (Claude jaisa feel) ⚡
app.post("/chat/stream", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [], image, newsContext } = req.body;
    if (!msg) return res.status(400).json({ error: "Message chahiye" });

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // 🌐 Web search — current data ke liye
    let webContext = null;
    if (needsWebSearch(msg)) {
      res.write(`data: ${JSON.stringify({ status: "🌐 Web search ho rahi hai..." })}\n\n`);
      webContext = await webSearch(msg);
    }

    const messages = buildMessages(history, newsContext, msg, image, webContext);
    const model = image ? "meta-llama/llama-3.2-11b-vision-instruct:free" : "google/gemini-2.0-flash-001";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true })
    });

    if (!response.ok) {
      const err = await response.text();
      res.write(`data: ${JSON.stringify({ error: "AI error: " + err })}\n\n`);
      res.end(); return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // incomplete line baad ke liye

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.replace("data: ", "").trim();
        if (raw === "[DONE]") {
          res.write("data: [DONE]\n\n");
          res.end(); return;
        }
        try {
          const parsed = JSON.parse(raw);
          const token = parsed?.choices?.[0]?.delta?.content || "";
          if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
        } catch {}
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error("Stream Error:", e);
    try {
      res.write(`data: ${JSON.stringify({ error: "AI fail ho gaya" })}\n\n`);
      res.end();
    } catch {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server port ${PORT} pe chal raha hai — Gemini Flash ⚡`));
