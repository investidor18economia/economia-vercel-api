/**
 * PATCH 10.1C — Comparative Runner-Up Reasoning
 *
 * Identifica runner-up real a partir do ranking/candidatos existentes.
 * Não altera winner, ranking ou scoring.
 */

import { hasUsableDataLayerContent } from "./miaProductExplanationBuilder.js";
import { translateDataLayerFieldsToConsequences } from "./miaConsequenceTranslationLayer.js";
import { isGenericProductSearchQuery } from "./miaSpecificProductResolutionLock.js";

export const COMPARATIVE_RUNNER_UP_REASONING_VERSION = "10.1C.1";

const AXIS_LABELS = Object.freeze({
  battery: "bateria",
  performance: "desempenho",
  value: "custo-benefício",
  longevity: "durabilidade",
  camera: "câmera",
  screen: "tela",
  storage: "armazenamento",
});

const GENERIC_TEMPLATES = Object.freeze([
  ({ winner, runnerUp, winnerEdge }) =>
    `Eu escolhi o ${winner}, mas o ${runnerUp} chegou perto. A diferença é que ${winnerEdge}.`,
  ({ winner, runnerUp, winnerEdge }) =>
    `Quase te recomendaria o ${runnerUp}; só não fiz isso porque ${winnerEdge}.`,
  ({ winner, runnerUp, winnerEdge }) =>
    `Eu iria no ${winner}, mas o ${runnerUp} também entrou forte — ${winnerEdge}.`,
]);

const SPECIFIC_SOFT_TEMPLATES = Object.freeze([
  ({ winner, runnerUp, winnerEdge }) =>
    `Como alternativa, eu compararia com o ${runnerUp} se outro fator pesar mais, mas para a busca direta eu manteria o ${winner} como foco.`,
  ({ winner, runnerUp, winnerEdge }) =>
    `O ${runnerUp} também apareceu entre as opções reais; ainda assim, para esta busca eu manteria o ${winner} porque ${winnerEdge}.`,
]);

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

function cleanList(value, max = 2) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanText(entry)).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string" && value.trim()) {
    return [cleanText(value)].slice(0, max);
  }
  return [];
}

function seedFromText(text = "") {
  return Array.from(String(text || "")).reduce(
    (acc, char) => acc + char.charCodeAt(0),
    0
  );
}

function pickVariant(items = [], seed = "") {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  return list[seedFromText(seed) % list.length];
}

export function resolveProductDisplayName(product = null) {
  if (!product || typeof product !== "object") return "";
  return cleanText(
    product.trustedSpecs?.official_name ||
      product.official_name ||
      product.product_name ||
      product.title ||
      ""
  );
}

function resolveFamilyKey(product = null) {
  if (!product) return "";
  return normalizeProductKey(
    product.familyKey ||
      product.normalizedName ||
      product.trustedSpecs?.model_family ||
      resolveProductDisplayName(product)
  );
}

export function isSameProductFamily(a = null, b = null) {
  const keyA = resolveFamilyKey(a);
  const keyB = resolveFamilyKey(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  if (keyA.length >= 8 && keyB.length >= 8) {
    return keyA.includes(keyB) || keyB.includes(keyA);
  }
  return false;
}

function isQueryAnchorProduct(product = null) {
  if (!product) return false;
  return (
    product.specificProductQueryAnchor === true ||
    /query_product_anchor/i.test(String(product.source || "")) ||
    /query_product_anchor/i.test(String(product.provider || ""))
  );
}

export function isTrustedRunnerUpCandidate(product = null) {
  if (!product || typeof product !== "object") return false;
  if (isQueryAnchorProduct(product)) return false;

  const specs = product.trustedSpecs || null;
  if (hasUsableDataLayerContent(specs)) return true;

  if (product.dataLayerMatch === true || product.dataLayerUsed === true) return true;

  const scores = product.scoreEngine?.scores || product.scores || null;
  if (scores && typeof scores === "object" && Object.keys(scores).length >= 2) {
    return true;
  }

  return false;
}

function classifyRunnerUpSource(product = null, dataLayerPrimary = false) {
  if (hasUsableDataLayerContent(product?.trustedSpecs)) {
    return dataLayerPrimary
      ? "data_layer_ranked_candidates"
      : "data_layer_ranked_candidates";
  }
  if (product?.scoreEngine?.scores && Object.keys(product.scoreEngine.scores).length >= 2) {
    return "decision_engine_candidates";
  }
  if (isTrustedRunnerUpCandidate(product)) {
    return "commercial_candidates";
  }
  return null;
}

function resolveAxisScore(product = null, axis = "") {
  const scores =
    product?.scoreEngine?.scores ||
    product?.scores ||
    product?.trustedSpecs?.scores ||
    {};
  const raw = scores[axis];
  if (raw == null || Number.isNaN(Number(raw))) return null;
  return Number(raw);
}

function extractHumanConsequence(items = []) {
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    const text = cleanText(item?.consequence || item);
    if (text && text.length >= 8) return text.replace(/\.$/, "");
  }
  return "";
}

