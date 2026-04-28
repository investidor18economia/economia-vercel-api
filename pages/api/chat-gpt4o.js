import { fetchSerpPrices } from "../../lib/prices";
import { callOpenAI, getOpenAIText } from "../../lib/openai";
import { MIA_SYSTEM_PROMPT } from "../../lib/miaPrompt";
function normalizeProductKey(title = "") {
  return normalizeQuery(title)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProductFamilyKey(title = "") {
  const t = normalizeProductKey(title)
    .replace(/\b(4g|5g|128gb|256gb|512gb|1tb|2gb|3gb|4gb|6gb|8gb|12gb|16gb|32gb|ram|rom|tela|camera|câmera|bateria|mah|hz|android|dual|chip|cor|rosa|azul|preto|cinza|verde|branco|lacrado|novo|original)\b/g, " ")
    .replace(/\b(de|da|do|com|sem|para|por|e|a|o|os|as)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const knownPatterns = [
    /(motorola\s+)?moto\s+g\d+/,
    /realme\s+note\s+\d+/,
    /galaxy\s+a\d+/,
    /samsung\s+galaxy\s+a\d+/,
    /redmi\s+note\s+\d+/,
    /infinix\s+hot\s+\d+\w*/,
    /iphone\s+\d+/,
    /poco\s+\w+\d*/,
    /ps5/,
    /xbox\s+series\s+[sx]/,
    /macbook\s+\w+/
  ];

  for (const pattern of knownPatterns) {
    const match = t.match(pattern);
    if (match?.[0]) return match[0].trim();
  }

  return t.split(" ").slice(0, 5).join(" ").trim();
}

function extractProductsFromText(text = "") {
  const products = [];
  const content = String(text || "");

  const priceMatch = content.match(/R\$\s*[\d.,]+/i);
  const price = priceMatch ? priceMatch[0] : null;

  const boldRegex = /\*\*([^*]{8,140})\*\*/g;
  let match;

  while ((match = boldRegex.exec(content)) !== null) {
    const title = cleanTitle(match[1]);

    if (
      title &&
      !/se quiser|porque|minha escolha|olhei aqui|só escolheria|em relação/i.test(title)
    ) {
      products.push({
        product_name: title,
        price,
        source: "histórico",
        link: null,
        thumbnail: null
      });
    }
  }

  const directPatterns = [
    /(?:eu iria nesse|eu iria nessa|eu escolheria|minha escolha principal seria|a melhor escolha.*?seria)\s+(?:o|a)?\s*([^.\n]{8,120})/i,
    /(?:produto|opção)\s+(?:principal\s+)?(?:seria|é)\s+(?:o|a)?\s*([^.\n]{8,120})/i
  ];

  for (const pattern of directPatterns) {
    const found = content.match(pattern);
    if (found?.[1]) {
      let title = cleanTitle(found[1])
        .replace(/\s+por\s+R\$.*/i, "")
        .replace(/\s+que\s+est[aá].*/i, "")
        .trim();

      if (title.length >= 8) {
        products.push({
          product_name: title,
          price,
          source: "histórico",
          link: null,
          thumbnail: null
        });
      }
    }
  }

  return products;
}

function extractProductsFromMessages(messages = []) {
  const found = [];
  const seen = new Map();

  for (const msg of messages) {
    const role = String(msg?.role || "").toLowerCase();
    const content = String(msg?.content || "");

    if (role !== "assistant" || !content) continue;

    const products = extractProductsFromText(content);

    for (const product of products) {
      const familyKey = getProductFamilyKey(product.product_name);
      if (!familyKey) continue;

      const currentIndex = seen.get(familyKey);

      if (currentIndex === undefined) {
        seen.set(familyKey, found.length);
        found.push(product);
        continue;
      }

      const existing = found[currentIndex];

      const existingScore =
        String(existing.product_name || "").length + (existing.price ? 30 : 0);

      const newScore =
        String(product.product_name || "").length + (product.price ? 30 : 0);

      if (newScore > existingScore) {
        found[currentIndex] = product;
      }
    }
  }

  return found.slice(-5);
}
function responseMentionsUnknownProduct(reply = "", allowedProducts = []) {
  const text = normalizeQuery(reply);

  if (!text || !Array.isArray(allowedProducts) || allowedProducts.length === 0) {
    return false;
  }

  const allowedKeys = allowedProducts
    .map((p) => normalizeProductKey(p.product_name || ""))
    .filter(Boolean);

  const allowedFamilyKeys = allowedProducts
    .map((p) => getProductFamilyKey(p.product_name || ""))
    .filter(Boolean);

  const suspiciousProductWords =
    /(samsung|galaxy|redmi|realme|motorola|moto|iphone|infinix|xiaomi|poco|lg|philco|brastemp|electrolux|consul|notebook|monitor|ps5|xbox|playstation|macbook|\b[a-z]{1,5}\s?\d{1,4}\b)/i;

  const sentences = String(reply)
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    if (!suspiciousProductWords.test(sentence)) continue;

    const sentenceKey = normalizeProductKey(sentence);

    const mentionsAllowed =
      allowedKeys.some((key) => sentenceKey.includes(key) || key.includes(sentenceKey)) ||
      allowedFamilyKeys.some((key) => sentenceKey.includes(key));

    if (!mentionsAllowed) {
      return true;
    }
  }

  return false;
}
function buildSafeDecisionReply(allowedProducts = []) {
  if (!Array.isArray(allowedProducts) || allowedProducts.length === 0) {
    return "Pelo contexto, eu escolheria a opção principal que apareceu antes, sem inventar modelo novo.";
  }

  const first = allowedProducts[0];
  const second = allowedProducts[1];
  const third = allowedProducts[2];

  let reply = `Eu compraria o **${cleanTitle(first.product_name)}**.`;

  reply += `\n\nEle foi a melhor opção dentro do que apareceu na conversa.`;

  if (second || third) {
    reply += `\n\nComparando rápido:`;

    if (first) reply += `\n- **${cleanTitle(first.product_name)}**: melhor escolha geral.`;
    if (second) reply += `\n- **${cleanTitle(second.product_name)}**: alternativa dependendo do seu uso.`;
    if (third) reply += `\n- **${cleanTitle(third.product_name)}**: outra opção dentro do contexto.`;
  }

  reply += `\n\nNão vou sugerir outro modelo fora dessas opções pra não te passar algo sem base.`;

  return reply;
}
function buildSessionContext(messages = [], sessionContext = {}) {
  const inferredProducts = extractProductsFromMessages(messages);

  const context = {
    lastQuery: sessionContext?.lastQuery || "",
    lastCategory: sessionContext?.lastCategory || "",
    lastProducts:
      Array.isArray(sessionContext?.lastProducts) && sessionContext.lastProducts.length
        ? sessionContext.lastProducts
        : inferredProducts,
    lastBestProduct:
      sessionContext?.lastBestProduct ||
      inferredProducts[inferredProducts.length - 1] ||
      null,
    lastIntent: sessionContext?.lastIntent || "",
    lastTopic: sessionContext?.lastTopic || "",
    lastProductMentioned:
      sessionContext?.lastProductMentioned ||
      inferredProducts[inferredProducts.length - 1]?.product_name ||
      "",
    lastInteractionType: sessionContext?.lastInteractionType || ""
  };

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const role = String(msg?.role || "").toLowerCase();
    const content = String(msg?.content || "").trim();

    if (role !== "user" || !content) continue;

    const normalized = normalizeQuery(content);

    if (/^(oi|ola|olá|opa|eai|e ai|eae|iae|fala|salve|bom dia|boa tarde|boa noite)$/.test(normalized)) {
      continue;
    }

    const category = detectProductCategory(content);

    if (!context.lastQuery && hasStrongShoppingSignal(content)) {
      context.lastQuery = content;
      context.lastCategory = context.lastCategory || category || "";
      context.lastIntent = context.lastIntent || detectIntent(content);
      context.lastTopic = context.lastTopic || content;
      break;
    }
  }

  if (!context.lastCategory && context.lastQuery) {
    context.lastCategory = detectProductCategory(context.lastQuery) || "";
  }

  return context;
}

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

  if (q.includes("notebook") || q.includes("laptop")) {
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
  const t = (title || "").toLowerCase();
  const q = normalizeQuery(query);

  if (
    isUsedLikeProduct(t) ||
    isSuspiciousListing(t) ||
    isAccessoryMismatch(q, t)
  ) {
    return true;
  }

  if ((q.includes("celular") || q.includes("smartphone")) && /b220|tecla|flip|feature phone|2g|3g|bot[aã]o/.test(t)) {
    return true;
  }

  if ((q.includes("notebook") || q.includes("laptop")) && /mochila|base cooler|mouse|teclado|capa/.test(t)) {
    return true;
  }

  if (q.includes("cadeira") && /mesa|apoio de pe avulso|almofada/.test(t)) {
    return true;
  }

  if ((q.includes("ps5") || q.includes("xbox") || q.includes("console")) && /controle|gift card|assinatura|skin/.test(t)) {
    return true;
  }

  return false;
}

