/**
 * PATCH 10.1E — Comparison Flow Crash Guard
 *
 * Detecção/resolução segura de comparação direta.
 * Não altera winner, ranking ou patches 10.1A–10.1D.
 */

export const COMPARISON_FLOW_CRASH_GUARD_VERSION = "10.1E.1";

const COMPARISON_CONNECTOR_PATTERN = /\b(?:ou|vs|versus|contra)\b|\s+e\s+/i;
const COMPARE_VERB_PATTERN = /\b(comparar|compare|comparação|comparacao)\b/i;
const COMPARISON_INTENT_PATTERN =
  /\b(comparar|compare|comparação|comparacao|versus| vs | x )\b|\b(ou|versus|contra)\b|\s+e\s+/i;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeProductKey(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanComparisonTerm(part = "") {
  return cleanText(part)
    .replace(/^\s*(é|e)\s+/i, " ")
    .replace(
      /\b(qual|quais|quem|melhor|pior|vale|mais|menos|tem|pena|entre|comparar|compare|comparação|comparacao)\b/gi,
      " "
    )
    .replace(/\b(celular|smartphone|telefone|aparelho|modelo|opção|opcao)\b/gi, " ")
    .replace(
      /\b(bateria|autonomia|carga|tomada|desempenho|performance|camera|câmera|foto|fotos|video|vídeo|tela|display|armazenamento|memoria|memória|espaço|espaco|custo|beneficio|benefício)\b/gi,
      " "
    )
    .replace(/[,:;()]/g, " ")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTerms(parts = []) {
  const seen = new Set();

  return parts
    .map((part) => cleanComparisonTerm(part))
    .filter((part) => part.length >= 2)
    .filter((part) => {
      const key = normalizeProductKey(part);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function splitComparisonParts(raw = "") {
  const normalizedRaw = String(raw || "")
    .trim()
    .replace(/\s+x\s+/gi, " vs ")
    .replace(/\s+contra\s+/gi, " vs ")
    .replace(/\s+versus\s+/gi, " vs ");

  return normalizedRaw
    .replace(/[?!.]/g, " ")
    .split(COMPARISON_CONNECTOR_PATTERN)
    .map((part) => cleanText(part))
    .filter(Boolean);
}

export function extractComparisonTermsFromQuery(query = "") {
  const raw = String(query || "").trim();
  if (!raw) return [];

  const normalizedRaw = raw
    .replace(/\s+x\s+/gi, " vs ")
    .replace(/\s+contra\s+/gi, " vs ")
    .replace(/\s+versus\s+/gi, " vs ");

  const hasCompareVerb = COMPARE_VERB_PATTERN.test(normalizedRaw);
  const hasDirectComparisonConnector = COMPARISON_CONNECTOR_PATTERN.test(normalizedRaw);

  if (hasDirectComparisonConnector) {
    let parts = splitComparisonParts(normalizedRaw);

    if (hasCompareVerb) {
      parts = parts.map((part) =>
        part.replace(/\b(comparar|compare|comparação|comparacao)\b/gi, " ").trim()
      );
    }

    const terms = normalizeTerms(parts);
    if (terms.length >= 2) return terms;
  }

  const looksLikeMoreQuestion =
    /\b(qual|quais|quem)\b/i.test(raw) &&
    /\b(mais|melhor|maior|dura|aguenta|vale)\b/i.test(raw);

  if (looksLikeMoreQuestion && /\bentre\b/i.test(raw) && /\se\s/i.test(raw)) {
    const afterEntre = raw.split(/\bentre\b/i).pop() || "";
    const beforeQuestion = afterEntre.split(/\b(?:qual|quais|quem)\b/i)[0] || "";
    const terms = normalizeTerms(beforeQuestion.split(/\s+\be\b\s+/i));
    if (terms.length >= 2) return terms;
  }

  if (looksLikeMoreQuestion && /\se\s/i.test(raw)) {
    const beforeQuestion = raw.split(/\b(?:qual|quais|quem)\b/i)[0] || "";
    const terms = normalizeTerms(beforeQuestion.split(/\s+\be\b\s+/i));
    if (terms.length >= 2) return terms;
  }

  return [];
}

export function isDirectComparisonQuery(query = "") {
  const raw = cleanText(query);
  if (!raw) return false;
  if (extractComparisonTermsFromQuery(raw).length >= 2) return true;
  return COMPARISON_INTENT_PATTERN.test(raw) && /\b(ou|vs|versus|contra)\b|\s+e\s+/i.test(raw);
}

export function findMissingComparisonTerms(terms = [], products = []) {
  const list = Array.isArray(terms) ? terms.filter(Boolean) : [];
  const resolved = Array.isArray(products) ? products.filter(Boolean) : [];

  return list.filter((term) => {
    const termKey = normalizeProductKey(term);
    if (!termKey) return true;

    const termTokens = termKey.split(" ").filter((token) => token.length >= 2);
    if (!termTokens.length) return true;

    return !resolved.some((product) => {
      const nameKey = normalizeProductKey(
        product?.trustedSpecs?.official_name ||
          product?.product_name ||
          product?.title ||
          ""
      );
      if (!nameKey) return false;
      if (nameKey === termKey || nameKey.includes(termKey) || termKey.includes(nameKey)) {
        return true;
      }
      return termTokens.every((token) => nameKey.includes(token));
    });
  });
}

export function buildComparisonUnresolvedFallbackReply({
  query = "",
  resolvedTerms = [],
  missingTerms = [],
} = {}) {
  const missing = (missingTerms.length ? missingTerms : resolvedTerms).filter(Boolean);
  if (missing.length === 1) {
    return `Consigo comparar, mas não encontrei "${missing[0]}" com segurança no catálogo da MIA ainda. Me manda o nome um pouco mais completo para eu fechar a comparação.`;
  }
  return "Consigo comparar, mas não encontrei esses modelos com segurança no catálogo da MIA ainda. Me manda os nomes um pouco mais completos, tipo “Galaxy A15 ou Moto G84”, que eu comparo direto.";
}

export function buildComparisonFlowCrashGuardAudit(input = {}) {
  return {
    applied: !!input.applied,
    query: input.query || null,
    detectedComparison: !!input.detectedComparison,
    resolvedProductsCount: input.resolvedProductsCount ?? 0,
    resolvedProducts: input.resolvedProducts || [],
    missingProducts: input.missingProducts || [],
    winner: input.winner || null,
    responsePath: input.responsePath || "",
    preventedCrash: !!input.preventedCrash,
    fallbackUsed: !!input.fallbackUsed,
    errorBeforeGuard: input.errorBeforeGuard || null,
  };
}

export function logComparisonFlowCrashGuardAudit(audit = {}) {
  console.log(
    "COMPARISON_FLOW_CRASH_GUARD_AUDIT",
    JSON.stringify({
      version: COMPARISON_FLOW_CRASH_GUARD_VERSION,
      ...buildComparisonFlowCrashGuardAudit(audit),
    })
  );
}

/**
 * Executa fluxo de comparação com fallback 200 em erro inesperado.
 * @param {{ query?: string, execute: Function, onFallback: Function }} input
 */
export async function executeComparisonFlowSafely(input = {}) {
  const query = cleanText(input.query || "");
  const terms = extractComparisonTermsFromQuery(query);
  const detectedComparison = isDirectComparisonQuery(query);

  try {
    const result = await input.execute({
      terms,
      detectedComparison,
    });

    logComparisonFlowCrashGuardAudit({
      applied: true,
      query,
      detectedComparison,
      resolvedProductsCount: result?.resolvedProductsCount ?? 0,
      resolvedProducts: result?.resolvedProducts || [],
      missingProducts: result?.missingProducts || [],
      winner: result?.winner || null,
      responsePath: result?.responsePath || "",
      preventedCrash: false,
      fallbackUsed: !!result?.fallbackUsed,
      errorBeforeGuard: null,
    });

    return result;
  } catch (error) {
    const message = error?.message || String(error || "unknown_error");

    logComparisonFlowCrashGuardAudit({
      applied: true,
      query,
      detectedComparison,
      resolvedProductsCount: 0,
      resolvedProducts: [],
      missingProducts: terms,
      winner: null,
      responsePath: "comparison_flow_crash_guard",
      preventedCrash: true,
      fallbackUsed: true,
      errorBeforeGuard: message,
    });

    if (typeof input.onFallback === "function") {
      return input.onFallback({ error: message, terms, detectedComparison });
    }

    return {
      fallbackUsed: true,
      preventedCrash: true,
      responsePath: "comparison_flow_crash_guard",
      reply: buildComparisonUnresolvedFallbackReply({
        query,
        resolvedTerms: terms,
        missingTerms: terms,
      }),
    };
  }
}
