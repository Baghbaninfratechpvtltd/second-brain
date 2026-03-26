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

const MONGO_URI  = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const GEMINI_KEY = process.env.GEMINI_KEY;

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

// AI Chat - Bina Token ke chalne ke liye authMiddleware hata diya
app.post("/chat", async (req, res) => {
  try {
    const { msg, history = [], imageBase64 } = req.body;
    let contents = [];

    if (history.length > 0) {
      history.forEach(h => {
        contents.push({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] });
      });
    }

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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
