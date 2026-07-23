/**
 * PATCH 10.4 — Derive anti-regret foundation metadata from observational evidence only.
 *
 * Formula (documented in ANTI_REGRET_FOUNDATION_ANALYTICS.md):
 * - Base score: 50 (neutral observational baseline)
 * - Adjustments from objective same-turn and correlated signals
 * - Clamped to [0, 100]
 * - Does NOT infer emotions, satisfaction, purchase, or confirmed regret
 */

import {
  MIA_ANTI_REGRET_CONFIDENCE,
  MIA_ANTI_REGRET_OBSERVED_PATTERN,
  MIA_ANTI_REGRET_SCORE_MAX,
  MIA_ANTI_REGRET_SCORE_MIN,
  MIA_ANTI_REGRET_SCORE_NEUTRAL_BASE,
  MIA_ANTI_REGRET_SIGNAL_POLARITY,
  MIA_ANTI_REGRET_SIGNAL_SOURCE,
} from "./miaAntiRegretFoundationCatalog.js";
import { MIA_SCORE_GAP_BUCKETS } from "./miaRecommendationAlternativeCatalog.js";
import {
  MIA_PRICE_CONFIDENCE,
  MIA_PRICE_QUALITY,
} from "./miaPriceIntelligenceCatalog.js";
import { MIA_SAVINGS_TYPE } from "./miaSavingsEstimationCatalog.js";
import { buildPriceIntelligenceFromOfferSetMetadata } from "./miaPriceIntelligenceClassifier.js";
import { buildWinnerVsMinimumEstimation } from "./miaSavingsEstimationClassifier.js";

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function clampScore(value) {
  if (value == null || !Number.isFinite(value)) return MIA_ANTI_REGRET_SCORE_NEUTRAL_BASE;
  return Math.max(MIA_ANTI_REGRET_SCORE_MIN, Math.min(MIA_ANTI_REGRET_SCORE_MAX, Math.round(value)));
}

/**
 * @typedef {{
 *   source: string,
 *   polarity: string,
 *   weight?: number,
 *   reason?: string|null,
 * }} AntiRegretObservedSignal
 */

/**
 * @param {Record<string, unknown>} decision
 * @param {Record<string, unknown>} offerSet
 * @param {Record<string, unknown>} priceIntel
 * @param {Record<string, unknown>} savings
 * @param {AntiRegretObservedSignal[]} [extraSignals]
 */
