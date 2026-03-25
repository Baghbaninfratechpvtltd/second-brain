app.post("/chat", async (req, res) => {
  try {
    const { msg, history, imageBase64 } = req.body;
    const GEMINI_KEY = process.env.GEMINI_KEY;

    let contents = [];
    history.forEach(h => {
      contents.push({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] });
    });

    let parts = [{ text: msg || "Is photo ke baare mein batao" }];
    if (imageBase64) {
      parts.push({
        inlineData: { mimeType: "image/jpeg", data: imageBase64.split(",")[1] }
      });
    }
    contents.push({ role: "user", parts: parts });

    // New Gemini 1.5 Flash URL
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf kijiye, main samajh nahi paaya.";
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: "AI Connection Error" });
  }
});
