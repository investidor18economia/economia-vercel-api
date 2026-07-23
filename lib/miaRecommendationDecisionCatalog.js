/**
 * PATCH 9.1 — Recommendation Decision Analytics taxonomies
 */

export const MIA_RECOMMENDATION_DECISION_CATALOG_VERSION = "9.1.0";

export const MIA_DECISION_SOURCES = Object.freeze({
  COGNITIVE_PRIMARY: "COGNITIVE_PRIMARY",
  COMMERCIAL_ONLY_FALLBACK: "COMMERCIAL_ONLY_FALLBACK",
  LEGACY_LLM: "LEGACY_LLM",
  NO_RESULT: "NO_RESULT",
  UNKNOWN: "UNKNOWN",
});

export const MIA_DECISION_ROUTING_MODES = Object.freeze({
  CONTEXT_HOLD: "context_hold",
  CONVERSATIONAL: "conversational",
  EXPLICIT_RECOMMENDATION_CHANGE: "explicit_recommendation_change",
  FINAL_DECISION_SCOPE_HOLD: "final_decision_scope_hold",
  POST_CHANGE_RECOVERY_HOLD: "post_change_recovery_hold",
  CONTRADICTION_RECOVERY_HOLD: "contradiction_recovery_hold",
  USER_CONFUSION_RECOVERY_HOLD: "user_confusion_recovery_hold",
  UNKNOWN: "UNKNOWN",
});

/** Reuse runtime mode vocabulary from Phase 8 */
export const MIA_DECISION_RUNTIME_MODES = Object.freeze({
  LEGACY: "LEGACY",
  CONTROLLED: "CONTROLLED",
  SHADOW: "SHADOW",
  UNKNOWN: "UNKNOWN",
});
