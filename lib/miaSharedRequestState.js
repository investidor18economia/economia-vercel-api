/**
 * PATCH 12F — Request-scoped shared state (serverless-safe).
 *
 * Centralizes per-request mutable state via AsyncLocalStorage so concurrent
 * warm invocations do not bleed runtime enforcement, semantic governance,
 * or provider execution env across requests.
 */

import { AsyncLocalStorage } from "async_hooks";

export const MIA_SHARED_REQUEST_STATE_VERSION = "12F.1";

export const SHARED_STATE_SCOPE = Object.freeze({
  REQUEST: "request",
  CONVERSATION: "conversation",
  APPLICATION: "application",
  PERSISTENT: "persistent",
});

export const miaSharedRequestStorage = new AsyncLocalStorage();

function cleanId(value = "") {
  const text = String(value || "").trim();
  return text.length > 0 ? text.slice(0, 128) : null;
}

/**
 * @param {object} input
 * @param {import("http").IncomingMessage} [input.req]
 * @param {string|null} [input.requestId]
 * @param {string|null} [input.correlationId]
 * @param {(req: object) => Record<string, string|undefined>} [input.resolveRequestRuntimeExecutionEnv]
 */
export function createInitialSharedRequestState({
  req = {},
  requestId = null,
  correlationId = null,
  resolveRequestRuntimeExecutionEnv = null,
} = {}) {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const env =
    typeof resolveRequestRuntimeExecutionEnv === "function"
      ? resolveRequestRuntimeExecutionEnv(req)
      : process.env;

  return {
    version: MIA_SHARED_REQUEST_STATE_VERSION,
    requestId: cleanId(requestId),
    correlationId: cleanId(correlationId),
    runtimeExecutionEnv: { env },
    semanticGovernance: {
      ctx: null,
      finalRoutingDecision: null,
      commercialEntryGate: null,
      legacyIntentSignal: null,
    },
    runtimeEnforcement: null,
    activeRequestExecutionEnv: null,
    activeExternalCallAccounting: null,
    conversationContext: {
      conversationId: cleanId(body.conversation_id || body.conversationId),
      userId: cleanId(body.user_id || body.userId),
    },
    sessionContextInbound:
      body.session_context && typeof body.session_context === "object" && !Array.isArray(body.session_context)
        ? body.session_context
        : null,
    analyticsContext: {
      endpoint: "/api/chat-gpt4o",
    },
    providerContext: {
      bound: false,
    },
    cacheContext: {
      requestScopedOnly: true,
    },
    commercialContext: {
      dedupRequestId: cleanId(requestId),
    },
    oauthContext: null,
  };
}

export function getSharedRequestState() {
  return miaSharedRequestStorage.getStore() || null;
}

export function runWithSharedRequestState(state, fn) {
  return miaSharedRequestStorage.run(state, fn);
}

/**
 * Proxy that delegates get/set to the active ALS bucket when present.
 * Keeps stable module-level identities in chat-gpt4o without per-request refactors.
 *
 * @template T extends object
 * @param {string} stateKey
 * @param {T} fallbackRef
 * @returns {T}
 */
export function createSharedStateAccessor(stateKey, fallbackRef) {
  const target = {};

  return new Proxy(target, {
    get(_target, prop, receiver) {
      const store = getSharedRequestState();
      const bucket = store?.[stateKey];
      if (bucket != null) {
        return bucket[prop];
      }
      return Reflect.get(fallbackRef, prop, receiver);
    },
    set(_target, prop, value) {
      const store = getSharedRequestState();
      const bucket = store?.[stateKey];
      if (bucket != null) {
        bucket[prop] = value;
        return true;
      }
      fallbackRef[prop] = value;
      return true;
    },
  });
}

/**
 * @param {ReturnType<typeof createInitialSharedRequestState>} state
 * @param {object} runtimeEnforcement
 */
export function bindSharedRuntimeEnforcement(state, runtimeEnforcement) {
  if (!state) return runtimeEnforcement;
  state.runtimeEnforcement = runtimeEnforcement;
  state.providerContext.bound = true;
  return runtimeEnforcement;
}

/**
 * @param {ReturnType<typeof createInitialSharedRequestState>} state
 * @param {Record<string, string|undefined>|null} env
 */
export function bindSharedRequestExecutionEnv(state, env = null) {
  if (!state) return env;
  state.activeRequestExecutionEnv = env || null;
  if (state.runtimeExecutionEnv) {
    state.runtimeExecutionEnv.env = env || state.runtimeExecutionEnv.env;
  }
  return state.activeRequestExecutionEnv;
}

/**
 * @param {ReturnType<typeof createInitialSharedRequestState>} state
 * @param {object|null} enforcementCtx
 */
export function bindSharedExternalCallAccounting(state, enforcementCtx = null) {
  if (!state) return null;
  state.activeExternalCallAccounting =
    enforcementCtx?.externalCallAccounting ||
    enforcementCtx?.providerAccounting?.externalCallAccounting ||
    null;
  return state.activeExternalCallAccounting;
}

export function clearSharedRequestExecutionEnv(state) {
  if (!state) return;
  state.activeRequestExecutionEnv = null;
}

export function clearSharedExternalCallAccounting(state) {
  if (!state) return;
  state.activeExternalCallAccounting = null;
}

export function getSharedRequestExecutionEnv() {
  const state = getSharedRequestState();
  if (state?.activeRequestExecutionEnv) return state.activeRequestExecutionEnv;
  return null;
}

export function getSharedExternalCallAccounting() {
  const state = getSharedRequestState();
  return state?.activeExternalCallAccounting || null;
}

export function getSharedRequestIds() {
  const state = getSharedRequestState();
  return {
    requestId: state?.requestId || null,
    correlationId: state?.correlationId || null,
  };
}
