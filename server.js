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

const MONGO_URI      = process.env.MONGO_URI      || "YOUR_MONGODB_URI";
const JWT_SECRET     = process.env.JWT_SECRET     || "supersecretkey123";
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || "YOUR_OPENROUTER_KEY";

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

// ── HELPER: messages array banana
function buildMessages(history = [], newsContext = [], msg, image) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
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
    const messages = buildMessages(history, newsContext, msg, image);
    // ⚡ Gemini Flash — sabse fast free model
    const model = image ? "meta-llama/llama-3.2-11b-vision-instruct:free" : "google/gemini-flash-1.5";
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
    res.setHeader("X-Accel-Buffering", "no"); // Nginx buffering disable
    res.flushHeaders();

    const messages = buildMessages(history, newsContext, msg, image);
    // ⚡ Gemini Flash — sabse fast + streaming support
    const model = image ? "meta-llama/llama-3.2-11b-vision-instruct:free" : "google/gemini-flash-1.5";

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
