/**
 * PATCH Comercial 4E-A.4 — Commercial Knowledge Transparency Payload
 *
 * Propaga knowledgeMetadata do guard 4E-A.3 no payload da API.
 * Não altera reply, winner, ranking ou Decision Engine.
 */

import { buildCommercialKnowledgeMetadata } from "./commercial/nonDataLayerCommercialResponseGuard.js";

export const COMMERCIAL_KNOWLEDGE_TRANSPARENCY_PAYLOAD_VERSION = "4E-A.4";

/**
 * @param {Record<string, unknown>} body
 * @param {{
 *   winnerProduct?: Record<string, unknown>|null,
 *   dataLayerPrimary?: boolean,
 * }} context
 */
export function attachCommercialKnowledgeMetadataToChatResponse(body = {}, context = {}) {
  if (!body || typeof body !== "object") return body;

  const hasCommercialSurface =
    (Array.isArray(body.prices) && body.prices.length > 0) ||
    Boolean(String(body.reply || "").trim());

  if (!hasCommercialSurface) return body;

  const winner =
    context.winnerProduct ||
    body.session_context?.lastBestProduct ||
    (Array.isArray(body.prices) ? body.prices[0] : null);

  if (!winner || typeof winner !== "object") return body;

  const knowledgeMetadata = buildCommercialKnowledgeMetadata({
    product: winner,
    trustedSpecs: winner.trustedSpecs || null,
    hasDataLayer:
      typeof context.dataLayerPrimary === "boolean" ? context.dataLayerPrimary : undefined,
  });

  return {
    ...body,
    knowledgeMetadata,
  };
}
