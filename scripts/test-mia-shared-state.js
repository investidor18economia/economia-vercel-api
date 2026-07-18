/**
 * PATCH 12F — Shared request state validation (serverless isolation).
 */
import {
  bindActiveExternalCallAccounting,
  bindActiveRequestExecutionEnv,
  clearActiveExternalCallAccounting,
  clearActiveRequestExecutionEnv,
  createExternalCallAccounting,
  getActiveExternalCallAccounting,
  getActiveRequestExecutionEnv,
} from "../lib/commercial/externalProviderExecutionPolicy.js";
import { createRuntimeEnforcementContext } from "../lib/miaRuntimeEnforcement.js";
import {
  createInitialSharedRequestState,
  createSharedStateAccessor,
  getSharedRequestIds,
  getSharedRequestState,
  runWithSharedRequestState,
  SHARED_STATE_SCOPE,
  MIA_SHARED_REQUEST_STATE_VERSION,
} from "../lib/miaSharedRequestState.js";
import { initObservabilityContext, runWithObservabilityContext } from "../lib/miaObservabilityContext.js";
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
  expectTrue("version exported", MIA_SHARED_REQUEST_STATE_VERSION === "12F.1");
  expectTrue("scope constants", SHARED_STATE_SCOPE.REQUEST === "request");
}

{
  const state = createInitialSharedRequestState({
    req: {
      body: {
        conversation_id: "conv-1",
        user_id: "user-1",
        session_context: { lastBestProduct: { product_name: "Test" } },
      },
    },
    requestId: "req-abc",
    correlationId: "corr-xyz",
    resolveRequestRuntimeExecutionEnv: () => ({ MIA_TEST_MODE: "true" }),
  });
  expectTrue("requestId preserved", state.requestId === "req-abc");
  expectTrue("correlationId preserved", state.correlationId === "corr-xyz");
  expectTrue("conversation scoped", state.conversationContext.conversationId === "conv-1");
  expectTrue("session inbound captured", state.sessionContextInbound?.lastBestProduct?.product_name === "Test");
  expectTrue("test env resolved", state.runtimeExecutionEnv.env.MIA_TEST_MODE === "true");
}

{
  const fallback = { ctx: null, counter: 0 };
  const accessor = createSharedStateAccessor("semanticGovernance", fallback);

  accessor.counter = 7;
  expectTrue("fallback write without ALS", fallback.counter === 7);

  const state = createInitialSharedRequestState({});
  state.semanticGovernance = { ctx: { id: 1 }, counter: 99 };

  runWithSharedRequestState(state, () => {
    expectTrue("ALS read", accessor.counter === 99);
    accessor.counter = 42;
    expectTrue("ALS write", state.semanticGovernance.counter === 42);
  });

  expectTrue("fallback unchanged after ALS", fallback.counter === 7);
}

{
  const fallbackEnforcement = createRuntimeEnforcementContext();
  const accessor = createSharedStateAccessor("runtimeEnforcement", fallbackEnforcement);

  await Promise.all([
    runWithSharedRequestState(
      {
        ...createInitialSharedRequestState({ requestId: "req-a" }),
        runtimeEnforcement: createRuntimeEnforcementContext(),
      },
      async () => {
        accessor.httpSendCount = 1;
        bindActiveRequestExecutionEnv({ REQ: "A" });
        bindActiveExternalCallAccounting(accessor);
        await new Promise((resolve) => setTimeout(resolve, 25));
        expectTrue("parallel A env", getActiveRequestExecutionEnv().REQ === "A");
        expectTrue(
          "parallel A accounting isolated",
          getActiveExternalCallAccounting() === accessor.externalCallAccounting
        );
        expectTrue("parallel A send count", accessor.httpSendCount === 1);
      }
    ),
    runWithSharedRequestState(
      {
        ...createInitialSharedRequestState({ requestId: "req-b" }),
        runtimeEnforcement: createRuntimeEnforcementContext(),
      },
      async () => {
        accessor.httpSendCount = 2;
        bindActiveRequestExecutionEnv({ REQ: "B" });
        bindActiveExternalCallAccounting(accessor);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expectTrue("parallel B env", getActiveRequestExecutionEnv().REQ === "B");
        expectTrue(
          "parallel B accounting isolated",
          getActiveExternalCallAccounting() === accessor.externalCallAccounting
        );
        expectTrue("parallel B send count", accessor.httpSendCount === 2);
      }
    ),
  ]);
}

{
  const observability = initObservabilityContext(
    { headers: { "x-request-id": "req-obs", "x-correlation-id": "corr-obs" } },
    { endpoint: "/api/chat-gpt4o" }
  );
  const shared = createInitialSharedRequestState({
    req: { body: {} },
    requestId: observability.requestId,
    correlationId: observability.correlationId,
  });

  runWithObservabilityContext(observability, () => {
    runWithSharedRequestState(shared, () => {
      const ids = getSharedRequestIds();
      expectTrue("observability requestId aligned", ids.requestId === "req-obs");
      expectTrue("observability correlationId aligned", ids.correlationId === "corr-obs");
    });
  });
}

{
  const state = createInitialSharedRequestState({ req: { body: {} } });
  state.runtimeEnforcement = createRuntimeEnforcementContext();

  runWithSharedRequestState(state, () => {
    bindActiveRequestExecutionEnv({ REQ: "scoped" });
    bindActiveExternalCallAccounting(state.runtimeEnforcement);
    expectTrue("scoped store present", getSharedRequestState() === state);
    clearActiveRequestExecutionEnv();
    clearActiveExternalCallAccounting();
    expectTrue("scoped env cleared", state.activeRequestExecutionEnv === null);
    expectTrue("scoped accounting cleared", state.activeExternalCallAccounting === null);
  });
}

{
  const chatSrc = read("pages/api/chat-gpt4o.js");
  expectTrue("chat uses shared state ALS", chatSrc.includes("runWithSharedRequestState"));
  expectTrue("chat uses shared state accessor", chatSrc.includes("createSharedStateAccessor"));
  expectTrue("chat binds observability ids", chatSrc.includes("getObservabilityContext"));
  expectTrue("chat removes module Object.assign reset", !chatSrc.includes("Object.assign(runtimeEnforcementRef, createRuntimeEnforcementContext())"));
}

{
  const policySrc = read("lib/commercial/externalProviderExecutionPolicy.js");
  expectTrue("policy uses shared ALS", policySrc.includes("getSharedRequestState"));
}

{
  const dedupSrc = read("lib/commercial/commercialRequestDeduplication.js");
  expectTrue("commercial dedup uses ALS", dedupSrc.includes("AsyncLocalStorage"));
}

{
  const rateLimitSrc = read("lib/miaPerimeterRateLimit.js");
  expectTrue("rate limit documented application scope", rateLimitSrc.includes("application-scoped"));
}

console.log(`\nPATCH 12F shared state: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
