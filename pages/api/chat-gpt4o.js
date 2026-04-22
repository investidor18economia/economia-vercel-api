import { fetchSerpPrices } from "../../lib/prices";
import { callOpenAI, getOpenAIText } from "../../lib/openai";
import { MIA_SYSTEM_PROMPT } from "../../lib/miaPrompt";

const API_SHARED_KEY = process.env.API_SHARED_KEY;

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
  return (title || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBudget(text) {
  const q = (text || "").toLowerCase();

  const patterns = [
    /até\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /abaixo\s*de\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /menos\s*de\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /no\s*m[aá]ximo\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /por\s*até\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match) {
      let value = parseFloat(match[1].replace(",", "."));
      if (Number.isNaN(value)) continue;
      if (match[2]) value *= 1000;
      return value;
    }
  }

  return null;
}

function wantsNewProduct(query) {
  return /\bnovo\b|\bnova\b|\blacrado\b|\blacrada\b|\bzerado\b|\bzerada\b/i.test(query || "");
}

function isUsedLikeProduct(title) {
  const t = (title || "").toLowerCase();
  return /usado|usada|seminovo|seminova|recondicionado|recondicionada|open box|vitrine|mostruario|mostruário|segunda mao|segunda mão|trocafone/.test(t);
}

function isSuspiciousListing(title) {
  const t = (title || "").toLowerCase();
  return /leia|descri[cç][aã]o|vendo|vende|troco|retirada|retirar|chat|urgente|oportunidade|negocio|negócio|somente hoje|imperdivel|imperd[ií]vel/.test(t);
}

function isAccessoryMismatch(query, title) {
  const q = normalizeQuery(query);
  const t = (title || "").toLowerCase();

  if (q.includes("celular") || q.includes("smartphone") || q.includes("iphone")) {
    return /capa|pelicula|película|carregador|fone|suporte|case/.test(t);
  }

  if (q.includes("notebook")) {
    return /mochila|capa|base cooler|suporte|teclado|mouse/.test(t);
  }

  if (q.includes("tv") || q.includes("televis")) {
    return /suporte|controle remoto|antena|soundbar/.test(t);
  }

  if (q.includes("ps5") || q.includes("xbox") || q.includes("console")) {
    return /controle|headset|jogo|gift card|assinatura|skin/.test(t);
  }

  return false;
}

function isBadProduct(title, query) {
  return (
    isUsedLikeProduct(title) ||
    isSuspiciousListing(title) ||
    isAccessoryMismatch(query, title)
  );
}

function scoreProduct(product, query) {
  const title = (product.product_name || "").toLowerCase();
  const price = parsePrice(product.price);
  const q = normalizeQuery(query);

  let score = 0;

  // base de preço: ajuda, mas não manda sozinho
  if (!Number.isNaN(price)) {
    score += Math.max(0, 3000 - price) / 20;
  }

  // penalizações fortes
  if (isUsedLikeProduct(title)) score -= 120;
  if (isSuspiciousListing(title)) score -= 140;
  if (isAccessoryMismatch(q, title)) score -= 180;
  if (title.length < 18) score -= 60;

  // bônus leves por título mais rico
  if (/gb|ssd|ram|128|256|512|1tb/.test(title)) score += 22;
  if (/pro|max|plus|ultra/.test(title)) score += 18;
  if (/novo|lacrado/.test(title)) score += 25;

  // filtros contextuais simples para evitar absurdos
  if ((q.includes("celular") || q.includes("smartphone")) && /flip|dual sim basico|tecla|teclado numerico|bot[aã]o/.test(title)) {
    score -= 220;
  }

  if (q.includes("notebook") && /chromebook/i.test(title) && /gamer|jogo|jogar/.test(q)) {
    score -= 160;
  }

  if ((q.includes("pc gamer") || q.includes("notebook gamer")) && !/gamer|rtx|gtx|radeon|geforce|ryzen 5|ryzen 7|i5|i7/.test(title)) {
    score -= 90;
  }

  return score;
}