function extractRunnerUpStrength(runnerUp = null) {
  const specs = runnerUp?.trustedSpecs || {};
  const translated = translateDataLayerFieldsToConsequences(specs);
  return (
    extractHumanConsequence(translated.strengths) ||
    cleanList(specs.strengths, 1)[0]?.replace(/\.$/, "") ||
    extractHumanConsequence(translated.idealFor) ||
    cleanList(specs.ideal_for, 1)[0]?.replace(/\.$/, "") ||
    ""
  );
}

function extractWinnerEdge({
  winner = null,
  runnerUp = null,
  primaryAxis = "",
  querySignals = {},
  specificProductQueryAnchor = false,
  specificProductLockActive = false,
} = {}) {
  if (specificProductLockActive && specificProductQueryAnchor) {
    return "é exatamente o modelo que você pediu nesta busca";
  }

  const axis = cleanText(primaryAxis).toLowerCase();
  const axisLabel = AXIS_LABELS[axis] || "o critério principal desta busca";
  const winnerScore = axis ? resolveAxisScore(winner, axis) : null;
  const runnerScore = axis ? resolveAxisScore(runnerUp, axis) : null;

  if (winnerScore != null && runnerScore != null && winnerScore > runnerScore + 2) {
    if (querySignals?.priceSensitive && axis === "value") {
      return `o ${resolveProductDisplayName(winner)} fecha melhor o custo-benefício para o que você pediu`;
    }
    return `o ${resolveProductDisplayName(winner)} leva vantagem em ${axisLabel} nesta comparação`;
  }

  const winnerSpecs = winner?.trustedSpecs || {};
  const translated = translateDataLayerFieldsToConsequences(winnerSpecs);
  const strength =
    extractHumanConsequence(translated.strengths) ||
    cleanList(winnerSpecs.strengths, 1)[0]?.replace(/\.$/, "") ||
    extractHumanConsequence(translated.idealFor) ||
    cleanList(winnerSpecs.ideal_for, 1)[0]?.replace(/\.$/, "") ||
    "";

  if (strength) {
    return strength.charAt(0).toLowerCase() + strength.slice(1);
  }

  if (querySignals?.batteryPriority && axis === "battery") {
    return `a autonomia do ${resolveProductDisplayName(winner)} pesa mais para esta busca`;
  }

  if (querySignals?.priceSensitive) {
    return `o equilíbrio de preço e entrega do ${resolveProductDisplayName(winner)} fecha melhor aqui`;
  }

  return `ele encaixa melhor no que esta busca prioriza`;
}

function resolveConfidence({ runnerUpSource = "", axisGap = 0, runnerUpStrength = "" } = {}) {
  if (runnerUpSource === "data_layer_ranked_candidates" && axisGap >= 5) return "high";
  if (runnerUpSource === "data_layer_ranked_candidates" && runnerUpStrength) return "medium";
  if (runnerUpSource === "decision_engine_candidates") return "medium";
  if (runnerUpSource === "commercial_candidates" && runnerUpStrength) return "low";
  return "low";
}

export function findTrustedRunnerUp({ winner = null, candidates = [] } = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!winner || !list.length) {
    return { runnerUp: null, runnerUpSource: null, skippedReason: "no_candidates" };
  }

  const winnerIndex = list.findIndex(
    (candidate) =>
      isSameProductFamily(candidate, winner) ||
      resolveProductDisplayName(candidate) === resolveProductDisplayName(winner)
  );

  const startIndex = winnerIndex >= 0 ? winnerIndex + 1 : 0;

  for (let index = startIndex; index < list.length; index += 1) {
    const candidate = list[index];
    if (!candidate) continue;
    if (isSameProductFamily(candidate, winner)) continue;
    if (!isTrustedRunnerUpCandidate(candidate)) continue;

    const name = resolveProductDisplayName(candidate);
    if (!name) continue;

    return {
      runnerUp: candidate,
      runnerUpSource: classifyRunnerUpSource(candidate),
      skippedReason: null,
      candidateIndex: index,
    };
  }

  return { runnerUp: null, runnerUpSource: null, skippedReason: "no_trusted_runner_up" };
}

