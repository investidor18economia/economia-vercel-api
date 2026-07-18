/**
 * PATCH 12E — Observability infrastructure tests (no external providers).
 */
import {
  createRequestId,
  createCorrelationId,
  initObservabilityContext,
  runWithObservabilityContext,
} from "../lib/miaObservabilityContext.js";
import { redactLogFields, redactString } from "../lib/miaLogRedaction.js";
import { logInfo, logRequestComplete } from "../lib/miaLogger.js";
import { getMetricsSnapshot, resetMetricsForTests } from "../lib/miaMetrics.js";
import { resolveBuildInfo, MIA_OBSERVABILITY_VERSION } from "../lib/miaBuildInfo.js";
import { getPropagationHeaders } from "../lib/miaObservability.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

{
  const provided = createRequestId("req-existing");
  const generated = createRequestId("");
  expectTrue("accepts x-request-id", provided === "req-existing");
  expectTrue("generates uuid requestId", /^[0-9a-f-]{36}$/i.test(generated));
}

{
  const ctx = initObservabilityContext(
    { headers: { "x-request-id": "req-1", "x-correlation-id": "corr-1" } },
    { endpoint: "/api/mia-chat" }
  );
  expectTrue("correlation preserved", ctx.correlationId === "corr-1");
  expectTrue("requestId preserved", ctx.requestId === "req-1");
  const fallback = createCorrelationId("", "req-abc");
  expectTrue("correlation defaults to requestId", fallback === "req-abc");
}

{
  const redacted = redactString("Bearer abc.def.ghi user@test.com");
  expectTrue("redacts bearer", redacted.includes("Bearer ****"));
  expectTrue("redacts email", !redacted.includes("user@test.com"));
  const obj = redactLogFields({
    authorization: "Bearer secret",
    session_token: "abc",
    reasonCode: "ok",
  });
  expectTrue("redacts sensitive keys", obj.authorization === "[REDACTED]");
  expectTrue("preserves reasonCode", obj.reasonCode === "ok");
}

{
  resetMetricsForTests();
  let captured = null;
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    captured = String(chunk);
    return true;
  };

  runWithObservabilityContext(
    initObservabilityContext({ headers: {} }, { endpoint: "/api/test" }),
    () => {
      logInfo({ event: "unit", reasonCode: "test_ok", status: 200 });
      logRequestComplete({ endpoint: "/api/test", status: 200, durationMs: 12 });
    }
  );

  process.stdout.write = originalWrite;
  expectTrue("structured log emitted", captured && captured.includes('"level":"info"'));
  expectTrue("log has requestId", captured && captured.includes('"requestId"'));
  const metrics = getMetricsSnapshot();
  expectTrue("metrics recorded", metrics.requests >= 1);
}

{
  const headers = runWithObservabilityContext(
    initObservabilityContext({ headers: { "x-request-id": "a", "x-correlation-id": "b" } }, {
      endpoint: "/api/mia-chat",
    }),
    () => getPropagationHeaders()
  );
  expectTrue("propagation headers", headers["x-request-id"] === "a" && headers["x-correlation-id"] === "b");
}

{
  const build = resolveBuildInfo({ VERCEL_GIT_COMMIT_SHA: "abc123", NODE_ENV: "test" });
  expectTrue("build info", build.commit === "abc123" && build.version === MIA_OBSERVABILITY_VERSION);
}

{
  const src = read("pages/api/mia-chat.js");
  expectTrue("mia-chat wrapped", src.includes("withMiaObservability"));
  expectTrue("chat-gpt4o wrapped", read("pages/api/chat-gpt4o.js").includes("withMiaObservability"));
  expectTrue("health endpoint exists", fs.existsSync(path.join(ROOT, "pages/api/health.js")));
  expectTrue("ready endpoint exists", fs.existsSync(path.join(ROOT, "pages/api/ready.js")));
  expectTrue("proxy propagates ids", read("lib/miaPerimeterChatProxy.js").includes("x-correlation-id"));
  expectTrue("logger exists", fs.existsSync(path.join(ROOT, "lib/miaLogger.js")));
}

console.log(`\nObservability tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
