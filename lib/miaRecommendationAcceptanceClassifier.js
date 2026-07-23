/**
 * PATCH 9.2 — Acceptance signal classification (deterministic, observational)
 */

import { COMMERCIAL_FOLLOW_UP_TYPES } from "./miaCommercialFollowUpContinuity.js";
import {
  MIA_ACCEPTANCE_SIGNAL_SOURCES,
  MIA_ACCEPTANCE_SIGNAL_STRENGTHS,
  MIA_ACCEPTANCE_SIGNAL_TARGETS,
  MIA_ACCEPTANCE_SIGNAL_TYPES,
} from "./miaRecommendationAcceptanceCatalog.js";
import { hashSafeFamilyKey, resolveSafeProductFamilyKey } from "./miaRecommendationDecisionIdentity.js";
import { buildOfferFingerprint, extractOfferProviderId } from "./miaOfferIdentity.js";

const CLIENT_EVENT_MAP = Object.freeze({
  mia_recommendation_shown: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.RECOMMENDATION_RENDERED,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.WEAK,
    signal_source: MIA_ACCEPTANCE_SIGNAL_SOURCES.FRONTEND_RENDER,
    default_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER,
  },
  offer_click: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.WINNER_OFFER_CLICKED,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.WEAK,
    signal_source: MIA_ACCEPTANCE_SIGNAL_SOURCES.CLIENT_INTERACTION,
    default_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.OFFER_ONLY,
  },
  favorite_created: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.PRODUCT_FAVORITED,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.STRONG,
    signal_source: MIA_ACCEPTANCE_SIGNAL_SOURCES.CLIENT_INTERACTION,
    default_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.OFFER_ONLY,
  },
  price_alert_created: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.PRICE_ALERT_CREATED,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.STRONG,
    signal_source: MIA_ACCEPTANCE_SIGNAL_SOURCES.CLIENT_INTERACTION,
    default_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.OFFER_ONLY,
  },
});

const FOLLOW_UP_SIGNAL_MAP = Object.freeze({
  [COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP]: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.PRICE_REQUESTED,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.MEDIUM,
    signal_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER,
  },
  [COMMERCIAL_FOLLOW_UP_TYPES.AVAILABILITY_FOLLOW_UP]: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.STORE_REQUESTED,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.MEDIUM,
    signal_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER,
  },
  [COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP]: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.PRODUCT_DETAIL_REQUESTED,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.MEDIUM,
    signal_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER,
  },
  [COMMERCIAL_FOLLOW_UP_TYPES.JUSTIFICATION_FOLLOW_UP]: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.WINNER_FOLLOW_UP,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.MEDIUM,
    signal_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER,
  },
  [COMMERCIAL_FOLLOW_UP_TYPES.COMPARISON_FOLLOW_UP]: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.COMPARISON_REQUESTED,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.MEDIUM,
    signal_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.DECISION_GENERIC,
  },
  [COMMERCIAL_FOLLOW_UP_TYPES.CONFIRMATION_FOLLOW_UP]: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.WINNER_FOLLOW_UP,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.STRONG,
    signal_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER,
    acceptance_proxy: true,
  },
  [COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE]: {
    signal_type: MIA_ACCEPTANCE_SIGNAL_TYPES.RECOMMENDATION_REVISITED,
    signal_strength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.MEDIUM,
    signal_target: MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER,
  },
});

/** Follow-ups excluded from acceptance domain (PATCH 9.3 / non-interest) */
const FOLLOW_UP_EXCLUDED = new Set([
  COMMERCIAL_FOLLOW_UP_TYPES.NONE,
  COMMERCIAL_FOLLOW_UP_TYPES.TOPIC_SWITCH,
  COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT,
  COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP,
  COMMERCIAL_FOLLOW_UP_TYPES.ALTERNATIVE_FOLLOW_UP,
]);

/**
 * @param {string} clientEventName
 * @param {object} [row]
 * @param {object} [decisionContext]
 */
