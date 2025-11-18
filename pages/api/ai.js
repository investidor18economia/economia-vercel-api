// pages/api/ai.js

export default async function handler(req, res) {
  try {
    // Only allow POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Validate API shared key
    const clientKey = (req.headers["x-api-key"] || "").toString();
    if (!clientKey || clientKey !== process.env.API_SHARED_KEY) {
      return res.status(401).json({ error: "invalid_api_key" });
    }

    // Extract body
    const { text, user_id, conversation_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "Missing user_id" });
    if (!text) return res.status(400).json({ error: "Missing text" });

    // Message format for OpenAI
    const messages = [
      { role: "system", content: "Você é a MIA, assistente da EconomIA. Seja objetivo e amigável." },
      { role: "user", content: text }
    ];

    // Ensure OpenAI key exists
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      return res.status(500).json({ error: "OpenAI key not configured" });
    }

    // Call OpenAI API using fetch
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.MODEL_GPT4O_MINI || "gpt-4o-mini",
        messages,
        temperature: 0.15,
        max_tokens: 800
      })
    });

    // If OpenAI returns error
    if (!openaiResp.ok) {
      const txt = await openaiResp.text().catch(() => "");
      console.error("OpenAI error", openaiResp.status, txt);
      return res.status(500).json({ error: "openai_error", details: txt });
    }

    // Parse OpenAI response
    const openaiJson = await openaiResp.json();
    const miaReply =
      openaiJson?.choices?.[0]?.message?.content ||
      openaiJson?.output_text ||
      "";

    // Minimal successful response
    return res.status(200).json({
      conversation_id: conversation_id || null,
      reply: miaReply,
      prices: []
    });

  } catch (err) {
    console.error("ai handler error:", err);
    return res.status(500).json({
      error: "internal_error",
      details: String(err)
    });
  }
}
