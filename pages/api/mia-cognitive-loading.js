/**
 * PATCH UX-1 / 12B — Cognitive loading preview (read-only, zero LLM).
 * Public same-origin endpoint; no client secret required.
 */

import { buildCognitiveLoadingPreview } from "../../lib/miaCognitiveLoadingPreview.js";
import { getCognitiveLoadingFallbackState } from "../../lib/miaCognitiveLoading.js";
import {
  evaluatePerimeterRateLimit,
  buildPerimeterRateLimit429Payload,
} from "../../lib/miaPerimeterRateLimit.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const conversationId = body.conversation_id || body.conversationId || "";

  const rateLimit = evaluatePerimeterRateLimit({ req, conversationId });
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds || 60));
    return res.status(429).json(buildPerimeterRateLimit429Payload());
  }

  try {
    const { text = "", session_context: sessionContext = {} } = body;
    const loading =
      buildCognitiveLoadingPreview({
        text,
        sessionContext,
      }) || getCognitiveLoadingFallbackState(text);

    return res.status(200).json({
      ...loading,
      readOnly: true,
    });
  } catch {
    return res.status(200).json(getCognitiveLoadingFallbackState());
  }
}
