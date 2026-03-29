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

// ── AI SYSTEM PROMPT — current date dynamically inject hoti hai
function getSystemPrompt() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('hi-IN', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  const timeStr = now.toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' });
  
  return `Tu "Brain" hai — "Second Brain" app ka AI assistant. Tu ek dost ki tarah baat karta hai.

AAJ KI DATE AUR TIME (BILKUL SAHI):
📅 ${dateStr}
🕐 ${timeStr} IST
YEAR: ${now.getFullYear()}

YEH DATE 100% SAHI HAI — kabhi galat date mat batana. Agar koi date pooche to yahi batana.

LANGUAGE RULE:
- User Hindi mein likhe → simple bolchal wali Hindi mein jawab de (jaise "haan yaar", "dekh", "bilkul" — formal nahi)
- User English mein likhe → English mein jawab de
- User Hinglish mein likhe → Hinglish mein jawab de
- Ek hi response mein Hindi + English dono mat mix kar
- Hindi ke baad English translation bilkul mat de

STYLE: Dost jaisi boli, seedha kaam ki baat, lists/bullets jab helpful ho, code poochha to puri working code de.`;
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
  const messages = [{ role: "system", content: getSystemPrompt() }];

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
// ── AI MODELS — Automatic fallback system 🔄
// openrouter/free — khud best available free model choose karta hai
const AI_MODELS = [
  "openrouter/free",                            // 1st — auto best free model (March 2026)
  "meta-llama/llama-3.3-70b-instruct:free",     // 2nd — Llama 70B
  "meta-llama/llama-3.1-8b-instruct:free",      // 3rd — Llama 8B fast
  "google/gemma-3-27b-it:free",                 // 4th — Google Gemma 3
  "google/gemma-3-12b-it:free",                 // 5th — Google Gemma 3 small
  "mistralai/mistral-small-3.1-24b-instruct:free", // 6th — Mistral Small
  "qwen/qwen-2.5-72b-instruct:free",            // 7th — Qwen
];

// Smart AI call — automatically next model try karta hai
async function callAI(messages, stream = false) {
  for (let i = 0; i < AI_MODELS.length; i++) {
    const model = AI_MODELS[i];
    try {
      console.log(`🤖 [${i+1}/${AI_MODELS.length}] ${model}`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://second-brain-98s0.onrender.com",
          "X-Title": "Second Brain App"
        },
        body: JSON.stringify({ model, messages, stream }),
        signal: AbortSignal.timeout(45000)
      });

      // Rate limit ya busy — next try karo
      if (response.status === 429 || response.status === 503 || response.status === 404) {
        console.log(`⏭ Model ${model} busy/unavailable (${response.status}), next...`);
        continue;
      }

      if (!response.ok) {
        console.log(`❌ Model ${model} failed (${response.status}), next...`);
        continue;
      }

      if (stream) return response;

      const data = await response.json();
      if (data.error) {
        console.log(`❌ ${model}: ${data.error.message}, next...`);
        continue;
      }

      const reply = data?.choices?.[0]?.message?.content;
      if (!reply) { console.log(`❌ ${model}: empty reply, next...`); continue; }

      console.log(`✅ ${model} — success!`);
      return { reply, model };
    } catch (e) {
      console.log(`❌ ${model} exception: ${e.message}`);
    }
  }
  throw new Error("Sab models unavailable hain — OpenRouter down ho sakta hai");
}

// Image ke liye vision model with fallback
const VISION_MODELS = [
  "meta-llama/llama-3.2-11b-vision-instruct:free",
  "google/gemini-2.0-flash-exp:free",
];

async function callVisionAI(messages) {
  for (const model of VISION_MODELS) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages }),
        signal: AbortSignal.timeout(30000)
      });
      const data = await response.json();
      if (data.error || !data?.choices?.[0]?.message?.content) continue;
      return { reply: data.choices[0].message.content, model };
    } catch { continue; }
  }
  throw new Error("Koi bhi vision model kaam nahi kar raha");
}

// ── AI CHAT — Normal
app.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [], image, newsContext } = req.body;
    if (!msg) return res.status(400).json({ error: "Message chahiye" });

    let webContext = null;
    if (needsWebSearch(msg)) webContext = await webSearch(msg);

    const messages = buildMessages(history, newsContext, msg, image, webContext);

    const result = image ? await callVisionAI(messages) : await callAI(messages);
    res.json({ reply: result.reply });
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

    // Streaming — models try karo ek ek karke
    let streamSuccess = false;
    for (let i = 0; i < AI_MODELS.length; i++) {
      const model = AI_MODELS[i];
      try {
        if (i > 0) {
          res.write(`data: ${JSON.stringify({ status: `🔄 Model ${i+1} try ho raha hai...` })}\n\n`);
        }
        const response = await callAI(messages, true);
        if (!response?.body) continue;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let hasContent = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.replace("data: ", "").trim();
            if (raw === "[DONE]") {
              res.write("data: [DONE]\n\n");
              res.end();
              streamSuccess = true;
              return;
            }
            try {
              const parsed = JSON.parse(raw);
              const token = parsed?.choices?.[0]?.delta?.content || "";
              if (token) { hasContent = true; res.write(`data: ${JSON.stringify({ token })}\n\n`); }
            } catch {}
          }
        }

        if (hasContent) { streamSuccess = true; break; }
      } catch (e) {
        console.log(`Stream model ${model} failed:`, e.message);
        if (i === AI_MODELS.length - 1) break;
      }
    }

    if (!streamSuccess) {
      res.write(`data: ${JSON.stringify({ error: "Sab models busy hain, thodi der baad try karo" })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error("Stream Error:", e);
    try { res.write(`data: ${JSON.stringify({ error: "AI fail ho gaya" })}\n\n`); res.end(); } catch {}
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server port ${PORT} pe chal raha hai — Auto Fallback AI ⚡`));
