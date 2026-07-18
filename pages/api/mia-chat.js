/**
 * PATCH 12B / 12C — Public perimeter proxy for MIA chat.
 */

import {
  evaluatePerimeterRateLimit,
  buildPerimeterRateLimit429Payload,
} from "../../lib/miaPerimeterRateLimit.js";
import { forwardChatRequestToCore } from "../../lib/miaPerimeterChatProxy.js";
import {
  applyPublicCorsHeaders,
  applyPublicSecurityHeaders,
  sendPublicApiError,
  sanitizePublicUpstreamResponse,
  validatePublicChatRequestBody,
  validatePublicContentType,
  validatePublicHttpMethod,
} from "../../lib/miaPublicApiHardening.js";
import { withMiaObservability } from "../../lib/miaObservability.js";
import { logInfo, logError } from "../../lib/miaLogger.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "6mb",
    },
  },
};

export default withMiaObservability(async function miaChatHandler(req, res) {
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

  const bodyCheck = validatePublicChatRequestBody(req.body);
  if (!bodyCheck.ok) {
    return sendPublicApiError(res, bodyCheck.response);
  }

  const body = bodyCheck.body;
  const conversationId = body.conversation_id || body.conversationId || "";

  const rateLimit = evaluatePerimeterRateLimit({ req, conversationId });
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds || 60));
    logInfo({
      event: "rate_limit",
      reasonCode: "perimeter_rate_limited",
      endpoint: "/api/mia-chat",
      status: 429,
    });
    return res.status(429).json(buildPerimeterRateLimit429Payload());
  }

  try {
    const upstream = await forwardChatRequestToCore({ req, body });
    const sanitized = sanitizePublicUpstreamResponse({
      status: upstream.status,
      bodyText: upstream.bodyText,
      contentType: upstream.headers?.["content-type"] || "application/json",
    });

    res.setHeader("Content-Type", sanitized.contentType || "application/json");
    applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });

    const retryAfter = upstream.headers?.["retry-after"];
    if (retryAfter) {
      res.setHeader("Retry-After", retryAfter);
    }

    return res.status(sanitized.status).send(sanitized.bodyText);
  } catch (error) {
    logError({
      event: "upstream_error",
      endpoint: "/api/mia-chat",
      reasonCode: "perimeter_upstream_error",
      message: error?.message || "upstream_unavailable",
      status: 502,
    });
    return res.status(502).json({
      error: "upstream_unavailable",
      reasonCode: "perimeter_upstream_error",
      reply: "Não consegui conectar agora. Tenta novamente em instantes.",
    });
  }
}, { endpoint: "/api/mia-chat" });