function getQueryWords(query) {
  return normalizeQuery(query)
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => w.length > 2);
}

function getDetectedUseIntent(query) {
  const q = normalizeQuery(query);

  if (/minecraft|roblox|the sims/.test(q)) {
    return "gaming_light";
  }

  if (/gta|fortnite|valorant|cs|csgo/.test(q)) {
    return "gaming_medium";
  }

  if (/warzone|cyberpunk|elden ring|red dead|hogwarts/.test(q)) {
    return "gaming_heavy";
  }

  if (/jogo|jogar|gamer/.test(q)) {
    return "gaming_medium";
  }

  if (/trabalho|office|empresa/.test(q)) {
    return "work";
  }

  if (/estudo|faculdade/.test(q)) {
    return "study";
  }

  if (/foto|camera|câmera|video|vídeo/.test(q)) {
    return "photo";
  }

  if (/conforto|ergonomia/.test(q)) {
    return "comfort";
  }

  if (/custo beneficio|custo-beneficio|compensa/.test(q)) {
    return "value";
  }

  return "general";
}

function scoreRelevanceToQuery(title, query) {
  const t = (title || "").toLowerCase();
  const queryWords = getQueryWords(query);

  let score = 0;

  queryWords.forEach((word) => {
    if (t.includes(word)) score += 10;
  });

  return score;
}

function scoreTitleQuality(title) {
  const t = (title || "").toLowerCase();
  let score = 0;

  if (t.length > 25) score += 10;
  if (t.length < 15) score -= 40;

  if (/pro|max|plus|ultra|premium|turbo/.test(t)) score += 18;
  if (/novo|lacrado/.test(t)) score += 20;
  if (/gb|ssd|ram|hz|fps|mah|mp|polegadas|pol|inch|256gb|512gb|128gb|1tb/.test(t)) score += 15;

  return score;
}

function scorePriceCoherence(price, query) {
  const q = normalizeQuery(query);

  if (Number.isNaN(price)) return -50;
  if (price <= 0) return -50;

  let score = 0;

  if (/notebook|laptop|pc gamer|computador/.test(q) && price < 900) score -= 80;
  if (/celular|smartphone|iphone|xiaomi|samsung|motorola/.test(q) && price < 250) score -= 100;
  if (/ps5|playstation|xbox|console/.test(q) && price < 1200) score -= 150;
  if (/tv|smart tv/.test(q) && price < 500) score -= 80;

  if (price > 20) score += Math.max(0, 3000 - price) / 25;

  return score;
}

function scoreUseIntentMatch(title, query) {
  const t = (title || "").toLowerCase();
  const useIntent = getDetectedUseIntent(query);

  let score = 0;

  if (useIntent === "gaming_light" || useIntent === "gaming_medium" || useIntent === "gaming_heavy") {
    if (/gamer|rtx|gtx|geforce|radeon|ryzen 5|ryzen 7|i5|i7|144hz|165hz/.test(t)) score += 50;
    if (/gtx 750|gt 710|gt 730|1gb video|2gb video|dual core/.test(t)) score -= 180;
    if (/chromebook|basico|b[aá]sico/.test(t)) score -= 100;
  }

  if (useIntent === "work") {
    if (/i5|i7|ryzen 5|ryzen 7|ssd|8gb|16gb|full hd/.test(t)) score += 30;
  }

  if (useIntent === "study") {
    if (/ssd|8gb|full hd|ryzen 5|i5/.test(t)) score += 20;
  }

  if (useIntent === "photo") {
    if (/iphone|galaxy|samsung|xiaomi|camera|c[aâ]mera|pro|max|ultra/.test(t)) score += 25;
  }

  if (useIntent === "comfort") {
    if (/ergon[oô]mica|ergonomica|apoio|reclin[aá]vel|reclinavel|lombar/.test(t)) score += 30;
  }

  if (useIntent === "value") {
    if (/8gb|16gb|256gb|512gb|ssd|ryzen 5|i5/.test(t)) score += 20;
  }

  return score;
}

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
    return /gtx|rtx|radeon|vega 7|vega 8/.test(t);
  }

  if (useIntent === "gaming_medium") {
    return /gtx 1050|gtx 1050ti|gtx 1650|rx 560|rx 570|rx 580|rtx/.test(t);
  }

  if (useIntent === "gaming_heavy") {
    return /gtx 1660|rtx|rx 580|rx 6600/.test(t);
  }

  return true;
}

