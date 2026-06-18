/**
 * PATCH 8.5B — Legitimate Search Reset Guard Audit
 *
 * Usage:
 *   node scripts/test-mia-legitimate-search-reset-guard-audit.js
 *   $env:MIA_HTTP_AUDIT="1"; $env:MIA_API_BASE="http://localhost:3001"; node scripts/test-mia-legitimate-search-reset-guard-audit.js
 */

import { spawnSync } from "node:child_process";
import {
  detectsLegitimateSearchResetIntent,
  detectsLegitimateSearchResetDiscourse,
  isLegitimateSearchResetBlocked,
  hasLegitimateSearchResetCommercialTail,
  buildLegitimateSearchResetSessionContext,
} from "../lib/miaLegitimateSearchResetGuard.js";
import { namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";

const API = process.env.MIA_API_BASE || "http://localhost:3001";
const API_ENDPOINT = `${API}/api/chat-gpt4o`;
const API_KEY = process.env.MIA_API_KEY || "minha_chave_181199";
const HTTP_ENABLED = process.env.MIA_HTTP_AUDIT === "1" || process.env.MIA_HTTP_AUDIT === "true";

const PRIOR_AUDITS = [
  "test-mia-winner-lifecycle-enforcement-audit.js",
  "test-mia-discussion-set-enforcement-audit.js",
  "test-mia-recommendation-stability-guard-audit.js",
  "test-mia-contradiction-recovery-audit.js",
  "test-mia-user-confusion-recovery-audit.js",
  "test-mia-explicit-recommendation-change-audit.js",
  "test-mia-explicit-change-persistence-fix-audit.js",
  "test-mia-post-change-recovery-precedence-audit.js",
  "test-mia-final-decision-scope-guard-audit.js",
  "test-mia-decision-consistency-validation.js",
  "test-mia-real-conversation-simulation-audit.js",
];

const STATIC_VARIANTS = [
  { label: "formal", query: "gostaria de reiniciar a busca" },
  { label: "informal", query: "começa de novo aí" },
  { label: "curta", query: "recomeça" },
  { label: "incompleta", query: "esquece isso" },
  { label: "typo", query: "comeca d novo" },
  { label: "regional", query: "deixa isso pra la" },
  { label: "leigo", query: "vamos procurar outra coisa" },
  { label: "apressado", query: "zera" },
];

const FALSE_POSITIVE_QUERIES = [
  "compensa?",
  "ainda vale?",
  "voce recomenda?",
  "e a bateria?",
  "qual dos dois?",
  "nao entendi",
  "voce me confundiu",
];

const HTTP_SCENARIOS = [
  {
    id: "A",
    name: "Reset explícito",
    turns: ["celular ate 2000", "comeca de novo", "notebook ate 3000"],
    assertResetTurn: 2,
    assertSearchTurn: 3,
  },
  {
    id: "B",
    name: "Reset após comparação",
    turns: [
      "celular ate 2000",
      "estou em duvida entre esse e outro",
      "comeca de novo",
      "monitor ate 1500",
    ],
    assertResetTurn: 3,
    assertSearchTurn: 4,
  },
  {
    id: "C",
    name: "Reset após mudança legítima",
    turns: [
      "celular ate 2000",
      "quero gastar o minimo possivel",
      "comeca de novo",
      "celular ate 2500",
    ],
    assertResetTurn: 3,
    assertSearchTurn: 4,
  },
  {
    id: "D",
    name: "Reset após recovery",
    turns: [
      "celular ate 2000",
      "voce me confundiu",
      "comeca de novo",
      "celular ate 2000",
    ],
    assertResetTurn: 3,
    assertSearchTurn: 4,
  },
  {
    id: "E",
    name: "Nova busca legítima (8.5A J6)",
    turns: [
      "celular ate 2000",
      "estou em duvida entre esse e outro",
      "qual dos dois?",
      "comeca de novo",
      "agora quero notebook ate 3000",
    ],
    assertResetTurn: 4,
    assertSearchTurn: 5,
  },
];

function pickName(p) {
  if (!p) return null;
  if (typeof p === "string") return p;
  return p.product_name || p.title || null;
}

function sessionIsCleared(sc = {}) {
  return (
    !sc.lastBestProduct &&
    (!sc.lastComparisonProducts || sc.lastComparisonProducts.length === 0) &&
    !sc.comparisonContextLocked &&
    !sc.lastDecisionChange &&
    (!sc.lastProducts || sc.lastProducts.length === 0)
  );
}

async function callHttp(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-8-5b",
      conversation_id: conversationId,
      messages,
      session_context: sessionContext || {},
    }),
    signal: AbortSignal.timeout(120000),
  });
  const data = resp.ok ? await resp.json() : { reply: "", session_context: sessionContext };
  return { status: resp.status, data };
}