export function verbalizeComparativeRunnerUpParagraph(payload = {}) {
  if (!payload?.applied || !payload?.winner || !payload?.runnerUp || !payload?.reason) {
    return "";
  }
  return cleanText(payload.reason);
}

export function resolveComparativeRunnerUpReasoning(input = {}) {
  const query = cleanText(input.query || "");
  const winner = input.winner || null;
  const candidates = Array.isArray(input.rankedCandidates)
    ? input.rankedCandidates
    : Array.isArray(input.candidates)
      ? input.candidates
      : [];
  const primaryAxis = cleanText(input.primaryAxis || "").toLowerCase();
  const querySignals = input.querySignals || {};
  const specificProductLockActive = !!input.specificProductLockActive;
  const specificProductQueryAnchor =
    !!input.specificProductQueryAnchor || isQueryAnchorProduct(winner);
  const isSpecificQuery = specificProductLockActive && !isGenericProductSearchQuery(query);

  const winnerName = resolveProductDisplayName(winner);
  const baseAudit = {
    applied: false,
    query,
    winner: winnerName || null,
    runnerUp: null,
    runnerUpSource: null,
    candidateCount: candidates.length,
    skippedReason: null,
    winnerPreserved: true,
    specificProductLockActive,
    comparisonAxis: primaryAxis || null,
    confidence: null,
  };

  if (!winnerName || candidates.length < 2) {
    return {
      applied: false,
      audit: { ...baseAudit, skippedReason: "no_candidates" },
      payload: null,
    };
  }

  const { runnerUp, runnerUpSource, skippedReason } = findTrustedRunnerUp({
    winner,
    candidates,
  });

  if (!runnerUp || !runnerUpSource) {
    return {
      applied: false,
      audit: { ...baseAudit, skippedReason: skippedReason || "no_trusted_runner_up" },
      payload: null,
    };
  }

  const runnerUpName = resolveProductDisplayName(runnerUp);
  if (!runnerUpName || isSameProductFamily(runnerUp, winner)) {
    return {
      applied: false,
      audit: { ...baseAudit, skippedReason: "same_family_as_winner" },
      payload: null,
    };
  }

  const winnerEdge = extractWinnerEdge({
    winner,
    runnerUp,
    primaryAxis,
    querySignals,
    specificProductQueryAnchor,
    specificProductLockActive,
  });
  const runnerUpStrength = extractRunnerUpStrength(runnerUp);

  const winnerScore = primaryAxis ? resolveAxisScore(winner, primaryAxis) : null;
  const runnerScore = primaryAxis ? resolveAxisScore(runnerUp, primaryAxis) : null;
  const axisGap =
    winnerScore != null && runnerScore != null ? Math.abs(winnerScore - runnerScore) : 0;

  const confidence = resolveConfidence({ runnerUpSource, axisGap, runnerUpStrength });
  const seed = `${query}|${winnerName}|${runnerUpName}|${primaryAxis}`;

  const templates = isSpecificQuery && specificProductQueryAnchor
    ? SPECIFIC_SOFT_TEMPLATES
    : GENERIC_TEMPLATES;

  const reason = pickVariant(
    templates.map(
      (template) => () =>
        template({
          winner: winnerName,
          runnerUp: runnerUpName,
          winnerEdge,
          query,
        })
    ),
    seed
  )();

  const payload = {
    applied: true,
    winner: winnerName,
    runnerUp: runnerUpName,
    comparisonAxis: primaryAxis || null,
    winnerEdge,
    runnerUpStrength,
    reason,
    source: runnerUpSource,
    confidence,
  };

  return {
    applied: true,
    reason,
    payload,
    audit: {
      ...baseAudit,
      applied: true,
      runnerUp: runnerUpName,
      runnerUpSource,
      skippedReason: null,
      comparisonAxis: primaryAxis || null,
      confidence,
    },
  };
}

export function logComparativeRunnerUpAudit(audit = {}) {
  console.log(
    "COMPARATIVE_RUNNER_UP_AUDIT",
    JSON.stringify({
      version: COMPARATIVE_RUNNER_UP_REASONING_VERSION,
      applied: !!audit.applied,
      query: audit.query || null,
      winner: audit.winner || null,
      runnerUp: audit.runnerUp || null,
      runnerUpSource: audit.runnerUpSource || null,
      candidateCount: audit.candidateCount ?? 0,
      skippedReason: audit.skippedReason || null,
      winnerPreserved: audit.winnerPreserved !== false,
      specificProductLockActive: !!audit.specificProductLockActive,
      comparisonAxis: audit.comparisonAxis || null,
      confidence: audit.confidence || null,
    })
  );
}
