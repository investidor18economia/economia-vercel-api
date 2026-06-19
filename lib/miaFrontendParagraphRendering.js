/**
 * PATCH 9.2C — Frontend Paragraph Rendering Fix
 *
 * Utilitário puro para preservar quebras estratégicas (\n\n) no chat.
 * Sem alteração de conteúdo — apenas estrutura de renderização.
 */

export const FRONTEND_PARAGRAPH_RENDERING_VERSION = "9.2C.1";

export function splitAssistantParagraphs(text = "") {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function shouldUseStructuredParagraphs(text = "") {
  return splitAssistantParagraphs(text).length > 1;
}