async function runHttpScenario(scenario) {
  let sessionContext = {};
  let messages = [];
  const conversationId = `audit-85b-${scenario.id}-${Date.now()}`;
  const turns = [];
  let ok = true;
  const failures = [];

  for (let i = 0; i < scenario.turns.length; i++) {
    const query = scenario.turns[i];
    const turn = i + 1;
    const winnerBefore = pickName(sessionContext.lastBestProduct);
    const { status, data } = await callHttp(query, sessionContext, messages, conversationId);
    const trace = data.mia_debug?.pipelineTrace || {};
    const winnerAfter = pickName(data.session_context?.lastBestProduct);
    const responsePath = trace.response_path || trace.responsePath || null;

    const report = {
      turn,
      query,
      status,
      winnerBefore,
      winnerAfter,
      responsePath,
      sessionCleared: sessionIsCleared(data.session_context || {}),
      discussionLocked: !!data.session_context?.comparisonContextLocked,
      hasDecisionChange: !!data.session_context?.lastDecisionChange,
    };
    turns.push(report);

    if (turn === scenario.assertResetTurn) {
      if (!sessionIsCleared(data.session_context || {})) {
        ok = false;
        failures.push(`T${turn}: sessão não limpa após reset`);
      }
      if (winnerAfter && winnerBefore && namesLikelyMatch(winnerAfter, winnerBefore)) {
        ok = false;
        failures.push(`T${turn}: winner anterior preservado após reset`);
      }
      if (responsePath !== "legitimate_search_reset_awaiting_query" && !report.sessionCleared) {
        ok = false;
        failures.push(`T${turn}: path esperado legitimate_search_reset_awaiting_query, got ${responsePath}`);
      }
    }

    if (turn === scenario.assertSearchTurn) {
      if (!winnerAfter) {
        ok = false;
        failures.push(`T${turn}: nova busca sem winner`);
      }
    }

    sessionContext = data.session_context || sessionContext;
    messages = [...messages, { role: "user", content: query }, { role: "assistant", content: data.reply || "" }];
  }

  return { scenario, turns, ok, failures };
}

function runStaticAudit() {
  const results = [];
  let pass = 0;

  for (const v of STATIC_VARIANTS) {
    const detected = detectsLegitimateSearchResetIntent(v.query, { hasActiveAnchor: true });
    const discourse = detectsLegitimateSearchResetDiscourse(v.query);
    const blocked = isLegitimateSearchResetBlocked(v.query);
    const ok = detected && discourse && !blocked;
    results.push({ ...v, detected, discourse, blocked, ok });
    if (ok) pass++;
  }

  const fpResults = [];
  let fpPass = 0;
  for (const q of FALSE_POSITIVE_QUERIES) {
    const detected = detectsLegitimateSearchResetIntent(q, { hasActiveAnchor: true });
    const ok = !detected;
    fpResults.push({ query: q, detected, ok });
    if (ok) fpPass++;
  }

  const cleared = buildLegitimateSearchResetSessionContext({ lastQuery: "test" });
  const clearedOk =
    !cleared.lastBestProduct &&
    cleared.comparisonContextLocked === false &&
    cleared.lastDecisionChange === null;

  const tailOnlyOriginal =
    !hasLegitimateSearchResetCommercialTail("comeca de novo", "celular ate 2000", {
      detectProductCategory: (q) => (/\bcelular\b/i.test(q) ? "phone" : ""),
    }) &&
    hasLegitimateSearchResetCommercialTail("agora quero notebook ate 3000", "celular ate 2000", {
      detectProductCategory: (q) => (/\bnotebook\b/i.test(q) ? "notebook" : ""),
    });

  return {
    variants: results,
    variantsPass: pass,
    variantsTotal: STATIC_VARIANTS.length,
    falsePositives: fpResults,
    fpPass,
    fpTotal: FALSE_POSITIVE_QUERIES.length,
    clearedOk,
    tailOnlyOriginal,
  };
}

