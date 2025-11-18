import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientKey = req.headers["x-api-key"] || "";
  if (clientKey !== process.env.API_SHARED_KEY) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  try {
    const { text, user_id } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const userId = user_id || "guest";

    const { data: user } = await supabase
      .from("users")
      .select("plan, monthly_messages")
      .eq("id", userId)
      .single();

    const isPlus = user?.plan === "plus";
    const limit = isPlus
      ? Number(process.env.PLUS_MONTHLY_MSGS || 300)
      : Number(process.env.FREE_MONTHLY_MSGS || 5);

    if ((user?.monthly_messages || 0) >= limit) {
      return res.status(403).json({
        reply: "Você atingiu o limite mensal. Faça upgrade para Premium!",
        prices: []
      });
    }

    const apiUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://economia-ai.vercel.app";
    
    const response = await fetch(`${apiUrl}/api/chat-gpt4o`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.API_SHARED_KEY
      },
      body: JSON.stringify({
        text,
        user_id: userId,
        conversation_id: null
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro chat-gpt4o:", response.status, errorText);
      return res.status(500).json({
        reply: "Desculpe, tive um problema. Tente novamente!",
        prices: []
      });
    }

    const data = await response.json();

    if (userId !== "guest") {
      await supabase
        .from("users")
        .update({ monthly_messages: (user?.monthly_messages || 0) + 1 })
        .eq("id", userId);
    }

    return res.status(200).json({
      reply: data.reply || "Sem resposta no momento.",
      prices: data.prices || []
    });

  } catch (err) {
    console.error("Erro /api/economia:", err);
    return res.status(500).json({
      error: "Erro interno",
      reply: "Desculpe, algo deu errado!",
      prices: []
    });
  }
}
