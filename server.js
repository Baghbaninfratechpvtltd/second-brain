const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const MONGO_URI       = process.env.MONGO_URI       || "YOUR_MONGODB_URI";
const JWT_SECRET      = process.env.JWT_SECRET      || "supersecretkey123";
const OPENROUTER_KEY  = process.env.OPENROUTER_KEY  || "YOUR_OPENROUTER_KEY";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

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

app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email aur password dono chahiye" });
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ error: "Yeh email pehle se registered hai" });
    const hashed = await bcrypt.hash(password, 10);
    await User.create({ email, password: hashed });
    res.json({ message: "Account ban gaya ✅" });
  } catch (e) {
    res.status(500).json({ error: "Signup fail: " + e.message });
  }
});

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
    res.status(500).json({ error: "Login fail: " + e.message });
  }
});

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

app.get("/notes", authMiddleware, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(notes);
  } catch (e) {
    res.status(500).json({ error: "Notes load nahi hue" });
  }
});

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

app.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [] } = req.body;
    if (!msg)
      return res.status(400).json({ error: "Message chahiye" });

    const messages = [
      {
        role: "system",
        content: `You are a highly intelligent, helpful AI assistant similar to Claude by Anthropic.
- Give clear, detailed, well-structured answers
- Use bullet points, numbered lists, headings, code blocks when helpful
- Be honest, warm, and respectful
- Remember everything said earlier in this conversation
- Always respond in the SAME language the user writes in (Hindi, English, or Hinglish)
You are the AI inside "Second Brain" — a personal notes and knowledge app.`
      }
    ];

    for (const turn of history) {
      messages.push({
        role: turn.role === "user" ? "user" : "assistant",
        content: turn.text
      });
    }
    messages.push({ role: "user", content: msg });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
  model: "google/gemma-3-27b-it:free",
  messages,
})
    });

    const data = await response.json();
    if (data.error)
      return res.status(500).json({ error: "AI: " + data.error.message });

    const reply = data?.choices?.[0]?.message?.content || "Koi jawab nahi mila.";
    res.json({ reply });

  } catch (e) {
    console.error("AI Error:", e);
    res.status(500).json({ error: "AI fail ho gaya" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server chal raha hai port ${PORT} pe`));
