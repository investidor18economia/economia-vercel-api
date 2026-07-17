/**
 * PATCH 11A.9 — Post-seal mutation audit inventory
 *
 * Static audit of handler patterns that may mutate payload after seal.
 * Used by regression tests; does not alter runtime behavior.
 */

export const POST_SEAL_MUTATION_AUDIT_VERSION = "11A.9.1";

export const AUTHORIZED_DEBUG_INJECTION_STRATEGY =
  "debug_injected_before_seal_or_outside_functional_payload";

/**
 * Known post-finalization zones in chat-gpt4o.js.
 * Each entry documents whether mutation is allowed and why.
 */
export const POST_FINALIZATION_MUTATION_INVENTORY = Object.freeze([
  {
    local: "sendHttpRuntimeResponse",
    moment: "pre_seal",
    mutation: "runtimeEnforcementToTrace merged into mia_debug before seal",
    permitted: true,
    reason: "debug injected before fingerprint/seal",
    action: "none",
  },
  {
    local: "sendHttpRuntimeResponse",
    moment: "post_seal_pre_send",
    mutation: "detectPostSealMutation comparison",
    permitted: true,
    reason: "validation only; blocked payload preserved from sealed snapshot",
    action: "none",
  },
  {
    local: "sendHttpRuntimeResponse",
    moment: "post_seal",
    mutation: "functional payload field assignment",
    permitted: false,
    reason: "must use sealed snapshot",
    action: "blocked_by_sealed_snapshot",
  },
]);

export function auditHandlerPostSealPatterns(source = "") {
  const violations = [];
  const sendHttpIdx = source.indexOf("function sendHttpRuntimeResponse");
  const afterSendHttp =
    sendHttpIdx >= 0 ? source.slice(sendHttpIdx) : source;

  const riskyPatterns = [
    { pattern: /sealRuntimePayload[\s\S]{0,800}?body\.prices\s*=/, label: "prices_mutation_after_seal" },
    { pattern: /sealRuntimePayload[\s\S]{0,800}?body\.winner\s*=/, label: "winner_mutation_after_seal" },
    { pattern: /sealRuntimePayload[\s\S]{0,800}?body\.reply\s*=/, label: "reply_mutation_after_seal" },
    { pattern: /detectPostSealMutation[\s\S]{0,400}?Object\.assign\(body/, label: "object_assign_after_seal_check" },
  ];

  for (const { pattern, label } of riskyPatterns) {
    if (pattern.test(afterSendHttp)) {
      violations.push(label);
    }
  }

  return {
    version: POST_SEAL_MUTATION_AUDIT_VERSION,
    postSealMutationAuditComplete: violations.length === 0,
    postSealFunctionalMutationCount: violations.length,
    violations,
    inventory: POST_FINALIZATION_MUTATION_INVENTORY,
    debugInjectionAuthorizedBeforeSeal: source.includes("sealRuntimePayload") &&
      source.includes("runtimeEnforcementToTrace"),
  };
}
