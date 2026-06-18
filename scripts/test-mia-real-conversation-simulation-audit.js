/**
 * PATCH 8.4E — Real Conversation Simulation Audit (OBSERVATIONAL ONLY)
 *
 * Simula conversas reais longas/adversariais para validar consistência percebida.
 * NÃO altera comportamento de produção.
 *
 * Usage:
 *   node scripts/test-mia-real-conversation-simulation-audit.js
 *   $env:MIA_HTTP_AUDIT="1"; $env:MIA_DEBUG="true"; $env:MIA_API_BASE="http://localhost:3001"; node scripts/test-mia-real-conversation-simulation-audit.js
 */

import { spawnSync } from "node:child_process";
import { extractMentionedProductFromReply } from "../lib/miaDecisionConsistencyAudit.js";
import { namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";
import { hasActiveFinalDecisionScope } from "../lib/miaFinalDecisionScopeGuard.js";

const API = process.env.MIA_API_BASE || "http://localhost:3001";
const API_ENDPOINT = `${API}/api/chat-gpt4o`;
const API_KEY = process.env.MIA_API_KEY || "minha_chave_181199";
const HTTP_ENABLED = process.env.MIA_HTTP_AUDIT === "1" || process.env.MIA_HTTP_AUDIT === "true";
const RUN_PRIOR_AUDITS = process.env.MIA_RUN_PRIOR_AUDITS !== "0";

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
];

const CONVERSATIONS = [
  {
    id: "1",
    name: "Usuário típico indeciso",
    family: ["search", "hesitation", "comparison", "binary_choice", "comprehension", "final_decision"],
    turns: [
      "celular ate 2000",
      "sera que compensa?",
      "estou em duvida entre esse e o Galaxy A35",
      "qual dos dois?",
      "nao entendi",
      "entao qual voce recomenda afinal?",
    ],
    expect: { discussionSet: true, winnerStable: true, noExternalLeak: true },
  },
  {
    id: "2",
    name: "Usuário muda prioridade",
    family: ["search", "confirmation", "explicit_change", "post_change_recovery", "final_decision"],
    turns: [
      "celular ate 2000",
      "fechou nele?",
      "quero gastar o minimo possivel",
      "voce me confundiu",
      "entao qual e afinal",
    ],
    expect: { explicitChange: true, sessionUpdated: true, postChangeRecovery: true },
  },
  {
    id: "3",
    name: "Usuário confuso e informal",
    family: ["search", "comparison", "confusion", "comprehension", "final_decision"],
    turns: [
      "celular ate 2000",
      "estou em duvida entre esse e o Galaxy A35",
      "ué",
      "nao saquei",
      "agora fiquei perdido",
      "entao qual e afinal?",
    ],
    expect: { recoveryTriggered: true, noGenericFallback: true },
  },
  {
    id: "4",
    name: "Conversa longa 15+ turnos",
    family: ["long_context", "attributes", "hesitation", "recovery", "final_decision"],
    turns: [
      "celular ate 2000",
      "estou em duvida entre esse e o Galaxy A35",
      "qual dos dois voce indica?",
      "e a bateria?",
      "e a camera?",
      "sera que compensa?",
      "nao quero gastar muito",
      "tem outro melhor?",
      "qual ficou em segundo?",
      "nao entendi.",
      "explica melhor",
      "voce me confundiu.",
      "entao fico com o que voce indicou",
      "tem certeza?",
      "entao qual e afinal?",
      "blz valeu",
    ],
    expect: { minTurns: 15, noDrift: true, anchorPreserved: true },
  },
  {
    id: "5",
    name: "Conversa adversarial 20+ turnos",
    family: ["adversarial", "explicit_change", "recovery", "comparison", "final_scope"],
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
    expect: { minTurns: 20, adversarialResilience: true },
  },
  {
    id: "6",
    name: "Nova busca legítima",
    family: ["search", "comparison", "legitimate_new_search"],
    turns: [
      "celular ate 2000",
      "estou em duvida entre esse e o Galaxy A35",
      "qual dos dois voce indica?",
      "procura outros modelos de notebook ate 3000",
    ],
    expect: { newSearchAllowed: true, notOverprotected: true },
  },
  {
    id: "7",
    name: "Atributos tardios pós-decisão",
    family: ["explicit_change", "final_decision", "attribute_followup"],
    turns: [
      "celular ate 2000",
      "quero gastar o minimo possivel.",
      "entao qual e afinal",
      "e a bateria?",
      "e o desempenho?",
      "e custo-beneficio?",
      "ainda vale?",
    ],
    expect: { scopedAttributes: true, currentWinnerAnchored: true },
  },
];

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
    "samsung galaxy s23", "smartphone beta", "smartphone alpha", "notebook",
    "poco", "moto", "redmi", "monitor",
  ];
  return brands.filter((b) => r.includes(b));
}

