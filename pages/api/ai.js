import { OpenAI } from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Método inválido" });

    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.API_SHARED_KEY) {
      return res.status(401).json({ error: "invalid_api_key" });
    }

    const { text, user_id, conversation_id } = req.body;
    if (!text || !user_id) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Você é a MIA, assistente da Economia.AI" },
        { role: "user", content: text }
      ]
    });

    return res.status(200).json({
      conversation_id: conversation_id || crypto.randomUUID(),
      reply: completion.choices[0].message.content
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "internal_error", details: err.message });
  }
}