export function collectObservationalSignals(
  decision = {},
  offerSet = {},
  priceIntel = {},
  savings = {},
  extraSignals = []
) {
  /** @type {AntiRegretObservedSignal[]} */
  const signals = [];

  if (bool(offerSet.winner_is_lowest_price) === true) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.PRICE_INTELLIGENCE,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL,
      weight: 12,
      reason: "winner_is_lowest_price",
    });
  } else if (bool(offerSet.winner_present) === true) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.PRICE_INTELLIGENCE,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.UNCERTAIN_SIGNAL,
      weight: 4,
      reason: "winner_not_lowest",
    });
  }

  const priceQuality = priceIntel.price_quality ?? null;
  const priceConfidence = priceIntel.price_confidence ?? null;

  if (priceQuality === MIA_PRICE_QUALITY.HIGH && priceConfidence === MIA_PRICE_CONFIDENCE.HIGH) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.PRICE_INTELLIGENCE,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL,
      weight: 10,
      reason: "high_price_evidence",
    });
  } else if (
    priceQuality === MIA_PRICE_QUALITY.LOW ||
    priceConfidence === MIA_PRICE_CONFIDENCE.LOW
  ) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.PRICE_INTELLIGENCE,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.NEGATIVE_SIGNAL,
      weight: 8,
      reason: "low_price_evidence",
    });
  } else if (
    (priceQuality === MIA_PRICE_QUALITY.MEDIUM || priceQuality === MIA_PRICE_QUALITY.HIGH) &&
    (priceConfidence === MIA_PRICE_CONFIDENCE.MEDIUM || priceConfidence === MIA_PRICE_CONFIDENCE.HIGH)
  ) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.PRICE_INTELLIGENCE,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.NEUTRAL_SIGNAL,
      weight: 2,
      reason: "partial_price_evidence",
    });
  }

  const savingsType = savings.savings_type ?? null;
  if (savingsType === MIA_SAVINGS_TYPE.OBSERVED && num(savings.savings_amount) > 0) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.SAVINGS_ESTIMATION,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL,
      weight: 8,
      reason: "observed_savings_signal",
    });
  } else if (savingsType === MIA_SAVINGS_TYPE.UNVERIFIED) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.SAVINGS_ESTIMATION,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.UNCERTAIN_SIGNAL,
      weight: 5,
      reason: "unverified_savings_only",
    });
  }

  if (bool(decision.runner_up_present) === true) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.SECOND_BEST,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.NEUTRAL_SIGNAL,
      weight: 3,
      reason: "runner_up_present",
    });
  }

  const gapBucket = decision.score_gap_bucket ?? null;
  if (gapBucket === MIA_SCORE_GAP_BUCKETS.WIDE || gapBucket === MIA_SCORE_GAP_BUCKETS.MODERATE) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.DECISION_CONTEXT,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL,
      weight: 6,
      reason: "clear_winner_gap",
    });
  } else if (
    gapBucket === MIA_SCORE_GAP_BUCKETS.VERY_CLOSE ||
    gapBucket === MIA_SCORE_GAP_BUCKETS.CLOSE ||
    gapBucket === MIA_SCORE_GAP_BUCKETS.TIE
  ) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.DECISION_CONTEXT,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.NEGATIVE_SIGNAL,
      weight: 10,
      reason: "close_runner_up_gap",
    });
  }

  if (bool(decision.anchor_preserved) === true) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.DECISION_CONTEXT,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL,
      weight: 5,
      reason: "anchor_preserved",
    });
  }

  if (bool(decision.new_search) === true || bool(decision.reset_applied) === true) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.DECISION_CONTEXT,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.NEGATIVE_SIGNAL,
      weight: 8,
      reason: "search_reset_or_new_search",
    });
  }

  let constraintCount = 0;
  if (bool(decision.budget_constraint) === true) constraintCount += 1;
  if (bool(decision.category_constraint) === true) constraintCount += 1;
  if (bool(decision.brand_constraint) === true) constraintCount += 1;
  if (constraintCount >= 2) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.CONSTRAINT_CHANGE,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.UNCERTAIN_SIGNAL,
      weight: 6,
      reason: "multiple_constraints_active",
    });
  } else if (constraintCount === 1) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.CONSTRAINT_CHANGE,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.NEUTRAL_SIGNAL,
      weight: 2,
      reason: "single_constraint_active",
    });
  }

  const deliveredCount = num(offerSet.delivered_offers_count) ?? 0;
  if (deliveredCount > 1) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.ALTERNATIVE_REQUEST,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.NEUTRAL_SIGNAL,
      weight: 3,
      reason: "multiple_offers_delivered",
    });
  }

  const candidateCount = num(decision.candidate_count) ?? num(offerSet.raw_offers_count) ?? 0;
  const conversationTurnCount = num(decision.conversation_turn_count) ?? null;
  if (conversationTurnCount != null && conversationTurnCount >= 6) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.MULTI_TURN,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.UNCERTAIN_SIGNAL,
      weight: 5,
      reason: "long_conversation",
    });
  }
  if (candidateCount >= 5) {
    signals.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.MULTI_TURN,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.UNCERTAIN_SIGNAL,
      weight: 4,
      reason: "broad_candidate_pool",
    });
  }

  for (const extra of extraSignals) {
    if (!extra?.source || !extra?.polarity) continue;
    signals.push({
      source: extra.source,
      polarity: extra.polarity,
      weight: num(extra.weight) ?? 5,
      reason: extra.reason ?? null,
    });
  }

  return signals;
}

/**
 * @param {AntiRegretObservedSignal[]} signals
 */
export function computeAntiRegretScoreFromSignals(signals = []) {
  let score = MIA_ANTI_REGRET_SCORE_NEUTRAL_BASE;
  for (const signal of signals) {
    const weight = num(signal.weight) ?? 0;
    if (weight <= 0) continue;
    if (signal.polarity === MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL) score += weight;
    else if (signal.polarity === MIA_ANTI_REGRET_SIGNAL_POLARITY.NEGATIVE_SIGNAL) score -= weight;
    else if (signal.polarity === MIA_ANTI_REGRET_SIGNAL_POLARITY.UNCERTAIN_SIGNAL) score -= weight * 0.35;
  }
  return clampScore(score);
}

/**
 * @param {AntiRegretObservedSignal[]} signals
 */
