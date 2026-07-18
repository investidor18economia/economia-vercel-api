/**
 * PATCH 12D — Open endpoint lockdown inventory + policy tests (no paid providers).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ENDPOINT_REASON_CODES,
  gateLegacyEconomiaEndpoint,
  isDevRouteEnabled,
  requireAdminAuthorization,
  requireCronAuthorization,
  requireInternalApiKey,
  validateHttpMethod,
} from "../lib/miaEndpointAccessPolicy.js";
import {
  issueUserSessionToken,
  requireUserSession,
  verifyUserSessionToken,
} from "../lib/miaUserSessionToken.js";
import {
  ALLOWED_ANALYTICS_EVENTS,
  validateAnalyticsTrackRequest,
} from "../lib/miaAnalyticsAllowlist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

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

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function listApiEndpoints() {
  const apiRoot = path.join(ROOT, "pages", "api");
  const results = [];

  function walk(currentDir, prefix = "") {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, `${prefix}/${entry.name}`);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;
      const route = `/api${prefix}/${entry.name.replace(/\.js$/, "")}`.replace(/\/index$/, "");
      results.push(route.replace(/\/{2,}/g, "/"));
    }
  }

  walk(apiRoot);
  return results.sort();
}

{
  const endpoints = listApiEndpoints();
  expectTrue("inventory finds mia-chat", endpoints.includes("/api/mia-chat"));
  expectTrue("inventory finds chat-gpt4o", endpoints.includes("/api/chat-gpt4o"));
  expectTrue("inventory finds dev routes", endpoints.some((route) => route.startsWith("/api/dev/")));
  expectTrue("inventory count >= 40", endpoints.length >= 40);
}

{
  expectTrue("dev routes disabled by default", !isDevRouteEnabled({ MIA_DEV_ROUTES_ENABLED: "false" }));
  expectTrue("dev routes enabled explicitly", isDevRouteEnabled({ MIA_DEV_ROUTES_ENABLED: "true" }));
}

{
  const get = validateHttpMethod({ method: "GET" }, ["POST"]);
  expectTrue("GET rejected for POST-only", get.ok === false && get.response.statusCode === 405);
}

{
  const env = { API_SHARED_KEY: "server-secret" };
  const ok = requireInternalApiKey({ headers: { "x-api-key": "server-secret" } }, env);
  const bad = requireInternalApiKey({ headers: {} }, env);
  expectTrue("internal key accepted", ok.ok === true);
  expectTrue("internal key rejected without header", bad.ok === false && bad.response.statusCode === 401);
}

{
  const env = { MIA_CRON_SECRET: "cron-secret" };
  const bad = requireCronAuthorization({ headers: {}, query: {} }, env);
  const ok = requireCronAuthorization(
    { headers: { authorization: "Bearer cron-secret" }, query: {} },
    env
  );
  expectTrue("cron rejected without secret", bad.ok === false);
  expectTrue("cron accepted with bearer", ok.ok === true);
}

{
  const env = { MIA_ADMIN_API_KEY: "admin-secret" };
  const bad = requireAdminAuthorization({ headers: {} }, env);
  const ok = requireAdminAuthorization({ headers: { "x-admin-api-key": "admin-secret" } }, env);
  expectTrue("admin rejected without key", bad.ok === false);
  expectTrue("admin accepted with key", ok.ok === true);
}

{
  const blocked = gateLegacyEconomiaEndpoint({ MIA_LEGACY_ECONOMIA_ENABLED: "false" });
  const allowed = gateLegacyEconomiaEndpoint({ MIA_LEGACY_ECONOMIA_ENABLED: "true" });
  expectTrue("economia blocked by default", blocked.blocked === true && blocked.response.statusCode === 404);
  expectTrue("economia allowed when flagged", allowed.blocked === false);
}

{
  const env = { MIA_USER_SESSION_SECRET: "session-secret" };
  const token = issueUserSessionToken("user-123", env);
  const verified = verifyUserSessionToken(token, env);
  const mismatch = requireUserSession(
    { headers: { authorization: `Bearer ${token}` }, body: { user_id: "other-user" } },
    env,
    "other-user"
  );
  expectTrue("session token issued", typeof token === "string" && token.includes("."));
  expectTrue("session token verified", verified.ok === true && verified.userId === "user-123");
  expectTrue("session mismatch rejected", mismatch.ok === false && mismatch.response.statusCode === 403);
}

{
  const allowed = validateAnalyticsTrackRequest({ event_name: "session_started", metadata: { page: "/app-mia" } });
  const blocked = validateAnalyticsTrackRequest({ event_name: "admin_override_all_metrics" });
  expectTrue("analytics allowlist accepts known event", allowed.ok === true);
  expectTrue("analytics allowlist rejects unknown event", blocked.ok === false);
  expectTrue("analytics events documented", ALLOWED_ANALYTICS_EVENTS.length >= 6);
}

{
  const miaChat = read("pages/api/mia-chat.js");
  const chatGpt = read("pages/api/chat-gpt4o.js");
  const miaTest = read("pages/mia-test.js");
  const miaChatComponent = read("components/MIAChat.jsx");
  const middleware = read("middleware.js");

  expectTrue("frontend uses mia-chat", miaChatComponent.includes('fetch("/api/mia-chat"'));
  expectTrue("frontend does not call chat-gpt4o", !miaChatComponent.includes("/api/chat-gpt4o"));
  expectTrue("frontend does not send x-api-key", !miaChatComponent.includes("x-api-key"));
  expectTrue("chat-gpt4o removes wildcard cors", !chatGpt.includes('Access-Control-Allow-Origin", "*"'));
  expectTrue("mia-test removes hardcoded key", !miaTest.includes("minha_chave_"));
  expectTrue("mia-test uses public proxy", miaTest.includes("/api/mia-chat"));
  expectTrue("middleware blocks dev routes", middleware.includes("MIA_DEV_ROUTES_ENABLED"));
  expectTrue("delete-wish requires session", read("pages/api/delete-wish.js").includes("requireUserSession"));
  expectTrue("create-price-alert requires session", read("pages/api/create-price-alert.js").includes("requireUserSession"));
  expectTrue("check-prices requires cron auth", read("pages/api/check-prices.js").includes("requireCronAuthorization"));
  expectTrue("economia gated", read("pages/api/economia.js").includes("gateLegacyEconomiaEndpoint"));
  expectTrue("public chat preserved", miaChat.includes("sanitizePublicUpstreamResponse"));
}

console.log(`\nOpen endpoint lockdown tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
