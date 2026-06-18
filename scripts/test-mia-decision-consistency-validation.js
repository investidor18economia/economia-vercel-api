/**
 * PATCH 8.4A — Decision Consistency Validation (OBSERVATIONAL ONLY)
 *
 * Valida consistência decisória end-to-end após patches 8.3A–G.
 * NÃO altera comportamento — apenas observa HTTP + heurísticas de percepção.
 *
 * Usage:
 *   node scripts/test-mia-decision-consistency-validation.js
 *   $env:MIA_HTTP_AUDIT="1"; $env:MIA_DEBUG="true"; $env:MIA_API_BASE="http://localhost:3001"; node scripts/test-mia-decision-consistency-validation.js
 */

import { extractMentionedProductFromReply } from "../lib/miaDecisionConsistencyAudit.js";
import { namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";

const API = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API}/api/chat-gpt4o`;
const API_KEY = process.env.MIA_API_KEY || "minha_chave_181199";
const HTTP_ENABLED = process.env.MIA_HTTP_AUDIT === "1" || process.env.MIA_HTTP_AUDIT === "true";

// ─────────────────────────────────────────────────────────────
// Matriz de cenários 8.4A
// ─────────────────────────────────────────────────────────────

const MATRIX = [
  {
    id: "A",
    name: "Busca → Comparacao → Qual dos dois → Nao entendi → Voce me confundiu → Decisao final",
    dimensions: ["winner", "discussion_set", "stability", "comprehension", "contradiction"],
    turns: [
      "celular ate 2000",
      "estou em duvida entre esse e o Galaxy A35",
      "qual dos dois voce indica?",
      "nao entendi.",
      "voce me confundiu.",
      "entao qual voce recomenda afinal?",
    ],
    checkpoints: {
      comprehensionTurn: 4,
      contradictionTurn: 5,
      finalDecisionTurn: 6,
    },
  },
  {
    id: "B",
    name: "Busca → Comparacao → Mudanca orcamento → Troca legitima → Confirmacao",
    dimensions: ["winner", "explicit_change", "stability"],
    turns: [
      "celular ate 2000",
      "estou em duvida entre esse e o Galaxy A35",
      "quero gastar o minimo possivel.",
      "ta certo entao?",
    ],
    checkpoints: {
      explicitChangeTurn: 3,
      confirmationTurn: 4,
    },
  },
  {
    id: "C",
    name: "Busca → Alternativa → Segunda melhor → Comparacao → Recuperacao",
    dimensions: ["winner", "discussion_set", "comprehension"],
    turns: [
      "celular ate 2000",
      "tem outro melhor?",
      "qual ficou em segundo?",
      "compara esse com o mais barato que voce citou",
      "nao saquei.",
    ],
    checkpoints: {
      comprehensionTurn: 5,
    },
  },
  {
    id: "D",
    name: "Conversa longa 15+ turnos — sem perda de contexto",
    dimensions: ["winner", "discussion_set", "stability", "long_context"],
    turns: [
      "celular ate 2000",
      "estou em duvida entre esse e o Galaxy A35",
      "qual dos dois voce indica?",
      "e a bateria?",
      "e a camera?",
      "sera que compensa?",
      "nao quero gastar muito",
      "mas e o custo beneficio?",
      "qual dura mais?",
      "nao entendi.",
      "explica melhor",
      "voce me confundiu.",
      "ok entendi",
      "entao fico com o que voce indicou",
      "tem certeza?",
      "blz valeu",
    ],
    checkpoints: {
      minTurns: 15,
    },
  },
  {
    id: "E",
    name: "Conversa longa 20+ turnos — multiplos follow-ups",
    dimensions: ["winner", "stability", "long_context", "generalization"],
    turns: [
      "celular ate 2000",
      "quero gastar o minimo possivel.",
      "nao entendi",
      "como assim?",
      "voce me confundiu",
      "pera",
      "qual dos dois voce indica?",
      "estou em duvida entre esse e o Galaxy A35",
      "q dos 2 vc indica",
      "nao saquei",
      "explica de outro jeito",
      "agora quero economizar",
      "ta pesado no bolso",
      "minha prioridade mudou",
      "entao qual e afinal",
      "fechou",
      "ok",
      "e a bateria?",
      "compensa?",
      "blz",
      "valeu",
    ],
    checkpoints: {
      minTurns: 20,
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function normalizeText(s = "") {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickName(p) {
  if (!p) return null;
  if (typeof p === "string") return p;
  return p.product_name || p.title || null;
}

function inferDiscussionSet(session = {}) {
  const set = new Set();
  const w = pickName(session.lastBestProduct);
  if (w) set.add(w);
  for (const p of session.lastComparisonProducts || []) {
    const n = pickName(p);
    if (n) set.add(n);
  }
  return [...set];
}

function extractProductMentions(text = "") {
  const r = normalizeText(text);
  const brands = [
    "iphone 13", "iphone 11", "galaxy a35", "galaxy s23", "samsung galaxy a35",
    "smartphone beta", "smartphone alpha", "poco", "moto", "redmi",
  ];
  return brands.filter((b) => r.includes(b));
}

function detectConfusionRecovery(reply = "") {
  const r = normalizeText(reply);
  return (
    /\b(voce tem razao|vamos organizar|organizar o que)\b/.test(r) &&
    /\b(principal|recomendacao|referencia)\b/.test(r)
  );
}

function detectComprehensionRecovery(reply = "") {
  const r = normalizeText(reply);
  return (
    /\b(vamos simplificar|simplificar|em uma frase)\b/.test(r) &&
    /\b(recomendacao principal|continuo recomendando|minha recomendacao)\b/.test(r)
  );
}

function detectExplicitChange(reply = "") {
  const r = normalizeText(reply);
  return (
    /\b(sua prioridade mudou|prioridade mudou)\b/.test(r) &&
    /\b(antes eu estava|agora estou priorizando|agora estou priorizando)\b/.test(r) &&
    /\b(eu recomendo|com as novas prioridades)\b/.test(r)
  );
}

function detectChangeExplanation(reply = "", prev = "", next = "") {
  if (!prev || !next || namesLikelyMatch(prev, next)) return true;
  const r = normalizeText(reply);
  return (
    /\b(antes|anteriormente|mudou|passa a|prioridade|agora|minimo|econom)\b/.test(r) ||
    namesLikelyMatch(extractMentionedProductFromReply(reply) || "", next)
  );
}

function isLegitimateChangeQuery(q = "") {
  return /\b(gastar (o )?minimo|economizar|agora quero economizar|ta pesado no bolso)\b/.test(
    normalizeText(q)
  );
}

async function callHttp(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-8-4a",
      conversation_id: conversationId,
      messages,
      session_context: sessionContext || {},
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) {
    return { status: resp.status, data: { reply: "", session_context: sessionContext, error: true } };
  }
  return { status: resp.status, data: await resp.json() };
}

function evaluateTurn(scenario, turnNum, ctx) {
  const flags = [];
  const q = ctx.query;
  const nq = normalizeText(q);
  const reply = ctx.reply;
  const cp = scenario.checkpoints || {};

  // Discussion set leakage
  if (ctx.discussionBefore.length >= 2 && ctx.mentionedInReply.length > 0) {
    const leak = ctx.mentionedInReply.filter(
      (p) => !ctx.discussionBefore.some((d) => namesLikelyMatch(d, p))
    );
    if (leak.length > 0) {
      flags.push({ type: "SCOPE_LEAK", severity: "high", detail: leak.join(", ") });
    }
  }

  // Winner change
  if (ctx.anchorBefore && ctx.anchorAfter && !namesLikelyMatch(ctx.anchorBefore, ctx.anchorAfter)) {
    if (!detectChangeExplanation(reply, ctx.anchorBefore, ctx.anchorAfter)) {
      flags.push({
        type: "WINNER_CHANGE_UNEXPLAINED",
        severity: "high",
        detail: `${ctx.anchorBefore} → ${ctx.anchorAfter}`,
      });
    }
  }

  // Recovery protocols
  if (cp.comprehensionTurn === turnNum || /\b(nao entendi|nao saquei|explica melhor|como assim)\b/.test(nq)) {
    if (!detectComprehensionRecovery(reply)) {
      flags.push({ type: "COMPREHENSION_RECOVERY_MISS", severity: "medium", detail: q });
    }
  }
  if (cp.contradictionTurn === turnNum || /\bvoce me confundiu\b/.test(nq)) {
    if (!detectConfusionRecovery(reply)) {
      flags.push({ type: "CONTRADICTION_RECOVERY_MISS", severity: "medium", detail: q });
    }
  }
  if (cp.explicitChangeTurn === turnNum || isLegitimateChangeQuery(q)) {
    if (!detectExplicitChange(reply)) {
      flags.push({ type: "EXPLICIT_CHANGE_MISS", severity: "medium", detail: q });
    }
  }

  // Internal DCA divergence — ignore when legitimate explicit change aligned session+reply
  if ((ctx.dca.divergences || []).length > 0) {
    const legitChange =
      isLegitimateChangeQuery(q) &&
      ctx.anchorAfter &&
      namesLikelyMatch(ctx.anchorAfter, ctx.verbalized || "");
    if (!legitChange) {
      flags.push({
        type: "DCA_DIVERGENCE",
        severity: "low",
        detail: ctx.dca.divergences.join(", "),
      });
    }
  }

  // Stability: verbalized vs session when discussion set active
  if (
    ctx.discussionBefore.length >= 2 &&
    ctx.anchorAfter &&
    ctx.verbalized &&
    !namesLikelyMatch(ctx.anchorAfter, ctx.verbalized) &&
    !isLegitimateChangeQuery(q)
  ) {
    flags.push({
      type: "STABILITY_DRIFT",
      severity: "medium",
      detail: `session=${ctx.anchorAfter} verbalized=${ctx.verbalized}`,
    });
  }

  return flags;
}

async function runScenario(scenario) {
  let sessionContext = {};
  let messages = [];
  const conversationId = `audit-84a-${scenario.id}-${Date.now()}`;
  const turnReports = [];
  let initialWinner = null;
  let finalWinner = null;
  let discussionSetEverLocked = false;
  const allFlags = [];

  for (let i = 0; i < scenario.turns.length; i++) {
    const query = scenario.turns[i];
    const turnNum = i + 1;
    const anchorBefore = pickName(sessionContext.lastBestProduct);
    const discussionBefore = inferDiscussionSet(sessionContext);

    if (turnNum === 1) {
      // placeholder
    } else if (!initialWinner && anchorBefore) {
      initialWinner = anchorBefore;
    }

    const { status, data } = await callHttp(query, sessionContext, messages, conversationId);
    const reply = String(data.reply || "");
    const anchorAfter = pickName(data.session_context?.lastBestProduct);
    const verbalized = extractMentionedProductFromReply(reply);
    const mentionedInReply = extractProductMentions(reply);
    const dca = data.mia_debug?.pipelineTrace?.decisionConsistencyAudit || {};
    const responsePath =
      data.mia_debug?.pipelineTrace?.response_path ||
      data.mia_debug?.pipelineTrace?.responsePath ||
      null;

    if (data.session_context?.comparisonContextLocked) discussionSetEverLocked = true;

    const flags = evaluateTurn(scenario, turnNum, {
      query,
      reply,
      anchorBefore,
      anchorAfter,
      discussionBefore,
      mentionedInReply,
      verbalized,
      dca,
    });

    sessionContext = data.session_context || sessionContext;
    messages = [...messages, { role: "user", content: query }, { role: "assistant", content: reply }];
    finalWinner = anchorAfter || finalWinner;

    if (!initialWinner && anchorAfter) initialWinner = anchorAfter;

    turnReports.push({
      turn: turnNum,
      query,
      status,
      anchorBefore,
      anchorAfter,
      discussionBefore,
      discussionAfter: inferDiscussionSet(sessionContext),
      verbalized,
      responsePath,
      flags,
      replyPreview: reply.slice(0, 140),
    });
    allFlags.push(...flags);
  }

  const highFlags = allFlags.filter((f) => f.severity === "high");
  const mediumFlags = allFlags.filter((f) => f.severity === "medium");

  return {
    scenario,
    turnReports,
    summary: {
      turns: scenario.turns.length,
      initialWinner,
      finalWinner,
      winnerChanged: initialWinner && finalWinner && !namesLikelyMatch(initialWinner, finalWinner),
      discussionSetEverLocked,
      totalFlags: allFlags.length,
      highFlags: highFlags.length,
      mediumFlags: mediumFlags.length,
      ok: highFlags.length === 0 && mediumFlags.length === 0,
      partial: highFlags.length === 0 && mediumFlags.length > 0,
    },
    allFlags,
  };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

console.log("\nPATCH 8.4A — Decision Consistency Validation\n");
console.log(`Audit ID: MIA_DECISION_CONSISTENCY_VALIDATION_8_4A`);
console.log(`HTTP: ${HTTP_ENABLED ? "enabled" : "DISABLED — set MIA_HTTP_AUDIT=1"}`);
console.log(`API: ${API_ENDPOINT}\n`);

if (!HTTP_ENABLED) {
  console.log("ERRO: 8.4A requer HTTP real. Execute:");
  console.log('  $env:MIA_HTTP_AUDIT="1"; $env:MIA_DEBUG="true"; $env:MIA_API_BASE="http://localhost:3001"; node scripts/test-mia-decision-consistency-validation.js');
  process.exit(2);
}

const results = [];
for (const scenario of MATRIX) {
  console.log(`\n${"─".repeat(64)}`);
  console.log(`Cenário ${scenario.id} — ${scenario.name}`);
  console.log(`${"─".repeat(64)}`);

  const report = await runScenario(scenario);
  results.push(report);

  for (const t of report.turnReports) {
    const flagStr = t.flags.length ? ` ⚠ ${t.flags.map((f) => f.type).join(", ")}` : " ✓";
    console.log(
      `  T${t.turn} [${t.status}] ${t.query.slice(0, 50)}${t.query.length > 50 ? "…" : ""}`
    );
    console.log(
      `       anchor: ${t.anchorBefore || "—"} → ${t.anchorAfter || "—"} | verbalized: ${t.verbalized || "—"}${flagStr}`
    );
    if (t.flags.length) {
      for (const f of t.flags) console.log(`       ↳ ${f.type}: ${f.detail}`);
    }
  }

  const s = report.summary;
  const verdict = s.ok ? "PASS" : s.partial ? "PARTIAL" : "FAIL";
  console.log(
    `\n  Resumo ${scenario.id}: ${verdict} | turns=${s.turns} winner ${s.initialWinner || "—"} → ${s.finalWinner || "—"} | flags H=${s.highFlags} M=${s.mediumFlags}`
  );
}

const totalHigh = results.reduce((n, r) => n + r.summary.highFlags, 0);
const totalMedium = results.reduce((n, r) => n + r.summary.mediumFlags, 0);
const allPass = results.every((r) => r.summary.ok);
const anyFail = results.some((r) => r.summary.highFlags > 0);

let finalVerdict = "A) ROBUST";
if (anyFail) finalVerdict = "C) FAIL";
else if (totalMedium > 0 || !allPass) finalVerdict = "B) PARTIAL";

console.log(`\n${"═".repeat(64)}`);
console.log("VEREDITO FINAL 8.4A:", finalVerdict);
console.log(`Cenários: ${results.filter((r) => r.summary.ok).length}/${results.length} PASS limpo`);
console.log(`Flags: high=${totalHigh} medium=${totalMedium}`);
console.log(`${"═".repeat(64)}\n`);

process.exit(anyFail ? 1 : 0);
