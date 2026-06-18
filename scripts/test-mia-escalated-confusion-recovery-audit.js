/**
 * PATCH 8.5C — Escalated Confusion Recovery Precedence Audit
 *
 * Usage:
 *   node scripts/test-mia-escalated-confusion-recovery-audit.js
 *   $env:MIA_HTTP_AUDIT="1"; $env:MIA_API_BASE="http://localhost:3001"; node scripts/test-mia-escalated-confusion-recovery-audit.js
 */

import { spawnSync } from "node:child_process";
import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import {
  detectsEscalatedUserConfusionSignal,
  detectsEscalatedUserConfusionDiscourse,
} from "../lib/miaEscalatedConfusionSignals.js";
import {
  detectsExplanationBreakdownSignal,
  buildUserConfusionRecoveryReply,
} from "../lib/miaUserConfusionRecoveryLayer.js";
import { detectsReasoningBreakdownSignal } from "../lib/miaContradictionRecoveryLayer.js";
import { mergeDiscussionSetIntoSessionContext } from "../lib/miaDiscussionSetEnforcement.js";

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
  "test-mia-legitimate-search-reset-guard-audit.js",
  "test-mia-decision-consistency-validation.js",
  "test-mia-real-conversation-simulation-audit.js",
];

const ANCHOR = { product_name: "iPhone 13", price: "R$ 1.950", source: "search" };
const BETA = { product_name: "Samsung Galaxy A35 5G", price: "R$ 1.700", source: "discussion_set" };
const CATALOG = [ANCHOR, BETA, { product_name: "Monitor Gamma 27", price: "R$ 1.800", source: "search" }];

const SESSION_COMPARISON = mergeDiscussionSetIntoSessionContext(
  {
    lastBestProduct: ANCHOR,
    lastProducts: CATALOG,
    lastAxis: "value",
    lastMainConsequence: "melhor retorno pelo investimento no uso diário",
    comparisonContextLocked: true,
  },
  {
    anchorProduct: ANCHOR,
    query: "estou em duvida entre esse e outro",
    rememberedProducts: CATALOG,
    preserveExisting: false,
  }
);

const SESSION_SIMPLE = {
  lastBestProduct: ANCHOR,
  lastProducts: [ANCHOR],
  lastAxis: "camera",
  lastMainConsequence: "fotos mais consistentes no dia a dia",
};

const STATIC_VARIANTS = [
  { label: "formal", query: "perdi o raciocínio" },
  { label: "informal", query: "agora fiquei perdido" },
  { label: "curta", query: "pera" },
  { label: "incompleta", query: "não tô acompanhando" },
  { label: "typo", query: "to perdid" },
  { label: "regional", query: "me embolei aqui" },
  { label: "leigo", query: "não sei mais qual escolher" },
  { label: "apressado", query: "resume aí" },
  { label: "colloquial", query: "buguei" },
  { label: "colloquial2", query: "me perdi" },
];

const FALSE_POSITIVES = [
  "qual dos dois?",
  "compensa?",
  "e a bateria?",
  "ainda vale?",
  "você recomenda?",
  "tem outra opção?",
  "começa de novo",
  "procura notebook",
];

const HTTP_SCENARIOS = [
  {
    id: "A",
    name: "Após comparação",
    turns: ["celular ate 2000", "estou em duvida entre esse e outro", "agora fiquei perdido"],
    assertRecoveryTurn: 3,
  },
  {
    id: "B",
    name: "Após mudança legítima",
    turns: ["celular ate 2000", "quero gastar o minimo possivel", "agora fiquei perdido"],
    assertRecoveryTurn: 3,
  },
  {
    id: "C",
    name: "Após contradiction recovery",
    turns: ["celular ate 2000", "voce me confundiu", "agora fiquei perdido"],
    assertRecoveryTurn: 3,
  },
  {
    id: "D",
    name: "Após comprehension recovery",
    turns: ["celular ate 2000", "nao entendi", "agora fiquei perdido"],
    assertRecoveryTurn: 3,
  },
  {
    id: "E",
    name: "Busca simples",
    turns: ["celular ate 2000", "agora fiquei perdido"],
    assertRecoveryTurn: 2,
  },
];

const RECOVERY_PATHS = new Set([
  "user_confusion_recovery_simplify",
  "contradiction_recovery_reorganize",
]);

