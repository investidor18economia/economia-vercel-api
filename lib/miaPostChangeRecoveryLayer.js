/**
 * PATCH 8.4C — Post-Change Recovery Precedence Fix
 *
 * RECOVERY_AFTER_DECISION_CHANGE: usuário perdeu confiança ou compreensão
 * depois de uma mudança legítima de recomendação já persistida (8.3E/8.4B).
 */

import { namesLikelyMatch } from "./miaDecisionConsistencyFixes.js";
import { detectsReasoningBreakdownSignal } from "./miaContradictionRecoveryLayer.js";
import { detectsExplanationBreakdownSignal } from "./miaUserConfusionRecoveryLayer.js";

function normalizeRecoveryText(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function axisLabel(axis = "") {
  const map = {
    battery: "bateria",
    camera: "câmera",
    performance: "desempenho",
    value: "menor custo",
    premium: "maior investimento",
    longevity: "longevidade",
    screen: "tela",
    storage: "armazenamento",
    balance: "equilíbrio geral",
  };
  const key = String(axis || "").toLowerCase().trim();
  return map[key] || key || "equilíbrio geral";
}

export function inferDecisionChangeFromSession(sessionContext = {}) {
  const stored = sessionContext?.lastDecisionChange;
  if (stored?.winnerChanged) return stored;

  const current = sessionContext?.lastBestProduct;
  const currentName = current?.product_name || "";
  if (!currentName) return null;

  const recentExplicitChange =
    sessionContext?.lastInteractionType === "explicit_recommendation_change" ||
    sessionContext?.lastIntent === "decision_context_change";
  if (!recentExplicitChange) return null;

  const candidates = [
    ...(sessionContext?.lastComparisonProducts || []),
    ...(sessionContext?.lastProducts || []),
    ...(Array.isArray(sessionContext?.lastRankingSnapshot)
      ? sessionContext.lastRankingSnapshot.map((entry) => ({
          product_name: entry?.product_name,
          price: entry?.price,
        }))
      : []),
  ];

  const previousWinner = candidates.find(
    (p) => p?.product_name && !namesLikelyMatch(p.product_name, currentName)
  );
  if (!previousWinner?.product_name) return null;

  return {
    previousWinner,
    newWinner: current,
    previousCriterion:
      sessionContext?.lastPreviousAxis ||
      sessionContext?.lastPreviousPriority ||
      "",
    newCriterion: sessionContext?.lastPriority || sessionContext?.lastAxis || "",
    previousLabel: axisLabel(
      sessionContext?.lastPreviousAxis || sessionContext?.lastPreviousPriority || ""
    ),
    newLabel: axisLabel(sessionContext?.lastPriority || sessionContext?.lastAxis || ""),
    winnerChanged: true,
    inferred: true,
  };
}

/**
 * Sessão registrou troca legítima de winner com histórico persistido.
 */
export function hasRecentDecisionChange(sessionContext = {}) {
  const change = inferDecisionChangeFromSession(sessionContext);
  if (!change?.winnerChanged) return false;

  const prevName = change.previousWinner?.product_name || "";
  const currentName =
    sessionContext?.lastBestProduct?.product_name ||
    change.newWinner?.product_name ||
    "";

  if (!prevName || !currentName) return false;
  return !namesLikelyMatch(prevName, currentName);
}

function detectsPostChangeClaritySignal(q = "") {
  return (
    /\b(troca|mudanca|mudou|essa mudanca|essa troca)\b/.test(q) ||
    /\b(por que (mudou|trocou)|como assim.*(mudou|trocou))\b/.test(q) ||
    /\b(nao entendi|nao compreendi).*(troca|mudanca|mudou)\b/.test(q) ||
    /\b(explica|explique).*(troca|mudanca|mudou|essa mudanca)\b/.test(q)
  );
}

function detectsPostChangeFlipFlopSignal(q = "") {
  return (
    /\b(entao )?qual (e|eu) (afinal|mesmo|agora)\b/.test(q) ||
    /\bqual e afinal\b/.test(q) ||
    /\b(entao )?mudou\??\b/.test(q) ||
    /\b(ué|ue).*(mudou|trocou)\b/.test(q) ||
    /\b(pera|pera ai).*(agora|esse)\b/.test(q) ||
    /\bmas antes era (outro|diferente)\b/.test(q) ||
    /\b(voce|vc) (mudou|trocou)\b/.test(q)
  );
}

/**
 * Confusão sobre troca recente — distinto de recovery genérico 8.3F/8.3G.
 */
export function detectsPostChangeRecoverySignal(
  message = "",
  { hasActiveAnchor = false, sessionContext = null } = {}
) {
  if (!hasActiveAnchor || !hasRecentDecisionChange(sessionContext)) return false;

  const q = normalizeRecoveryText(message);
  if (!q) return false;

  if (
    detectsReasoningBreakdownSignal(message, {
      hasActiveAnchor,
      sessionContext,
    })
  ) {
    return true;
  }

  if (detectsPostChangeFlipFlopSignal(q)) return true;
  if (detectsPostChangeClaritySignal(q)) return true;

  if (detectsExplanationBreakdownSignal(message, { hasActiveAnchor, sessionContext })) {
    return detectsPostChangeClaritySignal(q);
  }

  return false;
}

export function isPostChangeRecoveryFamilyQuery(message = "", options = {}) {
  return detectsPostChangeRecoverySignal(message, options);
}

function resolvePostChangeStyle(message = "", sessionContext = null) {
  if (
    detectsReasoningBreakdownSignal(message, {
      hasActiveAnchor: true,
      sessionContext,
    })
  ) {
    return "contradiction";
  }
  return "comprehension";
}

/**
 * Reorganiza raciocínio usando histórico real da troca — sem template fixo de produto.
 */
export function buildPostChangeRecoveryReply({
  sessionContext = {},
  query = "",
  style = null,
} = {}) {
  const change = inferDecisionChangeFromSession(sessionContext) || {};
  const previousWinner = change.previousWinner || null;
  const currentWinner =
    sessionContext?.lastBestProduct || change.newWinner || null;
  const prevName = String(previousWinner?.product_name || "").trim();
  const currentName = String(currentWinner?.product_name || "").trim();
  const resolvedStyle = style || resolvePostChangeStyle(query, sessionContext);

  if (!currentName) {
    return resolvedStyle === "contradiction"
      ? "Você tem razão — vamos organizar. Me diz qual parte da troca ficou confusa que eu reorganizo com clareza."
      : "Vamos simplificar. Me diz qual parte da troca ficou confusa que eu reorganizo a explicação.";
  }

  const prevLabel =
    change.previousLabel || axisLabel(change.previousCriterion || "");
  const newLabel = change.newLabel || axisLabel(change.newCriterion || "");
  const parts = [];

  if (resolvedStyle === "contradiction") {
    parts.push("Você tem razão — vamos organizar.");
  } else {
    parts.push("Vamos simplificar.");
  }

  if (change.winnerChanged && prevName && !namesLikelyMatch(prevName, currentName)) {
    parts.push(
      `No começo, eu tinha recomendado ${prevName} porque o critério principal era ${prevLabel}.`
    );
    parts.push(`Depois você mudou a prioridade para ${newLabel}.`);
    parts.push(
      `Com esse novo critério, a recomendação passou para ${currentName}.`
    );
  } else if (newLabel) {
    parts.push(
      `${prevName || "A escolha anterior"} fazia mais sentido no critério antigo.`
    );
    parts.push(
      `${currentName} faz mais sentido no critério novo (${newLabel}).`
    );
  }

  parts.push(`Então a recomendação atual é: ${currentName}.`);

  return parts.join(" ");
}
