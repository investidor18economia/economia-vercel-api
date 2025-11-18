// pages/api/ai.js
import { createClient } from "@supabase/supabase-js";
import { callOpenAI } from "../../lib/openai";
import { fetchSerpPrices } from "../../lib/prices";

const API_SHARED_KEY = process.env.API_SHARED_KEY;
const MODEL = process.env.MODEL_GPT4O_MINI || "gpt-4o-mini";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const clientKey = (req.headers["x-api-key"] || "").toString();
  if (!API_SHARED_KEY || clientKey !== API_SHARED_KEY) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  const { text, user_id, conversation_id: conv_id } = req.body || {};
  const query = (text || "").trim();
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });
  if (!query) return res.status(400).json({ error: "Missing text" });

  let conversation_id = conv_id || null;

  try {
    // 1) read user and limits from supabase
    const { data: users } = await supabase
      .from("users")
      .select("id, plan, monthly_messages")
      .eq("id", user_id)
      .limit(1);
    const user = users?.[0] || null;
    const plan = user?.plan || "free";
    const FREE_LIMIT = parseInt(process.env.FREE_MONTHLY_MSGS || "5", 10);
    const PLUS_LIMIT = parseInt(process.env.PLUS_MONTHLY_MSGS || "300", 10);
    const limit = plan === "plus" ? PLUS_LIMIT : FREE_LIMIT;
    if ((user?.monthly_messages || 0) >= limit) {
      return res.status(403).json({ error: "quota_exceeded", message: `Quota ${limit} reached` });
    }

    // 2) ensure conversation
    if (!conversation_id) {
      const insertConv = await supabase.from("conversations").insert([{ user_id }]).select("id").limit(1);
      conversation_id = insertConv.data?.[0]?.id || null;
    }

    // 3) fetch prices: first try Supabase cache, then SerpAPI fallback
    let prices = [];
    try {
      const { data: cacheRows } = await supabase
        .from("cache_results")
        .select("*")
        .ilike("product_name", `%${query}%`)
        .limit(6);
      if (cacheRows && cacheRows.length) {
        prices = cacheRows.map(r => ({
          product_name: r.product_name,
          price: r.price,
          link: r.link || r.redirectUrl || null,
        }));
      }
    } catch (e) {
      console.warn("supabase cache read failed", e);
    }

    if (!prices.length) {
      // fallback to SerpAPI
      try {
        prices = await fetchSerpPrices(query, Number(process.env.SERPAPI_MAX || 10));
      } catch (err) {
        console.warn("SerpAPI failed", err);
      }
    }

    // 4) build prompt for GPT
    const systemPrompt = `Você é a MIA, assistente da EconomIA. Seja objetivo, amigável, explique custo-benefício e use apenas os dados fornecidos.`;
    const pricesText = prices && prices.length ? prices.map(p => `• ${p.product_name} — ${p.price} — ${p.link || "sem link"}`).join("\n") : "Sem preços disponíveis.";

    const userPrompt = `
Usuário perguntou: "${query}"

Preços encontrados:
${pricesText}

Responda de forma curta, amigável, cite o melhor preço e o custo-benefício. Use SOMENTE os dados acima.
`;

    // 5) call OpenAI
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const openaiRes = await callOpenAI(messages, { model: process.env.MODEL_GPT4O_MINI || MODEL });
    const miaReply = openaiRes?.choices?.[0]?.message?.content || openaiRes.output_text || "Desculpe, não consegui gerar resposta.";

    // 6) save messages & usage & increment monthly count
    try {
      await supabase.from("messages").insert([
        { conversation_id, role: "user", content: query },
        { conversation_id, role: "assistant", content: miaReply }
      ]);
      await supabase.from("usage_log").insert([{
        user_id,
        model: process.env.MODEL_GPT4O_MINI || MODEL,
        prompt_tokens: openaiRes?.usage?.prompt_tokens || null,
        completion_tokens: openaiRes?.usage?.completion_tokens || null,
        cost: null
      }]);
      await supabase.from("users").update({ monthly_messages: (user?.monthly_messages || 0) + 1 }).eq("id", user_id);
    } catch (e) {
      console.warn("saving usage failed", e);
    }

    // 7) return unified response
    return res.status(200).json({
      conversation_id,
      reply: miaReply,
      prices
    });

  } catch (err) {
    console.error("ai handler error:", err);
    return res.status(500).json({ error: "internal_error", details: String(err) });
  }
}
