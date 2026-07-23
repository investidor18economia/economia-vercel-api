/**
 * PATCH 9.1 — Recommendation decision classification (observational only).
 */

import {
  MIA_DECISION_ROUTING_MODES,
  MIA_DECISION_RUNTIME_MODES,
  MIA_DECISION_SOURCES,
} from "./miaRecommendationDecisionCatalog.js";
import {
  computeScoreGap,
  decisionProductsMatchFamily,
  extractDecisionProviderId,
  extractObservedScore,
  hashSafeFamilyKey,
  resolveSafeProductFamilyKey,
} from "./miaRecommendationDecisionIdentity.js";
import {
  isCommercialRuntimeControlled,
  isCommercialRuntimeShadow,
} from "./productSourceAdapter/commercialRuntimeMode.js";

/**
 * @param {string} [mode]
 */
export function normalizeDecisionRoutingMode(mode = "") {
  const value = String(mode || "").trim();
  if (!value) return MIA_DECISION_ROUTING_MODES.UNKNOWN;
  const known = Object.values(MIA_DECISION_ROUTING_MODES);
  if (known.includes(value)) return value;
  return value.slice(0, 64);
}

export function resolveDecisionRuntimeMode() {
  if (isCommercialRuntimeControlled()) return MIA_DECISION_RUNTIME_MODES.CONTROLLED;
  if (isCommercialRuntimeShadow()) return MIA_DECISION_RUNTIME_MODES.SHADOW;
  return MIA_DECISION_RUNTIME_MODES.LEGACY;
}

/**
 * @param {Array<Record<string, unknown>>} rankedProducts
 * @param {Record<string, unknown>|null} winner
 */
export function resolveWinnerAndRunnerUpRanks(rankedProducts = [], winner = null) {
  if (!winner || !Array.isArray(rankedProducts) || rankedProducts.length === 0) {
    return {
      winnerRank: null,
      runnerUpPresent: false,
      runnerUpRank: null,
      runnerUpProduct: null,
    };
  }

  let winnerRank = null;
  for (let index = 0; index < rankedProducts.length; index += 1) {
    if (decisionProductsMatchFamily(rankedProducts[index], winner)) {
      winnerRank = index + 1;
      break;
    }
  }
  if (winnerRank == null && rankedProducts.length > 0) {
    winnerRank = 1;
  }

  const winnerFamily = resolveSafeProductFamilyKey(winner);
  for (let index = 0; index < rankedProducts.length; index += 1) {
    const candidate = rankedProducts[index];
    if (!candidate) continue;
    if (decisionProductsMatchFamily(candidate, winner)) continue;
    const candidateFamily = resolveSafeProductFamilyKey(candidate);
    if (winnerFamily && candidateFamily && winnerFamily === candidateFamily) continue;
    return {
      winnerRank,
      runnerUpPresent: true,
      runnerUpRank: index + 1,
      runnerUpProduct: candidate,
    };
  }

  return {
    winnerRank,
    runnerUpPresent: false,
    runnerUpRank: null,
    runnerUpProduct: null,
  };
}

/**
 * @param {object} input
 */
export function buildRecommendationDecisionMetadata(input = {}) {
  const winner = input.selectedBestProduct || null;
  const rankedProducts = Array.isArray(input.rankedProducts) ? input.rankedProducts : [];
  const displayProducts = Array.isArray(input.displayProducts) ? input.displayProducts : [];
  const routingDecision = input.routingDecision || {};
  const specificProductLock = input.specificProductLock || {};
  const commercialOfferReset = input.commercialOfferReset || {};

  const rankInfo = resolveWinnerAndRunnerUpRanks(rankedProducts, winner);
  const winnerScore = extractObservedScore(winner);
  const runnerUpScore = extractObservedScore(rankInfo.runnerUpProduct);
  const winnerFamily = resolveSafeProductFamilyKey(winner);

  const winnerPresent = !!winner && typeof winner === "object";
  const winnerSanitized = !!input.winnerSanitizedAway;
  const resetApplied = !!commercialOfferReset.shouldReset;
  const specificLockActive = !!specificProductLock.active;

  const allowReplace =
    routingDecision.allowReplaceWinner ?? routingDecision.allowNewSearch ?? false;
  const anchorPreserved =
    !!input.anchorPreserved ||
    (!allowReplace && !!input.hadAnchor && winnerPresent);

  return {
    routing_mode: normalizeDecisionRoutingMode(routingDecision.mode),
    decision_source: input.decisionSource || MIA_DECISION_SOURCES.UNKNOWN,
    runtime_mode: input.runtimeMode || resolveDecisionRuntimeMode(),
    winner_present: winnerPresent,
    winner_rank: winnerPresent ? rankInfo.winnerRank : null,
    winner_product_family: winnerPresent ? hashSafeFamilyKey(winnerFamily) : null,
    winner_provider: winnerPresent ? extractDecisionProviderId(winner) : null,
    winner_category: winnerPresent ? (input.winnerCategory ?? null) : null,
    runner_up_present: rankInfo.runnerUpPresent,
    runner_up_rank: rankInfo.runnerUpRank,
    candidate_count: rankedProducts.length > 0 ? rankedProducts.length : null,
    display_count: displayProducts.length > 0 ? displayProducts.length : null,
    winner_score: winnerScore,
    runner_up_score: rankInfo.runnerUpPresent ? runnerUpScore : null,
    score_gap: rankInfo.runnerUpPresent ? computeScoreGap(winnerScore, runnerUpScore) : null,
    budget_constraint: !!input.budgetConstraintApplied,
    category_constraint: !!input.categoryConstraintApplied,
    brand_constraint: !!input.brandConstraintApplied,
    specific_product_lock: specificLockActive,
    anchor_preserved: anchorPreserved,
    rerank_allowed: routingDecision.allowRerank === true,
    new_search: routingDecision.allowNewSearch === true || resetApplied,
    reset_applied: resetApplied,
    decision_completed: input.decisionCompleted !== false,
    winner_sanitized: winnerSanitized,
    decision_valid: winnerPresent && !winnerSanitized,
    response_ready: winnerPresent,
    response_path: input.responsePath ?? null,
    source: "server",
  };
}
