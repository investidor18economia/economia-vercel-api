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
  productLimit,
  userStyle
}) {
  return `
Contexto da solicitação do usuário:
- Mensagem do usuário: "${query}"
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

  Exemplo de comportamento esperado:
  - "O PS5 é mais forte e melhor pra quem quer desempenho máximo..."
  - "O Xbox Series S é mais barato e faz sentido pra quem quer economizar..."

- Em perguntas que não sejam saudação pura, não comece a resposta com cumprimento como bom dia, boa tarde, boa noite, olá ou oi.
- Ao citar opções, trate sempre o primeiro produto da lista como a recomendação principal. Se mencionar outra opção, cite no máximo 1 alternativa e deixe claro que ela é apenas uma alternativa. Não transforme a resposta em listão.
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
  const userStyle = detectUserStyle(query);
  const budget = extractBudget(query);
  const wantsNew = wantsNewProduct(query);
  const period = getTimePeriod();

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
            query,
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

    let products = await fetchSerpPrices(query, 10);
    console.log("Produtos encontrados:", products.length);

    products = products.filter((p) => !isBadProduct(p.product_name, query));

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

    const useIntent = getDetectedUseIntent(query);

    if (useIntent === "gaming_light" || useIntent === "gaming_medium" || useIntent === "gaming_heavy") {
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
          reply: "⚠️ Nessa faixa de preço, não encontrei um PC realmente confiável para esse tipo de jogo. Se quiser, eu posso tentar achar a opção menos arriscada ou te dizer a faixa mais realista.",
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
          productLimit,
          userStyle
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
  reply: aiResponse,
  products: bestProduct ? [bestProduct] : []
});
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
