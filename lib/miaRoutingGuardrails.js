/**
 * PATCH 3 — Follow-up guardrails (enforcement of Routing Decision Contract).
 * No new routing intelligence — only governance.
 */

import { pickAuthoritativeLastBestProduct } from "./miaRoutingSafety.js";

/** Paths that must not run when contract mode forbids them */
const MODE_BLOCKED_PATHS = {
  context_decision: new Set([
    "commercial_only_fallback",
    "return_seguro",
    "legacy_llm_search"
  ]),
  anchored_reaction: new Set([
    "commercial_only_fallback",
    "return_seguro",
    "legacy_llm_search",
    "search_guidance"
  ]),
  comparison_followup: new Set(["commercial_only_fallback", "return_seguro"]),
  context_hold: new Set(["commercial_only_fallback", "return_seguro"])
};

/**
 * @returns {{ violation: boolean, reason: string|null }}
 */
export function checkContractViolation(responsePath = "", routingDecision = {}) {
  const path = String(responsePath || "").trim();
  const rd = routingDecision || {};

  if (!path) {
    return { violation: false, reason: null };
  }

  if (!rd.allowCommercialFallback && path === "commercial_only_fallback") {
    return {
      violation: true,
      reason: "commercial_fallback_not_allowed"
    };
  }

  if (!rd.allowNewSearch) {
    const blockedWithoutAnchor = new Set([
      "commercial_only_fallback",
      "return_seguro",
      "legacy_llm_search",
      "search_guidance"
    ]);
    if (blockedWithoutAnchor.has(path) && rd.shouldPreserveAnchor) {
      return {
        violation: true,
        reason: `${rd.mode || "contract"}_blocks_${path}_with_anchor`
      };
    }
  }

  const modeBlocked = MODE_BLOCKED_PATHS[rd.mode];
  if (modeBlocked?.has(path)) {
    return {
      violation: true,
      reason: `${rd.mode}_incompatible_with_${path}`
    };
  }

  return { violation: false, reason: null };
}

export function shouldBlockCsoVerbalizer(routingDecision = {}) {
  const rd = routingDecision || {};
  if (rd.allowNewSearch) return false;
  if (rd.mode === "priority_change_reopen") return false;
  if (
    rd.shouldPreserveAnchor &&
    (rd.mode === "anchored_reaction" ||
      rd.mode === "context_decision" ||
      rd.mode === "comparison_followup" ||
      rd.mode === "context_hold")
  ) {
    return true;
  }
  return !rd.allowNewSearch && !!rd.shouldPreserveAnchor;
}

export function shouldSkipCommercialProductPipeline(routingDecision = {}) {
  const rd = routingDecision || {};
  return (
    !rd.allowNewSearch &&
    (rd.mode === "anchored_reaction" ||
      rd.mode === "context_decision" ||
      rd.mode === "context_hold")
  );
}

