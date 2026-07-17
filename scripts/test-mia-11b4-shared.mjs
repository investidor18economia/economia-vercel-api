/**
 * PATCH 11B.4 / 11B.4.1 — Shared helpers for final conversational validation
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const PROD_API = process.env.MIA_PROD_API || "https://economia-ai.vercel.app/api/chat-gpt4o";
export const PROD_UI = process.env.MIA_PROD_UI || "https://economia-ai.vercel.app/app-mia";

export const GENERIC_ONLY = /^(pois [eé]|entendi|legal|faz sentido|ok|tudo bem|certo)\.?$/i;

export function loadEnvKey() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return process.env.API_SHARED_KEY || null;
  const raw = fs.readFileSync(envPath, "utf8");
  const match = raw.match(/^API_SHARED_KEY=(.+)$/m);
  return (match?.[1] || process.env.API_SHARED_KEY || "").trim() || null;
}

export async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return { resp, durationMs: Date.now() - started, timedOut: false, error: null };
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return { resp: null, durationMs: Date.now() - started, timedOut, error };
  } finally {
    clearTimeout(timer);
  }
}

export function extractMetrics(data, status) {
  const en = data?.mia_debug?.runtime_enforcement || {};
  const ext = en.externalCallAccounting || {};
  const ir = data?.mia_debug?.intent_recognition || {};
  const ia = data?.mia_debug?.intent_authority || {};
  const followUp = ir?.contextualFollowUp || {};
  const cr = followUp?.constraintRefinement || ir?.constraintRefinement || null;
  const reply = (data?.reply || "").trim();
  const sc = data?.session_context || {};
  const lcc = sc?.lastCommercialConstraints || {};
  return {
    http200: status === 200,
    httpStatus: status,
    reply,
    replyLen: reply.length,
    replyGenericOnly: GENERIC_ONLY.test(reply),
    pricesCount: Array.isArray(data?.prices) ? data.prices.length : 0,
    interactionMode: ir.interactionMode || null,
    commercialPermission: ia.commercialPermission || null,
    followUpType: followUp.followUpType || null,
    providerRequired: followUp.providerRequired ?? cr?.providerRequired ?? null,
    paidExternal: ext.paidExternalCallExecutedCount || 0,
    providerExecuted: en.providerExecutedCount || 0,
    httpSendCount: en.httpSendCount ?? null,
    responseSealed: en.responseSealed ?? null,
    postSealMutationDetected: en.postSealMutationDetected ?? null,
    providerAfterSealCount: en.providerAfterSealCount ?? null,
    anchor: sc?.lastBestProduct?.product_name || null,
    budgetMax: sc?.budgetMax ?? lcc?.budgetMax ?? null,
    category: sc?.lastCategory || lcc?.category || null,
    excludedBrands: lcc?.excludedBrands || sc?.excludedBrands || [],
    preferredBrands: lcc?.preferredBrands || sc?.preferredBrands || [],
    desiredAttributes: lcc?.desiredAttributes || [],
    rankingLen: Array.isArray(sc?.lastRankingSnapshot) ? sc.lastRankingSnapshot.length : 0,
    ms: 0,
    parseError: false,
    networkError: null,
    timedOut: false,
  };
}

export class ConversationSession {
  constructor({ conversationId, userId = "11b4-prod" } = {}) {
    this.conversationId = conversationId || `11b4-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.userId = userId;
    this.sessionContext = {};
    this.messages = [];
    this.turns = [];
  }

  async send(apiKey, text, { timeoutMs = 45000 } = {}) {
    const { resp, durationMs, timedOut, error } = await fetchWithTimeout(
      PROD_API,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          text,
          user_id: this.userId,
          conversation_id: this.conversationId,
          messages: this.messages,
          session_context: this.sessionContext,
        }),
      },
      timeoutMs
    );

    if (!resp) {
      const m = extractMetrics({}, null);
      m.ms = durationMs;
      m.timedOut = timedOut;
      m.networkError = error;
      m.http200 = false;
      const turn = { text, data: {}, ...m };
      this.turns.push(turn);
      return { data: {}, ...turn };
    }

    const rawText = await resp.text();
    let data = {};
    let parseError = false;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { reply: "" };
      parseError = true;
    }
    const m = extractMetrics(data, resp.status);
    m.ms = durationMs;
    m.parseError = parseError;
    m.timedOut = timedOut;
    m.networkError = error;
    if (data?.session_context) this.sessionContext = data.session_context;
    const reply = m.reply;
    if (text) this.messages.push({ role: "user", content: text });
    if (reply) this.messages.push({ role: "assistant", content: reply });
    if (this.messages.length > 24) this.messages = this.messages.slice(-24);
    const turn = { text, data, ...m };
    this.turns.push(turn);
    return { data, ...turn };
  }
}

/** @deprecated Use ValidationRunner from test-mia-11b4-observability.mjs */
export function createReporter(label) {
  const results = [];
  function record(name, pass, detail = {}) {
    results.push({ name, pass, patch: label, ...detail });
    console.log(`${pass ? "PASS" : "FAIL"} — ${name}`, JSON.stringify(detail));
  }
  function summary() {
    const passed = results.filter((r) => r.pass).length;
    return { label, total: results.length, passed, failed: results.length - passed, results };
  }
  return { record, summary, results };
}
