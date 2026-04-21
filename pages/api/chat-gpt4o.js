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

function formatBRL(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
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

function isComplexQuery(query) {
  return /qual o melhor|melhor|vale a pena|compensa|rodar|gamer|cyberpunk|estudar|ou /i.test(query);
}

function cleanTitle(title) {
  return (title || "")
    .replace(/\b(barato|barata|promoção|promocao|oferta|imperdível|imperdivel|p sair hoje|para sair hoje|aproveite|últimas unidades|ultimas unidades)\b/gi, "")
    .replace(/\b(agora)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wantsNewProduct(query) {
  return /\bnovo\b|\bnova\b|\blacrado\b|\blacrada\b|\bzerado\b/i.test(query || "");
}

function isUsedLikeProduct(title) {
  const t = (title || "").toLowerCase();

  const usedTerms = [
    "usado", "usada", "seminovo", "seminova",
    "recondicionado", "open box", "vitrine",
    "marcas de uso", "bateria", "trocafone"
  ];

  return usedTerms.some(term => t.includes(term));
}

function isSuspiciousListing(title) {
  const t = (title || "").toLowerCase();

 const suspiciousTerms = [
  "leia a descrição",
  "leia a descricao",
  "vende-se",
  "vendo",
  "troco",
  "retirada",
  "retirar",
  "chama no chat",
  "chamar no chat",
  "somente hoje",
  "oportunidade",
  "urgente",
  "negocio",
  "negócio",
  "falar no chat",
  "fale no chat",
  "descrição",
  "descricao"
];

  return suspiciousTerms.some(term => t.includes(term));
}

function isBadProduct(title) {
  return isSuspiciousListing(title) || isUsedLikeProduct(title);
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

  try {
    let products = await fetchSerpPrices(query, 8);

    if (!products.length) {
      return res.status(200).json({
        reply: "⚠️ Nenhum resultado encontrado.",
        prices: []
      });
    }

    const budget = extractBudget(query);

    if (budget) {
      products = products.filter(p => parsePrice(p.price) <= budget);
    }

    if (wantsNewProduct(query)) {
      const filtered = products.filter(p => !isUsedLikeProduct(p.product_name));
      if (filtered.length) products = filtered;
    }

    let validProducts = products
      .map(p => ({ ...p, numericPrice: parsePrice(p.price) }))
      .filter(p => !isNaN(p.numericPrice))
      .sort((a, b) => a.numericPrice - b.numericPrice);

    if (!validProducts.length) {
      return res.status(200).json({
        reply: "⚠️ Nenhum resultado encontrado.",
        prices: []
      });
    }

    const goodProducts = validProducts.filter(p => !isBadProduct(p.product_name));
    const base = goodProducts.length ? goodProducts : validProducts;

    const best = base[0];
    const title = cleanTitle(best.product_name);

    const hasCheaperBad = validProducts.some(p =>
      parsePrice(p.price) < parsePrice(best.price) &&
      isBadProduct(p.product_name)
    );

    const reply = `💰 Melhor preço confiável: ${best.price}
🧠 ${title}${
  hasCheaperBad ? "\n⚠️ Existem opções mais baratas, mas podem ser menos confiáveis" : ""
}
❓ Quer ver mais opções?`;

    return res.status(200).json({
      reply,
      prices: validProducts.map(p => ({
        product_name: cleanTitle(p.product_name),
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