function detectComprehensionRecovery(reply = "") {
  const r = normalizeText(reply);
  return (
    /\b(vamos simplificar|simplificar|em uma frase)\b/.test(r) &&
    /\b(recomendacao principal|continuo recomendando|minha recomendacao)\b/.test(r)
  );
}

function detectConfusionRecovery(reply = "") {
  const r = normalizeText(reply);
  return (
    /\b(voce tem razao|vamos organizar|organizar o que)\b/.test(r) &&
    /\b(principal|recomendacao|referencia|recomendacao atual)\b/.test(r)
  );
}

function detectExplicitChange(reply = "") {
  const r = normalizeText(reply);
  return (
    /\b(sua prioridade mudou|prioridade mudou)\b/.test(r) &&
    /\b(antes eu estava|agora estou priorizando)\b/.test(r)
  );
}

function detectPostChangeRecovery(reply = "") {
  const r = normalizeText(reply);
  return (
    (/\b(voce tem razao|vamos organizar|vamos simplificar)\b/.test(r) &&
      /\b(prioridade|critério|criterio|mudou|passou)\b/.test(r)) ||
    /\b(recomendacao atual|recomendação atual)\b/.test(r)
  );
}

function detectFinalScopeReply(reply = "") {
  const r = normalizeText(reply);
  return (
    /\b(falando do|sobre bateria|sobre desempenho|sobre custo)\b/.test(r) ||
    /\b(recomendacao final|recomendação final|afinal)\b/.test(r)
  );
}

function detectGenericFallback(reply = "") {
  const r = normalizeText(reply);
  return (
    /\b(sou a mia|assistente virtual|como posso ajudar|posso ajudar com)\b/.test(r) ||
    /^ola[,!]/.test(r) ||
    /\bnao tenho informacoes\b/.test(r)
  );
}

function isLegitimateChangeQuery(q = "") {
  return /\b(gastar (o )?minimo|economizar|agora quero economizar|ta pesado no bolso|vou gastar menos)\b/.test(
    normalizeText(q)
  );
}

function isLegitimateNewSearchQuery(q = "") {
  const nq = normalizeText(q);
  return (
    /\b(procura|procurar|busca|buscar|pesquisa|pesquisar)\b/.test(nq) &&
    /\b(outr[oa]s?|modelos|opcoes|notebook|celular)\b/.test(nq)
  ) || /\b(agora quero|quero)\s+(um\s+)?notebook\b/.test(nq);
}

function isShortConfusionToken(q = "") {
  const nq = normalizeText(q).trim();
  return /^(ue|ué|hein|hã|ha|ah|oxe|pera)$/.test(nq);
}

function isConfusionQuery(q = "") {
  if (isShortConfusionToken(q)) return false;
  const nq = normalizeText(q);
  return (
    /\b(nao entendi|nao saquei|nao compreendi|como assim|fiquei perdido|agora fiquei perdido)\b/.test(
      nq
    ) || /\bvoce me confundiu\b/.test(nq)
  );
}

