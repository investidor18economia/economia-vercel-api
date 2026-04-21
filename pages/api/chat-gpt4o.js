import { createClient } from "@supabase/supabase-js";

const API_SHARED_KEY = process.env.API_SHARED_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function extractBudget(text) {
  const match = text.match(/(\d+[.,]?\d*)\s*(mil|reais|r\$)?/i);
  if (!match) return null;

  let value = parseFloat(match[1].replace(",", "."));
  if (match[2]?.toLowerCase() === "mil") value *= 1000;

  return value;
}

function parsePrice(p) {
  return parseFloat(p?.replace(/[^\d,]/g, "").replace(",", "."));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientKey = (req.headers["x-api-key"] || "").toString();
  if (!API_SHARED_KEY || clientKey !== API_SHARED_KEY) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  const { text } = req.body || {};
  const query = (text || "").trim();

  if (!query) {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    // 🔥 usar rota local corretamente
    const response = await fetch(
      `http://localhost:3000/api/search?q=${encodeURIComponent(query)}`
    );

    let data = {};
    try {
      data = await response.json();
    } catch {}

    let products = data.products || [];

    // 🔥 fallback caso API falhe
    if (!products.length) {
      return res.status(200).json({
        reply: "⚠️ Não encontrei resultados confiáveis. Tente outra busca.",
        products: []
      });
    }

    const budget = extractBudget(query);

    if (budget) {
      const withinBudget = products.filter(p => {
        const price = parsePrice(p.price);
        return !isNaN(price) && price <= budget;
      });

      if (!withinBudget.length) {
        const lowest = Math.min(...products.map(p => parsePrice(p.price)));

        return res.status(200).json({
          reply: `⚠️ Não encontrei boas opções dentro de R$ ${budget.toLocaleString("pt-BR")}
📊 Os modelos mais próximos começam em R$ ${lowest.toLocaleString("pt-BR")}
❓ Quer ver opções nessa faixa?`,
          products
        });
      }

      products = withinBudget;
    }

    // 🔥 melhorar escolha com contexto
    const isGamer = /gamer|jogar|cyberpunk/i.test(query);

    if (isGamer) {
      const gamerFiltered = products.filter(p =>
        /gamer|rtx|gtx|radeon|ryzen 7|i7/i.test(p.title.toLowerCase())
      );

      if (gamerFiltered.length) {
        products = gamerFiltered;
      }
    }

    const best = products[0];

    let reply = `💰 Melhor preço confiável: ${best.price}`;

    if (data.priceRange) {
      reply += `\n📊 Faixa normal: ${data.priceRange.min} até ${data.priceRange.max}`;
    }

    reply += `\n🧠 ${best.title}`;

    if (isGamer) {
      if (!/rtx|gtx|radeon/i.test(best.title.toLowerCase())) {
        reply += `\n⚠️ Pode não rodar jogos pesados como Cyberpunk`;
      }
    }

    reply += `\n❓ Quer ver mais opções parecidas?`;

    return res.status(200).json({
      reply,
      products
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "Erro ao processar a busca."
    });
  }
}
