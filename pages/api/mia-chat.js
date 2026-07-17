/**
 * PATCH 12B — Public perimeter proxy for MIA chat.
 * Browser → rate limit → server-side API_SHARED_KEY → /api/chat-gpt4o passthrough.
 */

import {
  evaluatePerimeterRateLimit,
  buildPerimeterRateLimit429Payload,
} from "../../lib/miaPerimeterRateLimit.js";
import { forwardChatRequestToCore } from "../../lib/miaPerimeterChatProxy.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const conversationId = body.conversation_id || body.conversationId || "";

  const rateLimit = evaluatePerimeterRateLimit({ req, conversationId });
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds || 60));
    return res.status(429).json(buildPerimeterRateLimit429Payload());
  }

  try {
    const upstream = await forwardChatRequestToCore({ req, body });

    for (const [headerName, headerValue] of Object.entries(upstream.headers || {})) {
      if (headerValue) {
        res.setHeader(headerName, headerValue);
      }
    }

    return res.status(upstream.status).send(upstream.bodyText);
  } catch (error) {
    console.error("mia_chat_proxy_upstream_error:", error?.message || error);
    return res.status(502).json({
      error: "upstream_unavailable",
      reasonCode: "perimeter_upstream_error",
      reply: "Não consegui conectar agora. Tenta novamente em instantes.",
    });
  }
}