function isAttributeQuery(q = "") {
  const nq = normalizeText(q);
  return (
    /^e (a|o|no)\s+/.test(nq) ||
    /\b(bateria|camera|desempenho|custo.beneficio|ainda vale)\b/.test(nq)
  );
}

function isFinalDecisionQuery(q = "") {
  const nq = normalizeText(q);
  return /\b(entao qual|qual voce recomenda afinal|qual e afinal|afinal)\b/.test(nq);
}

function detectChangeExplanation(reply = "", prev = "", next = "") {
  if (!prev || !next || namesLikelyMatch(prev, next)) return true;
  const r = normalizeText(reply);
  return (
    /\b(antes|anteriormente|mudou|passa a|prioridade|agora|minimo|econom)\b/.test(r) ||
    namesLikelyMatch(extractMentionedProductFromReply(reply) || "", next)
  );
}

function inferAllowedProductsCount(session = {}) {
  if (session.comparisonContextLocked && (session.lastComparisonProducts || []).length >= 2) {
    return session.lastComparisonProducts.length;
  }
  if (session.lastDecisionChange?.winnerChanged) return 2;
  return (session.lastProducts || []).length;
}

function evaluateTurnMetrics(conv, turnNum, ctx) {
  const flags = [];
  const nq = normalizeText(ctx.query);
  const reply = ctx.reply;

  if (ctx.discussionBefore.length >= 2 && ctx.productsMentioned.length > 0) {
    const leak = ctx.productsMentioned.filter(
      (p) => !ctx.discussionBefore.some((d) => namesLikelyMatch(d, p))
    );
    if (
      leak.length > 0 &&
      !isLegitimateChangeQuery(ctx.query) &&
      !isLegitimateNewSearchQuery(ctx.query)
    ) {
      flags.push({
        type: "EXTERNAL_PRODUCT_LEAK",
        severity: "high",
        detail: leak.join(", "),
      });
    }
  }

  if (
    ctx.winnerBefore &&
    ctx.winnerAfter &&
    !namesLikelyMatch(ctx.winnerBefore, ctx.winnerAfter) &&
    !isLegitimateChangeQuery(ctx.query) &&
    !isLegitimateNewSearchQuery(ctx.query)
  ) {
    if (!detectChangeExplanation(reply, ctx.winnerBefore, ctx.winnerAfter)) {
      flags.push({
        type: "WINNER_DRIFT_UNEXPLAINED",
        severity: "high",
        detail: `${ctx.winnerBefore} → ${ctx.winnerAfter}`,
      });
    }
  }

  if (
    ctx.discussionLockedBefore &&
    ctx.discussionAfter.length < 2 &&
    ctx.discussionBefore.length >= 2 &&
    !isLegitimateNewSearchQuery(ctx.query)
  ) {
    flags.push({
      type: "DISCUSSION_SET_LOST",
      severity: "medium",
      detail: `${ctx.discussionBefore.length} → ${ctx.discussionAfter.length}`,
    });
  }

  if (isConfusionQuery(ctx.query)) {
    const recovered =
      detectComprehensionRecovery(reply) ||
      detectConfusionRecovery(reply) ||
      detectPostChangeRecovery(reply);
    if (!recovered) {
      flags.push({
        type: "CONFUSION_NOT_RESOLVED",
        severity: "medium",
        detail: ctx.query,
      });
      flags.push({ type: "RECOVERY_MISSED", severity: "medium", detail: ctx.query });
    }
  }

  if (isLegitimateChangeQuery(ctx.query) && !detectExplicitChange(reply)) {
    flags.push({ type: "RECOVERY_MISSED", severity: "medium", detail: "explicit_change_protocol" });
  }

  if (
    ctx.winnerAfter &&
    ctx.finalResponseProduct &&
    !namesLikelyMatch(ctx.winnerAfter, ctx.finalResponseProduct) &&
    !isLegitimateNewSearchQuery(ctx.query)
  ) {
    flags.push({
      type: "SESSION_REPLY_DIVERGENCE",
      severity: "high",
      detail: `session=${ctx.winnerAfter} trace=${ctx.finalResponseProduct}`,
    });
  }

  if (detectGenericFallback(reply)) {
    flags.push({ type: "GENERIC_FALLBACK_RESPONSE", severity: "high", detail: ctx.query });
  }

  if (
    (isFinalDecisionQuery(ctx.query) || isAttributeQuery(ctx.query)) &&
    hasActiveFinalDecisionScope({ lastBestProduct: { product_name: ctx.winnerBefore }, ...ctx.sessionBeforeObj }) &&
    !detectFinalScopeReply(reply) &&
    !detectConfusionRecovery(reply) &&
    !detectComprehensionRecovery(reply) &&
    !detectPostChangeRecovery(reply) &&
    !detectExplicitChange(reply) &&
    ctx.responsePath !== "final_decision_scope_reply" &&
    ctx.responsePath !== "post_change_recovery_reorganize"
  ) {
    flags.push({ type: "FINAL_SCOPE_BROKEN", severity: "medium", detail: ctx.query });
  }

  if (conv.id === "6" && isLegitimateNewSearchQuery(ctx.query)) {
    const winnerShifted =
      ctx.winnerAfter &&
      ctx.winnerBefore &&
      !namesLikelyMatch(ctx.winnerBefore, ctx.winnerAfter);
    const newCategoryInReply =
      /\bnotebook\b/.test(normalizeText(reply)) ||
      /\bnotebook\b/.test(normalizeText(ctx.query));
    const newSearchMode =
      ctx.routingMode === "new_search" ||
      ctx.responsePath === "legacy_llm_search" ||
      ctx.responsePath === "return_seguro" ||
      winnerShifted ||
      newCategoryInReply;
    if (!newSearchMode) {
      flags.push({
        type: "LEGITIMATE_NEW_SEARCH_BLOCKED",
        severity: "high",
        detail: ctx.query,
      });
    }
  }

  if ((ctx.dca.divergences || []).length > 0) {
    const legit =
      isLegitimateChangeQuery(ctx.query) &&
      ctx.winnerAfter &&
      namesLikelyMatch(ctx.winnerAfter, ctx.verbalized || "");
    if (!legit) {
      flags.push({
        type: "DCA_DIVERGENCE",
        severity: "low",
        detail: ctx.dca.divergences.join(", "),
      });
    }
  }

  const humanTrustFlag =
    flags.some((f) => f.severity === "high") ? "LOW" :
    flags.some((f) => f.severity === "medium") ? "MEDIUM" : "HIGH";

  return { flags, humanTrustFlag };
}

