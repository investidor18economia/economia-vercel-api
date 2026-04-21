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

function cleanTitle(title) {
  return (title || "")
    .replace(/\b(barato|barata|promoção|promocao|oferta|p sair hoje|para sair hoje|agora|aproveite|imperdível|imperdivel)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuery(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function wantsNewProduct(query) {
  return /\bnovo\b|\bnova\b|\blacrado\b|\blacrada\b|\bzerado\b/i.test(query || "");
}

function isUsedLikeProduct(title) {
  const t = (title || "").toLowerCase();
  return /usado|usada|seminovo|seminova|recondicionado|open box|bateria|marcas de uso|trocafone|segunda mao|segunda mão/.test(t);
}

function isSuspiciousListing(title) {
  const t = (title || "").toLowerCase();
  return /leia|descri|vende|vendo|troco|retirada|retirar|chat|urgente|oportunidade|negocio|negócio/.test(t);
}

function isBadProduct(title) {
  return isUsedLikeProduct(title) || isSuspiciousListing(title);
}

function detectGreeting(query) {
  const q = normalizeQuery(query);

  const greetings = [
    "oi",
    "ola",
    "opa",
    "iae",
    "eae",
    "e ai",
    "fala",
    "fala ai",
    "salve",
    "bom dia",
    "boa tarde",
    "boa noite",
    "tudo bem",
    "td bem",
    "como vai",
    "como vc ta",
    "como voce ta",
    "como voce esta",
    "como vc esta",
    "hey",
    "hello",
    "hi"
  ];

  return greetings.some((g) => q === g || q.startsWith(g + " "));
}

function detectComparison(query) {
  const q = normalizeQuery(query);

  return (
    /\bou\b/.test(q) ||
    /melhor comprar/.test(q) ||
    /qual compensa mais/.test(q) ||
    /qual vale mais a pena/.test(q) ||
    /versus/.test(q) ||
    /\bvs\b/.test(q)
  );
}

function detectRecommendation(query) {
  const q = normalizeQuery(query);

  return (
    /qual o melhor/.test(q) ||
    /\bmelhor\b/.test(q) ||
    /vale a pena/.test(q) ||
    /compensa/.test(q) ||
    /custo beneficio/.test(q) ||
    /custo-beneficio/.test(q) ||
    /recomenda/.test(q) ||
    /indica/.test(q)
  );
}

function detectUseCase(query) {
  const q = normalizeQuery(query);

  const useCases = [
    "jogo", "jogar", "games", "gamer", "cyberpunk", "fps",
    "trabalho", "trabalhar", "planilhas", "office",
    "estudo", "estudar", "faculdade", "aula",
    "uso basico", "dia a dia",
    "fotos", "camera", "video",
    "bateria", "duracao",
    "edicao", "design", "programacao"
  ];

  return useCases.some((term) => q.includes(term));
}

function detectGenericCategory(query) {
  const q = normalizeQuery(query);

  const categories = [
    "celular",
    "iphone",
    "smartphone",
    "notebook",
    "pc",
    "computador",
    "tv",
    "televisao",
    "videogame",
    "console",
    "ps5",
    "xbox",
    "fone",
    "headset",
    "tablet",
    "monitor",
    "cadeira",
    "tenis",
    "geladeira",
    "maquina de lavar"
  ];

  return categories.some((term) => q.includes(term));
}

function detectPriceSearch(query) {
  const q = normalizeQuery(query);

  return (
    /mais barato/.test(q) ||
    /menor preco/.test(q) ||
    /mais em conta/.test(q) ||
    /preco mais baixo/.test(q)
  );
}

function detectIntent(query) {
  const q = normalizeQuery(query);

  if (detectGreeting(q)) return "greeting";
  if (detectComparison(q)) return "comparison";
  if (detectRecommendation(q) && detectUseCase(q)) return "specific_use";
  if (detectRecommendation(q)) return "recommendation";
  if (detectGenericCategory(q) && !detectUseCase(q) && !detectPriceSearch(q)) return "generic";
  if (detectPriceSearch(q)) return "price_search";

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
      reply: "👋 Oi! Me fala o que você quer comprar que eu te ajudo a encontrar a melhor opção.",
      prices: []
    });
  }

  if (intent === "generic") {
    return res.status(200).json({
      reply: "🧠 Pra eu te indicar a melhor compra, me fala rapidinho: é pra jogo, trabalho, estudo ou uso básico?",
      prices: []
    });
  }

  if (intent === "comparison") {
    return res.status(200).json({
      reply: "⚖️ Me diz os 2 modelos que você quer comparar e, se puder, o que pesa mais pra você: preço, desempenho, durabilidade ou custo-benefício.",
      prices: []
    });
  }

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
      const filtered = products.filter((p) => parsePrice(p.price) <= budget);
      if (filtered.length) products = filtered;
    }

    if (wantsNewProduct(query)) {
      const filtered = products.filter((p) => !isUsedLikeProduct(p.product_name));
      if (filtered.length) products = filtered;
    }

    let validProducts = products
      .map((p) => ({ ...p, numericPrice: parsePrice(p.price) }))
      .filter((p) => !isNaN(p.numericPrice))
      .sort((a, b) => a.numericPrice - b.numericPrice);

    if (!validProducts.length) {
      return res.status(200).json({
        reply: "⚠️ Nenhum resultado encontrado.",
        prices: []
      });
    }

    const goodProducts = validProducts.filter((p) => !isBadProduct(p.product_name));
    const base = goodProducts.length ? goodProducts : validProducts;

    const best = base[0];
    const title = cleanTitle(best.product_name);

    const hasCheaperBad = validProducts.some(
      (p) => parsePrice(p.price) < parsePrice(best.price) && isBadProduct(p.product_name)
    );

    let reply = `💰 Melhor preço confiável: ${best.price}\n🧠 ${title}`;

    if (hasCheaperBad) {
      reply += `\n⚠️ Existem opções mais baratas, mas podem ser menos confiáveis`;
    }

    if (intent === "specific_use") {
      if (/estudar/i.test(normalizeQuery(query))) {
        reply += `\n📊 Boa opção para estudo e uso diário`;
      } else if (/gamer|jogar|cyberpunk/i.test(normalizeQuery(query))) {
        if (/rtx|gtx|radeon|geforce|gamer/i.test(title.toLowerCase())) {
          reply += `\n📊 Parece mais preparado para jogos do que modelos comuns`;
        } else {
          reply += `\n📊 Parece mais indicado para uso leve do que para jogos pesados`;
          reply += `\n⚠️ Para jogos exigentes, pode valer investir mais`;
        }
      } else if (/trabalho/i.test(normalizeQuery(query))) {
        reply += `\n📊 Boa opção para trabalho e uso geral`;
      }
    }

    if (intent === "recommendation") {
      reply += `\n📊 Boa opção de custo-benefício`;
    }

    reply += `\n❓ Quer ver mais opções?`;

    return res.status(200).json({
      reply,
      prices: validProducts.map((p) => ({
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
