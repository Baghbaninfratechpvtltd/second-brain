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
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const MONGO_URI      = process.env.MONGO_URI      || "YOUR_MONGODB_URI";
const JWT_SECRET     = process.env.JWT_SECRET     || "supersecretkey123";
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || "YOUR_OPENROUTER_KEY";
const NEWS_KEY       = process.env.NEWS_KEY       || "YOUR_NEWS_KEY";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

// ── MODELS
const UserSchema = new mongoose.Schema({
  email:    { type: String, unique: true, required: true },
  password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

const NoteSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title:     { type: String, required: true },
  body:      { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const Note = mongoose.model("Note", NoteSchema);

// ── AUTH MIDDLEWARE
function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login karo pehle" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token invalid" });
  }
}

// ── SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email aur password chahiye" });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "Email already registered hai" });
    const hashed = await bcrypt.hash(password, 10);
    await User.create({ email, password: hashed });
    res.json({ message: "Account ban gaya ✅" });
  } catch (e) {
    res.status(500).json({ error: "Signup fail: " + e.message });
  }
});

// ── LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User nahi mila" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Password galat hai" });
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, email: user.email });
  } catch (e) {
    res.status(500).json({ error: "Login fail: " + e.message });
  }
});

// ── NOTES
app.post("/notes", authMiddleware, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title) return res.status(400).json({ error: "Title chahiye" });
    const note = await Note.create({ userId: req.user.id, title, body });
    res.json(note);
  } catch (e) {
    res.status(500).json({ error: "Note save fail" });
  }
});

app.get("/notes", authMiddleware, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(notes);
  } catch (e) {
    res.status(500).json({ error: "Notes load fail" });
  }
});

app.delete("/notes/:id", authMiddleware, async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user.id });
    if (!note) return res.status(404).json({ error: "Note nahi mila" });
    await note.deleteOne();
    res.json({ message: "Deleted ✅" });
  } catch (e) {
    res.status(500).json({ error: "Delete fail" });
  }
});

// ── NEWS API — Latest news fetch karo
app.get("/news", authMiddleware, async (req, res) => {
  try {
    const query = req.query.q || "India";
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=hi&gl=IN&ceid=IN:hi`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    const xml = await r.text();

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const articles = items.slice(0, 8).map(item => {
      const title       = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)       || item.match(/<title>(.*?)<\/title>/))?.[1]       || "";
      const description = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || "";
      const link        = item.match(/<link\/>(.*?)<item/s)?.[1]?.trim() ||
                          item.match(/<link>(.*?)<\/link>/)?.[1] || "#";
      const pubDate     = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
      const source      = item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || "Google News";
      return {
        title: title.replace(/<[^>]*>/g, "").trim(),
        description: description.replace(/<[^>]*>/g, "").substring(0, 200).trim(),
        url: link.trim(),
        source: source.trim(),
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
      };
    });

    res.json({ articles });
  } catch (e) {
    console.error("News error:", e);
    res.status(500).json({ error: "News fetch fail", articles: [] });
  }
});

// ── AI CHAT (streaming)
app.post("/chat/stream", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [], image, newsContext } = req.body;
    if (!msg) return res.status(400).json({ error: "Message chahiye" });

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const messages = [];

    if (newsContext && newsContext.length > 0) {
      const newsText = newsContext.map((a, i) =>
        `[${i+1}] ${a.title}\n${a.description || ""}\nSource: ${a.source} | ${new Date(a.publishedAt).toLocaleDateString()}`
      ).join("\n\n");
      messages.push({
        role: "system",
        content: `Latest news articles:\n\n${newsText}`
      });
    }

    for (const turn of history) {
      messages.push({
        role: turn.role === "user" ? "user" : "assistant",
        content: turn.text
      });
    }

    if (image) {
      messages.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
          { type: "text", text: msg }
        ]
      });
    } else {
      messages.push({ role: "user", content: msg });
    }

    const model = image
      ? "meta-llama/llama-3.2-11b-vision-instruct:free"
      : "openrouter/auto";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
      for (const line of lines) {
        const data = line.replace("data: ", "").trim();
        if (data === "[DONE]") {
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const token = parsed?.choices?.[0]?.delta?.content || "";
          if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
        } catch {}
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error("Stream Error:", e);
    res.write(`data: ${JSON.stringify({ error: "AI fail ho gaya" })}\n\n`);
    res.end();
  }
});

const SYSTEM_PROMPT = `Tu "Brain" hai — "Second Brain" app ka AI assistant. Tu ek dost ki tarah baat karta hai.

LANGUAGE RULE:
- User Hindi mein likhe → simple, bolchal wali Hindi mein jawab de (jaise dost bolta hai, formal/literary nahi)
- User English mein likhe → English mein jawab de
- User Hinglish mein likhe (Roman Hindi) → Hinglish mein jawab de
- Kabhi bhi ek hi message mein Hindi + English dono mat mix kar
- Hindi response ke baad English translation mat de

TONE:
- Dost jaisi simple boli — jaise "kya baat hai", "haan bilkul", "dekh yaar" wali style
- Formal/literary Hindi BILKUL mat — "आपको सूचित किया जाता है" type nahi chahiye
- Seedha kaam ki baat kar, ghumao-phirao nahi

HELPFUL BEHAVIOR:
- Clear aur helpful jawab de
- Code poochha to puri working code de
- News articles mile to unse jawab de
- Lists/bullets use karo jab helpful ho

Tu ek personal assistant hai — notes, tasks, reminders aur AI chat sab teri territory hai.`;

app.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [], image, newsContext } = req.body;
    if (!msg) return res.status(400).json({ error: "Message chahiye" });

    const messages = [{ role: "system", content: SYSTEM_PROMPT }];

    // News context inject karo agar available hai
    if (newsContext && newsContext.length > 0) {
      const newsText = newsContext.map((a, i) =>
        `[${i+1}] ${a.title}\n${a.description || ""}\nSource: ${a.source} | ${new Date(a.publishedAt).toLocaleDateString()}`
      ).join("\n\n");
      messages.push({
        role: "system",
        content: `Latest news articles (use these to answer):\n\n${newsText}`
      });
    }

    for (const turn of history) {
      messages.push({
        role: turn.role === "user" ? "user" : "assistant",
        content: turn.text
      });
    }

    // Image support (OCR)
    if (image) {
      messages.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
          { type: "text", text: msg }
        ]
      });
    } else {
      messages.push({ role: "user", content: msg });
    }

    const model = image
      ? "meta-llama/llama-3.2-11b-vision-instruct:free"
      : "openrouter/auto";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, messages })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: "AI: " + data.error.message });
    const reply = data?.choices?.[0]?.message?.content || "Koi jawab nahi mila.";
    res.json({ reply });

  } catch (e) {
    console.error("AI Error:", e);
    res.status(500).json({ error: "AI fail ho gaya" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server chal raha hai port ${PORT} pe`));
