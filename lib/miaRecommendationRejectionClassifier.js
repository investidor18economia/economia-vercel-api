/**
 * PATCH 9.3 — Rejection / refinement / substitution classification (observational).
 */

import { COMMERCIAL_FOLLOW_UP_TYPES } from "./miaCommercialFollowUpContinuity.js";
import { REFINEMENT_TYPES } from "./miaCommercialConstraintRefinement.js";
import {
  MIA_REJECTION_EVIDENCE_STRENGTHS,
  MIA_REJECTION_SIGNAL_CLASSES,
  MIA_REJECTION_SIGNAL_OUTCOMES,
  MIA_REJECTION_SIGNAL_REASONS,
  MIA_REJECTION_SIGNAL_SOURCES,
  MIA_REJECTION_SIGNAL_TARGETS,
  MIA_REJECTION_SIGNAL_TYPES,
} from "./miaRecommendationRejectionCatalog.js";

const EXPLICIT_ABANDONMENT_PATTERN =
  /\b(nao quero comprar|n[aã]o quero comprar|desisto|desistir|vou deixar pra depois|deixa pra la|deixa pra l[aá]|nao vou comprar|n[aã]o vou comprar)\b/;

const EXPLICIT_REJECTION_PATTERN =
  /\b(nao gostei|n[aã]o gostei|nao quero esse|n[aã]o quero esse|esse nao serve|esse n[aã]o serve|nao compraria|n[aã]o compraria)\b/;

/**
 * @param {string[]|undefined} reasons
 */
function reasonsIndicatePriceObjection(reasons = []) {
  const blob = reasons.join(" ").toLowerCase();
  return (
    blob.includes("objection") &&
    (blob.includes("price") ||
      blob.includes("caro") ||
      blob.includes("budget") ||
      blob.includes("orcamento"))
  );
}

/**
 * @param {string} refinementType
 */
function mapRefinementTypeToRejectionSignal(refinementType = "") {
  switch (refinementType) {
    case REFINEMENT_TYPES.BUDGET_REFINEMENT:
    case REFINEMENT_TYPES.PRICE_REFINEMENT:
      return {
        signal_type: MIA_REJECTION_SIGNAL_TYPES.BUDGET_REFINEMENT,
        signal_class: MIA_REJECTION_SIGNAL_CLASSES.REFINEMENT,
        signal_reason: MIA_REJECTION_SIGNAL_REASONS.PRICE,
        evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.STRONG,
        rejection_explicit: false,
        refinement_present: true,
      };
    case REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT:
      return {
        signal_type: MIA_REJECTION_SIGNAL_TYPES.BRAND_REFINEMENT,
        signal_class: MIA_REJECTION_SIGNAL_CLASSES.REFINEMENT,
        signal_reason: MIA_REJECTION_SIGNAL_REASONS.BRAND,
        evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.STRONG,
        rejection_explicit: false,
        refinement_present: true,
      };
    case REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT:
      return {
        signal_type: MIA_REJECTION_SIGNAL_TYPES.BRAND_REFINEMENT,
        signal_class: MIA_REJECTION_SIGNAL_CLASSES.REFINEMENT,
        signal_reason: MIA_REJECTION_SIGNAL_REASONS.BRAND,
        evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
        rejection_explicit: false,
        refinement_present: true,
      };
    case REFINEMENT_TYPES.ATTRIBUTE_REFINEMENT:
    case REFINEMENT_TYPES.SPECIFICATION_REFINEMENT:
      return {
        signal_type: MIA_REJECTION_SIGNAL_TYPES.FEATURE_REFINEMENT,
        signal_class: MIA_REJECTION_SIGNAL_CLASSES.REFINEMENT,
        signal_reason: MIA_REJECTION_SIGNAL_REASONS.FEATURE,
        evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.STRONG,
        rejection_explicit: false,
        refinement_present: true,
      };
    case REFINEMENT_TYPES.SIZE_REFINEMENT:
      return {
        signal_type: MIA_REJECTION_SIGNAL_TYPES.CONSTRAINT_REFINEMENT,
        signal_class: MIA_REJECTION_SIGNAL_CLASSES.REFINEMENT,
        signal_reason: MIA_REJECTION_SIGNAL_REASONS.SIZE,
        evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
        rejection_explicit: false,
        refinement_present: true,
      };
    default:
      return {
        signal_type: MIA_REJECTION_SIGNAL_TYPES.CONSTRAINT_REFINEMENT,
        signal_class: MIA_REJECTION_SIGNAL_CLASSES.REFINEMENT,
        signal_reason: MIA_REJECTION_SIGNAL_REASONS.OTHER_OBSERVED,
        evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
        rejection_explicit: false,
        refinement_present: true,
      };
  }
}

/**
 * @param {string} followUpType
 * @param {object} [input]
 */