function normalizeText(s = "") {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function looksLikeRecoveryReply(reply = "") {
  const t = normalizeText(reply);
  return (
    /\bvamos simplificar\b/.test(t) ||
    /\bvamos organizar\b/.test(t) ||
    /\brecomendacao (principal|atual)\b/.test(t) ||
    /\bcontinuo recomendando\b/.test(t)
  );
}

async function callHttp(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-8-5c",
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
  const conversationId = `audit-85c-${scenario.id}-${Date.now()}`;
  const turns = [];
  let ok = true;
  const failures = [];

  for (let i = 0; i < scenario.turns.length; i++) {
    const query = scenario.turns[i];
    const turn = i + 1;
    const { status, data } = await callHttp(query, sessionContext, messages, conversationId);
    const trace = data.mia_debug?.pipelineTrace || {};
    const responsePath = trace.response_path || trace.responsePath || null;
    const report = {
      turn,
      query,
      status,
      responsePath,
      winnerAfter: data.session_context?.lastBestProduct?.product_name || null,
      recoveryReply: looksLikeRecoveryReply(data.reply),
    };
    turns.push(report);

    if (turn === scenario.assertRecoveryTurn) {
      const isRecoveryPath =
        responsePath === "user_confusion_recovery_simplify" ||
        (responsePath === "contradiction_recovery_reorganize" && /voce me confundiu/i.test(scenario.turns[1] || ""));
      if (!isRecoveryPath && !looksLikeRecoveryReply(data.reply)) {
        ok = false;
        failures.push(`T${turn}: esperado recovery, got ${responsePath}`);
      }
      if (!looksLikeRecoveryReply(data.reply)) {
        ok = false;
        failures.push(`T${turn}: resposta não parece recovery`);
      }
      if (!data.session_context?.lastBestProduct?.product_name) {
        ok = false;
        failures.push(`T${turn}: winner perdido após recovery`);
      }
    }

    sessionContext = data.session_context || sessionContext;
    messages = [...messages, { role: "user", content: query }, { role: "assistant", content: data.reply || "" }];
  }

  return { scenario, turns, ok, failures };
}

function runStaticAudit() {
  const opts = { hasActiveAnchor: true, sessionContext: SESSION_SIMPLE };
  const variantResults = STATIC_VARIANTS.map((v) => {
    const detected =
      detectsEscalatedUserConfusionSignal(v.query, opts) &&
      detectsExplanationBreakdownSignal(v.query, opts);
    return { ...v, detected };
  });

  const fpResults = FALSE_POSITIVES.map((q) => ({
    query: q,
    blocked: !detectsEscalatedUserConfusionDiscourse(q),
  }));

  const precedence =
    detectsExplanationBreakdownSignal("agora fiquei perdido", {
      hasActiveAnchor: true,
      sessionContext: SESSION_COMPARISON,
    }) &&
    !detectsReasoningBreakdownSignal("agora fiquei perdido", {
      hasActiveAnchor: true,
      sessionContext: SESSION_COMPARISON,
    });

  const reply = buildUserConfusionRecoveryReply({
    sessionContext: SESSION_COMPARISON,
    allowedProducts: [ANCHOR, BETA],
    explanationCtx: { lastConsequence: SESSION_COMPARISON.lastMainConsequence },
    query: "agora fiquei perdido",
  });

  const replyOk = /vamos simplificar/i.test(reply) && reply.includes(ANCHOR.product_name);

  return {
    variants: variantResults,
    variantsPass: variantResults.filter((r) => r.detected).length,
    fpResults,
    fpPass: fpResults.filter((r) => r.blocked).length,
    precedence,
    replyOk,
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
          script.includes("legitimate-search-reset") ||
          script.includes("validation") ||
          script.includes("simulation")
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
  console.log("\nPATCH 8.5C — Escalated Confusion Recovery Precedence Audit\n");

  const staticAudit = runStaticAudit();
  console.log("── Estático: variantes escaladas ──");
  for (const r of staticAudit.variants) {
    console.log(`  ${r.detected ? "✓" : "✗"} [${r.label}] ${r.query}`);
  }
  console.log(`  ${staticAudit.variantsPass}/${staticAudit.variants.length}\n`);

  console.log("── Estático: falsos positivos ──");
  for (const r of staticAudit.fpResults) {
    console.log(`  ${r.blocked ? "✓" : "✗"} ${r.query}`);
  }
  console.log(`  ${staticAudit.fpPass}/${staticAudit.fpResults.length}\n`);

  console.log(`── Precedência 8.5C sobre 8.3F: ${staticAudit.precedence ? "✓" : "✗"} ──`);
  console.log(`── Reply recovery template: ${staticAudit.replyOk ? "✓" : "✗"} ──\n`);

  let httpResults = [];
  if (HTTP_ENABLED) {
    console.log("── HTTP: cenários A–E ──\n");
    for (const scenario of HTTP_SCENARIOS) {
      const result = await runHttpScenario(scenario);
      httpResults.push(result);
      console.log(`  ${result.ok ? "✓" : "✗"} Grupo ${scenario.id} — ${scenario.name}`);
      for (const t of result.turns) {
        console.log(
          `     T${t.turn} path=${t.responsePath || "—"} winner=${t.winnerAfter || "—"} recoveryReply=${t.recoveryReply}`
        );
      }
      if (result.failures.length) console.log(`     failures: ${result.failures.join("; ")}`);
    }
    console.log("");
  }

  console.log("── Regressão 8.3A–8.5B ──\n");
  const prior = runPriorAudits();
  for (const r of prior) {
    console.log(`  ${r.passed ? "✓" : "✗"} ${r.script}`);
  }
  const priorPass = prior.filter((r) => r.passed).length;

  const staticOk =
    staticAudit.variantsPass === staticAudit.variants.length &&
    staticAudit.fpPass === staticAudit.fpResults.length &&
    staticAudit.precedence &&
    staticAudit.replyOk;
  const httpOk = !HTTP_ENABLED || httpResults.every((r) => r.ok);
  const priorOk = priorPass === prior.length;

  const verdict =
    staticOk && httpOk && priorOk ? "A) ROBUST" : staticOk && priorOk ? "B) PARTIAL" : "C) FAIL";

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log(`VEREDITO 8.5C: ${verdict}`);
  if (HTTP_ENABLED) console.log(`HTTP: ${httpResults.filter((r) => r.ok).length}/${httpResults.length} cenários`);
  console.log(`Regressão: ${priorPass}/${prior.length}`);
  console.log("════════════════════════════════════════════════════════════════\n");

  process.exit(verdict === "C) FAIL" ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