export function classifyAcceptanceSignalFromClientEvent(
  clientEventName = "",
  row = {},
  decisionContext = {}
) {
  const base = CLIENT_EVENT_MAP[clientEventName];
  if (!base) return null;

  let signalType = base.signal_type;
  let signalStrength = base.signal_strength;
  let signalTarget = resolveSignalTargetFromClientRow(row, decisionContext, base.default_target);

  if (clientEventName === "offer_click") {
    if (signalTarget === MIA_ACCEPTANCE_SIGNAL_TARGETS.RUNNER_UP) {
      signalType = MIA_ACCEPTANCE_SIGNAL_TYPES.ALTERNATIVE_OFFER_CLICKED;
    } else if (signalTarget === MIA_ACCEPTANCE_SIGNAL_TARGETS.ALTERNATIVE) {
      signalType = MIA_ACCEPTANCE_SIGNAL_TYPES.ALTERNATIVE_OFFER_CLICKED;
    } else if (signalTarget === MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER) {
      signalType = MIA_ACCEPTANCE_SIGNAL_TYPES.WINNER_OFFER_CLICKED;
    }
  }

  const productFamilyHash = resolveProductFamilyHashFromClientRow(row);
  const offerFingerprint = buildOfferFingerprint(
    extractOfferProviderId(row),
    row.product_id || row.metadata?.product_id || "",
    row.offer_store || row.source || ""
  );

  return {
    signal_type: signalType,
    signal_strength: signalStrength,
    signal_source: base.signal_source,
    signal_target: signalTarget,
    signal_observed: true,
    product_family_hash: productFamilyHash,
    offer_fingerprint: offerFingerprint,
    provider_id: extractOfferProviderId(row),
    category: row.category ?? null,
    acceptance_proxy: signalStrength === MIA_ACCEPTANCE_SIGNAL_STRENGTHS.WEAK,
    purchase_confirmed: false,
  };
}

/**
 * @param {string} followUpType
 * @param {object} [input]
 */
export function classifyAcceptanceSignalFromFollowUp(followUpType = "", input = {}) {
  if (FOLLOW_UP_EXCLUDED.has(followUpType)) return null;

  const mapped = FOLLOW_UP_SIGNAL_MAP[followUpType];
  if (!mapped) return null;

  const winnerFamily = input.winnerProductFamilyHash ?? null;

  return {
    signal_type: mapped.signal_type,
    signal_strength: mapped.signal_strength,
    signal_source: MIA_ACCEPTANCE_SIGNAL_SOURCES.SERVER_CONVERSATION,
    signal_target: mapped.signal_target,
    signal_observed: true,
    product_family_hash: winnerFamily,
    offer_fingerprint: null,
    provider_id: input.winnerProvider ?? null,
    category: input.category ?? null,
    acceptance_proxy: mapped.acceptance_proxy === true,
    purchase_confirmed: false,
  };
}

/**
 * @param {object} row
 * @param {object} decisionContext
 * @param {string} fallback
 */
function resolveSignalTargetFromClientRow(row, decisionContext = {}, fallback = "UNKNOWN") {
  const rowFamily = resolveProductFamilyHashFromClientRow(row);
  const winnerFamily =
    decisionContext.winner_product_family ||
    decisionContext.winnerProductFamilyHash ||
    decisionContext.winner_product_family_hash ||
    null;
  const runnerUpFamily = decisionContext.runnerUpProductFamilyHash || null;

  if (winnerFamily && rowFamily && rowFamily === winnerFamily) {
    return MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER;
  }
  if (runnerUpFamily && rowFamily && rowFamily === runnerUpFamily) {
    return MIA_ACCEPTANCE_SIGNAL_TARGETS.RUNNER_UP;
  }
  if (rowFamily && winnerFamily && rowFamily !== winnerFamily) {
    return MIA_ACCEPTANCE_SIGNAL_TARGETS.ALTERNATIVE;
  }

  if (clientEventNameIsRender(row)) return MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER;

  if (row.product_id || row.product_name) return MIA_ACCEPTANCE_SIGNAL_TARGETS.OFFER_ONLY;
  return fallback;
}

function clientEventNameIsRender() {
  return false;
}

/**
 * @param {object} row
 */
function resolveProductFamilyHashFromClientRow(row = {}) {
  const familyKey =
    row.metadata?.product_family_key ||
    row.product_id ||
    row.metadata?.product_id ||
    null;
  if (familyKey) return hashSafeFamilyKey(String(familyKey).trim().toLowerCase());

  const product = {
    familyKey: row.product_id || null,
    normalizedName: row.metadata?.normalized_name || null,
    product_id: row.product_id || null,
  };
  const resolved = resolveSafeProductFamilyKey(product);
  return resolved ? hashSafeFamilyKey(resolved) : null;
}

export { FOLLOW_UP_EXCLUDED, CLIENT_EVENT_MAP };
