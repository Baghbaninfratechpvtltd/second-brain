const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const MONGO_URI  = process.env.MONGO_URI;
const GEMINI_KEY = process.env.GEMINI_KEY;

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e => console.log("❌ MongoDB Error:", e.message));

// AI Chat Route (Simplified for Gemini 1.5 Flash)
app.post("/chat", async (req, res) => {
  try {
    const { msg, history = [], imageBase64 } = req.body;
    
    // Format contents for Google API
    let contents = [];
    
    // History add karein
    history.forEach(h => {
      contents.push({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text }]
      });
    });

    // Current message aur image add karein
    let userParts = [{ text: msg || "Explain this image" }];
    if (imageBase64) {
      userParts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64.split(",")[1]
        }
      });
    }
    contents.push({ role: "user", parts: userParts });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("Gemini Error:", data.error.message);
      return res.status(400).json({ error: data.error.message });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from AI.";
    res.json({ reply });

  } catch (e) {
    res.status(500).json({ error: "Server error: " + e.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
