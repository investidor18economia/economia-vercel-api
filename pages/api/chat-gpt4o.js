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
  const normalized = q
  .replace(/i+$/g, "i")
  .replace(/a+$/g, "a")
  .replace(/o+$/g, "o")
  .replace(/\?+$/g, "")
  .replace(/!+$/g, "")
  .trim();

if (/^(oi|ola|olá|opa|eai|e ai|eae|iae|fala|salve|bom dia|boa tarde|boa noite)$/.test(normalized)) {
  return "greeting";
}

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
  if (isComparison || /entre/.test(q)) return "comparison";
  if (isDecision) return "decision";
  if (hasCategory && !hasSpecificConstraint && !hasRecommendationIntent) return "generic";
  if (hasRecommendationIntent || hasSpecificConstraint) return "specific";

  return "other";
}

function getBrazilHour() {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false
  });

  return Number(formatter.format(new Date()));
}

function getTimePeriod() {
  const hour = getBrazilHour();

  if (hour >= 0 && hour < 6) return "madrugada";
  if (hour >= 6 && hour < 12) return "manha";
  if (hour >= 12 && hour < 18) return "tarde";
  return "noite";
}
function getCategoryContextHint(query) {
  const q = normalizeQuery(query);

  if (/celular|smartphone|iphone|samsung galaxy|motorola|xiaomi/.test(q)) {
    return "Se precisar refinar, tente entender principalmente o uso principal do usuário, como: fotos, trabalho, estudo, jogos, bateria ou uso geral.";
  }

  if (/notebook|pc gamer|computador|laptop/.test(q)) {
    return "Se precisar refinar, tente entender principalmente o tipo de uso, como: trabalho, estudo, jogos, edição, programação ou uso básico.";
  }

  if (/geladeira|frigerador|freezer/.test(q)) {
    return "Se precisar refinar, tente entender principalmente capacidade, tamanho da casa, consumo de energia e tipo de uso da família.";
  }

  if (/maquina de lavar|máquina de lavar|lavadora|lava e seca/.test(q)) {
    return "Se precisar refinar, tente entender principalmente capacidade, frequência de uso, quantidade de roupa e espaço disponível.";
  }

  if (/tv|televis|smart tv/.test(q)) {
    return "Se precisar refinar, tente entender principalmente tamanho desejado, uso principal, qualidade de imagem e distância de visualização.";
  }

  if (/monitor/.test(q)) {
    return "Se precisar refinar, tente entender principalmente tamanho, resolução, trabalho, jogos ou uso geral.";
  }

  if (/fone|headset|earbud|airpods/.test(q)) {
    return "Se precisar refinar, tente entender principalmente se o foco é música, chamadas, trabalho, academia, jogos ou conforto.";
  }

  if (/cadeira|cadeira gamer|cadeira ergonomica|cadeira ergonômica/.test(q)) {
    return "Se precisar refinar, tente entender principalmente conforto, ergonomia, tempo de uso por dia e ambiente de uso.";
  }

  if (/mesa/.test(q)) {
    return "Se precisar refinar, tente entender principalmente espaço disponível, tipo de uso, tamanho e organização.";
  }

  if (/ps5|playstation|xbox|console/.test(q)) {
    return "Se precisar refinar, tente entender principalmente se o usuário prioriza desempenho, preço, catálogo de jogos ou custo-benefício.";
  }

  if (/tablet|ipad/.test(q)) {
    return "Se precisar refinar, tente entender principalmente estudo, desenho, trabalho, leitura ou entretenimento.";
  }

  if (/roda|pneu/.test(q)) {
    return "Se precisar refinar, tente entender principalmente modelo do carro, aro, uso urbano ou estrada e preferência visual.";
  }

  if (/fogao|fogão|cooktop|forno/.test(q)) {
    return "Se precisar refinar, tente entender principalmente tamanho da cozinha, frequência de uso, quantidade de bocas e praticidade.";
  }

  return "Se precisar refinar, faça uma pergunta final contextual baseada no tipo de produto e no que mais influencia a decisão de compra.";
}
function getProductLimitForAI(intent) {
  if (intent === "comparison") return 3;
  return 2;
}
function formatProductsForPrompt(products, limit = 2) {
  return products
    .slice(0, limit)
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
  products,
  productLimit
}) {
  return `
Contexto da solicitação do usuário:
- Mensagem do usuário: "${query}"
- Tipo de situação detectada: ${intent}
- Período do dia do usuário: ${period}
- Orçamento detectado: ${budget ? `R$ ${budget}` : "não informado"}
- Preferência por produto novo: ${wantsNew ? "sim" : "não informada"}
- Orientação de contexto por categoria: ${getCategoryContextHint(query)}

Produtos encontrados e já filtrados/rankeados:
${formatProductsForPrompt(products, productLimit)}

Instruções para esta resposta:
- Responda como a MIA.
- Seja natural, humana, carismática e útil.
- Não invente especificações técnicas.
- Não diga que você é um modelo ou IA da OpenAI.
- Escreva de forma mais humana e conversacional, como uma assistente real falando no chat.
- Prefira frases curtas e naturais.
- Evite tom formal, técnico demais ou com cara de texto gerado por IA.
- Evite começar a resposta com explicações longas.
- Vá mais direto ao ponto.
- Soe simpática, leve e confiante, mas sem exagerar.
- Evite listar vantagens demais de forma mecânica.
- Quando possível, use uma linguagem mais próxima do dia a dia.
- Em vez de parecer catálogo, pareça uma assistente ajudando alguém a decidir.
- Se a resposta estiver ficando longa, resuma.

- Se for saudação:
  só cumprimente se a mensagem do usuário for realmente uma saudação. Se o usuário disser "oi", "olá", "opa", "e aí" ou algo informal, responda de forma informal e natural, sem usar bom dia/boa tarde/boa noite. Só use bom dia/boa tarde/boa noite se o próprio usuário usar esse tipo de cumprimento.

- Se a pergunta for genérica:
  você pode sugerir uma opção inicial plausível, explicar rapidamente o motivo e terminar com uma pergunta contextual adequada ao produto, usando a orientação de contexto por categoria quando ela estiver disponível.

- Se a pergunta for específica:
  recomende de forma mais direta e termine oferecendo ajuda opcional.

- Se for comparação:
  1. NÃO peça contexto imediatamente.
  2. Comece com uma análise clara e útil entre as opções citadas.
  3. Destaque diferenças práticas (ex: desempenho, custo-benefício, uso ideal).
  4. Diga de forma simples qual tende a ser melhor em cada caso.
  5. Só depois faça uma pergunta para entender a prioridade do usuário.

  Exemplo de comportamento esperado:
  - "O PS5 é mais forte e melhor pra quem quer desempenho máximo..."
  - "O Xbox Series S é mais barato e faz sentido pra quem quer economizar..."
  
- Em perguntas que não sejam saudação pura, não comece a resposta com cumprimento como bom dia, boa tarde, boa noite, olá ou oi.
- Ao citar opções, priorize mostrar 2 produtos. Só mostre 3 se isso realmente ajudar a comparação ou a decisão. Evite listas longas.
- Mantenha a resposta curta ou média.
- Evite soar robótica.
`.trim();
}
const SMART_FOLLOW_UPS = {
  generic: [
    "Se quiser, eu posso refinar melhor pelo seu tipo de uso. 👀",
    "Posso te mostrar opções mais equilibradas em custo-benefício também.",
    "Se quiser, eu posso filtrar algo mais certeiro pro que você precisa.",
    "Quer que eu ajuste isso com base no seu uso principal?"
  ],
  specific: [
    "Se quiser, eu posso ver se existe uma opção ainda melhor nessa faixa.",
    "Posso comparar com alternativas parecidas, se você quiser.",
    "Quer que eu veja se esse preço está realmente bom?",
    "Se quiser, eu posso procurar uma opção mais barata ou mais forte."
  ],
  comparison: [
    "Se quiser, eu também posso comparar pensando no seu perfil de uso.",
    "Posso te dizer qual faz mais sentido pro seu caso, se você quiser.",
    "Quer que eu refine isso por preço, desempenho ou custo-benefício?",
    "Se quiser, eu posso te dar uma recomendação mais direta entre os dois."
  ],
  decision: [
    "Se quiser, eu posso checar se existe uma alternativa mais segura nessa faixa.",
    "Posso ver se esse preço está valendo a pena mesmo.",
    "Quer que eu compare com outras opções antes de você decidir?",
    "Se quiser, eu posso procurar algo melhor pelo mesmo valor."
  ]
};
function getSmartFollowUp(intent, reply) {
  const text = (reply || "").trim();

  if (!text) return "";

  // evita adicionar follow-up se a resposta já terminar convidando o usuário
  if (
    /\?\s*$/.test(text) ||
    /se quiser/i.test(text) ||
    /posso/i.test(text) ||
    /quer que eu/i.test(text)
  ) {
    return "";
  }

  const bucket =
    SMART_FOLLOW_UPS[intent] ||
    SMART_FOLLOW_UPS.specific;

  return bucket[Math.floor(Math.random() * bucket.length)];
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
  products: [],
  productLimit: 0
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
const productLimit = getProductLimitForAI(intent);
const topProductsForAI = rankedProducts.slice(0, productLimit);

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
  products: topProductsForAI,
  productLimit
})
      }
    ];

    const aiResponse = await callOpenAI(messages, {
      temperature: 0.45,
      max_tokens: 500
    });

    let reply = getOpenAIText(aiResponse)?.trim();

    if (!reply || reply.length < 20) {
      reply = buildFallbackReply(intent, bestProduct, period);
    }
    const smartFollowUp = getSmartFollowUp(intent, reply);

if (smartFollowUp) {
  reply = `${reply}\n\n${smartFollowUp}`;
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
