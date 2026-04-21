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

function extractBudget(text) {
  const q = (text || "").toLowerCase();
  const match = q.match(/até\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i);
  if (!match) return null;

  let value = parseFloat(match[1].replace(",", "."));
  if (match[2]) value *= 1000;
  return value;
}

function cleanTitle(title) {
  return (title || "")
    .replace(/\b(barato|promoção|oferta|p sair hoje|agora)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wantsNewProduct(query) {
  return /\bnovo\b|\bnova\b|\blacrado\b/i.test(query || "");
}

function isUsedLikeProduct(title) {
  const t = (title || "").toLowerCase();
  return /usado|seminovo|recondicionado|open box|bateria|marcas de uso/.test(t);
}

function isSuspiciousListing(title) {
  const t = (title || "").toLowerCase();
  return /leia|descri|vende|vendo|troco|retirada|chat/.test(t);
}

function isBadProduct(title) {
  return isUsedLikeProduct(title) || isSuspiciousListing(title);
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

    // orçamento
    const budget = extractBudget(query);
    if (budget) {
      const filtered = products.filter(p => parsePrice(p.price) <= budget);
      if (filtered.length) products = filtered;
    }

    // novo
    if (wantsNewProduct(query)) {
      const filtered = products.filter(p => !isUsedLikeProduct(p.product_name));
      if (filtered.length) products = filtered;
    }

    // ordenar
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

    // separar bons
    const goodProducts = validProducts.filter(p => !isBadProduct(p.product_name));

    // escolher base
    const base = goodProducts.length ? goodProducts : validProducts;

    // melhor produto
    const best = base[0];
    const title = cleanTitle(best.product_name);

    // aviso inteligente
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