export function classifyRejectionFromFollowUp(followUpType = "", input = {}) {
  switch (followUpType) {
    case COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT:
      if (input.constraintRefinement?.detected) {
        const mapped = mapRefinementTypeToRejectionSignal(
          input.constraintRefinement.refinementType
        );
        return {
          ...mapped,
          signal_source: MIA_REJECTION_SIGNAL_SOURCES.SERVER_CONVERSATION,
          signal_target: MIA_REJECTION_SIGNAL_TARGETS.WINNER,
          signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.FLOW_CONTINUED,
          winner_rejected: false,
          alternative_requested: false,
        };
      }
      return null;

    case COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP:
      return {
        signal_type: MIA_REJECTION_SIGNAL_TYPES.ALTERNATIVE_REQUESTED,
        signal_class: MIA_REJECTION_SIGNAL_CLASSES.INCONCLUSIVE,
        signal_reason: MIA_REJECTION_SIGNAL_REASONS.NOT_APPLICABLE,
        evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
        signal_source: MIA_REJECTION_SIGNAL_SOURCES.SERVER_CONVERSATION,
        signal_target: MIA_REJECTION_SIGNAL_TARGETS.RUNNER_UP,
        signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.FLOW_CONTINUED,
        rejection_explicit: false,
        refinement_present: false,
        winner_rejected: false,
        alternative_requested: true,
      };

    case COMMERCIAL_FOLLOW_UP_TYPES.ALTERNATIVE_FOLLOW_UP:
      return {
        signal_type: MIA_REJECTION_SIGNAL_TYPES.ALTERNATIVE_REQUESTED,
        signal_class: MIA_REJECTION_SIGNAL_CLASSES.INCONCLUSIVE,
        signal_reason: MIA_REJECTION_SIGNAL_REASONS.NOT_APPLICABLE,
        evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
        signal_source: MIA_REJECTION_SIGNAL_SOURCES.SERVER_CONVERSATION,
        signal_target: MIA_REJECTION_SIGNAL_TARGETS.ALTERNATIVE,
        signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.FLOW_CONTINUED,
        rejection_explicit: false,
        alternative_requested: true,
        winner_rejected: false,
      };

    case COMMERCIAL_FOLLOW_UP_TYPES.TOPIC_SWITCH:
      return {
        signal_type: MIA_REJECTION_SIGNAL_TYPES.COMMERCIAL_FLOW_EXITED,
        signal_class: MIA_REJECTION_SIGNAL_CLASSES.POSTPONEMENT,
        signal_reason: MIA_REJECTION_SIGNAL_REASONS.NOT_APPLICABLE,
        evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
        signal_source: MIA_REJECTION_SIGNAL_SOURCES.SERVER_CONVERSATION,
        signal_target: MIA_REJECTION_SIGNAL_TARGETS.COMMERCIAL_FLOW,
        signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.FLOW_EXITED,
        rejection_explicit: false,
        abandonment_observed: false,
        flow_continued: false,
      };

    default:
      return null;
  }
}

/**
 * @param {object} [input]
 */
export function classifyRejectionFromCognitiveTurn(input = {}) {
  const turnType = input.turnType || "";
  const reasons = Array.isArray(input.reasons) ? input.reasons : [];
  const normalizedQuery = String(input.normalizedQuery || "").trim();

  if (EXPLICIT_ABANDONMENT_PATTERN.test(normalizedQuery)) {
    return {
      signal_type: MIA_REJECTION_SIGNAL_TYPES.PURCHASE_ABANDONED_EXPLICITLY,
      signal_class: MIA_REJECTION_SIGNAL_CLASSES.ABANDONMENT,
      signal_reason: MIA_REJECTION_SIGNAL_REASONS.NOT_APPLICABLE,
      evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.EXPLICIT,
      signal_source: MIA_REJECTION_SIGNAL_SOURCES.SERVER_CONVERSATION,
      signal_target: MIA_REJECTION_SIGNAL_TARGETS.COMMERCIAL_FLOW,
      signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.ABANDONMENT_OBSERVED,
      rejection_explicit: true,
      abandonment_observed: true,
      abandonment_explicit: true,
      purchase_postponed: false,
      winner_rejected: true,
    };
  }

  if (turnType === "OBJECTION" || EXPLICIT_REJECTION_PATTERN.test(normalizedQuery)) {
    const priceObjection =
      reasonsIndicatePriceObjection(reasons) ||
      /\b(caro|cara|caro demais|pesou|orcamento|orçamento)\b/.test(normalizedQuery);

    return {
      signal_type: priceObjection
        ? MIA_REJECTION_SIGNAL_TYPES.PRICE_REJECTION
        : MIA_REJECTION_SIGNAL_TYPES.EXPLICIT_REJECTION,
      signal_class: MIA_REJECTION_SIGNAL_CLASSES.REJECTION,
      signal_reason: priceObjection
        ? MIA_REJECTION_SIGNAL_REASONS.PRICE
        : MIA_REJECTION_SIGNAL_REASONS.OTHER_OBSERVED,
      evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.EXPLICIT,
      signal_source: MIA_REJECTION_SIGNAL_SOURCES.SERVER_CONVERSATION,
      signal_target: MIA_REJECTION_SIGNAL_TARGETS.WINNER,
      signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.FLOW_CONTINUED,
      rejection_explicit: true,
      winner_rejected: true,
      refinement_present: false,
    };
  }

  if (turnType === "ALTERNATIVE_REQUEST") {
    return {
      signal_type: MIA_REJECTION_SIGNAL_TYPES.ALTERNATIVE_REQUESTED,
      signal_class: MIA_REJECTION_SIGNAL_CLASSES.INCONCLUSIVE,
      signal_reason: MIA_REJECTION_SIGNAL_REASONS.NOT_APPLICABLE,
      evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
      signal_source: MIA_REJECTION_SIGNAL_SOURCES.SERVER_CONVERSATION,
      signal_target: MIA_REJECTION_SIGNAL_TARGETS.ALTERNATIVE,
      signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.FLOW_CONTINUED,
      rejection_explicit: false,
      alternative_requested: true,
      winner_rejected: false,
    };
  }

  if (turnType === "PRIORITY_SHIFT") {
    return {
      signal_type: MIA_REJECTION_SIGNAL_TYPES.FEATURE_REFINEMENT,
      signal_class: MIA_REJECTION_SIGNAL_CLASSES.REFINEMENT,
      signal_reason: MIA_REJECTION_SIGNAL_REASONS.FEATURE,
      evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
      signal_source: MIA_REJECTION_SIGNAL_SOURCES.SERVER_CONVERSATION,
      signal_target: MIA_REJECTION_SIGNAL_TARGETS.WINNER,
      signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.FLOW_CONTINUED,
      rejection_explicit: false,
      refinement_present: true,
      winner_rejected: false,
    };
  }

  return null;
}

