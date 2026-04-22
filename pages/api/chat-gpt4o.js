// ================= IMPORTS =================
import { fetchSerpPrices } from "../../lib/prices";
import { callOpenAI, getOpenAIText } from "../../lib/openai";
import { MIA_SYSTEM_PROMPT } from "../../lib/miaPrompt";

const API_SHARED_KEY = process.env.API_SHARED_KEY;

// ================= UTILS =================
function parsePrice(value) {
  if (typeof value === "number") return value;
  if (!value) return NaN;

  const normalized = String(value)
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  return parseFloat(normalized);
}

function normalizeQuery(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function cleanTitle(title) {
  return (title || "").replace(/\s+/g, " ").trim();
}

// ================= GPU LOGIC =================
function hasDedicatedGpu(title) {
  const t = (title || "").toLowerCase();
  return /gtx|rtx|radeon|rx/.test(t);
}

function isTooOldGpu(title) {
  const t = (title || "").toLowerCase();
  return /gtx 750|gtx 650|gt 710|gt 730|550ti|1gb video|2gb video/.test(t);
}

function hasAcceptableGpuForUse(title, useIntent) {
  const t = (title || "").toLowerCase();

  if (useIntent === "gaming_light") {
    return /gtx|rtx|radeon|vega/.test(t);
  }

  if (useIntent === "gaming_medium") {
    return /gtx 1050|gtx 1650|rx 560|rx 570|rx 580|rtx/.test(t);
  }

  if (useIntent === "gaming_heavy") {
    return /gtx 1660|rtx|rx 580|rx 6600/.test(t);
  }

  return true;
}

// ================= INTENT =================
function getDetectedUseIntent(query) {
  const q = normalizeQuery(query);

  if (/minecraft|roblox/.test(q)) return "gaming_light";
  if (/gta|valorant|cs/.test(q)) return "gaming_medium";
  if (/warzone|cyberpunk/.test(q)) return "gaming_heavy";
  if (/jogo|gamer/.test(q)) return "gaming_medium";

  return "general";
}

// ================= SCORE =================
function scoreProduct(product, query) {
  const title = (product.product_name || "").toLowerCase();
  const q = normalizeQuery(query);
  const price = parsePrice(product.price);

  let score = 0;

  // relevância
  if (title.includes(q)) score += 50;

  // preço coerente
  if (price > 50) score += Math.max(0, 3000 - price) / 30;

  // PC / NOTEBOOK / GAMER
  if (/pc|notebook|computador/.test(q)) {
    if (/i5|i7|ryzen/.test(title)) score += 40;
    if (/16gb|8gb|ssd/.test(title)) score += 20;

    const useIntent = getDetectedUseIntent(q);

    // hardware antigo
    if (/i3 1|i5 1|i5 2/.test(title)) score -= 200;

    // gaming rules
    if (useIntent.includes("gaming")) {
      if (!hasDedicatedGpu(title)) score -= 400;
      if (isTooOldGpu(title)) score -= 350;

      if (hasAcceptableGpuForUse(title, useIntent)) {
        score += 100;
      }
    }
  }

  return score;
}

// ================= API =================
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

  if (!query) {
    return res.status(400).json({
      reply: "Me fala o que você quer que eu te ajudo a encontrar 👍",
      prices: []
    });
  }

  try {
    let products = await fetchSerpPrices(query, 10);

    let validProducts = products.map((p) => ({
      ...p,
      numericPrice: parsePrice(p.price)
    }));

    const useIntent = getDetectedUseIntent(query);

    if (useIntent.includes("gaming")) {
      const filtered = validProducts.filter((p) => {
        const title = p.product_name || "";
        return (
          hasDedicatedGpu(title) &&
          !isTooOldGpu(title) &&
          hasAcceptableGpuForUse(title, useIntent)
        );
      });

      if (filtered.length) {
        validProducts = filtered;
      } else {
        return res.status(200).json({
          reply:
            "⚠️ Nessa faixa de preço, não encontrei um PC realmente bom pra esse tipo de jogo. Se quiser, posso te sugerir uma faixa mais segura.",
          prices: []
        });
      }
    }

    const rankedProducts = validProducts
      .map((p) => ({
        ...p,
        score: scoreProduct(p, query)
      }))
      .sort((a, b) => b.score - a.score);

    return res.status(200).json({
      reply: "Olhei aqui e essa é a melhor opção que encontrei pra você 👇",
      prices: rankedProducts
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      reply: "Tive um erro aqui, tenta de novo 👍",
      prices: []
    });
  }
}
