/**
 * PATCH 8.0D — Typo / Fuzzy Input Understanding
 *
 * Recupera significado de erros humanos de digitação antes das camadas
 * de abreviação/informal. Determinístico, local, sem LLM.
 */

function stripAccents(str = "") {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function baseNormalize(str = "") {
  return stripAccents(String(str || "").toLowerCase())
    .replace(/[?!.,;:…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens técnicos / siglas — nunca corrigir. */
const PROTECTED_TOKEN = /^(rtx|rx|ddr\d*|ssd|nvme|gpu|cpu|hdmi|usb|wifi|gb|tb|mhz|ghz|fps|ips|oled|amoled|hz|w|mah|nvidia|amd|intel|apple|ios|android)$/i;

/** Tokens conversacionais válidos — nunca fuzzy (evita valeu→vale, etc.). */
const CONVERSATIONAL_PROTECTED = new Set([
  "valeu", "vlw", "obrigado", "obrigada", "brigado", "brigada",
  "tmj", "fechou", "demorou", "massa", "beleza", "blz", "show",
  "tranquilo", "suave", "captei", "entendi", "combinado", "perfeito",
  "otimo", "demoro", "falou", "certo", "fechado",
]);

/** Códigos de modelo / SKU — não corrigir. */
function isProtectedToken(token = "") {
  if (!token) return true;
  if (PROTECTED_TOKEN.test(token)) return true;
  if (/^https?:\/\//i.test(token)) return true;
  if (/^\d+[a-z]{0,3}$/i.test(token)) return true;
  if (/^[a-z]*\d+[a-z0-9-]*$/i.test(token) && /\d/.test(token) && token.length <= 12) return true;
  if (/^[a-z]{1,3}\d{2,}[a-z0-9-]*$/i.test(token)) return true;
  if (/^sm-[a-z0-9]+$/i.test(token)) return true;
  return false;
}

/** Frases multi-palavra — alta confiança. */
const PHRASE_CORRECTIONS = [
  [/(\b|^)poço comprar(\b|$)/gi, "posso comprar", "phrase:posso_comprar"],
  [/(\b|^)poco comprar(\b|$)/gi, "posso comprar", "phrase:posso_comprar"],
  [/(\b|^)poco confiar(\b|$)/gi, "posso confiar", "phrase:posso_confiar"],
  [/(\b|^)poço confiar(\b|$)/gi, "posso confiar", "phrase:posso_confiar"],
  [/(\b|^)poso comprar(\b|$)/gi, "posso comprar", "phrase:posso_comprar"],
  [/(\b|^)possu comprar(\b|$)/gi, "posso comprar", "phrase:posso_comprar"],
  [/(\b|^)com certeza(\b|$)/gi, "com certeza", "phrase:com_certeza"],
  [/(\b|^)comserteza(\b|$)/gi, "com certeza", "phrase:com_certeza"],
  [/(\b|^)comcertesa(\b|$)/gi, "com certeza", "phrase:com_certeza"],
  [/(\b|^)custo benificio(\b|$)/gi, "custo beneficio", "phrase:custo_beneficio"],
  [/(\b|^)custo benefisio(\b|$)/gi, "custo beneficio", "phrase:custo_beneficio"],
  [/(\b|^)custo benefico(\b|$)/gi, "custo beneficio", "phrase:custo_beneficio"],
  [/(\b|^)tenho serteza(\b|$)/gi, "tenho certeza", "phrase:tenho_certeza"],
  [/(\b|^)tenho sertesa(\b|$)/gi, "tenho certeza", "phrase:tenho_certeza"],
  [/(\b|^)tem serteza(\b|$)/gi, "tem certeza", "phrase:tem_certeza"],
  [/(\b|^)voce tem serteza(\b|$)/gi, "voce tem certeza", "phrase:voce_tem_certeza"],
  [/(\b|^)medo de erar(\b|$)/gi, "medo de errar", "phrase:medo_erar"],
  [/(\b|^)nao entedi(\b|$)/gi, "nao entendi", "phrase:nao_entedi"],
  [/(\b|^)nao me convence(\b|$)/gi, "nao me convenceu", "phrase:nao_me_convence"],
  [/(\b|^)nao quero me arprender(\b|$)/gi, "nao quero me arrepender", "phrase:nao_arprender"],
  [/(\b|^)quero gasta menos(\b|$)/gi, "quero gastar menos", "phrase:quero_gasta"],
  [/(\b|^)segundoo(\b|$)/gi, "segundo", "phrase:segundoo"],
  [/(\b|^)recomendassao(\b|$)/gi, "recomendacao", "phrase:recomendacao"],
  [/(\b|^)recomendacão(\b|$)/gi, "recomendacao", "phrase:recomendacao"],
  [/(\b|^)recomendaçao(\b|$)/gi, "recomendacao", "phrase:recomendacao"],
];

/** Mapa token → canônico (alta confiança, sem fuzzy). */
const TOKEN_CORRECTIONS = Object.freeze({
  // marcas
  sansung: "samsung",
  samsumg: "samsung",
  samsng: "samsung",
  samgung: "samsung",
  xiaome: "xiaomi",
  xiaomii: "xiaomi",
  xiaumy: "xiaomi",
  motrola: "motorola",
  motorla: "motorola",
  aple: "apple",
  aplle: "apple",
  iphonne: "iphone",
  iphnoe: "iphone",
  ifone: "iphone",
  ipone: "iphone",
  realmi: "realme",
  reame: "realme",
  infinixx: "infinix",
  tecnoo: "tecno",
  // palavras comuns
  serteza: "certeza",
  sertesa: "certeza",
  srtza: "certeza",
  poso: "posso",
  possu: "posso",
  tambemm: "tambem",
  tbemm: "tambem",
  naun: "nao",
  naoo: "nao",
  entendii: "entendi",
  entendiu: "entendi",
  voce: "voce",
  voçe: "voce",
  vocêe: "voce",
  camera: "camera",
  camêra: "camera",
  bateriaa: "bateria",
  // categorias
  notbook: "notebook",
  notebbok: "notebook",
  notboook: "notebook",
  monito: "monitor",
  monnitor: "monitor",
  tecldo: "teclado",
  tecaldo: "teclado",
  mause: "mouse",
  mouze: "mouse",
  foni: "fone",
  fonee: "fone",
  cadeeira: "cadeira",
  celulsr: "celular",
  bsteria: "bateria",
  perfomance: "performance",
  cameta: "camera",
  desepenho: "desempenho",
  bararto: "barato",
  baratinhoo: "barato",
  barartinho: "barato",
  promoçaoo: "promocao",
  ofertaa: "oferta",
  benefisio: "beneficio",
  benefico: "beneficio",
  recomendacão: "recomendacao",
  explicassao: "explicacao",
  indicassao: "indicacao",
});

/** Léxico para fuzzy distância 1 — apenas palavras comerciais/portuguesas seguras. */
const FUZZY_LEXICON = [
  "certeza", "recomenda", "recomendacao", "compensa", "notebook", "monitor",
  "teclado", "celular", "smartphone", "cadeira", "tablet", "samsung",
  "xiaomi", "motorola", "iphone", "apple", "performance", "bateria",
  "camera", "desempenho", "beneficio", "promocao", "oferta", "barato",
  "comprar", "posso", "confiar", "continua", "indica", "melhor",
  "alternativa", "processador", "memoria", "armazenamento", "garantia",
];

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function isLaughterToken(token = "") {
  return /^(?:k{2,}|(?:rs)+|(?:ha)+|(?:he)+|(?:hue)+)$/i.test(token);
}

function collapseRepeatedLetters(token = "") {
  if (token.length < 4 || isLaughterToken(token)) return token;
  return token.replace(/(.)\1{2,}/g, "$1");
}

/** Infinitivos válidos — não fuzzy (recomendar→recomenda, continuar→continua). */
function isLikelyValidInfinitive(token = "") {
  return token.length >= 6 && /(?:ar|er|ir)$/.test(token);
}

function fuzzyCorrectToken(token, appliedTypoCorrections) {
  if (token.length < 5 || isProtectedToken(token)) return token;
  if (CONVERSATIONAL_PROTECTED.has(token)) return token;
  if (isLikelyValidInfinitive(token)) return token;
  if (TOKEN_CORRECTIONS[token]) return token;

  let best = null;
  let bestDist = Infinity;
  for (const candidate of FUZZY_LEXICON) {
    if (Math.abs(candidate.length - token.length) > 1) continue;
    if (token.endsWith("s") !== candidate.endsWith("s")) continue;
    if (candidate.endsWith("ar") && candidate === `${token}r`) continue;
    const dist = levenshtein(token, candidate);
    if (dist === 1 && dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }

  if (best) {
    appliedTypoCorrections.push(`fuzzy:${token}->${best}`);
    return best;
  }
  return token;
}

/**
 * @param {string} message
 * @returns {{
 *   originalMessage: string,
 *   typoNormalizedMessage: string,
 *   appliedTypoCorrections: string[],
 *   hasTypoNormalization: boolean
 * }}
 */
export function applyTypoNormalization(message = "") {
  const originalMessage = String(message || "");
  const appliedTypoCorrections = [];

  if (!originalMessage.trim()) {
    return {
      originalMessage,
      typoNormalizedMessage: "",
      appliedTypoCorrections,
      hasTypoNormalization: false,
    };
  }

  if (/https?:\/\//i.test(originalMessage)) {
    return {
      originalMessage,
      typoNormalizedMessage: originalMessage.trim(),
      appliedTypoCorrections,
      hasTypoNormalization: false,
    };
  }

  const baseline = baseNormalize(originalMessage);
  let text = baseline;

  for (const [pattern, replacement, tag] of PHRASE_CORRECTIONS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement).replace(/\s+/g, " ").trim();
      appliedTypoCorrections.push(tag);
      pattern.lastIndex = 0;
    }
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  const corrected = tokens.map((rawToken) => {
    let token = stripAccents(rawToken.toLowerCase());

    if (isProtectedToken(token)) return token;

    const directFirst = TOKEN_CORRECTIONS[token];
    if (directFirst) {
      if (directFirst !== token) appliedTypoCorrections.push(`token:${token}->${directFirst}`);
      return directFirst;
    }

    const collapsed = collapseRepeatedLetters(token);
    if (collapsed !== token) {
      appliedTypoCorrections.push(`repeat:${token}->${collapsed}`);
      token = collapsed;
    }

    const direct = TOKEN_CORRECTIONS[token];
    if (direct && direct !== token) {
      appliedTypoCorrections.push(`token:${token}->${direct}`);
      return direct;
    }
    if (direct) return direct;

    return fuzzyCorrectToken(token, appliedTypoCorrections);
  });

  text = corrected.join(" ").replace(/\s+/g, " ").trim();

  return {
    originalMessage,
    typoNormalizedMessage: text,
    appliedTypoCorrections: [...new Set(appliedTypoCorrections)],
    hasTypoNormalization: text !== baseline,
  };
}

export function normalizeWithTypoLayer(message = "") {
  return applyTypoNormalization(message).typoNormalizedMessage;
}
