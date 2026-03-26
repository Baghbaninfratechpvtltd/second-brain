const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Public folder ki files serve karne ke liye
app.use(express.static(path.join(__dirname, "public")));

const GEMINI_KEY = process.env.GEMINI_KEY;

app.post("/chat", async (req, res) => {
  try {
    const { msg } = req.body;
    
    // Yahan humne 'v1beta' ko 'v1' se badal diya hai jo zyada stable hai
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: msg }] }]
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error("Gemini API Error:", data.error.message);
      return res.status(400).json({ error: data.error.message });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf kijiye, main samajh nahi paya.";
    res.json({ reply });

  } catch (e) {
    console.error("Server Error:", e.message);
    res.status(500).json({ error: "Server error: " + e.message });
  }
});

// Default route jo index.html dikhayega
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
