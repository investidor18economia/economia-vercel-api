/**
 * PATCH 2.2 — Canonical analytics payload assembly.
 * PATCH 2.3 — Official names: Analytics Storage Schema v1; Event Contract v1 (docs/analytics/contracts/).
 * PATCH 3.1 — visitor_id in identification layer (docs/analytics/VISITOR_ID.md).
 * PATCH 3.2 — conversation_id in identification layer (docs/analytics/CONVERSATION_ID.md).
 *
 * Field order (identification → context → entity → offer → metadata):
 *   event_name, visitor_id, session_id, conversation_id, user_id,
 *   category, query_text,
 *   product_name, product_brand, product_id, recommendation_name,
 *   offer_store, offer_price, offer_url,
 *   metadata
 */

const ANALYTICS_ROW_FIELD_ORDER = Object.freeze([
  "event_name",
  "visitor_id",
  "session_id",
  "conversation_id",
  "user_id",
  "category",
  "query_text",
  "product_name",
  "product_brand",
  "product_id",
  "recommendation_name",
  "offer_store",
  "offer_price",
  "offer_url",
  "metadata",
]);

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAnalyticsUuid(value) {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

/**
 * @param {Record<string, unknown>} fields
 * @param {{ includeKeys?: string[] }} [options]
 */
export function assembleAnalyticsEventRow(fields = {}, options = {}) {
  const includeKeys = options.includeKeys || ANALYTICS_ROW_FIELD_ORDER;
  const row = {};

  for (const key of includeKeys) {
    if (!ANALYTICS_ROW_FIELD_ORDER.includes(key)) continue;
    if (!(key in fields)) continue;
    row[key] = fields[key];
  }

  return row;
}

/**
 * Builds a full analytics row with canonical key order and null defaults.
 * Used for DB INSERT mappings.
 *
 * @param {Record<string, unknown>} fields
 */
export function assembleAnalyticsInsertRow(fields = {}) {
  return {
    event_name: fields.event_name ?? null,
    visitor_id: fields.visitor_id ?? null,
    session_id: fields.session_id ?? null,
    conversation_id: fields.conversation_id ?? null,
    user_id: fields.user_id ?? null,
    category: fields.category ?? null,
    query_text: fields.query_text ?? null,
    product_name: fields.product_name ?? null,
    product_brand: fields.product_brand ?? null,
    product_id: fields.product_id ?? null,
    recommendation_name: fields.recommendation_name ?? null,
    offer_store: fields.offer_store ?? null,
    offer_price: fields.offer_price ?? null,
    offer_url: fields.offer_url ?? null,
    metadata: fields.metadata ?? {},
  };
}

/**
 * @param {string} eventName
 * @param {string|null} sessionId
 * @param {Record<string, unknown>} partial
 * @param {string|null} [visitorId]
 * @param {string|null|false|undefined} [conversationId]
 */
export function buildAnalyticsTrackPayload(
  eventName,
  sessionId,
  partial = {},
  visitorId = null,
  conversationId = undefined
) {
  const row = {
    event_name: eventName,
    session_id: sessionId,
    ...partial,
    ...(visitorId != null ? { visitor_id: visitorId } : {}),
  };

  if (conversationId === false) {
    row.conversation_id = null;
  } else if (conversationId != null) {
    row.conversation_id = conversationId;
  }

  return assembleAnalyticsEventRow(row);
}

/**
 * @param {Record<string, unknown>} source
 * @param {{ precedence?: "standard" | "card_response" }} [options]
 */
export function resolveAnalyticsProductName(source = {}, options = {}) {
  const precedence = options.precedence || "standard";
  const raw =
    precedence === "card_response"
      ? source.name || source.title || ""
      : source.product_name || source.name || source.title || "";
  const text = String(raw).trim();
  return text || null;
}

/**
 * @param {Record<string, unknown>} source
 * @param {{ precedence?: "standard" | "card_response" }} [options]
 */
export function resolveAnalyticsProductFields(source = {}, options = {}) {
  return {
    product_name: resolveAnalyticsProductName(source, options),
    product_brand: source.brand ?? null,
    product_id: source.id ?? null,
  };
}

/** @param {Record<string, unknown>} source */
export function resolveAnalyticsOfferFields(source = {}) {
  const offerPrice = source.numericPrice ?? source.price ?? null;

  return {
    offer_store: source.source || source.store || null,
    offer_price: offerPrice || null,
    offer_url: source.link ?? null,
  };
}

export function buildMiaQuestionSentPayload(
  queryText = "",
  { userId = null, hasImage = false, category = null } = {}
) {
  return assembleAnalyticsEventRow({
    user_id: userId,
    query_text: queryText || "",
    category,
    metadata: {
      has_image: !!hasImage,
    },
  });
}

export function buildMiaSessionStartedPayload() {
  if (typeof window === "undefined") return {};

  let referrer = null;
  try {
    referrer = typeof document !== "undefined" ? document.referrer || null : null;
  } catch {
    referrer = null;
  }

  return assembleAnalyticsEventRow({
    metadata: {
      page: window.location.pathname,
      user_agent: navigator.userAgent,
      referrer,
    },
  });
}

/** PATCH 3.4 — verified login milestone (retention foundation). */
export function buildMiaUserAuthenticatedPayload() {
  if (typeof window === "undefined") return {};

  return assembleAnalyticsEventRow({
    metadata: {
      page: window.location.pathname,
      auth_method: "otp_email",
    },
  });
}

/**
 * @param {{
 *   queryText?: string,
 *   category?: string|null,
 *   cardProduct?: Record<string, unknown>,
 *   userId?: string|null,
 *   productsCount?: number,
 *   productNamePrecedence?: "standard" | "card_response",
 *   dataLayerUsage?: Record<string, unknown>,
 * }} input
 */
export function buildMiaRecommendationShownPayload(input = {}) {
  const product = resolveAnalyticsProductFields(input.cardProduct || {}, {
    precedence: input.productNamePrecedence || "standard",
  });

  const metadata = {
    has_offer_card: true,
    products_count: input.productsCount ?? 0,
  };

  if (input.dataLayerUsage && typeof input.dataLayerUsage === "object") {
    Object.assign(metadata, input.dataLayerUsage);
  }

  return assembleAnalyticsEventRow({
    user_id: input.userId ?? null,
    query_text: input.queryText || "",
    category: input.category ?? null,
    product_name: product.product_name,
    product_brand: product.product_brand,
    product_id: product.product_id,
    recommendation_name: product.product_name,
    metadata,
  });
}

/**
 * @param {{
 *   prod?: Record<string, unknown>,
 *   userId?: string|null,
 *   categoryText?: string,
 *   detectCategory?: (text: string) => string,
 * }} input
 */
export function buildMiaFavoriteCreatedPayload(input = {}) {
  const prod = input.prod || {};
  const detectCategory = input.detectCategory || (() => "unknown");
  const categorySource =
    input.categoryText ?? (prod.product_name || prod.title || prod.name || "");

  return assembleAnalyticsEventRow({
    user_id: input.userId ?? null,
    category: detectCategory(categorySource),
    ...resolveAnalyticsProductFields(prod),
    ...resolveAnalyticsOfferFields(prod),
    metadata: {
      action_source: "offer_card",
    },
  });
}

/**
 * @param {{
 *   prod?: Record<string, unknown>,
 *   userId?: string|null,
 *   categoryText?: string,
 *   targetPrice?: number|null,
 *   numericPrice?: number|null,
 *   actionSource?: string,
 *   detectCategory?: (text: string) => string,
 * }} input
 */
export function buildMiaPriceAlertCreatedPayload(input = {}) {
  const prod = input.prod || {};
  const detectCategory = input.detectCategory || (() => "unknown");
  const categorySource =
    input.categoryText ?? (prod.product_name || prod.title || prod.name || "");
  const numericPrice = input.numericPrice ?? null;
  const targetPrice = input.targetPrice ?? null;

  return assembleAnalyticsEventRow({
    user_id: input.userId ?? null,
    category: detectCategory(categorySource),
    ...resolveAnalyticsProductFields(prod),
    ...resolveAnalyticsOfferFields({ ...prod, numericPrice, price: numericPrice }),
    metadata: {
      action_source: input.actionSource || "offer_card",
      target_price: targetPrice || null,
      current_price: numericPrice || null,
    },
  });
}

/**
 * @param {{
 *   offerCard?: Record<string, unknown>,
 *   categoryText?: string,
 *   detectCategory?: (text: string) => string,
 * }} input
 */
export function buildMiaOfferClickPayload(input = {}) {
  const offerCard = input.offerCard || {};
  const detectCategory = input.detectCategory || (() => "unknown");
  const categorySource =
    input.categoryText ?? (offerCard.product_name || offerCard.title || "");

  return assembleAnalyticsEventRow({
    category: detectCategory(categorySource),
    ...resolveAnalyticsProductFields(offerCard),
    ...resolveAnalyticsOfferFields(offerCard),
    metadata: {
      button_text: "Ver oferta",
    },
  });
}
