/**
 * PATCH 11B.2 — Mixed Intent Segmentation (Production API + Playwright UI)
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
  console.error("API_SHARED_KEY missing");
  process.exit(1);
}

async function apiCall(text, { conversationId, sessionContext = {}, userId = "11b2-prod" } = {}) {
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
  const rawText = await resp.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { reply: "", parseError: true };
  }
  const en = data?.mia_debug?.runtime_enforcement || {};
  const ext = en.externalCallAccounting || {};
  const ir = data?.mia_debug?.intent_recognition || {};
  const reply = (data?.reply || "").trim();
  return {
    status: resp.status,
    ms: Date.now() - started,
    data,
    m: {
      http200: resp.status === 200,
      reply,
      replyLen: reply.length,
      replyGenericSocial: /^(pois [eé]|entendi|legal|ok)\.?$/i.test(reply),
      pricesCount: Array.isArray(data?.prices) ? data.prices.length : 0,
      interactionMode: ir.interactionMode || null,
      commercialPermission: data?.mia_debug?.intent_authority?.commercialPermission || null,
      paidExternal: ext.paidExternalCallExecutedCount || 0,
      providerExecuted: en.providerExecutedCount || 0,
      enforcementVersion: en.version || null,
    },
  };
}

const results = [];
function record(name, pass, detail = {}) {
  results.push({ name, pass, ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}`, JSON.stringify(detail));
}

console.log("\nPATCH 11B.2 — Production Validation\n");

const mixedPositive = [
  {
    name: "frustração + compra",
    text: "estou cansado de pesquisar celular, mas quero comprar um até 2500",
    expectCommercial: true,
  },
  {
    name: "opinião + avaliação",
    text: "acho o iPhone bonito, mas vale a pena comprar?",
    expectCommercial: true,
  },
  {
    name: "rejeição + requisito",
    text: "não gosto de Samsung, mas quero um celular com boa bateria",
    expectCommercial: true,
  },
  {
    name: "medo + recomendação",
    text: "tenho medo de me arrepender, qual celular você recomenda?",
    expectCommercial: true,
  },
];

for (const item of mixedPositive) {
  const r = await apiCall(item.text, { conversationId: `11b2-mixed-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` });
  record(
    `Mixed+: ${item.name}`,
    r.m.http200 && r.m.replyLen > 20 && !r.m.replyGenericSocial && (item.expectCommercial ? r.m.replyLen > 30 : true),
    {
      ms: r.m.ms,
      interactionMode: r.m.interactionMode,
      commercialPermission: r.m.commercialPermission,
      replySnippet: r.m.reply.slice(0, 80),
      paidExternal: r.m.paidExternal,
    }
  );
}

for (const text of [
  "estou cansado de pesquisar celular",
  "acho o Galaxy bonito",
  "meu celular está velho",
  "não gosto de iPhone",
]) {
  const r = await apiCall(text, { conversationId: `11b2-neg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` });
  record(`11B negative: "${text.slice(0, 35)}"`, r.m.http200 && r.m.paidExternal === 0 && r.m.pricesCount === 0, {
    interactionMode: r.m.interactionMode,
    paidExternal: r.m.paidExternal,
  });
}

const rDeny = await apiCall("não quero comprar agora, só estou comentando", {
  conversationId: `11b2-deny-${Date.now()}`,
});
record("Commercial denial", rDeny.m.http200 && rDeny.m.paidExternal === 0, {
  commercialPermission: rDeny.m.commercialPermission,
  paidExternal: rDeny.m.paidExternal,
});

const convFollow = `11b2-follow-${Date.now()}`;
let ctx = {};
const rF1 = await apiCall("qual celular você recomenda até 2500 reais?", { conversationId: convFollow });
ctx = rF1.data?.session_context || ctx;
const rF2 = await apiCall("gostei desse, mas tenho medo da bateria ser ruim", {
  conversationId: convFollow,
  sessionContext: ctx,
});
record("11B.1 follow-up mixed concern", rF2.m.http200 && !rF2.m.replyGenericSocial && rF2.m.replyLen > 20, {
  replySnippet: rF2.m.reply.slice(0, 80),
});

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
    return {
      status: resp.status(),
      reply: (data?.reply || "").trim(),
      replyLen: (data?.reply || "").length,
      interactionMode: data?.mia_debug?.intent_recognition?.interactionMode || null,
    };
  }

  const ui1 = await uiTurn("estou cansado de pesquisar celular, mas quero comprar um até 2500");
  record("UI mixed commercial", ui1.status === 200 && ui1.replyLen > 40, {
    replySnippet: ui1.reply.slice(0, 80),
    interactionMode: ui1.interactionMode,
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
    { patch: "11B.2", total: results.length, passed: results.length - failed.length, failed: failed.length, uiRan, failedTests: failed.map((f) => f.name) },
    null,
    2
  )
);
if (failed.length) process.exit(1);
