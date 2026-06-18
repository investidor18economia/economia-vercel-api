/**
 * PATCH 3 — Follow-up guardrails (enforcement of Routing Decision Contract).
 * No new routing intelligence — only governance.
 */

import { pickAuthoritativeLastBestProduct } from "./miaRoutingSafety.js";
import { mergeDiscussionSetIntoSessionContext } from "./miaDiscussionSetEnforcement.js";

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
  anchored_comparison_hold: new Set(["commercial_only_fallback", "return_seguro", "legacy_llm_search"]),
  contradiction_recovery_hold: new Set(["commercial_only_fallback", "return_seguro", "legacy_llm_search"]),
  post_change_recovery_hold: new Set(["commercial_only_fallback", "return_seguro", "legacy_llm_search"]),
  final_decision_scope_hold: new Set(["commercial_only_fallback", "return_seguro", "legacy_llm_search"]),
  user_confusion_recovery_hold: new Set(["commercial_only_fallback", "return_seguro", "legacy_llm_search"]),
  explicit_recommendation_change: new Set(["commercial_only_fallback", "return_seguro", "legacy_llm_search"]),
  legitimate_search_reset_hold: new Set(["commercial_only_fallback", "return_seguro", "legacy_llm_search"]),
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
    rd.mode === "contradiction_recovery_hold" ||
    rd.mode === "user_confusion_recovery_hold" ||
    rd.mode === "post_change_recovery_hold" ||
    rd.mode === "final_decision_scope_hold"
  ) {
    return true;
  }
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

  // PATCH 8.4B — explicit change commits winner; must not fall through to anchor preservation
  if (rd.mode === "explicit_recommendation_change" && rd.allowReplaceWinner) {
    const nextWinner = proposedBestProduct?.product_name
      ? proposedBestProduct
      : out.lastBestProduct;
    if (nextWinner?.product_name) {
      out.lastBestProduct = nextWinner;
      out.lastProductMentioned = nextWinner.product_name;
      if (Array.isArray(proposedProducts) && proposedProducts.length) {
        out.lastProducts = proposedProducts;
        out.lastRankingSnapshot = buildRankingSnapshot(proposedProducts, nextWinner);
      }
    }
    return out;
  }

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
      // PATCH 7.4 — rebuild snapshot on formal winner replacement.
      // proposedProducts are already serialized (scores may be null), which
      // is acceptable — the snapshot was built with real scores at the search
      // write-point and this only acts as a safety net for other callers.
      out.lastRankingSnapshot = buildRankingSnapshot(proposedProducts, proposedBestProduct);
    }
  }

  if (
    rd.enforceDiscussionSetQuery &&
    (rd.mode === "anchored_comparison_hold" || rd.mode === "comparison_followup")
  ) {
    return mergeDiscussionSetIntoSessionContext(out, {
      anchorProduct: out.lastBestProduct || anchor,
      query: rd.enforceDiscussionSetQuery,
      rememberedProducts: out.lastProducts || [],
      preserveExisting: rd.mode === "comparison_followup",
    });
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

// ─────────────────────────────────────────────────────────────
// PATCH 7.4 — Formal Ranking Snapshot Persistence
// ─────────────────────────────────────────────────────────────

/**
 * Serializes an already-ranked product list into the formal ranking snapshot.
 *
 * Contract:
 *   - NEVER reorders.
 *   - NEVER recalculates scores.
 *   - NEVER chooses winner.
 *   - Preserves score when present in the product object; null otherwise.
 *   - Works for any product vertical — no vertical-specific fields.
 *
 * @param {Array}       products — ordered array, winner at index 0
 * @param {object|null} winner   — the formal winner (lastBestProduct)
 * @returns {Array} snapshot entries { rank, product_name, price, link,
 *                                     thumbnail, source, score, isWinner }
 */
export function buildRankingSnapshot(products = [], winner = null) {
  if (!Array.isArray(products) || products.length === 0) return [];

  const winnerKey = winner?.product_name
    ? normalizeNameKey(winner.product_name)
    : null;

  return products
    .filter(Boolean)
    .map((product, index) => {
      const name = String(product?.product_name || "").trim();
      const nameKey = normalizeNameKey(name);
      const isWinner = !!winnerKey && namesLikelyMatch(name, winner.product_name);

      return {
        rank: index + 1,
        product_name: name,
        price: product?.price ?? null,
        link: product?.link ?? null,
        thumbnail: product?.thumbnail ?? null,
        source: product?.source ?? null,
        // Prefer most precise score available; null if absent.
        score:
          product?.finalScoreEngineScore ??
          product?.decisionScore ??
          product?.localFallbackScore ??
          product?.score ??
          null,
        isWinner
      };
    });
}

// ─────────────────────────────────────────────────────────────
// PATCH 7.5 — Alternative Retrieval Governance
// ─────────────────────────────────────────────────────────────

/**
 * Retrieves ranking positions deterministically from lastRankingSnapshot.
 *
 * Contract:
 *   - NEVER recalculates or reorders ranking.
 *   - NEVER chooses a winner or invents a product.
 *   - Returns not_available when data is insufficient — caller must handle.
 *   - Pure function — no side effects.
 *
 * @param {Array|null} snapshot — sessionContext.lastRankingSnapshot
 * @param {{ requestedRank: number|null, requestedTopN: number|null }} request
 * @returns {
 *   { type: 'single_rank', rank: number, product: object } |
 *   { type: 'top_n',       n: number,   items: Array     } |
 *   { type: 'not_available', reason: 'no_snapshot'|'rank_out_of_bounds'|'no_request' }
 * }
 */
export function resolveRankingRequest(snapshot = null, request = {}) {
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    return { type: "not_available", reason: "no_snapshot" };
  }

  const { requestedRank = null, requestedTopN = null } = request || {};

  // Top-N: return the first N entries of the snapshot (already ordered)
  if (requestedTopN != null && requestedTopN >= 1) {
    const items = snapshot.slice(0, requestedTopN);
    return { type: "top_n", n: requestedTopN, items };
  }

  // Single rank: find the exact entry by rank field
  if (requestedRank != null && requestedRank >= 1) {
    const entry = snapshot.find((item) => item.rank === requestedRank);
    if (!entry) {
      return { type: "not_available", reason: "rank_out_of_bounds" };
    }
    return { type: "single_rank", rank: requestedRank, product: entry };
  }

  return { type: "not_available", reason: "no_request" };
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
