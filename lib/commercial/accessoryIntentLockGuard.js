/**
 * PATCH Comercial 4E-A.2 — Accessory Intent Lock Guard
 *
 * Informa ao Specific Product Lock quando a query representa acessório.
 * Não decide produto, não altera winner, ranking ou Decision Engine.
 */

export const ACCESSORY_INTENT_LOCK_GUARD_VERSION = "4E-A.2";

/**
 * Sinais universais expansíveis — category-agnostic, sem marcas/modelos.
 * Ordem: frases compostas antes de tokens curtos.
 */
export const ACCESSORY_INTENT_SIGNAL_RULES = Object.freeze([
  { token: "controle remoto", pattern: /\bcontrole remoto\b/i },
  { token: "capa protetora", pattern: /\bcapa protetora\b/i },
  { token: "pelicula", pattern: /\bpel[ií]cula\b/i },
  { token: "carregador", pattern: /\bcarregador\b/i },
  { token: "adaptador", pattern: /\badaptador\b/i },
  { token: "mousepad", pattern: /\bmousepad\b/i },
  { token: "headset", pattern: /\bheadset\b/i },
  { token: "reposicao", pattern: /\breposi[cç][aã]o\b/i },
  { token: "capa", pattern: /\bcapa\b|\bcase\b/i },
  { token: "cabo", pattern: /\bcabo\b/i },
  { token: "fonte", pattern: /\bfonte\b/i },
  { token: "controle", pattern: /\bcontrole\b/i },
  { token: "suporte", pattern: /\bsuporte\b/i },
  { token: "dock", pattern: /\bdock\b/i },
  { token: "hub", pattern: /\bhub\b/i },
  { token: "bolsa", pattern: /\bbolsa\b/i },
  { token: "estojo", pattern: /\bestojo\b/i },
  { token: "refil", pattern: /\brefil\b/i },
  { token: "peca", pattern: /\bpe[cç]a\b/i },
  { token: "fone", pattern: /\bfone\b/i },
  { token: "protetor", pattern: /\bprotetor\b/i },
  { token: "almofada", pattern: /\balmofada\b/i },
  { token: "bateria", pattern: /\bbateria\b/i },
  { token: "teclado", pattern: /\bteclado\b/i },
  { token: "kit", pattern: /\bkit\b/i },
]);

function stripAccents(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {string} query
 */
export function normalizeAccessoryIntentQuery(query = "") {
  return stripAccents(String(query || "").toLowerCase())
    .replace(/[^\p{L}\p{N}\s+]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} query
 */
export function detectAccessoryIntent(query = "") {
  const normalizedQuery = normalizeAccessoryIntentQuery(query);
  const matchedSignals = [];

  if (!normalizedQuery) {
    return {
      enabled: true,
      isAccessoryIntent: false,
      confidence: 0,
      matchedSignals,
      normalizedQuery,
    };
  }

  for (const rule of ACCESSORY_INTENT_SIGNAL_RULES) {
    if (rule.pattern.test(normalizedQuery)) {
      if (!matchedSignals.includes(rule.token)) {
        matchedSignals.push(rule.token);
      }
    }
  }

  const isAccessoryIntent = matchedSignals.length > 0;
  const confidence = isAccessoryIntent
    ? Math.min(1, 0.55 + matchedSignals.length * 0.15)
    : 0;

  return {
    enabled: true,
    isAccessoryIntent,
    confidence,
    matchedSignals,
    normalizedQuery,
  };
}

/**
 * Payload estável para tracer / endpoints DEV.
 * @param {string} query
 */
export function buildAccessoryIntentDiagnostic(query = "") {
  const intent = detectAccessoryIntent(query);
  return {
    enabled: intent.enabled,
    isAccessoryIntent: intent.isAccessoryIntent,
    confidence: intent.confidence,
    matchedSignals: intent.matchedSignals,
    normalizedQuery: intent.normalizedQuery,
    version: ACCESSORY_INTENT_LOCK_GUARD_VERSION,
  };
}

/**
 * @param {string} query
 */
export function shouldBypassSpecificProductLockForAccessoryIntent(query = "") {
  return detectAccessoryIntent(query).isAccessoryIntent === true;
}
