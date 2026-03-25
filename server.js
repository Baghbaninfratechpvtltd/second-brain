const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Photo ke liye limit badha di
app.use(express.static("public"));

const MONGO_URI  = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const GEMINI_KEY = process.env.GEMINI_KEY;

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

// Models
const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true }
}));

const Note = mongoose.model("Note", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: String,
  body: String,
  createdAt: { type: Date, default: Date.now }
}));

// Auth Routes (Signup/Login) - Aapka purana code yahan kaam karega
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    await User.create({ email, password: hashed });
    res.json({ message: "Account ban gaya!" });
  } catch (e) { res.status(500).json({ error: "Fail ho gaya" }); }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    res.json({ token });
  } else { res.status(401).json({ error: "Galat details" }); }
});

// --- AI Chat with Vision (Photo) & Translation ---
app.post("/chat", async (req, res) => {
  try {
    const { msg, history, imageBase64 } = req.body;
    let contents = [{ role: "user", parts: [{ text: "You are an advanced Second Brain AI. Help with notes, translations, and reminders." }] }];
    
    history.forEach(h => contents.push({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] }));

    let currentPart = { text: msg };
    let payloadParts = [currentPart];

    if (imageBase64) {
      payloadParts.push({
        inlineData: { mimeType: "image/jpeg", data: imageBase64.split(",")[1] }
      });
    }

    contents.push({ role: "user", parts: payloadParts });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf kijiye, samajh nahi aaya.";
    res.json({ reply });
  } catch (e) { res.status(500).json({ error: "AI Error" }); }
});

app.listen(process.env.PORT || 3000, () => console.log("🚀 Server Ready"));
