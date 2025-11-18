// /api/chat-gpt4o.js
import { createClient } from "@supabase/supabase-js";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.MODEL_GPT4O_MINI || "gpt-4o-mini";
const API_SHARED_KEY = process.env.API_SHARED_KEY;
const FREE_LIMIT = parseInt(process.env.FREE_MONTHLY_MSGS || "5", 10);
const PLUS_LIMIT = parseInt(process.env.PLUS_MONTHLY_MSGS || "300", 10);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Função para chamar a API OpenAI GPT-4O Mini
async function callOpenAI(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.15,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status} ${txt}`);
  }

  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // Verifica a shared key
  const clientKey = (req.headers["x-api-key"] || "").toString();
  if (!API_SHARED_KEY || clientKey !== API_SHARED_KEY) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  const body = req.body || {};
  const user_id = body.user_id;
  const text = (body.text || "").trim();
  let conversation_id = body.conversation_id || null;

  if (!user_id) return res.status(400).json({ error: "Missing user_id" });
  if (!text) return res.status(400).json({ error: "Missing text" });

  try {
    // ✅ 1 - Obter informações do usuário
    const { data: users } = await supabase
      .from("users")
      .select("id, plan, monthly_messages")
      .eq("id", user_id)
      .limit(1);

    const user = users?.[0];
    const plan = user?.plan || "free";
    const limit = plan === "plus" ? PLUS_LIMIT : FREE_LIMIT;

    if ((user?.monthly_messages || 0) >= limit) {
      return res.status(403).json({
        error: "quota_exceeded",
        message: `Você atingiu o limite de ${limit} perguntas mensais para seu plano (${plan}).`,
      });
    }

    // ✅ 2 - Buscar preços no Supabase
    let results = [];
    try {
      results = await supabase
        .from("cache_results")
        .select("*")
        .ilike("product_name", `%${text}%`)
        .limit(10);
    } catch (err) {
      console.error("Erro ao buscar preços:", err);
    }

    // ✅ 3 - Criar prompt para GPT-4O Mini
    const prompt = `
Você é a MIA, assistente da EconomIA.

O usuário perguntou: "${text}"

Aqui estão os preços encontrados:
${results.map(r => `• ${r.product_name} — R$ ${r.price} — ${r.link}`).join("\n")}

Responda de forma clara e amigável.
Mostre o melhor preço e o custo-benefício.
Use SOMENTE os dados fornecidos acima.
`;

    // ✅ 4 - Montar mensagens para OpenAI
    const messagesForOpenAI = [
      { role: "system", content: "Você é a MIA, assistente da EconomIA. Seja amigável, objetivo e explique custo-benefício." },
      { role: "user", content: prompt }
    ];

    // ✅ 5 - Salvar mensagem do usuário
    if (conversation_id) {
      await supabase
        .from("messages")
        .insert([{ conversation_id, role: "user", content: text }]);
    }

    // ✅ 6 - Chamada GPT-4O Mini
    const openaiRes = await callOpenAI(messagesForOpenAI);
    const miaReply = openaiRes.choices?.[0]?.message?.content || "";

    // ✅ 7 - Salvar resposta da MIA
    if (conversation_id) {
      await supabase
        .from("messages")
        .insert([{ conversation_id, role: "assistant", content: miaReply }]);
    }

    // ✅ 8 - Atualizar contagem de mensagens do usuário
    await supabase
      .from("users")
      .update({ monthly_messages: (user?.monthly_messages || 0) + 1 })
      .eq("id", user_id);

    // ✅ 9 - Retornar resposta + preços
    return res.status(200).json({
      conversation_id,
      reply: miaReply,
      prices: results
    });

  } catch (err) {
    console.error("Erro handler chat-gpt4o:", err);
    return res.status(500).json({
      error: "internal_error",
      details: String(err)
    });
  }
}
