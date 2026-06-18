/**
 * PATCH 8.0B — Informal Slang Normalization Layer
 *
 * Converte linguagem informal brasileira em formas canônicas que as famílias
 * semânticas existentes já compreendem. Não cria intenções novas — apenas
 * melhora ENTENDIMENTO antes do Router.
 */

function baseNormalize(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Substituições multi-palavra — ordem importa (frases mais longas primeiro).
 * Cada entrada: [pattern, replacement, hint]
 */
const PHRASE_CANONICALIZATIONS = [
  [/(\b|^)qual a fita ai(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)qual a fita(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)q fita(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)qual a boa(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)q boa(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)qual o papo(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)que que pega(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)fala comigo(\b|$)/g, "fala ai", "greeting_opening"],
  [/(\b|^)fala tu(\b|$)/g, "fala ai", "greeting_opening"],
  [/(\b|^)fala mano(\b|$)/g, "fala ai", "greeting_opening"],
  [/(\b|^)fala ai mano(\b|$)/g, "fala ai", "greeting_opening"],
  [/(\b|^)opa mano(\b|$)/g, "opa", "greeting_opening"],
  [/(\b|^)opa chefia(\b|$)/g, "opa", "greeting_opening"],
  [/(\b|^)koe mano(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)coe mano(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)coé mano(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)koé mano(\b|$)/g, "e ai", "greeting_opening"],
  [/(\b|^)partiu entao(\b|$)/g, "fechou entao", "acknowledgement"],
  [/(\b|^)show de bola(\b|$)/g, "show", "acknowledgement"],
  [/(\b|^)justissimo(\b|$)/g, "justo", "acknowledgement"],
  [/(\b|^)blz entao(\b|$)/g, "beleza entao", "acknowledgement"],
  [/(\b|^)tlgd ne(\b|$)/g, "ta ligado ne", "acknowledgement"],
  [/(\b|^)tlgd(\b|$)/g, "ta ligado", "acknowledgement"],
  [/(\b|^)to achando nao(\b|$)/g, "acho que nao", "soft_disagreement"],
  [/(?<!\bnao )(\b|^)sei nao(\b|$)/g, "nao sei nao", "soft_disagreement"],
  [/(\b|^)nao bateu(?!\s+comigo)(\b|$)/g, "nao bateu comigo", "soft_disagreement"],
  [/(\b|^)estranho isso ai(\b|$)/g, "meio estranho pra mim", "soft_disagreement"],
  [/(\b|^)nao quero me ferrar(\b|$)/g, "nao quero me arrepender", "anti_regret"],
  [/(\b|^)nao quero dor de cabeca(\b|$)/g, "nao quero me arrepender", "anti_regret"],
  [/(\b|^)quero evitar problema(\b|$)/g, "quero evitar arrependimento", "anti_regret"],
  [/(\b|^)tu iria nesse(\b|$)/g, "voce iria nele", "confidence_challenge"],
  [/(\b|^)tu iria nele(\b|$)/g, "voce iria nele", "confidence_challenge"],
  [/(?<!\bvoce )(\b|^)bancaria essa(\b|$)/g, "voce bancaria essa", "confidence_challenge"],
  [/(?<!\bvoce )(\b|^)sustenta isso(\b|$)/g, "voce sustenta isso", "confidence_challenge"],
  [/(\b|^)ce loko(\b|$)/g, "nossa", "reaction"],
  [/(\b|^)c loko(\b|$)/g, "nossa", "reaction"],
  [/(\b|^)seloko(\b|$)/g, "nossa", "reaction"],
];

/** Mensagens standalone → forma canônica inteira */
const STANDALONE_CANONICAL = Object.freeze({
  koe: "e ai",
  coe: "e ai",
  koé: "e ai",
  coé: "e ai",
  slk: "nossa",
  seloko: "nossa",
  vish: "nossa",
  eita: "nossa",
  caraca: "nossa",
  caramba: "nossa",
  nossa: "nossa",
  rapaz: "nossa",
  oxe: "nossa",
  uai: "nossa",
  doidera: "nossa",
  loucura: "nossa",
  pesado: "nossa",
  sinistro: "nossa",
  tmj: "valeu",
  demoro: "demorou",
  partiu: "fechou",
  bora: "e ai",
  suave: "suave",
  tranquilo: "tranquilo",
  "de boa": "de boa",
});

/** Tokens informais → equivalente canônico quando aparecem isolados ou como núcleo */
const TOKEN_CANONICAL = Object.freeze({
  koe: "e ai",
  coe: "e ai",
  koé: "e ai",
  coé: "e ai",
  slk: "nossa",
  seloko: "nossa",
  vish: "nossa",
  eita: "nossa",
  caraca: "nossa",
  rapaz: "nossa",
  oxe: "nossa",
  uai: "nossa",
  tmj: "valeu",
  tlgd: "ta ligado",
  blz: "blz",
  demoro: "demorou",
  partiu: "fechou",
  doidera: "nossa",
  sinistro: "nossa",
  loucura: "nossa",
  mano: "mano",
});

/**
 * @param {string} message
 * @returns {{ text: string, hints: string[], wasNormalized: boolean }}
 */
export function applyInformalLanguageNormalization(message = "") {
  const originalMessage = String(message || "");
  if (/https?:\/\//i.test(originalMessage)) {
    return {
      text: originalMessage.trim(),
      hints: [],
      wasNormalized: false,
    };
  }

  let text = baseNormalize(message);
  const hints = [];

  if (!text) {
    return { text: "", hints, wasNormalized: false };
  }

  const standalone = STANDALONE_CANONICAL[text];
  if (standalone) {
    return {
      text: standalone,
      hints: [`standalone:${text}`],
      wasNormalized: standalone !== text,
    };
  }

  for (const [pattern, replacement, hint] of PHRASE_CANONICALIZATIONS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement).replace(/\s+/g, " ").trim();
      hints.push(hint);
      pattern.lastIndex = 0;
    }
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    const mapped = tokens.map((token) => TOKEN_CANONICAL[token] || token);
    const remapped = mapped.join(" ");
    if (remapped !== text) {
      hints.push("token_map");
      text = remapped;
    }
  }

  const postStandalone = STANDALONE_CANONICAL[text];
  if (postStandalone && postStandalone !== text) {
    hints.push(`post_standalone:${text}`);
    text = postStandalone;
  }

  return {
    text,
    hints: [...new Set(hints)],
    wasNormalized: text !== baseNormalize(message),
  };
}

export function normalizeWithInformalLayer(message = "") {
  return applyInformalLanguageNormalization(message).text;
}
