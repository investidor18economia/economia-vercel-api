/**
 * PATCH UX-1 / 12B / 12C — Cognitive loading preview (read-only, zero LLM).
 */

import { buildCognitiveLoadingPreview } from "../../lib/miaCognitiveLoadingPreview.js";
import { getCognitiveLoadingFallbackState } from "../../lib/miaCognitiveLoading.js";
import {
  evaluatePerimeterRateLimit,
  buildPerimeterRateLimit429Payload,
} from "../../lib/miaPerimeterRateLimit.js";
import {
  applyPublicCorsHeaders,
  applyPublicSecurityHeaders,
  sendPublicApiError,
  validatePublicContentType,
  validatePublicHttpMethod,
  validatePublicLoadingRequestBody,
} from "../../lib/miaPublicApiHardening.js";
import { withMiaObservability } from "../../lib/miaObservability.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

export default withMiaObservability(async function miaCognitiveLoadingHandler(req, res) {
  applyPublicSecurityHeaders(res);

  if (req.method === "OPTIONS") {
    const cors = applyPublicCorsHeaders(req, res);
    if (cors.crossOrigin && !cors.originAllowed) {
      return res.status(403).json({
        error: "origin_not_allowed",
        reasonCode: "public_api_origin_not_allowed",
      });
    }
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  const methodCheck = validatePublicHttpMethod(req, ["POST"]);
  if (!methodCheck.ok) {
    return sendPublicApiError(res, methodCheck.response, {
      allowHeader: methodCheck.allowHeader,
    });
  }

  const cors = applyPublicCorsHeaders(req, res);
  if (cors.crossOrigin && !cors.originAllowed) {
    return res.status(403).json({
      error: "origin_not_allowed",
      reasonCode: "public_api_origin_not_allowed",
    });
  }

  const contentTypeCheck = validatePublicContentType(req);
  if (!contentTypeCheck.ok) {
    return sendPublicApiError(res, contentTypeCheck.response);
  }

  const bodyCheck = validatePublicLoadingRequestBody(req.body);
  if (!bodyCheck.ok) {
    return sendPublicApiError(res, bodyCheck.response);
  }

  const body = bodyCheck.body;
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

    applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });
    return res.status(200).json({
      ...loading,
      readOnly: true,
    });
  } catch {
    applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });
    return res.status(200).json(getCognitiveLoadingFallbackState());
  }
}, { endpoint: "/api/mia-cognitive-loading" });