export function summarizeSignalCounts(signals = []) {
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  let uncertain = 0;
  for (const signal of signals) {
    if (signal.polarity === MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL) positive += 1;
    else if (signal.polarity === MIA_ANTI_REGRET_SIGNAL_POLARITY.NEGATIVE_SIGNAL) negative += 1;
    else if (signal.polarity === MIA_ANTI_REGRET_SIGNAL_POLARITY.UNCERTAIN_SIGNAL) uncertain += 1;
    else neutral += 1;
  }
  return {
    signal_count: signals.length,
    positive_signal_count: positive,
    negative_signal_count: negative,
    neutral_signal_count: neutral + uncertain,
    uncertain_signal_count: uncertain,
  };
}

/**
 * @param {AntiRegretObservedSignal[]} signals
 */
export function resolvePrimarySignalSource(signals = []) {
  if (!signals.length) return MIA_ANTI_REGRET_SIGNAL_SOURCE.UNKNOWN;
  const ranked = [...signals].sort((a, b) => (num(b.weight) ?? 0) - (num(a.weight) ?? 0));
  return ranked[0]?.source ?? MIA_ANTI_REGRET_SIGNAL_SOURCE.UNKNOWN;
}

/**
 * @param {Record<string, unknown>} decision
 * @param {AntiRegretObservedSignal[]} signals
 * @param {{ acceptanceCount?: number, rejectionCount?: number, alertStage?: string|null }} [postDecision]
 */
export function resolveObservedPattern(decision = {}, signals = [], postDecision = {}) {
  const rejectionCount = num(postDecision.rejectionCount) ?? 0;
  const acceptanceCount = num(postDecision.acceptanceCount) ?? 0;
  const alertStage = postDecision.alertStage ?? null;

  if (rejectionCount >= 2) return MIA_ANTI_REGRET_OBSERVED_PATTERN.MULTIPLE_REJECTIONS;
  if (alertStage) return MIA_ANTI_REGRET_OBSERVED_PATTERN.PRICE_WAITING;

  let constraintCount = 0;
  if (bool(decision.budget_constraint) === true) constraintCount += 1;
  if (bool(decision.category_constraint) === true) constraintCount += 1;
  if (bool(decision.brand_constraint) === true) constraintCount += 1;
  if (constraintCount >= 2) return MIA_ANTI_REGRET_OBSERVED_PATTERN.MULTIPLE_CONSTRAINT_CHANGES;

  const deliveredCount = num(decision.display_count) ?? 0;
  const hasComparison =
    bool(decision.runner_up_present) === true && deliveredCount > 1;
  if (hasComparison && acceptanceCount > 0) {
    return MIA_ANTI_REGRET_OBSERVED_PATTERN.COMPARISON_BEFORE_ACCEPTANCE;
  }
  if (acceptanceCount > 0 && rejectionCount === 0) {
    return MIA_ANTI_REGRET_OBSERVED_PATTERN.DIRECT_ACCEPTANCE;
  }
  if (
    (num(decision.conversation_turn_count) ?? 0) >= 6 ||
    (num(decision.candidate_count) ?? 0) >= 5
  ) {
    return MIA_ANTI_REGRET_OBSERVED_PATTERN.LONG_EXPLORATION;
  }
  if (hasComparison) return MIA_ANTI_REGRET_OBSERVED_PATTERN.COMPARISON_BEFORE_ACCEPTANCE;
  return MIA_ANTI_REGRET_OBSERVED_PATTERN.UNKNOWN;
}

/**
 * @param {Record<string, unknown>} decision
 * @param {AntiRegretObservedSignal[]} signals
 * @param {{ acceptanceCount?: number, rejectionCount?: number, alertAfterAcceptance?: boolean, runnerUpChosen?: boolean }} [postDecision]
 */
