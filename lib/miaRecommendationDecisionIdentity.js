/**
 * PATCH 9.1 — Safe decision identity helpers (no PII, no product titles).
 */

import { createHash } from "node:crypto";
import { normalizeProviderAttemptId } from "./miaProviderIdCatalog.js";

/**
 * @param {Record<string, unknown>|null|undefined} product
 */
export function resolveSafeProductFamilyKey(product = null) {
  if (!product || typeof product !== "object") return null;
  const raw =
    product.familyKey ||
    product.normalizedName ||
    product.product_id ||
    product.productId ||
    null;
  if (!raw) return null;
  const normalized = String(raw).trim().toLowerCase().slice(0, 120);
  return normalized || null;
}

/**
 * @param {string|null|undefined} familyKey
 */
export function hashSafeFamilyKey(familyKey = null) {
  const key = String(familyKey || "").trim();
  if (!key) return null;
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

/**
 * @param {Record<string, unknown>|null|undefined} product
 */
export function extractDecisionProviderId(product = null) {
  if (!product || typeof product !== "object") return null;
  const raw = product.provider || product.commercialProvider || product.source || null;
  if (!raw) return null;
  const normalized = normalizeProviderAttemptId(String(raw));
  if (normalized === "unknown" && !product.provider && !product.commercialProvider) {
    if (String(product.source || "").toLowerCase().includes("spec")) return "product_specs";
  }
  return normalized;
}

/**
 * @param {Record<string, unknown>|null|undefined} product
 */
export function extractObservedScore(product = null) {
  if (!product || typeof product !== "object") return null;
  const candidates = [
    product.localFallbackScore,
    product.finalScoreEngineScore,
    product.decisionScore,
    product._miaScore,
    product.score,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return null;
}

/**
 * @param {Record<string, unknown>|null|undefined} a
 * @param {Record<string, unknown>|null|undefined} b
 */
export function decisionProductsMatchFamily(a = null, b = null) {
  const fa = resolveSafeProductFamilyKey(a);
  const fb = resolveSafeProductFamilyKey(b);
  if (fa && fb) return fa === fb;
  return false;
}

/**
 * @param {number|null|undefined} winnerScore
 * @param {number|null|undefined} runnerUpScore
 */
export function computeScoreGap(winnerScore, runnerUpScore) {
  if (winnerScore == null || runnerUpScore == null) return null;
  if (!Number.isFinite(winnerScore) || !Number.isFinite(runnerUpScore)) return null;
  return Math.round((winnerScore - runnerUpScore) * 100) / 100;
}