function normalizeNameKey(name = "") {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function namesLikelyMatch(a = "", b = "") {
  const ka = normalizeNameKey(a);
  const kb = normalizeNameKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

/**
 * Preserve anchor in session output when contract requires it.
 */
export function applyContractToSessionContext(
  sessionContext = {},
  routingDecision = {},
  {
    proposedBestProduct = null,
    proposedProducts = null,
    incomingLastBest = null
  } = {}
) {
  const out = { ...(sessionContext || {}) };
  const rd = routingDecision || {};

  const anchor =
    pickAuthoritativeLastBestProduct(
      rd.anchorProduct ||
        incomingLastBest ||
        out.lastBestProduct,
      out.lastProducts
    ) || rd.anchorProduct;

  if (rd.shouldPreserveAnchor && anchor?.product_name) {
    let merged = { ...anchor };

    if (proposedBestProduct?.product_name && namesLikelyMatch(anchor.product_name, proposedBestProduct.product_name)) {
      merged = {
        ...merged,
        price: proposedBestProduct.price ?? merged.price,
        link: proposedBestProduct.link ?? merged.link,
        thumbnail: proposedBestProduct.thumbnail ?? merged.thumbnail,
        source: proposedBestProduct.source || merged.source
      };
    }

    out.lastBestProduct = merged;
    out.lastProductMentioned =
      merged.product_name || out.lastProductMentioned || "";

    if (!rd.allowReplaceWinner && Array.isArray(proposedProducts) && proposedProducts.length) {
      // Do not replace product list with commercial-only fallback list
      if (!Array.isArray(out.lastProducts) || !out.lastProducts.length) {
        out.lastProducts = [merged];
      }
    } else if (rd.allowReplaceWinner && Array.isArray(proposedProducts)) {
      out.lastProducts = proposedProducts;
    }
  } else if (rd.allowReplaceWinner && proposedBestProduct?.product_name) {
    out.lastBestProduct = proposedBestProduct;
    // PATCH 7.1 — enforce winner-reference invariant on formal winner change.
    // When a new winner is set, lastProductMentioned must reflect it immediately.
    // Without this, lastProductMentioned could lag behind lastBestProduct and
    // contaminate the implicit reference resolution in the next turn.
    out.lastProductMentioned = proposedBestProduct.product_name;
    if (Array.isArray(proposedProducts)) {
      out.lastProducts = proposedProducts;
    }
  }

  return out;
}

export function ensureSessionContextOnPayload(
  payload = {},
  routingDecision = {},
  fallbackSessionContext = {}
) {
  const out = { ...payload };
  if (!routingDecision?.shouldReturnSessionContext) {
    return out;
  }
  if (!out.session_context || typeof out.session_context !== "object") {
    out.session_context = { ...(fallbackSessionContext || {}) };
  }
  return out;
}

/**
 * Build pipeline trace fields for contract audit (PATCH 3).
 */
export function buildContractPipelineExtras({
  responsePath = "",
  routingDecision = {},
  sessionContextBefore = null,
  sessionContextAfter = null,
  contractViolationReason = null,
  winnerChangeReasonOverride = null
} = {}) {
  const rd = routingDecision || {};
  const beforeName =
    sessionContextBefore?.lastBestProduct?.product_name ||
    rd.anchorProduct?.product_name ||
    null;
  const afterName = sessionContextAfter?.lastBestProduct?.product_name || null;
  const winnerChanged =
    !!beforeName &&
    !!afterName &&
    normalizeNameKey(beforeName) !== normalizeNameKey(afterName);

  let winnerChangeReason = winnerChangeReasonOverride || null;
  if (!winnerChangeReason && winnerChanged) {
    winnerChangeReason = rd.allowReplaceWinner
      ? "contract_allow_replace_winner"
      : "contract_violation_attempt";
  }

  const blockedSwap =
    contractViolationReason === "blocked_winner_swap_by_contract" ||
    winnerChangeReason === "blocked_by_contract";

  return {
    responsePath: responsePath || null,
    routingDecision: rd.mode
      ? {
          mode: rd.mode,
          conversationAct: rd.conversationAct,
          allowNewSearch: rd.allowNewSearch,
          allowCommercialFallback: rd.allowCommercialFallback,
          allowReplaceWinner: rd.allowReplaceWinner,
          allowRerank: rd.allowRerank,
          shouldPreserveAnchor: rd.shouldPreserveAnchor
        }
      : null,
    contractApplied: !contractViolationReason,
    contractViolation: contractViolationReason || null,
    anchorPreserved:
      rd.shouldPreserveAnchor &&
      (!winnerChanged || !rd.allowReplaceWinner || blockedSwap),
    sessionContextReturned: !!sessionContextAfter,
    winnerChanged: winnerChanged && !!rd.allowReplaceWinner && !blockedSwap,
    winnerChangeReason
  };
}

/**
 * Re-order ranked list without changing scores — anchor stays first when rerank blocked.
 */
export function preserveAnchorInRankedProducts(
  products = [],
  anchorProduct = null
) {
  const list = Array.isArray(products) ? [...products] : [];
  const anchorName = anchorProduct?.product_name;
  if (!anchorName || !list.length) return list;

  const idx = list.findIndex((p) =>
    namesLikelyMatch(p?.product_name, anchorName)
  );
  if (idx <= 0) return list;

  const [match] = list.splice(idx, 1);
  return [match, ...list];
}

/**
 * Final safety net — restore anchor if response tried to swap winner illegally.
 */
export function applyFinalContractSafetyNet(
  payload = {},
  routingDecision = {},
  sessionBefore = null
) {
  const rd = routingDecision || {};
  if (!rd.shouldPreserveAnchor || rd.allowReplaceWinner) {
    return { payload, contractViolationReason: null, winnerChangeReason: null };
  }

  const before =
    sessionBefore?.lastBestProduct ||
    rd.anchorProduct ||
    null;
  const after = payload?.session_context?.lastBestProduct;

  if (
    before?.product_name &&
    after?.product_name &&
    !namesLikelyMatch(before.product_name, after.product_name)
  ) {
    const fixedSession = applyContractToSessionContext(
      payload.session_context || {},
      rd,
      { incomingLastBest: before }
    );
    return {
      payload: { ...payload, session_context: fixedSession },
      contractViolationReason: "blocked_winner_swap_by_contract",
      winnerChangeReason: "blocked_by_contract"
    };
  }

  return { payload, contractViolationReason: null, winnerChangeReason: null };
}

// ─────────────────────────────────────────────────────────────
// PATCH 7.1 — Winner Reference Governance
// ─────────────────────────────────────────────────────────────

/**
 * Invariant: when a formal winner exists, lastProductMentioned must always
 * equal lastBestProduct.product_name.
 *
 * A product cited in a response (alternative, plan B, second place) must
 * NEVER promote itself to winner reference. Only a formal winner change
 * (allowReplaceWinner = true) can update the reference.
 *
 * Pure function — no side effects.
 * Call at any session write point as a final safeguard.
 *
 * @param {object} sessionContext
 * @returns {object} sessionContext with invariant enforced
 */
export function enforceWinnerReferenceInvariant(sessionContext = {}) {
  const winnerName = sessionContext?.lastBestProduct?.product_name;
  if (!winnerName) return sessionContext;
  if (sessionContext.lastProductMentioned === winnerName) return sessionContext;
  return { ...sessionContext, lastProductMentioned: winnerName };
}

export function pickWinnerUnderContract(
  displayProducts = [],
  anchorProduct = null,
  routingDecision = {}
) {
  const allowReplace =
    routingDecision?.allowReplaceWinner ?? routingDecision?.allowNewSearch;

  if (allowReplace) {
    return displayProducts[0] || null;
  }

  const anchorName = String(anchorProduct?.product_name || "").trim();
  if (!anchorName) {
    return displayProducts[0] || null;
  }

  const match = displayProducts.find((product) =>
    namesLikelyMatch(product?.product_name, anchorName)
  );

  return match || anchorProduct || displayProducts[0] || null;
}
