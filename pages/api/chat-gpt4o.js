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
  if (match[2] === "mil") value *= 1000;

  return value;
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

  const { text, user_id } = req.body || {};
  const query = (text || "").trim();

  if (!query) {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    // 🔥 chama sua API inteligente
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/search?q=${encodeURIComponent(query)}`
    );

    const data = await response.json();

    if (!response.ok || !data.products?.length) {
      return res.status(200).json({
        reply: "⚠️ Não encontrei resultados confiáveis para essa busca.",
        products: []
      });
    }

    const budget = extractBudget(query);

    let products = data.products;

    // 🔥 FILTRO DE ORÇAMENTO
    if (budget) {
      const withinBudget = products.filter(p => {
        const price = parseFloat(
          p.price?.replace(/[^\d,]/g, "").replace(",", ".")
        );
        return price <= budget;
      });

      if (!withinBudget.length) {
        return res.status(200).json({
          reply: `⚠️ Não encontrei boas opções dentro de R$ ${budget.toLocaleString("pt-BR")}
📊 Os modelos mais próximos começam acima disso
❓ Quer ver opções nessa faixa maior?`,
          products
        });
      }

      products = withinBudget;
    }

    const best = products[0];

    // 🔥 RESPOSTA INTELIGENTE
    let reply = `💰 Melhor preço confiável: ${best.price}`;

    if (data.priceRange) {
      reply += `\n📊 Faixa normal: ${data.priceRange.min} até ${data.priceRange.max}`;
    }

    reply += `\n🧠 ${best.title}`;

    // 🔥 DETECTAR PERGUNTA COMPLEXA
    if (/melhor|vale|compensa|rodar|jogar/i.test(query)) {
      reply += `\n📊 Boa opção para uso geral`;

      if (/cyberpunk|gamer|jogar/i.test(query)) {
        reply += `, mas pode não rodar jogos pesados`;
        reply += `\n⚠️ Para jogos exigentes, ideal investir mais`;
      }
    }

    reply += `\n❓ Quer ver mais opções parecidas?`;

    return res.status(200).json({
      reply,
      products
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
}
