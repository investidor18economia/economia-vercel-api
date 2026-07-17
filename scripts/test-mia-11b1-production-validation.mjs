/**
 * PATCH 11B.1 — Commercial Follow-up Continuity (Production API + Playwright UI)
 * Never logs secrets. Reads API_SHARED_KEY from .env.local only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROD_API = "https://economia-ai.vercel.app/api/chat-gpt4o";
const PROD_UI = "https://economia-ai.vercel.app/app-mia";

function loadEnvKey() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return process.env.API_SHARED_KEY || null;
  const raw = fs.readFileSync(envPath, "utf8");
  const match = raw.match(/^API_SHARED_KEY=(.+)$/m);
  return (match?.[1] || process.env.API_SHARED_KEY || "").trim() || null;
}

const API_KEY = loadEnvKey();
if (!API_KEY) {
  console.error("ERROR: API_SHARED_KEY missing (.env.local or env)");
  process.exit(1);
}

const GENERIC_SOCIAL = /^(pois [eé]|entendi|legal|ok|tudo bem|certo)\.?$/i;

function metrics(data, status) {
  const en = data?.mia_debug?.runtime_enforcement || {};
  const ext = en.externalCallAccounting || {};
  const ir = data?.mia_debug?.intent_recognition || {};
  const reply = (data?.reply || "").trim();
  return {
    http200: status === 200,
    reply,
    replyLen: reply.length,
    replyGenericSocial: GENERIC_SOCIAL.test(reply),
    hasPriceSignal: /\bR\$\s*[\d.,]+|\bpre[cç]o\b|\bvalor\b|\bcusta\b/i.test(reply),
    hasProductSignal: Boolean(data?.session_context?.lastBestProduct?.product_name),
    pricesCount: Array.isArray(data?.prices) ? data.prices.length : 0,
    interactionMode: ir.interactionMode || null,
    commercialPermission: data?.mia_debug?.intent_authority?.commercialPermission || null,
    enforcementVersion: en.version || null,
    httpSendCount: en.httpSendCount || 0,
    providerExecuted: en.providerExecutedCount || 0,
    paidExternalExecuted: ext.paidExternalCallExecutedCount || 0,
    sessionHasAnchor: Boolean(data?.session_context?.lastBestProduct?.product_name),
    sessionHasRanking: Array.isArray(data?.session_context?.lastRankingSnapshot) && data.session_context.lastRankingSnapshot.length >= 2,
  };
}

async function apiCall(text, { conversationId, sessionContext = {}, userId = "11b1-prod" } = {}) {
  const started = Date.now();
  const resp = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      user_id: userId,
      conversation_id: conversationId,
      messages: [],
      session_context: sessionContext,
    }),
  });
  const data = await resp.json();
  return { status: resp.status, data, ms: Date.now() - started, m: metrics(data, resp.status) };
}

const results = [];
function record(name, pass, detail = {}) {
  results.push({ name, pass, ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}`, JSON.stringify(detail));
}

function followUpLooksCommercial(m, { requirePrice = false } = {}) {
  if (!m.http200 || m.replyLen < 12) return false;
  if (m.replyGenericSocial) return false;
  if (requirePrice && !m.hasPriceSignal) return false;
  return m.interactionMode === "COMMERCE" || m.hasPriceSignal || m.pricesCount > 0 || m.replyLen > 30;
}

console.log("\nPATCH 11B.1 — Production Validation\n");

// --- Main 6-turn scenario ---
const convMain = `11b1-main-${Date.now()}`;
let ctxMain = {};

const r1 = await apiCall("qual celular você recomenda até 2500 reais?", { conversationId: convMain });
ctxMain = r1.data?.session_context || ctxMain;
record("Main T1 recommendation", r1.m.http200 && r1.m.replyLen > 40 && r1.m.sessionHasAnchor, {
  ms: r1.ms,
  anchor: ctxMain?.lastBestProduct?.product_name || null,
  rankingLen: ctxMain?.lastRankingSnapshot?.length || 0,
  enforcementVersion: r1.m.enforcementVersion,
});

const r2 = await apiCall("e quanto custa?", { conversationId: convMain, sessionContext: ctxMain });
ctxMain = r2.data?.session_context || ctxMain;
record("Main T2 price follow-up", followUpLooksCommercial(r2.m, { requirePrice: true }), {
  ms: r2.ms,
  replySnippet: r2.m.reply.slice(0, 80),
  replyGenericSocial: r2.m.replyGenericSocial,
  interactionMode: r2.m.interactionMode,
  paidExternalExecuted: r2.m.paidExternalExecuted,
});

const r3 = await apiCall("e qual seria a segunda opção?", { conversationId: convMain, sessionContext: ctxMain });
ctxMain = r3.data?.session_context || ctxMain;
record("Main T3 runner-up follow-up", followUpLooksCommercial(r3.m) && !r3.m.replyGenericSocial, {
  ms: r3.ms,
  replySnippet: r3.m.reply.slice(0, 80),
  interactionMode: r3.m.interactionMode,
});

const r4 = await apiCall("e bateria?", { conversationId: convMain, sessionContext: ctxMain });
ctxMain = r4.data?.session_context || ctxMain;
record("Main T4 attribute follow-up", followUpLooksCommercial(r4.m) && !r4.m.replyGenericSocial, {
  ms: r4.ms,
  replySnippet: r4.m.reply.slice(0, 80),
});

const r5 = await apiCall("vale a pena mesmo?", { conversationId: convMain, sessionContext: ctxMain });
ctxMain = r5.data?.session_context || ctxMain;
record("Main T5 justification follow-up", followUpLooksCommercial(r5.m) && !r5.m.replyGenericSocial, {
  ms: r5.ms,
  replySnippet: r5.m.reply.slice(0, 80),
});

const r6 = await apiCall("tem um mais barato?", { conversationId: convMain, sessionContext: ctxMain });
record("Main T6 constraint refinement", r6.m.http200 && !r6.m.replyGenericSocial && r6.m.replyLen > 15, {
  ms: r6.ms,
  replySnippet: r6.m.reply.slice(0, 80),
});

// --- No context follow-ups ---
for (const text of ["e quanto custa?", "e a segunda opção?", "esse vale a pena?"]) {
  const r = await apiCall(text, { conversationId: `11b1-nocontext-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` });
  const ok = r.m.http200 && !r.m.replyGenericSocial && (r.m.interactionMode !== "COMMERCE" || r.m.replyLen < 80);
  record(`No context: "${text}"`, ok, {
    interactionMode: r.m.interactionMode,
    replySnippet: r.m.reply.slice(0, 60),
    providerExecuted: r.m.providerExecuted,
  });
}

// --- 11B regression ---
for (const text of ["acho esse Galaxy bonito", "estou cansado de pesquisar celular", "meu celular está velho"]) {
  const r = await apiCall(text, { conversationId: `11b1-reg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` });
  record(`11B regression: "${text.slice(0, 35)}"`, r.m.http200 && r.m.paidExternalExecuted === 0 && r.m.pricesCount === 0, {
    interactionMode: r.m.interactionMode,
    paidExternalExecuted: r.m.paidExternalExecuted,
  });
}

// --- Topic switch ---
const convTopic = `11b1-topic-${Date.now()}`;
let ctxTopic = {};
const rt1 = await apiCall("qual celular até 2500?", { conversationId: convTopic });
ctxTopic = rt1.data?.session_context || ctxTopic;
const rt2 = await apiCall("mudando de assunto, como você está?", { conversationId: convTopic, sessionContext: ctxTopic });
record("Topic switch after commercial", rt2.m.http200 && !rt2.m.replyGenericSocial, {
  interactionMode: rt2.m.interactionMode,
  replySnippet: rt2.m.reply.slice(0, 60),
});

// --- Concurrency isolation ---
const convA = `11b1-conc-a-${Date.now()}`;
const convB = `11b1-conc-b-${Date.now()}`;
const ra1 = await apiCall("qual Galaxy você recomenda?", { conversationId: convA, userId: "conc-a" });
const rb1 = await apiCall("qual iPhone você recomenda?", { conversationId: convB, userId: "conc-b" });
const ra2 = await apiCall("e quanto custa?", { conversationId: convA, userId: "conc-a", sessionContext: ra1.data?.session_context || {} });
const rb2 = await apiCall("e bateria?", { conversationId: convB, userId: "conc-b", sessionContext: rb1.data?.session_context || {} });
const anchorA = ra1.data?.session_context?.lastBestProduct?.product_name || "";
const anchorB = rb1.data?.session_context?.lastBestProduct?.product_name || "";
record("Concurrency A price follow-up", followUpLooksCommercial(ra2.m) && !ra2.m.replyGenericSocial, {
  anchorA,
  replySnippet: ra2.m.reply.slice(0, 60),
});
record("Concurrency B attribute follow-up", followUpLooksCommercial(rb2.m) && !rb2.m.replyGenericSocial, {
  anchorB,
  replySnippet: rb2.m.reply.slice(0, 60),
});

// --- Playwright UI multi-turn ---
let uiRan = false;
try {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(PROD_UI, { waitUntil: "networkidle", timeout: 60000 });

  async function uiTurn(text) {
    const input = page.locator(".mia-input");
    await input.waitFor({ state: "visible", timeout: 20000 });
    await input.fill(text);
    const respP = page.waitForResponse(
      (r) => r.url().includes("/api/chat-gpt4o") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".send-btn").click();
    const resp = await respP;
    const data = await resp.json();
    const reply = (data?.reply || "").trim();
    return {
      status: resp.status(),
      reply,
      replyGenericSocial: GENERIC_SOCIAL.test(reply),
      replyLen: reply.length,
      hasPriceSignal: /\bR\$\s*[\d.,]+|\bpre[cç]o\b/i.test(reply),
      interactionMode: data?.mia_debug?.intent_recognition?.interactionMode || null,
    };
  }

  const ui1 = await uiTurn("qual celular você recomenda até 2500 reais?");
  record("UI T1 recommendation", ui1.status === 200 && ui1.replyLen > 40, { replyLen: ui1.replyLen });

  const ui2 = await uiTurn("e quanto custa?");
  record("UI T2 price follow-up", ui2.status === 200 && !ui2.replyGenericSocial && (ui2.hasPriceSignal || ui2.replyLen > 30), {
    replySnippet: ui2.reply.slice(0, 80),
    replyGenericSocial: ui2.replyGenericSocial,
  });

  const ui3 = await uiTurn("e qual seria a segunda opção?");
  record("UI T3 runner-up", ui3.status === 200 && !ui3.replyGenericSocial && ui3.replyLen > 20, {
    replySnippet: ui3.reply.slice(0, 80),
  });

  await browser.close();
  uiRan = true;
} catch (err) {
  console.log("UI skip:", err.message);
}

const failed = results.filter((r) => !r.pass);
console.log("\n=== SUMMARY ===");
console.log(
  JSON.stringify(
    {
      patch: "11B.1",
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      uiRan,
      enforcementVersion: r1.m.enforcementVersion,
      failedTests: failed.map((f) => f.name),
    },
    null,
    2
  )
);

if (failed.length) process.exit(1);
