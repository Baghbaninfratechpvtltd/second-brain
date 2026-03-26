const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Sabse zaroori: 'public' folder ko serve karna
app.use(express.static(path.join(__dirname, "public")));

const GEMINI_KEY = process.env.GEMINI_KEY;

app.post("/chat", async (req, res) => {
  try {
    const { msg } = req.body;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: msg }] }] })
      }
    );
    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agar koi page na mile toh index.html dikhao
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running`));