function detectIntent(query) {
  const q = normalizeQuery(query);

  const isGreeting =
    /^(oi|ola|olá|opa|e ai|eae|iae|fala|salve|bom dia|boa tarde|boa noite)\b/.test(q);

  const isComparison =
    /\bou\b/.test(q) ||
    /\bvs\b/.test(q) ||
    /versus/.test(q) ||
    /melhor comprar/.test(q) ||
    /qual vale mais a pena entre/.test(q);

  const isDecision =
    /vale a pena|compensa|esse preco ta bom|esse preço ta bom|esse preco esta bom|esse preço está bom/.test(q);

  const hasRecommendationIntent =
    /qual.*melhor|recomenda|indica|melhor custo beneficio|melhor custo-beneficio|custo beneficio|custo-beneficio|qual compensa mais/.test(q);

  const hasCategory =
    /celular|smartphone|iphone|notebook|pc|computador|tv|televis|geladeira|maquina de lavar|máquina de lavar|cadeira|monitor|fone|headset|ps5|playstation|xbox|console|tablet|roda|pneu/.test(q);

  const hasSpecificConstraint =
    !!extractBudget(q) ||
    /para|pra|com|novo|nova|lacrado|lacrada|gamer|fotos|camera|câmera|trabalho|estudo|jogo|jogar|uso basico|uso básico/.test(q);

  if (isGreeting) return "greeting";
  if (isComparison) return "comparison";
  if (isDecision) return "decision";
  if (hasCategory && !hasSpecificConstraint && !hasRecommendationIntent) return "generic";
  if (hasRecommendationIntent || hasSpecificConstraint) return "specific";

  return "other";
}

function getTimePeriod(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 0 && hour < 6) return "madrugada";
  if (hour >= 6 && hour < 12) return "manha";
  if (hour >= 12 && hour < 18) return "tarde";
  return "noite";
}

function formatProductsForPrompt(products) {
  return products
    .slice(0, 5)
    .map((p, index) => {
      const safeTitle = cleanTitle(p.product_name);
      const safePrice = p.price || "Preço não informado";
      const safeSource = p.source || "Loja não informada";
      return `${index + 1}. ${safeTitle} | ${safePrice} | Loja: ${safeSource}`;
    })
    .join("\n");
}

function buildUserPrompt({
  query,
  intent,
  budget,
  wantsNew,
  period,
  products
}) {
  return `
Contexto da solicitação do usuário:
- Mensagem do usuário: "${query}"
- Tipo de situação detectada: ${intent}
- Período do dia do usuário: ${period}
- Orçamento detectado: ${budget ? `R$ ${budget}` : "não informado"}
- Preferência por produto novo: ${wantsNew ? "sim" : "não informada"}

Produtos encontrados e já filtrados/rankeados:
${formatProductsForPrompt(products)}

Instruções para esta resposta:
- Responda como a MIA.
- Seja natural, humana, carismática e útil.
- Não invente especificações técnicas.
- Não diga que você é um modelo ou IA da OpenAI.
- Se for saudação, apenas cumprimente com base no horário e convide o usuário a dizer o que quer comprar.
- Se a pergunta for genérica, você pode sugerir uma opção inicial plausível, explicar rapidamente o motivo e terminar com uma pergunta contextual adequada ao produto.
- Se a pergunta for específica, recomende de forma mais direta e termine oferecendo ajuda opcional.
- Se for comparação, faça uma leitura inicial útil e depois pergunte o que pesa mais para o usuário.
- Mantenha a resposta curta ou média.
- Evite soar robótica.
`.trim();
}

