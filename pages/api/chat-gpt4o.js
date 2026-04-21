import { createClient } from "@supabase/supabase-js";
import { fetchSerpPrices } from "../../lib/prices";

const API_SHARED_KEY = process.env.API_SHARED_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function parsePrice(value) {
  if (typeof value === "number") return value;
  if (!value) return NaN;
  return parseFloat(String(value).replace(/[^\d,]/g, "").replace(",", "."));
}

function normalizeQuery(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// 🧠 NOVO: SCORE DE QUALIDADE DO PRODUTO
function scoreProduct(p) {
  const title = (p.product_name || "").toLowerCase();
  const price = parsePrice(p.price);

  let score = 0;

  // base
  score += 1000 - price; // mais barato ganha ponto, mas não domina tudo

  // ❌ penalizações
  if (/usado|seminovo|recondicionado/.test(title)) score -= 300;
  if (/leia|descricao|vendo|troco|retirada/.test(title)) score -= 400;
  if (title.length < 20) score -= 200;

  // ✅ bônus
  if (/gb|ssd|ram|128|256|512/.test(title)) score += 100;
  if (/pro|max|plus|ultra/.test(title)) score += 120;
  if (/novo|lacrado/.test(title)) score += 150;

  return score;
}

function extractBudget(text) {
  const q = (text || "").toLowerCase();

  const patterns = [
    /até\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /abaixo\s*de\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /menos\s*de\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /no\s*m[aá]ximo\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match) {
      let value = parseFloat(match[1].replace(",", "."));
      if (match[2]) value *= 1000;
      return value;
    }
  }

  return null;
}

function wantsNewProduct(query) {
  return /\bnovo\b|\bnova\b|\blacrado\b|\bzerado\b/i.test(query || "");
}

function detectIntent(query) {
  const q = normalizeQuery(query);

  if (/oi|ola|opa|fala|bom dia|boa tarde|boa noite/.test(q)) return "greeting";
  if (/ou|vs|versus|melhor comprar/.test(q)) return "comparison";
  if (/vale a pena|compensa/.test(q)) return "decision";
  if (/melhor|recomenda|indica/.test(q)) return "recommendation";
  if (/celular|notebook|tv|ps5|xbox/.test(q)) return "generic";

  return "other";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientKey = (req.headers["x-api-key"] || "").toString();
  if (!API_SHARED_KEY || clientKey !== API_SHARED_KEY) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  const { text } = req.body || {};
  const query = (text || "").trim();

  const intent = detectIntent(query);

  if (intent === "greeting") {
    return res.status(200).json({
      reply: "👋 Oi! Me fala o que você quer comprar que eu te ajudo a escolher a melhor opção.",
      prices: []
    });
  }

  if (intent === "comparison") {
    return res.status(200).json({
      reply: "⚖️ Me manda os 2 modelos que você quer comparar e o que é mais importante pra você (preço, desempenho, bateria, etc).",
      prices: []
    });
  }

  try {
    let products = await fetchSerpPrices(query, 8);

    if (!products.length) {
      return res.status(200).json({
        reply: "⚠️ Não encontrei resultados confiáveis.",
        prices: []
      });
    }

    const budget = extractBudget(query);
    if (budget) {
      const filtered = products.filter((p) => parsePrice(p.price) <= budget);
      if (filtered.length) products = filtered;
    }

    if (wantsNewProduct(query)) {
      const filtered = products.filter(
        (p) => !/usado|seminovo|recondicionado/.test(p.product_name.toLowerCase())
      );
      if (filtered.length) products = filtered;
    }

    let validProducts = products
      .map((p) => ({ ...p, numericPrice: parsePrice(p.price) }))
      .filter((p) => !isNaN(p.numericPrice));

    if (!validProducts.length) {
      return res.status(200).json({
        reply: "⚠️ Não encontrei resultados válidos.",
        prices: []
      });
    }

    // 🧠 NOVO: rankear por score
    validProducts = validProducts
      .map((p) => ({ ...p, score: scoreProduct(p) }))
      .sort((a, b) => b.score - a.score);

    const best = validProducts[0];

    let reply = `🧠 Essa é a melhor escolha considerando custo-benefício:\n\n💰 ${best.price}\n📦 ${best.product_name}`;

    if (intent === "decision") {
      reply += `\n\n👉 Sim, essa opção compensa pelo equilíbrio entre preço e qualidade.`;
    }

    if (intent === "recommendation") {
      reply += `\n\n📊 Dentro das opções encontradas, essa entrega o melhor retorno pelo valor.`;
    }

    reply += `\n\n❓ Quer que eu compare com outra opção ou te mostre alternativas?`;

    return res.status(200).json({
      reply,
      prices: validProducts.map((p) => ({
        product_name: p.product_name,
        price: p.price,
        link: p.link,
        thumbnail: p.thumbnail
      }))
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "Erro interno",
      prices: []
    });
  }
}
