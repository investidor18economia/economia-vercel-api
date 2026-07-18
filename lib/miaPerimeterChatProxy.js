import { getPropagationHeaders } from "./miaObservabilityContext.js";

export function buildInternalCoreChatUrl(req = {}) {
  const protocol =
    req.headers?.["x-forwarded-proto"] ||
    (String(req.headers?.host || "").includes("localhost") ? "http" : "https");
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
  return `${protocol}://${host}/api/chat-gpt4o`;
}

export function normalizeProxyRequestBody(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body;
}

export async function forwardChatRequestToCore({
  req,
  body,
  fetchImpl = fetch,
  env = process.env,
}) {
  const apiSharedKey = env.API_SHARED_KEY;
  if (!apiSharedKey) {
    return {
      ok: false,
      status: 503,
      headers: { "content-type": "application/json" },
      bodyText: JSON.stringify({
        error: "service_unavailable",
        reasonCode: "perimeter_missing_shared_key",
        reply: "A MIA está temporariamente indisponível. Tente novamente em instantes.",
      }),
    };
  }

  const internalUrl = buildInternalCoreChatUrl(req);
  const propagationHeaders = getPropagationHeaders();
  const upstream = await fetchImpl(internalUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiSharedKey,
      ...(propagationHeaders["x-request-id"]
        ? {
            "x-request-id": propagationHeaders["x-request-id"],
            "x-correlation-id": propagationHeaders["x-correlation-id"],
          }
        : {}),
    },
    body: JSON.stringify(normalizeProxyRequestBody(body)),
  });

  const contentType = upstream.headers.get("content-type") || "application/json";
  const headers = { "content-type": contentType };
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) {
    headers["retry-after"] = retryAfter;
  }

  return {
    ok: upstream.ok,
    status: upstream.status,
    headers,
    bodyText: await upstream.text(),
  };
}