function scoreProduct(product, query) {
  const title = (product.product_name || "").toLowerCase();
  const q = normalizeQuery(query);
  const price = parsePrice(product.price);

  let score = 0;

  score += scoreRelevanceToQuery(title, q);
  score += scoreTitleQuality(title);
  score += scorePriceCoherence(price, q);
  score += scoreUseIntentMatch(title, q);

  if (isUsedLikeProduct(title)) score -= 150;
  if (isSuspiciousListing(title)) score -= 150;
  if (isAccessoryMismatch(q, title)) score -= 220;

  if (/celular|smartphone|iphone|xiaomi|samsung|motorola|galaxy|redmi|realme/.test(q)) {
    if (/smartphone|iphone|xiaomi|samsung|motorola|galaxy|redmi|realme/.test(title)) score += 60;
    if (/5g/.test(title)) score += 20;
    if (/8gb|256gb|128gb/.test(title)) score += 20;
    if (/b220|tecla|flip|feature phone|2g|3g|bot[aã]o/.test(title)) score -= 350;
  }

  if (/notebook|laptop|pc gamer|computador/.test(q)) {
    if (/notebook|laptop|pc gamer|computador/.test(title)) score += 60;
    if (/ryzen 5|ryzen 7|i5|i7/.test(title)) score += 35;
    if (/16gb|8gb|ssd|512gb|256gb/.test(title)) score += 20;

    const useIntent = getDetectedUseIntent(q);

    if (/i3 1|i3 2|i5 1|i5 2|i5 3|i7 1|i7 2/.test(title)) score -= 250;
    if (/ddr3/.test(title)) score -= 120;
    if (/chromebook/.test(title) && /jogo|jogar|gamer/.test(q)) score -= 180;

    if (useIntent === "gaming_light") {
      if (/gtx|rtx|radeon/.test(title)) score += 30;
    }

    if (useIntent === "gaming_medium") {
      if (!/gtx|rtx|radeon/.test(title)) score -= 400;
      if (/gtx 1050|gtx 1050ti|gtx 1650|rx 560|rx 570|rx 580/.test(title)) score += 60;
      if (/gtx 750|gtx 650|gt 710|gt 730|550ti|1gb video|2gb video/.test(title)) score -= 350;
    }

    if (useIntent === "gaming_heavy") {
      if (!/rtx|gtx 1660|rx 580|rx 6600/.test(title)) score -= 450;
      if (/rtx|gtx 1660|rx 580|rx 6600/.test(title)) score += 100;
    }
  }

  if (/cadeira/.test(q)) {
    if (/cadeira/.test(title)) score += 50;
    if (/gamer/.test(title) && /gamer/.test(q)) score += 35;
    if (/ergonomica|ergon[oô]mica|reclinavel|reclin[aá]vel|apoio/.test(title)) score += 20;
    if (/mesa|apoio de pe avulso|almofada/.test(title)) score -= 150;
  }

  if (/ps5|playstation|xbox|console/.test(q)) {
    if (/ps5|playstation|xbox|series s|series x/.test(title)) score += 70;
    if (/controle|gift card|assinatura|skin|jogo avulso/.test(title)) score -= 250;
  }

  if (/tv|televis|monitor/.test(q)) {
    if (/tv|smart tv|monitor/.test(title)) score += 55;
    if (/4k|full hd|uhd|144hz|165hz/.test(title)) score += 20;
    if (/suporte|controle remoto|antena/.test(title)) score -= 180;
  }

  if (/geladeira|freezer|fogao|fogão|maquina de lavar|máquina de lavar|lavadora/.test(q)) {
    if (/geladeira|freezer|fogao|fogão|maquina de lavar|máquina de lavar|lavadora/.test(title)) score += 55;
    if (/220v|110v|inox|inverse|frost free|lava e seca/.test(title)) score += 15;
  }

  if (/ou/.test(title) && /gtx|rtx|radeon/.test(title)) {
    score -= 200;
  }

  if (/xeon|e3|e5/.test(title)) {
    score -= 180;
  }

  if (/pc gamer barato|cpu gamer barato/.test(title)) {
    score -= 120;
  }
const productTitle = normalizeQuery(product.product_name || "");

if (/lacrado|original|garantia/.test(productTitle)) {
  score += 25;
}

if (/256gb/.test(productTitle)) {
  score += 20;
}

if (/8gb/.test(productTitle)) {
  score += 15;
}

if (/5g/.test(productTitle)) {
  score += 15;
}

if (/realme|motorola|samsung|xiaomi|iphone/.test(productTitle)) {
  score += 10;
}

if (/recondicionado|usado|seminovo|vitrine|certificado|excelente/.test(productTitle)) {
  score -= 200;
}

if (/frete gratis de 2 dias nos eua|frete grátis de 2 dias nos eua/.test(productTitle)) {
  score -= 250;
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

  function isContextDecision(query) {
  const q = query.toLowerCase();

  return (
    /qual (vc|você) escolheria/.test(q) ||
    /qual vale mais a pena/.test(q) ||
    /esse compensa/.test(q) ||
    /vale a pena/.test(q) ||
    /vale esperar/.test(q) ||
    /compro agora/.test(q) ||
    /pego agora/.test(q) ||
    /melhor opção/.test(q)
  );
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

function detectUserStyle(query) {
  const q = normalizeQuery(query);

  const technicalTerms =
    /oled|amoled|rtx|gtx|ssd|ram|hz|fps|snapdragon|ryzen|i5|i7|benchmark|latencia|latência|resolucao|resolução|painel|nits|dlss|ray tracing/.test(q);

  const casualTone =
    /quero|me indica|compensa|vale a pena|bom|barato|top|massa|legal|e ai|eai|oi|opa/.test(q);

  if (technicalTerms) {
    return "tecnico";
  }

  if (casualTone) {
    return "casual";
  }

  return "simples";
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
function detectProductCategory(text = "") {
  const q = normalizeQuery(text);

  if (/celular|smartphone|iphone|samsung|xiaomi|motorola|galaxy|redmi|realme/.test(q)) {
    return "phone";
  }

  if (/notebook|laptop|macbook|chromebook/.test(q)) {
    return "notebook";
  }

  if (/pc gamer|computador|desktop|cpu gamer/.test(q)) {
    return "computer";
  }

  if (/ssd|hd|hd externo|armazenamento/.test(q)) {
  return "storage";
}

  if (/ps5|playstation|xbox|console|series s|series x/.test(q)) {
    return "console";
  }

  if (/tv|televis|smart tv/.test(q)) {
    return "tv";
  }

  if (/monitor/.test(q)) {
    return "monitor";
  }

  if (/fone|headset|earbud|airpods/.test(q)) {
    return "audio";
  }

  if (/cadeira|cadeira gamer|cadeira ergonomica|cadeira ergonômica/.test(q)) {
    return "chair";
  }

  if (/geladeira|frigerador|freezer/.test(q)) {
    return "fridge";
  }

  if (/maquina de lavar|máquina de lavar|lavadora|lava e seca/.test(q)) {
    return "washer";
  }

  if (/tablet|ipad/.test(q)) {
    return "tablet";
  }

  if (/roda|pneu/.test(q)) {
    return "car_part";
  }

  if (/fogao|fogão|cooktop|forno/.test(q)) {
    return "kitchen";
  }

  return null;
}

function isNewIntent(query, contextText) {
  const currentCategory = detectProductCategory(query);
  const previousCategory = detectProductCategory(contextText);

  if (!previousCategory) return false;
  if (!currentCategory) return false;

  return currentCategory !== previousCategory;
}

function productMatchesCategory(product, query) {
  const category = detectProductCategory(query);

  if (!category) return true;

  const title = normalizeQuery(product?.product_name || "");

  const rules = {
    phone: /celular|smartphone|iphone|samsung|xiaomi|motorola|moto|galaxy|redmi|realme|poco/,
    notebook: /notebook|laptop|macbook|chromebook/,
    computer: /pc gamer|computador|desktop|cpu gamer|ryzen|intel|i5|i7|rtx|gtx|radeon/,
    console: /ps5|playstation|xbox|series s|series x|console/,
    tv: /tv|smart tv|televis|uhd|4k/,
    monitor: /monitor/,
    audio: /fone|headset|earbud|airpods|bluetooth/,
    chair: /cadeira|ergonomica|ergonômica|gamer|reclinavel|reclinável/,
    fridge: /geladeira|frigerador|freezer|frost free/,
    washer: /maquina de lavar|máquina de lavar|lavadora|lava e seca/,
    tablet: /tablet|ipad/,
    car_part: /roda|pneu|aro/,
    kitchen: /fogao|fogão|cooktop|forno/
  };

  return rules[category] ? rules[category].test(title) : true;
}

function filterProductsByLockedCategory(products = [], query = "") {
  const category = detectProductCategory(query);

  if (!category || !Array.isArray(products)) {
    return products;
  }

  return products.filter((product) => productMatchesCategory(product, query));
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
  originalQuery,
  intent,
  budget,
  wantsNew,
  period,
  products,
  productLimit,
  userStyle
}) {
  return `
Contexto da solicitação do usuário:
- Mensagem original do usuário: "${originalQuery || query}"
- Query interpretada com contexto: "${query}"
- Tipo de situação detectada: ${intent}
- Período do dia do usuário: ${period}
- Orçamento detectado: ${budget ? `R$ ${budget}` : "não informado"}
- Preferência por produto novo: ${wantsNew ? "sim" : "não informada"}
- Estilo de linguagem do usuário detectado: ${userStyle}
- Orientação de contexto por categoria: ${getCategoryContextHint(query)}

Produtos encontrados e já filtrados/rankeados:
${formatProductsForPrompt(products, productLimit)}

Instruções para esta resposta:
- Adapte o tom ao estilo do usuário detectado.
- Se o estilo for "simples", fale de forma bem clara, leve e fácil de entender.
- Se o estilo for "casual", fale de forma natural, próxima e descontraída, sem exagerar.
- Se o estilo for "tecnico", você pode usar um pouco mais de precisão e termos técnicos, mas sem exagerar nem ficar fria.
- Nunca perca clareza.
- Evite começar a resposta com frases como:
  "Se você está procurando..."
  "Para um..."
  "Tenho duas opções..."

- Prefira começar de forma mais natural e direta, como:
  "Olhei aqui e..."
  "Nessa faixa..."
  "Esses dois aqui..."
  "Separei duas opções..."

- Varie o início das respostas para não repetir sempre o mesmo padrão.
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
- A resposta precisa estar alinhada com o primeiro produto da lista, porque ele será o produto principal exibido no card da interface.
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

- Em perguntas que não sejam saudação pura, não comece a resposta com cumprimento como bom dia, boa tarde, boa noite, olá ou oi.
- A MIA deve ser decisiva, explicativa e estratégica, não uma lista de produtos.
- Antes de recomendar, avalie mentalmente os produtos por: preço, confiabilidade, marca, armazenamento, RAM, 5G, garantia, risco de ser usado/recondicionado e custo-benefício.
- Não escolha automaticamente o produto mais barato.
- Não escolha automaticamente o primeiro produto se outro parecer mais confiável.
- Priorize produto novo/lacrado, com boa ficha técnica e menor risco para o usuário.
- Evite recomendar produtos com sinais de usado, recondicionado, certificado, vitrine, importação duvidosa ou descrição estranha.
- Trate sempre o primeiro produto da lista como a recomendação principal.
- Recomende 1 produto principal com clareza.
- Explique de forma simples por que esse produto faz sentido para o usuário.
- Se houver uma segunda opção realmente relevante, mencione como alternativa curta.
- Não diga "separei duas opções" se você não for explicar claramente as duas.
- Não liste produtos como catálogo.
- Use a estrutura ideal:
  1. "Eu iria nesse..." ou "Minha escolha principal seria..."
  2. Motivo prático da escolha.
  3. Alternativa curta, se fizer sentido: "Só olharia outra opção se..."
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

  if (
    /\?\s*$/.test(text) ||
    /se quiser/i.test(text) ||
    /posso/i.test(text) ||
    /quer que eu/i.test(text)
  ) {
    return "";
  }

  const bucket = SMART_FOLLOW_UPS[intent] || SMART_FOLLOW_UPS.specific;
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
      return `🧠 Uma opção inicial que parece interessante é ${productTitle}, por ${productPrice}.

Se eu refinar melhor pra você: qual é a principal necessidade nesse produto?`;
    }

    if (intent === "comparison") {
      return "⚖️ Consigo te ajudar a comparar isso melhor. Me diz o que pesa mais pra você nessa decisão: preço, desempenho, durabilidade ou custo-benefício?";
    }

    return `🧠 Entre as opções encontradas, ${productTitle} por ${productPrice} parece uma escolha interessante pelo equilíbrio geral.

Se quiser, posso ver se tem uma opção melhor ou mais barata nessa faixa.`;
  }

  return "Encontrei algumas opções, mas quero refinar melhor pra te ajudar de verdade. Me fala um pouco mais do que você procura.";
}

/** ================================
 *  CONTEXTO (BLOCO 1)
 *  ================================
 */

function hasStrongShoppingSignal(text = "") {
  const q = normalizeQuery(text);

  if (!q) return false;

  const hasCategory =
    /celular|smartphone|iphone|samsung|xiaomi|motorola|galaxy|redmi|realme|notebook|laptop|pc gamer|computador|tv|monitor|geladeira|fogao|fogão|maquina de lavar|cadeira|fone|headset|ps5|playstation|xbox|console|tablet|ipad|roda|pneu/.test(q);

  const hasBudget = !!extractBudget(q) || /\br\$?\s*\d+/.test(q);

  const hasModelLikeToken =
    /\b[a-z]{1,4}\d{2,4}\b/i.test(text) ||
    /\b(128gb|256gb|512gb|1tb|8gb|16gb|32gb)\b/i.test(q);

  const hasComparisonShape = /\bou\b|\bvs\b|versus|entre/.test(q);

  const hasUseConstraint =
    /pra|para|trabalho|estudo|jogo|jogar|gamer|camera|câmera|bateria|custo beneficio|custo-beneficio|mais forte|mais barato/.test(q);

  return hasCategory || hasBudget || hasModelLikeToken || hasComparisonShape || hasUseConstraint;
}

function isContextDecision(query = "") {
  const q = normalizeQuery(query);

  return (
    /qual.*(vc|voce|você).*escolheria/.test(q) ||
    /qual.*vale.*mais.*pena/.test(q) ||
    /qual.*eu.*compro/.test(q) ||
    /no fim das contas/.test(q) ||
    /esse.*compensa/.test(q) ||
    /essa.*compensa/.test(q) ||
    /vale.*a.*pena/.test(q) ||
    /vale.*esperar/.test(q) ||
    /compro.*agora/.test(q) ||
    /pego.*agora/.test(q) ||
    /melhor.*opcao/.test(q) ||
    /melhor.*opção/.test(q)
  );
}

function isProductReferenceQuestion(query = "") {
  const q = normalizeQuery(query);

  return (
    /^(esse|essa|isso|ele|ela)\b/.test(q) ||
    /esse.*roda.*jogo/.test(q) ||
    /essa.*roda.*jogo/.test(q) ||
    /roda.*jogo/.test(q) ||
    /serve.*pra.*jogo/.test(q) ||
    /aguenta.*jogo/.test(q)
  );
}
function detectContextAction(query = "", intent = "", contextResolution = {}) {
  const q = normalizeQuery(query);

  if (
    /no fim das contas/.test(q) ||
    /qual.*eu.*compro/.test(q) ||
    /qual.*comprar/.test(q) ||
    /qual.*escolher/.test(q) ||
    /qual.*vale.*mais.*pena/.test(q) ||
    /veredito/.test(q) ||
    /decis[aã]o final/.test(q)
  ) {
    return "decision";
  }

  if (
    /^(esse|essa|isso|ele|ela)\b/.test(q) ||
    /roda/.test(q) ||
    /serve/.test(q) ||
    /aguenta/.test(q) ||
    /presta/.test(q) ||
    /é bom/.test(q) ||
    /e bom/.test(q) ||
    /d[aá] conta/.test(q)
  ) {
    return "analysis";
  }

  if (
    intent === "comparison" ||
    /\bou\b/.test(q) ||
    /\bvs\b/.test(q) ||
    /versus/.test(q) ||
    /compar/.test(q)
  ) {
    return "comparison";
  }

  if (contextResolution?.mode === "refinement") {
    return "refinement";
  }

  if (isContextDecision(q)) {
    return "decision";
  }

  return "conversation";
}

function isContextRefinement(query = "") {
  const q = normalizeQuery(query);

  return (
    /^(mais barato|mais barata|mais forte|melhor|e pra bateria|pra bateria|com bateria|bateria|com 128gb|de 128gb|com 256gb|de 256gb|só samsung|so samsung|quero só samsung|quero so samsung|samsung|xiaomi|motorola|iphone)$/i.test(q) ||
    /^(e pra|e para|com|de)\b/.test(q)
  );
}

function looksLikeAmbiguousFollowUp(text = "") {
  const q = normalizeQuery(text);
  if (!q) return true;

  if (isContextDecision(q)) return true;
  if (isProductReferenceQuestion(q)) return true;
  if (isContextRefinement(q)) return true;

  if (q.length <= 14 && !hasStrongShoppingSignal(q)) return true;

  if (/^(esse|essa|isso|aquele|aquela|ele|ela)\b/.test(q)) return true;

  if (/^(sim|nao|não|ok|blz|beleza|pode|vai)$/.test(q)) return true;

  return false;
}

function getLastStrongUserQuery(messages = [], currentQuery = "") {
  const currentNorm = normalizeQuery(currentQuery);

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;

    const role = String(m.role || "").toLowerCase();
    const content = String(m.content || "").trim();
    if (role !== "user" || !content) continue;

    const cNorm = normalizeQuery(content);
    if (!cNorm || cNorm === currentNorm) continue;

    if (/^(oi|ola|olá|opa|eai|e ai|eae|fala|salve|bom dia|boa tarde|boa noite)$/.test(cNorm)) {
      continue;
    }

    if (hasStrongShoppingSignal(cNorm) && !isContextDecision(cNorm) && !isProductReferenceQuestion(cNorm)) {
      return content;
    }
  }

  return "";
}

function buildRefinedQuery(query = "", lastStrong = "") {
  const q = normalizeQuery(query);
  const base = String(lastStrong || "").trim();

  if (!base) return query;

  if (/bateria/.test(q)) {
    return `${base} com boa bateria`;
  }

  if (/mais forte|melhor desempenho|potente/.test(q)) {
    return `${base} mais forte melhor desempenho`;
  }

  if (/mais barato|mais barata/.test(q)) {
    return `${base} mais barato`;
  }

  if (/samsung/.test(q)) {
    return `${base} samsung`;
  }

  if (/xiaomi/.test(q)) {
    return `${base} xiaomi`;
  }

  if (/motorola/.test(q)) {
    return `${base} motorola`;
  }

  if (/iphone/.test(q)) {
    return `${base} iphone`;
  }

  if (/128gb/.test(q)) {
    return `${base} 128gb`;
  }

  if (/256gb/.test(q)) {
    return `${base} 256gb`;
  }

  return `${base} ${query}`.trim();
}

function resolveContextQuery(query = "", messages = []) {
  const q = String(query || "").trim();
  const qNorm = normalizeQuery(q);

  if (!q) {
    return {
      standaloneQuery: "",
      needsClarification: true,
      shouldSkipProductSearch: false,
      clarificationMessage: "Me fala o produto que você quer procurar que eu já te ajudo. 👀"
    };
  }

  const lastStrong = getLastStrongUserQuery(messages, q);
  const explicitCategory = detectProductCategory(q);
  const previousCategory = detectProductCategory(lastStrong);

  if (isContextDecision(qNorm) || isProductReferenceQuestion(qNorm)) {
    return {
      standaloneQuery: lastStrong ? `${lastStrong} ${q}` : q,
      needsClarification: !lastStrong,
      shouldSkipProductSearch: !!lastStrong,
      mode: "context_answer",
      clarificationMessage:
        "Entendi 👍 Me diz rapidinho de qual produto você está falando, que eu te respondo com segurança."
    };
  }

  if (isContextRefinement(qNorm) && lastStrong) {
    return {
      standaloneQuery: buildRefinedQuery(q, lastStrong),
      needsClarification: false,
      shouldSkipProductSearch: false,
      mode: "refinement"
    };
  }

  if (explicitCategory) {
    return {
      standaloneQuery: q,
      needsClarification: false,
      shouldSkipProductSearch: false,
      mode: "new_or_direct"
    };
  }

  if (!explicitCategory && previousCategory && looksLikeAmbiguousFollowUp(qNorm)) {
    return {
      standaloneQuery: buildRefinedQuery(q, lastStrong),
      needsClarification: false,
      shouldSkipProductSearch: false,
      mode: "refinement"
    };
  }

  if (hasStrongShoppingSignal(qNorm) && !looksLikeAmbiguousFollowUp(qNorm)) {
    return {
      standaloneQuery: q,
      needsClarification: false,
      shouldSkipProductSearch: false,
      mode: "direct"
    };
  }

  if (!lastStrong) {
    return {
      standaloneQuery: q,
      needsClarification: true,
      shouldSkipProductSearch: false,
      clarificationMessage:
        "Entendi 👍 Me diz rapidinho de qual produto você está falando (ex: celular, notebook, PS5...), que eu já refino pra você."
    };
  }

  return {
    standaloneQuery: buildRefinedQuery(q, lastStrong),
    needsClarification: false,
    shouldSkipProductSearch: false,
    mode: "refinement"
  };
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
  const conversationMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];

  if (!query) {
    return res.status(400).json({
      reply: "Me manda o que você quer comprar e eu te ajudo a encontrar uma boa opção.",
      prices: []
    });
  }

  const contextResolution = resolveContextQuery(query, conversationMessages);

  if (contextResolution.needsClarification) {
    return res.status(200).json({
      reply: contextResolution.clarificationMessage,
      prices: []
    });
  }

  const resolvedQuery = contextResolution.standaloneQuery || query;
  const sessionContext = buildSessionContext(conversationMessages, req.body?.session_context);

  const intent = detectIntent(resolvedQuery);
  const userStyle = detectUserStyle(resolvedQuery);
  const budget = extractBudget(resolvedQuery);
  const wantsNew = wantsNewProduct(resolvedQuery);
  const period = getTimePeriod();
    // 🔥 MODO CONTEXTO / DECISÃO / ANÁLISE DE PRODUTO ANTERIOR
const contextAction = detectContextAction(query, intent, contextResolution);

const isContextComparison =
  /(esse|essa|isso|ele|ela)\s+(ou|vs|versus)\s+/i.test(query);

const isDecisionIntent =
  contextAction === "decision" ||
  intent === "decision" ||
  isContextComparison;

    if (contextResolution.shouldSkipProductSearch || isDecisionIntent || contextAction === "analysis") {
    const rememberedProducts = Array.isArray(sessionContext.lastProducts)
      ? sessionContext.lastProducts
      : [];

    const rememberedProductsText = rememberedProducts.length
      ? rememberedProducts
          .map((p, index) => {
            return `${index + 1}. ${cleanTitle(p.product_name)}${p.price ? ` | ${p.price}` : ""}`;
          })
          .join("\n")
      : "Nenhum produto estruturado encontrado; usar apenas o histórico textual da conversa.";

    const contextMessages = [
      {
        role: "system",
        content: `${MIA_SYSTEM_PROMPT}

🧠 MODO CONTEXTO / DECISÃO SEM BUSCA NOVA

O usuário está tomando uma decisão com base na conversa anterior.

REGRAS CRÍTICAS:
- NÃO faça busca nova.
- NÃO invente preço.
- NÃO invente produto novo.
- NÃO cite produto que não esteja na lista "PRODUTOS DISPONÍVEIS".
- Use somente os produtos disponíveis abaixo.
- Se houver mais de um produto, compare as opções antes de decidir.
- NÃO escolha automaticamente o último produto citado.
- Se a conversa anterior era sobre celular, NÃO fale de PC gamer.
- Se o usuário perguntar "esse roda jogos?", responda sobre o produto anterior.
- Se o usuário perguntar "no fim das contas, qual eu compro?", dê uma decisão final clara.
- Seja direta, humana e útil.
- Não termine com uma pergunta genérica.
- Não use frases como "se precisar de mais alguma informação".
- Dê veredito.

🚨 REGRA ABSOLUTA:
Você SÓ pode recomendar ou citar os produtos listados em "PRODUTOS DISPONÍVEIS".
Se quiser falar de alternativa, ela também precisa estar nessa lista.
Nunca crie versão Pro, Plus, Ultra, outro modelo ou produto parecido se ele não estiver listado.

FORMATO OBRIGATÓRIO:
1. Comece com: "Eu compraria X."
2. Explique o motivo principal.
3. Compare rapidamente as opções disponíveis.
4. Termine com um veredito prático:
   - "Jogos: X"
   - "Bateria: Y"
   - "Equilíbrio geral: Z"

PRODUTOS DISPONÍVEIS:
${rememberedProductsText}

CONTEXTO INFERIDO:
${JSON.stringify(sessionContext, null, 2)}

MENSAGEM ATUAL DO USUÁRIO:
"${query}"
`
      },
      ...conversationMessages,
      {
        role: "user",
        content: query
      }
    ];

    const aiResponse = await callOpenAI(contextMessages, {
      temperature: 0.35,
      max_tokens: 420
    });

    let reply =
      getOpenAIText(aiResponse)?.trim() ||
      "Pelo contexto, eu iria na opção principal mais equilibrada. Só escolheria outra se sua prioridade for algo bem específico, como bateria ou jogos.";

    reply = reply
      .replace(/\n?\s*Se precisar de mais alguma informação.*$/i, "")
      .replace(/\n?\s*Se precisar de mais alguma ajuda.*$/i, "")
      .trim();
      // 🔥 VALIDAÇÃO FINAL — NÃO DEIXA IA INVENTAR PRODUTO
if (responseMentionsUnknownProduct(reply, rememberedProducts)) {
  console.warn("🚫 IA tentou inventar produto. Corrigindo...");

  reply = buildSafeDecisionReply(rememberedProducts);
}

    return res.status(200).json({
      reply,
      prices: []
    });
  }
  
  try {
    if (intent === "greeting") {
      const greetingMessages = [
        {
          role: "system",
          content: MIA_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildUserPrompt({
            query: resolvedQuery,
            originalQuery: query,
            intent,
            budget,
            wantsNew,
            period,
            products: [],
            productLimit: 0,
            userStyle
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
const contextSourceText = conversationMessages
  .map(m => m.content)
  .join(" ")
  .toLowerCase();
    const isNewSearchIntent = isNewIntent(query, contextSourceText);

const categoryFromContext =
  detectProductCategory(resolvedQuery) ||
  detectProductCategory(query) ||
  detectProductCategory(contextSourceText);
    
   let products = await fetchSerpPrices(resolvedQuery, 10);
console.log("Produtos encontrados:", products.length);

products = filterProductsByLockedCategory(products, resolvedQuery);

products = products.filter((p) => !isBadProduct(p.product_name, resolvedQuery));
    products = products.filter((p) => {
  const title = normalizeQuery(p.product_name || "");

  if (/certificado|recondicionado|vitrine|usado|seminovo|excelente|frete grátis de 2 dias nos eua/.test(title)) {
    return false;
  }

  if (/iphone/.test(title) && /desbloqueado|certificado|excelente/.test(title)) {
    return false;
  }

  return true;
});
    products = products.filter(p => productMatchesCategory(p, categoryFromContext));

if (!Array.isArray(products) || !products.length) {
  console.warn("⚠️ busca refinada falhou, tentando fallback...");

  // 🔁 fallback: tenta buscar usando a última query forte
  const fallbackQuery = getLastStrongUserQuery(conversationMessages, query);

  if (fallbackQuery && fallbackQuery !== resolvedQuery) {
    console.warn("🔁 fallback usando:", fallbackQuery);

    let fallbackProducts = await fetchSerpPrices(fallbackQuery, 10);

    fallbackProducts = fallbackProducts.filter((p) =>
      productMatchesCategory(p, fallbackQuery)
    );

    if (fallbackProducts.length > 0) {
      products = fallbackProducts;
    }
  }

  // se ainda não tiver nada → aí sim retorna erro
  if (!products || products.length === 0) {
    return res.status(200).json({
      reply: "⚠️ Não encontrei resultados suficientes por enquanto. Se quiser, eu posso refinar melhor pra você.",
      prices: []
    });
  }
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

    const useIntent = getDetectedUseIntent(resolvedQuery);

        const resolvedCategory = detectProductCategory(resolvedQuery);

    if (
      resolvedCategory !== "phone" &&
      resolvedCategory !== "tablet" &&
      (useIntent === "gaming_light" || useIntent === "gaming_medium" || useIntent === "gaming_heavy")
    ) {
      const gamingValidProducts = validProducts.filter((p) => {
        const title = p.product_name || "";

        if (isTooOldGpu(title)) return false;
        if (!hasDedicatedGpu(title)) return false;
        if (!hasAcceptableGpuForUse(title, useIntent)) return false;

        return true;
      });

      if (gamingValidProducts.length > 0) {
        validProducts = gamingValidProducts;
      } else {
        return res.status(200).json({
          reply: "⚠️ Nessa faixa de preço, não encontrei uma opção realmente confiável para esse tipo de jogo. Se quiser, eu posso tentar achar a opção menos arriscada ou te dizer uma faixa mais realista.",
          prices: []
        });
      }
    }

    if (!validProducts.length) {
      return res.status(200).json({
        reply: "⚠️ Encontrei resultados, mas nenhum veio com preço válido o bastante pra eu te recomendar com segurança.",
        prices: []
      });
    }

    const goodProducts = validProducts.filter((p) => !isBadProduct(p.product_name, resolvedQuery));
    const rankingBase = goodProducts.length ? goodProducts : validProducts;

    let rankedProducts = rankingBase
      .map((p) => ({
        ...p,
        score: scoreProduct(p, resolvedQuery)
      }))
      .sort((a, b) => b.score - a.score);

    if (!rankedProducts || rankedProducts.length === 0) {
      console.warn("⚠️ fallback ativado");

      const parts = resolvedQuery.split(/ ou | vs | versus /i);

      if (parts.length >= 2) {
        const fallbackProducts = [];

        for (const part of parts) {
  if (isDecisionIntent) continue; // 🔥 trava

  const results = await fetchSerpPrices(part.trim(), 3);
  const categorySafeResults = filterProductsByLockedCategory(results, resolvedQuery);
  const safeResults = results.filter(p => productMatchesCategory(p, categoryFromContext));
  fallbackProducts.push(...safeResults);
}

rankedProducts = fallbackProducts;
      } else {
        rankedProducts = rankingBase.slice(0, 5);
      }
    }

    if (rankedProducts.length < 2) {
      rankedProducts = rankingBase.slice(0, 5);
    }
rankedProducts = rankedProducts.filter(p => {
  const title = normalizeQuery(p?.product_name || "");

  // Se NÃO for nova intenção → aplicar trava
  if (!isNewSearchIntent) {
    if (
      /ssd|hd externo|pendrive|pen drive|cartao de memoria|micro sd|chip|esim|adaptador/.test(title)
    ) {
      return false;
    }

    return productMatchesCategory(p, categoryFromContext);
  }

  // Se for nova intenção → liberar tudo
  return true;
});
    const bestProduct = rankedProducts[0];
    if (!bestProduct && rankedProducts.length > 0) {
  console.warn("⚠️ corrigindo ausência de bestProduct");
}
    const productLimit = getProductLimitForAI(intent);
    const topProductsForAI = rankedProducts.slice(0, productLimit);

    const openAIMessages = [
      {
        role: "system",
        content: `${MIA_SYSTEM_PROMPT}
        COMPORTAMENTO INTELIGENTE DE CONTEXTO (CRÍTICO):

Você deve interpretar cada nova mensagem do usuário analisando o contexto da conversa.

Antes de responder, decida:

A mensagem é:
1) Continuação/refinamento da busca anterior
OU
2) Uma nova intenção diferente

---

REGRAS:

1. Se a mensagem parecer um refinamento:
- mantenha a mesma categoria de produto
- ajuste apenas atributos (preço, armazenamento, desempenho, etc)
- NÃO inicie uma nova busca do zero

Exemplos de refinamento (sem depender de palavras específicas):
- mudanças pequenas na intenção
- perguntas curtas relacionadas ao produto anterior
- ajustes de preço, qualidade ou características
- perguntas sobre o produto sugerido

2. Se a mensagem parecer uma nova intenção:
- inicie uma nova busca normalmente
- ignore o contexto anterior

3. Se houver ambiguidade:
- peça uma confirmação simples antes de mudar de direção

---

REGRA DE CATEGORIA (MUITO IMPORTANTE):

Se estiver claro que o usuário está falando do mesmo tipo de produto:
- NUNCA mude a categoria

Exemplo:
Se a conversa é sobre celular:
- nunca sugerir pen drive, chip, acessório ou item diferente

---

REGRA DE COERÊNCIA:

Se o usuário pedir algo mais barato:
- a nova sugestão deve ser mais barata que a anterior

Se pedir melhoria:
- a nova opção deve ser melhor

---

REGRA DE INTERPRETAÇÃO:

Não dependa de palavras específicas.
Interprete a intenção do usuário com base no contexto completo da conversa.

---

REGRA FINAL:

Sempre priorize:
- coerência
- continuidade lógica
- contexto da conversa

Evite respostas aleatórias ou fora do fluxo.

🔽 ESTILO DE RESPOSTA (MUITO IMPORTANTE)

- Responda curto por padrão.
- Só dê respostas mais longas quando o usuário claramente pedir mais detalhes.

Considere como pedido de resposta longa quando:
- o usuário pedir comparação (ex: "qual vale mais a pena", "compare", "ou", "vs")
- o usuário pedir explicação (ex: "por quê", "explica melhor", "detalha")
- o usuário estiver indeciso entre opções

Para perguntas simples:
- responda curto, direto e claro
- evite explicação longa desnecessária

Regras:
- prefira respostas curtas e úteis
- evite parecer um artigo
- seja natural, como uma pessoa ajudando
- só se estenda quando realmente agrega valor
`
      },
      {
        role: "user",
        content: buildUserPrompt({
          query: resolvedQuery,
          originalQuery: query,
          intent,
          budget,
          wantsNew,
          period,
          products: topProductsForAI,
          productLimit,
          userStyle
        })
      }
    ];

    const aiResponse = await callOpenAI(openAIMessages, {
      temperature: 0.45,
      max_tokens: 500
    });

    let reply = getOpenAIText(aiResponse)?.trim();

    const isComparison =
      intent === "comparison" ||
      / ou | vs | versus | comparar | vale mais a pena/i.test(resolvedQuery);

    if (!isComparison && reply && reply.length > 250) {
      reply = reply.slice(0, 250).trim();

      if (!reply.endsWith(".") && reply.includes(".")) {
        reply = reply.substring(0, reply.lastIndexOf(".") + 1);
      }
    }

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

 let finalProducts = (rankedProducts && rankedProducts.length > 0)
  ? rankedProducts.slice(0, 3)
  : [];

// 🔥 NÃO buscar fallback se for decisão
if (!finalProducts || finalProducts.length === 0) {
  console.warn("⚠️ fallback de produto ativado");

  if (!isDecisionIntent) {
    const fallbackResults = await fetchSerpPrices(query, 3);

    if (fallbackResults && fallbackResults.length > 0) {
      finalProducts = fallbackResults;
    }
  }
}

// 🔥 CONTROLE INTELIGENTE DE EXIBIÇÃO

const isComparisonQuery =
  intent === "comparison" ||
  /( ou | vs | versus )/i.test(resolvedQuery);

const isDecisionQuery =
  intent === "decision" ||
  /(vale a pena|compensa|devo|qual escolher|qual é melhor)/i.test(resolvedQuery);

const isGeneralQuery =
  /(esperar promoção|o que você acha|vale a pena comprar agora)/i.test(resolvedQuery);

// 🎯 regra final
let productsToShow = [];

if (!isDecisionQuery && !isGeneralQuery) {
  // 🟢 busca normal → mostra produtos
  productsToShow = finalProducts;

  // 🟡 comparação → mostra só 1 produto
  if (isComparisonQuery) {
    productsToShow = finalProducts.slice(0, 1);
  }
}

// 🔥 AGORA SIM O RETURN CORRETO
return res.status(200).json({
  reply,
  prices: productsToShow.map((p) => ({
    product_name: cleanTitle(p.product_name),
    price: p.price,
    link: p.link,
    thumbnail: p.thumbnail,
    source: p.source
  })),
  session_context: {
    lastQuery: resolvedQuery,
    lastCategory: detectProductCategory(resolvedQuery) || "",
    lastProducts: finalProducts.slice(0, 5).map((p) => ({
      product_name: cleanTitle(p.product_name),
      price: p.price,
      link: p.link,
      thumbnail: p.thumbnail,
      source: p.source
    })),
    lastBestProduct: finalProducts[0]
      ? {
          product_name: cleanTitle(finalProducts[0].product_name),
          price: finalProducts[0].price,
          link: finalProducts[0].link,
          thumbnail: finalProducts[0].thumbnail,
          source: finalProducts[0].source
        }
      : null,
    lastIntent: intent,
    lastInteractionType: "search"
  }
});
  } catch (err) {
    console.error("chat-gpt4o.js error:", err);

    return res.status(500).json({
      reply: "⚠️ Tive um problema aqui na busca. Tenta de novo que eu continuo te ajudando.",
      prices: []
    });
  }
}
