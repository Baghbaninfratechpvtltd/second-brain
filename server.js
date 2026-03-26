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

// CONFIG
const MONGO_URI  = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey123";
const GEMINI_KEY = process.env.GEMINI_KEY;

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

// AUTH MIDDLEWARE
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

// AI CHAT ROUTE
app.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { msg, history = [] } = req.body;
    
    // Gemini API ke liye contents structure
    const contents = history.map(h => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.text }]
    }));
    contents.push({ role: "user", parts: [{ text: msg }] });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents })
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error("Gemini Error:", data.error.message);
      return res.status(400).json({ error: data.error.message });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
    res.json({ reply });

  } catch (e) {
    res.status(500).json({ error: "Server error: " + e.message });
  }
});

// Root route fix: index.html serve karega
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