function runPriorAudits() {
  const results = [];
  for (const script of PRIOR_AUDITS) {
    const r = spawnSync("node", [`scripts/${script}`], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        MIA_HTTP_AUDIT:
          script.includes("validation") ||
          script.includes("simulation") ||
          script.includes("persistence") ||
          script.includes("post-change") ||
          script.includes("final-decision")
            ? "1"
            : process.env.MIA_HTTP_AUDIT,
        MIA_API_BASE: API,
        MIA_RUN_PRIOR_AUDITS: "0",
      },
      timeout: 600000,
    });
    results.push({ script, passed: r.status === 0 });
  }
  return results;
}

async function main() {
  console.log("\nPATCH 8.5B — Legitimate Search Reset Guard Audit\n");

  const staticAudit = runStaticAudit();
  console.log("── Estático: variantes de reset ──");
  for (const r of staticAudit.variants) {
    console.log(`  ${r.ok ? "✓" : "✗"} [${r.label}] ${r.query}`);
  }
  console.log(`  ${staticAudit.variantsPass}/${staticAudit.variantsTotal} variantes\n`);

  console.log("── Estático: falsos positivos (não reset) ──");
  for (const r of staticAudit.falsePositives) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.query}`);
  }
  console.log(`  ${staticAudit.fpPass}/${staticAudit.fpTotal} bloqueados\n`);

  console.log(`── Session clear template: ${staticAudit.clearedOk ? "✓" : "✗"} ──`);
  console.log(`── Commercial tail só no turno literal: ${staticAudit.tailOnlyOriginal ? "✓" : "✗"} ──\n`);

  let httpResults = [];
  if (HTTP_ENABLED) {
    console.log("── HTTP: cenários A–E ──\n");
    for (const scenario of HTTP_SCENARIOS) {
      const result = await runHttpScenario(scenario);
      httpResults.push(result);
      console.log(`  ${result.ok ? "✓" : "✗"} Grupo ${scenario.id} — ${scenario.name}`);
      for (const t of result.turns) {
        console.log(
          `     T${t.turn} path=${t.responsePath || "—"} winner=${t.winnerAfter || "—"} cleared=${t.sessionCleared}`
        );
      }
      if (result.failures.length) {
        console.log(`     failures: ${result.failures.join("; ")}`);
      }
    }
    console.log("");
  }

  console.log("── Regressão 8.3/8.4 ──\n");
  const prior = runPriorAudits();
  for (const r of prior) {
    console.log(`  ${r.passed ? "✓" : "✗"} ${r.script}`);
  }
  const priorPass = prior.filter((r) => r.passed).length;

  const staticOk =
    staticAudit.variantsPass === staticAudit.variantsTotal &&
    staticAudit.fpPass === staticAudit.fpTotal &&
    staticAudit.clearedOk &&
    staticAudit.tailOnlyOriginal;
  const httpOk = !HTTP_ENABLED || httpResults.every((r) => r.ok);
  const priorOk = priorPass === prior.length;

  const verdict =
    staticOk && httpOk && priorOk ? "A) ROBUST" : staticOk && priorOk ? "B) PARTIAL" : "C) FAIL";

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log(`VEREDITO 8.5B: ${verdict}`);
  if (HTTP_ENABLED) {
    console.log(`HTTP: ${httpResults.filter((r) => r.ok).length}/${httpResults.length} cenários`);
  }
  console.log(`Regressão: ${priorPass}/${prior.length}`);
  console.log("════════════════════════════════════════════════════════════════\n");

  process.exit(verdict === "C) FAIL" ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