function buildFallbackReply(intent, bestProduct, period) {
  const productTitle = bestProduct?.product_name ? cleanTitle(bestProduct.product_name) : "";
  const productPrice = bestProduct?.price || "";

  if (intent === "greeting") {
    if (period === "madrugada") {
      return "Ainda acordado? Me fala o que você quer comprar que eu te ajudo a encontrar uma opção boa de verdade. 🌙";
    }
    if (period === "manha") {
      return "Bom dia! Me conta o que você quer comprar que eu te ajudo a encontrar uma opção que valha a pena. ☀️";
    }
    if (period === "tarde") {
      return "Boa tarde! Me fala o que você está procurando que eu te ajudo a achar uma compra inteligente.";
    }
    return "Boa noite! Me conta o que você quer comprar que eu te ajudo a encontrar uma boa opção. ✨";
  }

  if (productTitle && productPrice) {
    if (intent === "generic") {
      return `🧠 Uma opção inicial que parece interessante é ${productTitle}, por ${productPrice}.\n\nSe eu refinar melhor pra você: qual é a principal necessidade nesse produto?`;
    }

    if (intent === "comparison") {
      return "⚖️ Consigo te ajudar a comparar isso melhor. Me diz o que pesa mais pra você nessa decisão: preço, desempenho, durabilidade ou custo-benefício?";
    }

    return `🧠 Entre as opções encontradas, ${productTitle} por ${productPrice} parece uma escolha interessante pelo equilíbrio geral.\n\nSe quiser, posso ver se tem uma opção melhor ou mais barata nessa faixa.`;
  }

  return "Encontrei algumas opções, mas quero refinar melhor pra te ajudar de verdade. Me fala um pouco mais do que você procura.";
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

  if (!query) {
    return res.status(400).json({
      reply: "Me manda o que você quer comprar e eu te ajudo a encontrar uma boa opção.",
      prices: []
    });
  }

  const intent = detectIntent(query);
  const budget = extractBudget(query);
  const wantsNew = wantsNewProduct(query);
  const period = getTimePeriod();

  try {
    // Saudação pura não precisa buscar produto
    if (intent === "greeting") {
      const greetingMessages = [
        {
          role: "system",
          content: MIA_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildUserPrompt({
            query,
            intent,
            budget,
            wantsNew,
            period,
            products: []
          })
        }
      ];

      const aiResponse = await callOpenAI(greetingMessages, {
        temperature: 0.6,
        max_tokens: 180
      });

      const reply = getOpenAIText(aiResponse) || buildFallbackReply(intent, null, period);

      return res.status(200).json({
        reply,
        prices: []
      });
    }

    let products = await fetchSerpPrices(query, 10);

    if (!Array.isArray(products) || !products.length) {
      return res.status(200).json({
        reply: "⚠️ Não encontrei resultados suficientes por enquanto. Se quiser, eu posso refinar por tipo de uso, faixa de preço ou modelo.",
        prices: []
      });
    }

    if (budget) {
      const filteredByBudget = products.filter((p) => {
        const numeric = parsePrice(p.price);
        return !Number.isNaN(numeric) && numeric <= budget;
      });

      if (filteredByBudget.length) {
        products = filteredByBudget;
      }
    }

    if (wantsNew) {
      const filteredNew = products.filter((p) => !isUsedLikeProduct(p.product_name));
      if (filteredNew.length) {
        products = filteredNew;
      }
    }

    let validProducts = products
      .map((p) => ({
        ...p,
        product_name: cleanTitle(p.product_name),
        numericPrice: parsePrice(p.price)
      }))
      .filter((p) => !Number.isNaN(p.numericPrice));

    if (!validProducts.length) {
      return res.status(200).json({
        reply: "⚠️ Encontrei resultados, mas nenhum veio com preço válido o bastante pra eu te recomendar com segurança.",
        prices: []
      });
    }

    const goodProducts = validProducts.filter((p) => !isBadProduct(p.product_name, query));
    const rankingBase = goodProducts.length ? goodProducts : validProducts;

    const rankedProducts = rankingBase
      .map((p) => ({
        ...p,
        score: scoreProduct(p, query)
      }))
      .sort((a, b) => b.score - a.score);

    const bestProduct = rankedProducts[0];
    const topProductsForAI = rankedProducts.slice(0, 5);

    const messages = [
      {
        role: "system",
        content: MIA_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: buildUserPrompt({
          query,
          intent,
          budget,
          wantsNew,
          period,
          products: topProductsForAI
        })
      }
    ];

    const aiResponse = await callOpenAI(messages, {
      temperature: 0.45,
      max_tokens: 260
    });

    let reply = getOpenAIText(aiResponse)?.trim();

    if (!reply || reply.length < 20) {
      reply = buildFallbackReply(intent, bestProduct, period);
    }

    if (reply.length > 900) {
      reply = reply.slice(0, 900).trim();
    }

    return res.status(200).json({
      reply,
      prices: rankedProducts.map((p) => ({
        product_name: cleanTitle(p.product_name),
        price: p.price,
        link: p.link,
        thumbnail: p.thumbnail,
        source: p.source
      }))
    });
  } catch (err) {
    console.error("chat-gpt4o.js error:", err);

    return res.status(500).json({
      reply: "⚠️ Tive um problema aqui na busca. Tenta de novo que eu continuo te ajudando.",
      prices: []
    });
  }
}
