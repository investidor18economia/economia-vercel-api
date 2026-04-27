import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("plan, monthly_messages")
      .eq("id", userId)
      .maybeSingle();

    if (userError) {
      console.error("Erro ao buscar user:", userError);
    }

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

    const apiUrl = "https://economia-ai.vercel.app";

    let data;

try {
  const response = await fetch(`${apiUrl}/api/chat-gpt4o`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.API_SHARED_KEY
    },
   body: JSON.stringify({
  text,
  user_id: userId,
  conversation_id: null,
  messages: req.body.messages || []
})
  });

  const textResponse = await response.text();
console.log("RAW RESPONSE:", textResponse);

try {
  data = JSON.parse(textResponse);
} catch (e) {
  console.error("ERRO PARSE JSON:", e);
  return res.status(200).json({
    reply: "Erro ao interpretar resposta da API interna",
    prices: []
  });
}

  if (!response.ok) {
    console.error("Erro chat-gpt4o:", response.status, data);

    return res.status(200).json({
      reply: data?.reply || "Tive um problema ao processar, tenta de novo 😊",
      prices: []
    });
  }

} catch (fetchError) {
  console.error("Erro no fetch chat-gpt4o:", fetchError);

  return res.status(200).json({
    reply: "⚠️ Não consegui conectar agora, tenta novamente em instantes 😊",
    prices: []
  });
}

    if (userId !== "guest") {
      const currentMessages = user?.monthly_messages || 0;

      const { error: upsertError } = await supabase
        .from("users")
        .upsert({
          id: userId,
          monthly_messages: currentMessages + 1,
          plan: user?.plan || "free"
        });

      if (upsertError) {
        console.error("Erro ao atualizar user:", upsertError);
      }
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