/**
 * @param {object} [input]
 */
export function classifyRejectionFromNewSearch(input = {}) {
  if (!input.allowNewSearch || !input.priorDecisionRequestId) return null;

  return {
    signal_type: MIA_REJECTION_SIGNAL_TYPES.NEW_SEARCH_STARTED,
    signal_class: MIA_REJECTION_SIGNAL_CLASSES.SUBSTITUTION,
    signal_reason: MIA_REJECTION_SIGNAL_REASONS.NOT_APPLICABLE,
    evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.STRONG,
    signal_source: MIA_REJECTION_SIGNAL_SOURCES.SERVER_CONVERSATION,
    signal_target: MIA_REJECTION_SIGNAL_TARGETS.DECISION_GENERIC,
    signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.NEW_DECISION_CREATED,
    rejection_explicit: false,
    refinement_present: !!input.refinementPresent,
    winner_replaced: false,
    new_decision_created: true,
    flow_continued: true,
  };
}

/**
 * @param {object} [input]
 */
export function classifyRejectionFromDecisionTransition(input = {}) {
  if (!input.previousDecisionRequestId || !input.replacementDecisionRequestId) return null;
  if (input.previousDecisionRequestId === input.replacementDecisionRequestId) return null;

  return {
    signal_type: MIA_REJECTION_SIGNAL_TYPES.WINNER_REPLACED,
    signal_class: MIA_REJECTION_SIGNAL_CLASSES.SUBSTITUTION,
    signal_reason: MIA_REJECTION_SIGNAL_REASONS.NOT_APPLICABLE,
    evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.STRONG,
    signal_source: MIA_REJECTION_SIGNAL_SOURCES.DECISION_TRANSITION,
    signal_target: MIA_REJECTION_SIGNAL_TARGETS.WINNER,
    signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.WINNER_REPLACED,
    rejection_explicit: false,
    winner_replaced: true,
    new_decision_created: true,
    previous_decision_request_id: input.previousDecisionRequestId,
    replacement_decision_request_id: input.replacementDecisionRequestId,
  };
}

/**
 * @param {object} [input]
 */
export function classifyRejectionFromSocialExit(input = {}) {
  if (!input.farewell || !input.priorDecisionRequestId) return null;

  return {
    signal_type: MIA_REJECTION_SIGNAL_TYPES.PURCHASE_POSTPONED,
    signal_class: MIA_REJECTION_SIGNAL_CLASSES.POSTPONEMENT,
    signal_reason: MIA_REJECTION_SIGNAL_REASONS.NOT_APPLICABLE,
    evidence_strength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
    signal_source: MIA_REJECTION_SIGNAL_SOURCES.SESSION_LIFECYCLE,
    signal_target: MIA_REJECTION_SIGNAL_TARGETS.COMMERCIAL_FLOW,
    signal_outcome: MIA_REJECTION_SIGNAL_OUTCOMES.PURCHASE_POSTPONED,
    rejection_explicit: false,
    abandonment_observed: false,
    purchase_postponed: true,
    flow_continued: false,
  };
}

/**
 * @param {object} input
 */
export function finalizeRejectionSignalObservation(input = {}) {
  const base = input.classified || {};
  return {
    ...base,
    signal_observed: true,
    signal_valid:
      !!input.decisionRequestId &&
      base.evidence_strength !== MIA_REJECTION_EVIDENCE_STRENGTHS.INCONCLUSIVE &&
      base.signal_class !== MIA_REJECTION_SIGNAL_CLASSES.INCONCLUSIVE,
    flow_continued: base.flow_continued ?? null,
    recovered_after_rejection: false,
  };
}