export function detectObjectiveConflicts(decision = {}, signals = [], postDecision = {}) {
  const conflicts = [];
  const positive = signals.filter(
    (s) => s.polarity === MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL
  ).length;
  const negative = signals.filter(
    (s) => s.polarity === MIA_ANTI_REGRET_SIGNAL_POLARITY.NEGATIVE_SIGNAL
  ).length;

  if (positive > 0 && negative > 0) conflicts.push("mixed_signal_polarity");
  if (bool(decision.new_search) === true && bool(decision.anchor_preserved) === true) {
    conflicts.push("new_search_with_anchor_preserved");
  }
  if ((num(postDecision.acceptanceCount) ?? 0) > 0 && (num(postDecision.rejectionCount) ?? 0) > 0) {
    conflicts.push("acceptance_and_rejection_same_decision");
  }
  if (postDecision.alertAfterAcceptance === true) conflicts.push("alert_after_acceptance_proxy");
  if (postDecision.runnerUpChosen === true) conflicts.push("runner_up_selected_over_winner");
  if (
    bool(decision.runner_up_present) === true &&
    (decision.score_gap_bucket === MIA_SCORE_GAP_BUCKETS.WIDE ||
      decision.score_gap_bucket === MIA_SCORE_GAP_BUCKETS.MODERATE) &&
    (num(postDecision.rejectionCount) ?? 0) > 0
  ) {
    conflicts.push("rejection_despite_clear_gap");
  }

  return {
    conflict_detected: conflicts.length > 0,
    conflict_count: conflicts.length,
    conflict_types: conflicts.slice(0, 6),
  };
}

/**
 * @param {AntiRegretObservedSignal[]} signals
 * @param {{ conflictCount?: number, conversationTurnCount?: number|null }} [context]
 */
export function resolveAntiRegretConfidence(signals = [], context = {}) {
  const counts = summarizeSignalCounts(signals);
  const uniqueSources = new Set(signals.map((s) => s.source)).size;
  const conflictCount = num(context.conflictCount) ?? 0;
  const turnCount = num(context.conversationTurnCount);

  if (counts.signal_count === 0) return MIA_ANTI_REGRET_CONFIDENCE.UNKNOWN;
  if (conflictCount >= 2) return MIA_ANTI_REGRET_CONFIDENCE.LOW;
  if (
    counts.signal_count >= 5 &&
    uniqueSources >= 3 &&
    counts.positive_signal_count + counts.negative_signal_count >= 3 &&
    conflictCount === 0
  ) {
    return MIA_ANTI_REGRET_CONFIDENCE.HIGH;
  }
  if (counts.signal_count >= 3 && uniqueSources >= 2 && conflictCount <= 1) {
    return MIA_ANTI_REGRET_CONFIDENCE.MEDIUM;
  }
  if (turnCount != null && turnCount >= 4 && counts.signal_count >= 2) {
    return MIA_ANTI_REGRET_CONFIDENCE.MEDIUM;
  }
  return MIA_ANTI_REGRET_CONFIDENCE.LOW;
}

/**
 * Map acceptance/rejection/post-decision facts into extra signals.
 * @param {{ acceptanceSignals?: object[], rejectionSignals?: object[], alertStage?: string|null }} input
 */
export function mapPostDecisionSignals(input = {}) {
  /** @type {AntiRegretObservedSignal[]} */
  const extra = [];
  const acceptance = Array.isArray(input.acceptanceSignals) ? input.acceptanceSignals : [];
  const rejection = Array.isArray(input.rejectionSignals) ? input.rejectionSignals : [];

  for (const row of acceptance) {
    const sourceEvent = String(row.source_event_name || row.signal_source || "").toLowerCase();
    let source = MIA_ANTI_REGRET_SIGNAL_SOURCE.ACCEPTANCE_SIGNAL;
    if (sourceEvent.includes("favorite")) source = MIA_ANTI_REGRET_SIGNAL_SOURCE.FAVORITE;
    else if (sourceEvent.includes("offer_click") || sourceEvent.includes("click")) {
      source = MIA_ANTI_REGRET_SIGNAL_SOURCE.OFFER_CLICK;
    } else if (sourceEvent.includes("price_alert")) source = MIA_ANTI_REGRET_SIGNAL_SOURCE.PRICE_ALERT;
    else if (sourceEvent.includes("follow")) source = MIA_ANTI_REGRET_SIGNAL_SOURCE.FOLLOW_UP;

    const strength = String(row.signal_strength || "").toUpperCase();
    const weight = strength === "STRONG" ? 10 : strength === "MEDIUM" ? 7 : 4;
    extra.push({
      source,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL,
      weight,
      reason: row.signal_type ? String(row.signal_type).slice(0, 64) : "acceptance_signal",
    });
  }

  for (const row of rejection) {
    extra.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.REJECTION_SIGNAL,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.NEGATIVE_SIGNAL,
      weight: 9,
      reason: row.signal_type ? String(row.signal_type).slice(0, 64) : "rejection_signal",
    });
  }

  if (input.alertStage) {
    extra.push({
      source: MIA_ANTI_REGRET_SIGNAL_SOURCE.PRICE_ALERT,
      polarity: MIA_ANTI_REGRET_SIGNAL_POLARITY.UNCERTAIN_SIGNAL,
      weight: 8,
      reason: String(input.alertStage).slice(0, 64),
    });
  }

  return extra;
}

