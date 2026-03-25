const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path"); // File dhoondne ke liye zaroori hai

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Photo ke liye limit
app.use(express.static(path.join(__dirname, "public"))); // Public folder se files uthayega

const MONGO_URI  = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const GEMINI_KEY = process.env.GEMINI_KEY;

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

// --- MODELS ---
const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true }
}));

const Note = mongoose.model("Note", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  body: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
}));

// --- ROUTES ---
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    await User.create({ email, password: hashed });
    res.json({ message: "Account ban gaya!" });
  } catch (e) { res.status(500).json({ error: "Signup fail" }); }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    res.json({ token });
  } else { res.status(401).json({ error: "Details galat hain" }); }
});

// AI Chat Fix (Voice + Photo + History)
app.post("/chat", async (req, res) => {
  try {
    const { msg, history, imageBase64 } = req.body;
    let contents = [];

    history.forEach(h => {
      contents.push({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] });
    });

    let parts = [{ text: msg || "Is photo ko samjhao" }];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64.split(",")[1] } });
    }
    contents.push({ role: "user", parts: parts });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    res.json({ reply: data?.candidates?.[0]?.content?.parts?.[0]?.text || "No reply" });
  } catch (e) { res.status(500).json({ error: "AI link error" }); }
});

// Sabse niche ye zaroori hai "Cannot GET /" fix ke liye
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
