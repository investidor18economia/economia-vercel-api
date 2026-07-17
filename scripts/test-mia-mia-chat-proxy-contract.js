/**
 * PATCH 12B — /api/mia-chat proxy contract tests (mocked upstream, no OpenAI).
 */
import {
  forwardChatRequestToCore,
  buildInternalCoreChatUrl,
  normalizeProxyRequestBody,
} from "../lib/miaPerimeterChatProxy.js";

let passed = 0;
let failed = 0;

function expectTrue(label, condition) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`);
}

function expectEqual(label, actual, expected) {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label} expected=${expected} actual=${actual}`);
}

{
  const req = {
    headers: {
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    },
  };
  expectEqual("internal url", buildInternalCoreChatUrl(req), "http://localhost:3000/api/chat-gpt4o");
}

{
  const body = {
    text: "iphone 13",
    messages: [{ role: "user", content: "oi" }],
    conversation_id: "conv-123",
    user_id: "guest",
    image_base64: "",
    session_context: { lastQuery: "iphone" },
    futureField: "preserved",
  };

  let capturedUrl = "";
  let capturedOptions = null;
  let fetchCount = 0;

  const fetchImpl = async (url, options) => {
    fetchCount += 1;
    capturedUrl = url;
    capturedOptions = options;
    return new Response(
      JSON.stringify({
        reply: "ok",
        prices: [{ product_name: "iPhone 13", price: "1000" }],
        products: [{ product_name: "iPhone 13", price: "1000" }],
        knowledgeMetadata: { transparencyRequired: true, knowledgeSource: "data_layer" },
        mia_debug: { runtime_precedence: { path: "test" } },
        session_context: { lastQuery: "iphone 13" },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const req = {
    headers: {
      host: "localhost:3000",
      "x-forwarded-proto": "http",
      "x-api-key": "client-should-not-forward",
    },
  };

  const result = await forwardChatRequestToCore({
    req,
    body,
    fetchImpl,
    env: { API_SHARED_KEY: "server-only-secret" },
  });

  expectEqual("single upstream call", fetchCount, 1);
  expectEqual("upstream url", capturedUrl, "http://localhost:3000/api/chat-gpt4o");
  expectEqual("server adds api key", capturedOptions.headers["x-api-key"], "server-only-secret");
  expectTrue("client api key not forwarded", capturedOptions.headers["x-api-key"] !== "client-should-not-forward");

  const forwardedBody = JSON.parse(capturedOptions.body);
  expectEqual("text preserved", forwardedBody.text, body.text);
  expectEqual("messages preserved", forwardedBody.messages.length, 1);
  expectEqual("conversation_id preserved", forwardedBody.conversation_id, body.conversation_id);
  expectEqual("user_id preserved", forwardedBody.user_id, body.user_id);
  expectEqual("session_context preserved", forwardedBody.session_context.lastQuery, body.session_context.lastQuery);
  expectEqual("future field preserved", forwardedBody.futureField, "preserved");

  const parsed = JSON.parse(result.bodyText);
  expectEqual("status preserved", result.status, 200);
  expectEqual("reply preserved", parsed.reply, "ok");
  expectEqual("prices preserved", parsed.prices.length, 1);
  expectEqual("products preserved", parsed.products.length, 1);
  expectEqual("knowledgeMetadata preserved", parsed.knowledgeMetadata.knowledgeSource, "data_layer");
  expectTrue("mia_debug preserved", parsed.mia_debug?.runtime_precedence?.path === "test");
}

{
  const result = await forwardChatRequestToCore({
    req: { headers: { host: "localhost:3000" } },
    body: { text: "oi" },
    fetchImpl: async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 }),
    env: { API_SHARED_KEY: "server-only-secret" },
  });

  expectEqual("400 status preserved", result.status, 400);
  expectEqual("400 body preserved", JSON.parse(result.bodyText).error, "bad");
}

{
  const result = await forwardChatRequestToCore({
    req: { headers: { host: "localhost:3000" } },
    body: { text: "oi" },
    fetchImpl: async () => {
      throw new Error("network");
    },
    env: { API_SHARED_KEY: "server-only-secret" },
  }).catch((error) => error);

  expectTrue("network errors bubble to caller", result instanceof Error);
}

{
  const result = await forwardChatRequestToCore({
    req: { headers: { host: "localhost:3000" } },
    body: null,
    fetchImpl: async () => new Response("{}", { status: 200 }),
    env: {},
  });

  expectEqual("missing shared key status", result.status, 503);
  expectEqual(
    "missing shared key reason",
    JSON.parse(result.bodyText).reasonCode,
    "perimeter_missing_shared_key"
  );
}

expectEqual("normalize invalid body", JSON.stringify(normalizeProxyRequestBody(null)), "{}");

console.log(`\nMIA chat proxy contract tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