/**
 * Build foundation metadata for one commercial decision.
 * @param {{
 *   requestId?: string|null,
 *   decisionRequestId?: string|null,
 *   offerSetMetadata?: Record<string, unknown>,
 *   decisionMetadata?: Record<string, unknown>|null,
 *   priceIntelligenceMetadata?: Record<string, unknown>|null,
 *   savingsMetadata?: Record<string, unknown>|null,
 *   acceptanceSignals?: object[],
 *   rejectionSignals?: object[],
 *   alertStage?: string|null,
 *   source?: string|null,
 * }} input
 */
export function buildAntiRegretFoundationMetadata(input = {}) {
  const requestId = input.requestId ?? null;
  const decisionRequestId = input.decisionRequestId ?? requestId ?? null;
  const offerSet = input.offerSetMetadata || {};
  const decision = input.decisionMetadata || {};
  const priceIntel =
    input.priceIntelligenceMetadata ||
    buildPriceIntelligenceFromOfferSetMetadata(offerSet, {
      requestId,
      decisionRequestId,
    });
  const savings =
    input.savingsMetadata ||
    buildWinnerVsMinimumEstimation(offerSet, priceIntel, { requestId, decisionRequestId });

  const postDecisionExtra = mapPostDecisionSignals({
    acceptanceSignals: input.acceptanceSignals,
    rejectionSignals: input.rejectionSignals,
    alertStage: input.alertStage ?? null,
  });
  const signals = collectObservationalSignals(
    decision,
    offerSet,
    priceIntel,
    savings,
    postDecisionExtra
  );
  const counts = summarizeSignalCounts(signals);
  const acceptanceCount = Array.isArray(input.acceptanceSignals)
    ? input.acceptanceSignals.length
    : 0;
  const rejectionCount = Array.isArray(input.rejectionSignals)
    ? input.rejectionSignals.length
    : 0;
  const conflicts = detectObjectiveConflicts(decision, signals, {
    acceptanceCount,
    rejectionCount,
    alertAfterAcceptance: acceptanceCount > 0 && !!input.alertStage,
    runnerUpChosen: acceptanceCount > 0 &&
      (input.acceptanceSignals || []).some((row) =>
        String(row.signal_target || "").includes("RUNNER_UP")
      ),
  });

  const antiRegretScore = computeAntiRegretScoreFromSignals(signals);
  const antiRegretConfidence = resolveAntiRegretConfidence(signals, {
    conflictCount: conflicts.conflict_count,
    conversationTurnCount: num(decision.conversation_turn_count),
  });

  return {
    request_id: requestId,
    decision_request_id: decisionRequestId,
    event_version: "10.4.0",
    source: input.source || "offer_set_derived",
    source_event_version: "8.3.0",
    offer_set_event_version: "8.3.0",
    decision_event_version: "9.1.0",
    price_intelligence_event_version: "10.1.0",
    savings_estimation_event_version: "10.2.0",
    anti_regret_score: antiRegretScore,
    anti_regret_confidence: antiRegretConfidence,
    ...counts,
    observed_pattern: resolveObservedPattern(decision, signals, {
      acceptanceCount,
      rejectionCount,
      alertStage: input.alertStage ?? null,
    }),
    primary_signal_source: resolvePrimarySignalSource(signals),
    conflict_detected: conflicts.conflict_detected,
    conflict_count: conflicts.conflict_count,
    price_quality: priceIntel.price_quality ?? null,
    price_confidence: priceIntel.price_confidence ?? null,
    savings_type: savings.savings_type ?? null,
    alert_stage: input.alertStage ?? null,
    search_path: offerSet.search_path ?? null,
    winner_provider_id: offerSet.winner_provider_id ?? null,
    runner_up_present: bool(decision.runner_up_present) === true,
    score_gap_bucket: decision.score_gap_bucket ?? null,
    runner_up_competitiveness: decision.runner_up_competitiveness ?? null,
    purchase_confirmed: false,
    regret_confirmed: false,
    satisfaction_assumed: false,
    foundation_valid:
      !!requestId &&
      (bool(offerSet.winner_present) === true || counts.signal_count > 0),
    occurred_at: new Date().toISOString(),
  };
}
