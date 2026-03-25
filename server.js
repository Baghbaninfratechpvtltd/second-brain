const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ─── CONFIG — Render pe Environment Variables mein daalein ───
const MONGO_URI  = process.env.MONGO_URI  || "YOUR_MONGODB_URI";
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey123";
const GEMINI_KEY = process.env.GEMINI_KEY || "YOUR_GEMINI_API_KEY";
// ─────────────────────────────────────────────────────────────

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

// ─── MODELS ──────────────────────────────────────────────────

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

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────

function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login karo pehle" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token invalid hai" });
  }
}

// ─── ROUTES ──────────────────────────────────────────────────

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email aur password dono chahiye" });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ error: "Yeh email pehle se registered hai" });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ email, password: hashed });
    res.json({ message: "Account ban gaya ✅" });
  } catch (e) {
    res.status(500).json({ error: "Signup fail ho gaya" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ error: "User nahi mila" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ error: "Password galat hai" });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, email: user.email });
  } catch (e) {
    res.status(500).json({ error: "Login fail ho gaya" });
  }
});

// SAVE NOTE
app.post("/notes", authMiddleware, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title)
      return res.status(400).json({ error: "Title zaroori hai" });
    const note = await Note.create({ userId: req.user.id, title, body });
    res.json(note);
  } catch (e) {
    res.status(500).json({ error: "Note save nahi hua" });
  }
});

// GET ALL NOTES
app.get("/notes", authMiddleware, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(notes);
  } catch (e) {
    res.status(500).json({ error: "Notes load nahi hue" });
  }
});

// DELETE NOTE
app.delete("/notes/:id", authMiddleware, async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user.id });
    if (!note)
      return res.status(404).json({ error: "Note nahi mila" });
    await note.deleteOne();
    res.json({ message: "Note delete ho gaya ✅" });
  } catch (e) {
    res.status(500).json({ error: "Delete fail ho gaya" });
  }
});

// ─── AI CHAT — Gemini with Memory + Claude-like Personality ──

const SYSTEM_PROMPT = `You are a highly intelligent, helpful AI assistant — similar in style and quality to Claude by Anthropic.

Your behavior:
- Give clear, detailed, well-structured answers
- Use bullet points, numbered lists, headings, and code blocks when helpful
- Be honest — if you don't know something, say so clearly
- Be warm, respectful, and never dismissive
- Remember everything said earlier in this conversation and use that context
- For coding: provide complete working code with explanations
- For creative tasks: be imaginative and thoughtful
- Always respond in the SAME language the user writes in (Hindi, English, or Hinglish)

You are the AI inside "Second Brain" — a personal notes and knowledge app.`;

app.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [] } = req.body;
    if (!msg)
      return res.status(400).json({ error: "Message chahiye" });

    // Build conversation contents for Gemini
    const contents = [];

    // System prompt as first exchange (Gemini ka trick)
    contents.push({ role: "user",  parts: [{ text: SYSTEM_PROMPT }] });
    contents.push({ role: "model", parts: [{ text: "Samajh gaya! Main aapka intelligent Second Brain assistant hoon. Poochho jo bhi chahiye!" }] });

    // Past conversation history
    for (const turn of history) {
      contents.push({
        role: turn.role === "user" ? "user" : "model",
        parts: [{ text: turn.text }]
      });
    }

    // Current message
    contents.push({ role: "user", parts: [{ text: msg }] });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature:     0.7,
            maxOutputTokens: 2048,
            topP:            0.95
          }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error("Gemini Error:", data.error);
      return res.status(500).json({ error: "Gemini: " + data.error.message });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Koi jawab nahi mila.";
    res.json({ reply });

  } catch (e) {
    console.error("AI Error:", e);
    res.status(500).json({ error: "AI request fail ho gaya" });
  }
});

// ─── START ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server chal raha hai port ${PORT} pe`));
