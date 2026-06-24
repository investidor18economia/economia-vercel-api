/**
 * PATCH 2 — Price Alerts Safety Fields
 *
 * Normalização, target padrão e payload de insert.
 * Não envia e-mail, não checa preços, não chama Resend.
 */

import {
  cleanProductTitle,
  normalizeProductNameKey,
  parseNumericPrice,
} from "./productSourceAdapter/normalizeProduct.js";

export const MIA_PRICE_ALERTS_SAFETY_VERSION = "2.0.0";
export const MIA_PRICE_ALERT_MONITORING_SCOPE = "trusted_sources";
export const MIA_PRICE_ALERT_CREATED_REASON = "user_monitor_button";
export const MIA_PRICE_ALERT_DEFAULT_TARGET_DISCOUNT = 0.05;

function roundCurrency(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Chave estável para deduplicação: 1 alerta ativo por usuário por produto.
 * @param {string} productName
 */
export function normalizePriceAlertProductKey(productName = "") {
  const cleaned = cleanProductTitle(productName);
  const key = normalizeProductNameKey(cleaned);
  return key || null;
}

/**
 * Preço alvo padrão: 5% abaixo do preço atual (regra interna).
 * Aplica quando target não veio ou quando Monitorar no card envia target = current.
 *
 * @param {{
 *   targetPrice?: unknown,
 *   currentPrice?: unknown,
 *   productUrl?: string,
 * }} input
 */
export function resolvePriceAlertTargetPrice(input = {}) {
  const current = parseNumericPrice(input.currentPrice);
  const explicitTarget = parseNumericPrice(input.targetPrice);
  const hasTargetField =
    input.targetPrice !== undefined &&
    input.targetPrice !== null &&
    String(input.targetPrice).trim() !== "";

  if (current == null || current <= 0) {
    return explicitTarget;
  }

  if (!hasTargetField) {
    return roundCurrency(current * (1 - MIA_PRICE_ALERT_DEFAULT_TARGET_DISCOUNT));
  }

  const productUrl = String(input.productUrl || "").trim();
  const isOfferCardMonitor =
    productUrl.length > 0 &&
    explicitTarget != null &&
    Math.abs(explicitTarget - current) < 0.01;

  if (isOfferCardMonitor) {
    return roundCurrency(current * (1 - MIA_PRICE_ALERT_DEFAULT_TARGET_DISCOUNT));
  }

  return explicitTarget;
}

/**
 * @param {{
 *   user_id: string,
 *   user_email?: string|null,
 *   product_name: string,
 *   product_url?: string|null,
 *   product_thumbnail?: string|null,
 *   source?: string|null,
 *   current_price?: unknown,
 *   target_price?: unknown,
 * }} input
 */
export function buildPriceAlertInsertRow(input = {}) {
  const productName = cleanProductTitle(input.product_name || "");
  const normalizedProductKey = normalizePriceAlertProductKey(productName);
  const currentPrice = parseNumericPrice(input.current_price);
  const productUrl = String(input.product_url || "").trim() || null;
  const source = String(input.source || "").trim() || null;
  const targetPrice = resolvePriceAlertTargetPrice({
    targetPrice: input.target_price,
    currentPrice,
    productUrl: productUrl || "",
  });

  return {
    user_id: input.user_id,
    user_email: input.user_email || null,
    product_name: productName,
    product_url: productUrl,
    product_thumbnail: input.product_thumbnail || null,
    source,
    current_price: currentPrice,
    target_price: targetPrice,
    is_active: true,
    normalized_product_key: normalizedProductKey,
    monitoring_scope: MIA_PRICE_ALERT_MONITORING_SCOPE,
    original_product_url: productUrl,
    original_source: source,
    last_checked_price: currentPrice,
    last_found_price: currentPrice,
    last_found_url: productUrl,
    last_found_source: source,
    created_reason: MIA_PRICE_ALERT_CREATED_REASON,
  };
}

/**
 * @param {Record<string, unknown>} existing
 * @param {Record<string, unknown>} incoming
 */
export function isSameActivePriceAlert(existing = {}, incoming = {}) {
  if (!existing || !incoming) return false;
  if (existing.is_active !== true) return false;

  const existingKey = String(existing.normalized_product_key || "").trim();
  const incomingKey = normalizePriceAlertProductKey(incoming.product_name || "");

  if (existingKey && incomingKey && existingKey === incomingKey) {
    return true;
  }

  const existingName = normalizeProductNameKey(existing.product_name || "");
  const incomingName = normalizeProductNameKey(incoming.product_name || "");
  return !!existingName && existingName === incomingName;
}
