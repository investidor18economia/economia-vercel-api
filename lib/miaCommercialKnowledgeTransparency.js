/**
 * PATCH Comercial 4E-A.4 — Commercial Knowledge Transparency (frontend helpers)
 *
 * Consome knowledgeMetadata do backend — não recalcula origem no cliente.
 */

export const COMMERCIAL_KNOWLEDGE_TRANSPARENCY_VERSION = "4E-A.4";

export const MIA_HOW_IT_WORKS_ROUTE = "/app-mia";
export const MIA_HOW_IT_WORKS_AUDIT_ANCHOR = "auditoria";
export const MIA_HOW_IT_WORKS_AUDIT_HREF = `${MIA_HOW_IT_WORKS_ROUTE}#${MIA_HOW_IT_WORKS_AUDIT_ANCHOR}`;

export const COMMERCIAL_TRANSPARENCY_NOTICE_PREFIX =
  "Produto ainda não passou pela auditoria completa da MIA.";

/**
 * @param {Record<string, unknown>|null|undefined} knowledgeMetadata
 */
export function shouldShowCommercialTransparencyNotice(knowledgeMetadata = null) {
  return knowledgeMetadata?.transparencyRequired === true;
}

/**
 * @param {Record<string, unknown>|null|undefined} data
 */
export function extractKnowledgeMetadataFromApiResponse(data = null) {
  if (!data || typeof data !== "object") return null;
  const metadata = data.knowledgeMetadata;
  if (!metadata || typeof metadata !== "object") return null;
  return metadata;
}