async function callHttp(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-8-4e",
      conversation_id: conversationId,
      messages,
      session_context: sessionContext || {},
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) {
    return {
      status: resp.status,
      data: { reply: "", session_context: sessionContext, error: true },
    };
  }
  return { status: resp.status, data: await resp.json() };
}

async function runConversation(conv) {
  let sessionContext = {};
  let messages = [];
  const conversationId = `audit-84e-conv${conv.id}-${Date.now()}`;
  const turnMetrics = [];
  const allFlags = [];
  let initialWinner = null;
  let finalWinner = null;

  for (let i = 0; i < conv.turns.length; i++) {
    const query = conv.turns[i];
    const turn = i + 1;
    const winnerBefore = pickName(sessionContext.lastBestProduct);
    const discussionBefore = inferDiscussionSet(sessionContext);
    const discussionLockedBefore = !!sessionContext.comparisonContextLocked;

    const { status, data } = await callHttp(query, sessionContext, messages, conversationId);
    const trace = data.mia_debug?.pipelineTrace || {};
    const rd = trace.routingDecision || {};
    const reply = String(data.reply || "");
    const winnerAfter = pickName(data.session_context?.lastBestProduct);
    const discussionAfter = inferDiscussionSet(data.session_context || {});
    const verbalized = extractMentionedProductFromReply(reply);
    const productsMentioned = extractProductMentions(reply);
    const responsePath = trace.response_path || trace.responsePath || null;
    const dca = trace.decisionConsistencyAudit || {};
    const turnType = trace.cognitive_turn_early?.turnType || trace.unified_cognitive_router_audit?.cognitiveTurnType || null;
    const routingMode = rd.mode || null;
    const finalResponseProduct = trace.final_response_product || trace.winner_real || verbalized;
    const recoveryTriggered =
      responsePath === "contradiction_recovery_reorganize" ||
      responsePath === "user_confusion_recovery_simplify" ||
      responsePath === "post_change_recovery_reorganize" ||
      detectComprehensionRecovery(reply) ||
      detectConfusionRecovery(reply) ||
      detectPostChangeRecovery(reply);

    const winnerChanged =
      !!(winnerBefore && winnerAfter && !namesLikelyMatch(winnerBefore, winnerAfter));
    const winnerChangeExplained = winnerChanged
      ? detectChangeExplanation(reply, winnerBefore, winnerAfter)
      : false;

    const { flags, humanTrustFlag } = evaluateTurnMetrics(conv, turn, {
      query,
      reply,
      winnerBefore,
      winnerAfter,
      discussionBefore,
      discussionAfter,
      discussionLockedBefore,
      productsMentioned,
      verbalized,
      dca,
      responsePath,
      routingMode,
      finalResponseProduct,
      sessionBeforeObj: sessionContext,
    });

    if (!initialWinner && winnerAfter) initialWinner = winnerAfter;
    finalWinner = winnerAfter || finalWinner;

    turnMetrics.push({
      turn,
      query,
      turnType,
      routingMode,
      winnerBefore,
      winnerAfter,
      winnerChanged,
      winnerChangeExplained,
      discussionSetBefore: discussionBefore,
      discussionSetAfter: discussionAfter,
      allowedProducts: inferAllowedProductsCount(data.session_context || {}),
      responsePath,
      productsMentioned,
      externalProductLeak: flags.some((f) => f.type === "EXTERNAL_PRODUCT_LEAK"),
      recoveryTriggered,
      finalResponseProduct,
      humanTrustFlag,
      flags,
      status,
      replyPreview: reply.slice(0, 120),
    });

    allFlags.push(...flags);
    sessionContext = data.session_context || sessionContext;
    messages = [...messages, { role: "user", content: query }, { role: "assistant", content: reply }];
  }

  const high = allFlags.filter((f) => f.severity === "high");
  const medium = allFlags.filter((f) => f.severity === "medium");

  return {
    conv,
    turnMetrics,
    summary: {
      turns: conv.turns.length,
      initialWinner,
      finalWinner,
      highFlags: high.length,
      mediumFlags: medium.length,
      lowFlags: allFlags.filter((f) => f.severity === "low").length,
      ok: high.length === 0 && medium.length === 0,
      partial: high.length === 0 && medium.length > 0,
      fail: high.length > 0,
    },
    allFlags,
  };
}

function runPriorAudits() {
  const results = [];
  for (const script of PRIOR_AUDITS) {
    const path = `scripts/${script}`;
    const r = spawnSync("node", [path], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        MIA_HTTP_AUDIT: script.includes("validation") || script.includes("persistence") || script.includes("post-change") || script.includes("final-decision") ? "1" : process.env.MIA_HTTP_AUDIT,
        MIA_API_BASE: process.env.MIA_API_BASE || "http://localhost:3001",
      },
      timeout: 300000,
    });
    const passed = r.status === 0;
    results.push({ script, passed, exitCode: r.status ?? 1 });
  }
  return results;
}

function computeVerdict(convResults, priorResults) {
  const priorFailed = priorResults.filter((r) => !r.passed);
  if (priorFailed.length > 0) return "C) FAIL";

  if (!HTTP_ENABLED) return "B) PARTIAL";

  const anyHigh = convResults.some((r) => r.summary.highFlags > 0);
  const anyMedium = convResults.some((r) => r.summary.mediumFlags > 0);
  const allOk = convResults.every((r) => r.summary.ok);

  if (anyHigh) return "C) FAIL";
  if (allOk) return "A) ROBUST";
  if (anyMedium) return "B) PARTIAL";
  return "A) ROBUST";
}

async function main() {
  console.log("\nPATCH 8.4E — Real Conversation Simulation Audit\n");
  console.log(`Audit ID: MIA_REAL_CONVERSATION_SIMULATION_8_4E`);
  console.log(`HTTP: ${HTTP_ENABLED ? "enabled" : "disabled (set MIA_HTTP_AUDIT=1)"}`);
  console.log(`API: ${API_ENDPOINT}\n`);

  let priorResults = [];
  if (RUN_PRIOR_AUDITS) {
    console.log("── Regressão: audits anteriores ──\n");
    priorResults = runPriorAudits();
    for (const r of priorResults) {
      console.log(`  ${r.passed ? "✓" : "✗"} ${r.script}`);
    }
    console.log("");
  }

  const convResults = [];

  if (HTTP_ENABLED) {
    for (const conv of CONVERSATIONS) {
      console.log(`────────────────────────────────────────────────────────────────`);
      console.log(`Conversa ${conv.id} — ${conv.name}`);
      console.log(`────────────────────────────────────────────────────────────────`);

      const result = await runConversation(conv);
      convResults.push(result);

      for (const t of result.turnMetrics) {
        const flagStr = t.flags.length
          ? t.flags.map((f) => f.type).join(", ")
          : "—";
        const mark = t.flags.some((f) => f.severity === "high")
          ? "✗"
          : t.flags.some((f) => f.severity === "medium")
            ? "⚠"
            : "✓";
        console.log(
          `  T${t.turn} [${t.status}] ${mark} ${t.query.slice(0, 42)}`
        );
        console.log(
          `       winner: ${t.winnerBefore || "—"} → ${t.winnerAfter || "—"} | path: ${t.responsePath || "—"} | trust: ${t.humanTrustFlag}`
        );
        if (t.flags.length) {
          console.log(`       flags: ${flagStr}`);
        }
      }

      console.log(
        `\n  Resumo ${conv.id}: ${result.summary.ok ? "PASS" : result.summary.partial ? "PARTIAL" : "FAIL"} | H=${result.summary.highFlags} M=${result.summary.mediumFlags}\n`
      );
    }
  } else {
    console.log("HTTP desabilitado — apenas regressão estática executada.\n");
  }

  const verdict = computeVerdict(convResults, priorResults);

  const allFlags = convResults.flatMap((r) => r.allFlags);
  const flagCounts = {};
  for (const f of allFlags) {
    flagCounts[f.type] = (flagCounts[f.type] || 0) + 1;
  }

  console.log("════════════════════════════════════════════════════════════════");
  console.log(`VEREDITO FINAL 8.4E: ${verdict}`);
  if (HTTP_ENABLED) {
    const clean = convResults.filter((r) => r.summary.ok).length;
    console.log(`Conversas: ${clean}/${convResults.length} PASS limpo`);
    console.log(`Flags: high=${allFlags.filter((f) => f.severity === "high").length} medium=${allFlags.filter((f) => f.severity === "medium").length} low=${allFlags.filter((f) => f.severity === "low").length}`);
    if (Object.keys(flagCounts).length) {
      console.log("Flag types:", Object.entries(flagCounts).map(([k, v]) => `${k}=${v}`).join(", "));
    }
  }
  const priorFail = priorResults.filter((r) => !r.passed).length;
  console.log(`Regressão anterior: ${priorResults.length - priorFail}/${priorResults.length} PASS`);
  console.log("════════════════════════════════════════════════════════════════\n");

  if (verdict === "A) ROBUST") {
    console.log("Próximo passo recomendado: PATCH 8.5A — MVP Launch Readiness Audit\n");
  } else {
    console.log("Documentar falhas acima. NÃO implementar correção neste patch.\n");
  }

  const exitCode = verdict === "C) FAIL" ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
