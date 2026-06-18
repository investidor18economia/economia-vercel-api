/**
 * PATCH 8.5A — MVP Launch Readiness Audit (OBSERVATIONAL ONLY)
 *
 * Avalia se a MIA está pronta para teste com usuários reais.
 * NÃO altera comportamento de produção.
 *
 * Usage:
 *   node scripts/test-mia-mvp-launch-readiness-audit.js
 *   $env:MIA_HTTP_AUDIT="1"; $env:MIA_DEBUG="true"; $env:MIA_API_BASE="http://localhost:3001"; node scripts/test-mia-mvp-launch-readiness-audit.js
 */

import { spawnSync } from "node:child_process";
import { extractMentionedProductFromReply } from "../lib/miaDecisionConsistencyAudit.js";
import { namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";
import { detectProductionGenericFallback } from "./test-mia-production-response-perception-audit.js";

const API = process.env.MIA_API_BASE || "http://localhost:3001";
const API_ENDPOINT = `${API}/api/chat-gpt4o`;
const API_KEY = process.env.MIA_API_KEY || "minha_chave_181199";
const HTTP_ENABLED = process.env.MIA_HTTP_AUDIT === "1" || process.env.MIA_HTTP_AUDIT === "true";
const RUN_PRIOR_AUDITS = process.env.MIA_RUN_PRIOR_AUDITS !== "0";
const LATENCY_WARN_MS = Number(process.env.MIA_LATENCY_WARN_MS || 15000);
const LATENCY_HIGH_MS = Number(process.env.MIA_LATENCY_HIGH_MS || 30000);

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

const JOURNEYS = [
  {
    id: "1",
    name: "Primeiro usuário leigo",
    dimension: "conversational_readiness",
    family: ["greeting", "search", "hesitation", "decision", "comprehension"],
    turns: ["oi", "celular ate 2000", "compensa?", "qual voce pegaria?", "nao entendi", "entao qual compro?"],
    expectCardOnSearch: true,
  },
  {
    id: "2",
    name: "Usuário indeciso",
    dimension: "decision_readiness",
    family: ["search", "comparison", "attribute", "contradiction", "final_decision"],
    turns: [
      "celular ate 2500",
      "estou em duvida entre esse e outro",
      "qual dos dois?",
      "e a bateria?",
      "voce me confundiu",
      "entao qual e afinal?",
    ],
    expectCardOnSearch: true,
  },
  {
    id: "3",
    name: "Usuário muda orçamento",
    dimension: "trust_readiness",
    family: ["search", "price_objection", "explicit_change", "change_explanation", "validation"],
    turns: [
      "celular ate 3000",
      "parece caro",
      "quero gastar menos",
      "por que mudou?",
      "continua valendo?",
    ],
    expectCardOnSearch: true,
  },
  {
    id: "4",
    name: "Usuário quer alternativa",
    dimension: "decision_readiness",
    family: ["search", "alternative", "second_best", "tradeoff"],
    turns: [
      "celular ate 2000",
      "tem outra opcao?",
      "e a segunda melhor?",
      "essa compensa menos?",
      "qual ficaria?",
    ],
    expectCardOnSearch: true,
  },
  {
    id: "5",
    name: "Usuário adversarial informal",
    dimension: "trust_readiness",
    family: ["cold_hesitation", "quality_doubt", "confusion", "final_decision"],
    turns: [
      "celular ate 2000",
      "sei la",
      "isso presta?",
      "ta puxado",
      "ue",
      "nao saquei",
      "agora fiquei perdido",
      "qual e afinal?",
    ],
    expectCardOnSearch: true,
  },
  {
    id: "6",
    name: "Nova busca legítima",
    dimension: "conversational_readiness",
    family: ["search", "reset", "category_pivot", "decision"],
    turns: [
      "celular ate 2000",
      "comeca de novo",
      "agora quero notebook ate 3000",
      "qual voce indica?",
    ],
    expectCardOnSearch: true,
  },
  {
    id: "7",
    name: "Jornada longa 20+ turnos",
    dimension: "production_perception",
    family: ["long_mixed"],
    turns: [
      "celular ate 2000",
      "estou em duvida entre esse e outro",
      "qual dos dois?",
      "compensa?",
      "e a bateria?",
      "nao quero me arrepender",
      "tem certeza?",
      "quero gastar o minimo possivel",
      "voce me confundiu",
      "entao qual e afinal?",
      "e a camera?",
      "tem outra opcao?",
      "qual ficou em segundo?",
      "nao entendi",
      "explica melhor",
      "parece caro",
      "continua valendo?",
      "fechou",
      "comeca de novo",
      "agora quero monitor ate 1500",
      "qual voce indica?",
      "valeu",
    ],
    expectCardOnSearch: true,
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

function extractApiProducts(data = {}) {
  const raw = data.products ?? data.prices ?? data.items ?? [];
  return Array.isArray(raw) ? raw : [];
}

function extractProductMentions(text = "") {
  const r = normalizeText(text);
  const tokens = [
    "iphone", "galaxy", "samsung", "notebook", "monitor", "smartphone",
    "asus", "vivobook", "motorola", "xiaomi", "poco", "redmi",
  ];
  return tokens.filter((b) => r.includes(b));
}

function isSearchTurn(query = "", turn = 1) {
  const nq = normalizeText(query);
  if (turn === 1 && !/^(oi|ola|eai|eae|bom dia)/.test(nq)) return true;
  return (
    /\b(celular|notebook|monitor|tv|mouse|teclado|camera|cadeira|pc gamer)\b/.test(nq) &&
    /\b(ate|até|por|reais|r\$)\b/.test(nq)
  ) || /\b(procura|busca|pesquisa|comeca de novo|agora quero)\b/.test(nq);
}

function isLegitimateChangeQuery(q = "") {
  return /\b(gastar (o )?minimo|economizar|quero gastar menos|parece caro|ta pesado|ta puxado|vou gastar menos)\b/.test(
    normalizeText(q)
  );
}

function isLegitimateNewSearchQuery(q = "") {
  const nq = normalizeText(q);
  return (
    /\b(comeca de novo|começa de novo|comecar de novo)\b/.test(nq) ||
    (/\b(procura|busca|pesquisa|agora quero)\b/.test(nq) &&
      /\b(notebook|monitor|celular|outr[oa]s?|modelos)\b/.test(nq))
  );
}

function isShortConfusionToken(q = "") {
  const nq = normalizeText(q).trim();
  return /^(ue|ué|hein|hã|ha|ah|oxe|pera|sei la)$/.test(nq);
}

function isConfusionQuery(q = "") {
  if (isShortConfusionToken(q)) return false;
  const nq = normalizeText(q);
  return (
    /\b(nao entendi|nao saquei|nao compreendi|como assim|fiquei perdido|agora fiquei perdido|voce me confundiu)\b/.test(
      nq
    )
  );
}

function isFinalDecisionQuery(q = "") {
  const nq = normalizeText(q);
  return /\b(entao qual|qual compro|qual voce pegaria|qual e afinal|qual é afinal|afinal)\b/.test(nq);
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
    /\b(sua prioridade mudou|prioridade mudou|por que mudou)\b/.test(r) ||
    (/\b(antes eu estava|agora estou priorizando|mudou porque)\b/.test(r) &&
      /\b(prioridade|criterio|critério|econom|minimo|preco)\b/.test(r))
  );
}

function detectChangeExplanation(reply = "", prev = "", next = "") {
  if (!prev || !next || namesLikelyMatch(prev, next)) return true;
  const r = normalizeText(reply);
  return (
    /\b(antes|anteriormente|mudou|passa a|prioridade|agora|minimo|econom|porque)\b/.test(r) ||
    namesLikelyMatch(extractMentionedProductFromReply(reply) || "", next) ||
    detectExplicitChange(reply)
  );
}

function detectDecisionClarity(reply = "") {
  const r = normalizeText(reply);
  return (
    /\b(recomendo|recomendacao|minha recomendacao|melhor opcao|melhor opção|ficaria com|pegaria)\b/.test(r) ||
    /\b(continuo|mantenho|segue sendo)\b/.test(r)
  );
}

function scoreHumanPerception({ flags, reply, hasWinner, decisionQuery }) {
  let score = 10;
  for (const f of flags) {
    if (f.severity === "high") score -= 3;
    else if (f.severity === "medium") score -= 1.5;
    else score -= 0.5;
  }
  if (!reply || reply.length < 20) score -= 2;
  if (decisionQuery && !detectDecisionClarity(reply) && !detectConfusionRecovery(reply)) score -= 1;
  if (hasWinner && reply.length > 30) score += 0.5;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function evaluateTurn(journey, turnNum, ctx) {
  const flags = [];
  const { query, reply, data, latencyMs } = ctx;

  if (latencyMs > LATENCY_HIGH_MS) {
    flags.push({ type: "LATENCY_TOO_HIGH", severity: "medium", detail: `${latencyMs}ms` });
  }

  if (detectProductionGenericFallback(reply) || /\b(sou a mia|assistente virtual|como posso ajudar)\b/.test(normalizeText(reply))) {
    flags.push({ type: "GENERIC_FALLBACK_RESPONSE", severity: "high", detail: query });
  }

  if (
    ctx.winnerBefore &&
    ctx.winnerAfter &&
    !namesLikelyMatch(ctx.winnerBefore, ctx.winnerAfter) &&
    !isLegitimateChangeQuery(query) &&
    !isLegitimateNewSearchQuery(query)
  ) {
    if (!detectChangeExplanation(reply, ctx.winnerBefore, ctx.winnerAfter)) {
      flags.push({
        type: "UNEXPLAINED_WINNER_CHANGE",
        severity: "high",
        detail: `${ctx.winnerBefore} → ${ctx.winnerAfter}`,
      });
    }
  }

  if (ctx.discussionSet.length >= 2 && ctx.productsMentioned.length > 0) {
    const leak = ctx.productsMentioned.filter(
      (p) => !ctx.discussionSet.some((d) => normalizeText(d).includes(p) || normalizeText(p).includes(normalizeText(d).split(" ")[0]))
    );
    if (
      leak.length > 0 &&
      !isLegitimateChangeQuery(query) &&
      !isLegitimateNewSearchQuery(query)
    ) {
      flags.push({ type: "EXTERNAL_PRODUCT_LEAK", severity: "high", detail: leak.join(", ") });
    }
  }

  if (
    ctx.winnerAfter &&
    ctx.finalResponseProduct &&
    !namesLikelyMatch(ctx.winnerAfter, ctx.finalResponseProduct) &&
    !isLegitimateNewSearchQuery(query)
  ) {
    flags.push({
      type: "SESSION_REPLY_DIVERGENCE",
      severity: "high",
      detail: `session=${ctx.winnerAfter} trace=${ctx.finalResponseProduct}`,
    });
  }

  if (ctx.cardProduct && ctx.winnerAfter && !namesLikelyMatch(pickName(ctx.cardProduct), ctx.winnerAfter)) {
    if (!isLegitimateNewSearchQuery(query)) {
      flags.push({
        type: "WINNER_CARD_MISMATCH",
        severity: "high",
        detail: `card=${pickName(ctx.cardProduct)} session=${ctx.winnerAfter}`,
      });
    }
  }

  if (ctx.cardProduct && ctx.replyProduct && !namesLikelyMatch(pickName(ctx.cardProduct), ctx.replyProduct)) {
    flags.push({
      type: "CARD_REPLY_CONFLICT",
      severity: "medium",
      detail: `card=${pickName(ctx.cardProduct)} reply=${ctx.replyProduct}`,
    });
  }

  if (isConfusionQuery(query)) {
    const recovered =
      detectComprehensionRecovery(reply) ||
      detectConfusionRecovery(reply) ||
      ctx.responsePath?.includes("recovery");
    if (!recovered) {
      flags.push({ type: "CONFUSION_NOT_RECOVERED", severity: "medium", detail: query });
    }
  }

  if (/\b(nao entendi|explica melhor|explica de outro)\b/.test(normalizeText(query))) {
    if (!detectComprehensionRecovery(reply) && !ctx.responsePath?.includes("confusion")) {
      flags.push({ type: "COMPREHENSION_NOT_RECOVERED", severity: "medium", detail: query });
    }
  }

  if (journey.id === "6" && isLegitimateNewSearchQuery(query)) {
    const pivot =
      ctx.winnerAfter &&
      ctx.winnerBefore &&
      !namesLikelyMatch(ctx.winnerBefore, ctx.winnerAfter);
    const categoryPivot = /\b(notebook|monitor)\b/.test(normalizeText(reply + query));
    if (!pivot && !categoryPivot) {
      flags.push({ type: "LEGITIMATE_NEW_SEARCH_BLOCKED", severity: "high", detail: query });
    }
  }

  if (isSearchTurn(query, turnNum) && journey.expectCardOnSearch) {
    if (!ctx.cardProduct && !ctx.fallbackUsed && ctx.httpStatus === 200) {
      flags.push({ type: "MISSING_CARD_PRODUCT", severity: "medium", detail: query });
    }
    if (ctx.cardProduct && !ctx.cardProduct.price) {
      flags.push({ type: "MISSING_PRICE", severity: "medium", detail: pickName(ctx.cardProduct) });
    }
    if (ctx.cardProduct && !ctx.cardProduct.source && !ctx.cardProduct.provider && !ctx.cardProduct.link) {
      flags.push({ type: "MISSING_SOURCE", severity: "low", detail: pickName(ctx.cardProduct) });
    }
  }

  if (ctx.providerFailure && !ctx.fallbackUsed && !ctx.cardProduct) {
    flags.push({ type: "PROVIDER_FAILURE_BLOCKING", severity: "high", detail: ctx.provider });
  }

  const humanPerceptionScore = scoreHumanPerception({
    flags,
    reply,
    hasWinner: !!ctx.winnerAfter,
    decisionQuery: isFinalDecisionQuery(query),
  });

  if (humanPerceptionScore < 5) {
    flags.push({
      type: "LOW_HUMAN_PERCEPTION_SCORE",
      severity: "medium",
      detail: String(humanPerceptionScore),
    });
  }

  const trustFlag = flags.some((f) => f.severity === "high")
    ? "LOW"
    : flags.some((f) => f.severity === "medium")
      ? "MEDIUM"
      : "HIGH";

  const uxFlag =
    flags.some((f) =>
      ["WINNER_CARD_MISMATCH", "CARD_REPLY_CONFLICT", "MISSING_CARD_PRODUCT", "MISSING_PRICE"].includes(f.type)
    )
      ? "LOW"
      : ctx.cardProduct
        ? "HIGH"
        : "MEDIUM";

  const apiFlag =
    flags.some((f) => f.type === "PROVIDER_FAILURE_BLOCKING")
      ? "LOW"
      : ctx.fallbackUsed
        ? "MEDIUM"
        : "HIGH";

  return { flags, humanPerceptionScore, trustFlag, uxFlag, apiFlag };
}

async function callHttp(text, sessionContext, messages, conversationId) {
  const started = Date.now();
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-8-5a",
      conversation_id: conversationId,
      messages,
      session_context: sessionContext || {},
    }),
    signal: AbortSignal.timeout(120000),
  });
  const latencyMs = Date.now() - started;
  if (!resp.ok) {
    return {
      status: resp.status,
      latencyMs,
      data: { reply: "", session_context: sessionContext, error: true },
    };
  }
  return { status: resp.status, latencyMs, data: await resp.json() };
}

function extractProvider(data = {}, trace = {}) {
  const products = extractApiProducts(data);
  const fromProduct = products[0]?.provider || products[0]?.source || null;
  return (
    fromProduct ||
    trace.provider ||
    trace.commercial_provider ||
    (data.mia_debug?.commercialOnlyFallback ? "commercial_fallback" : null) ||
    (trace.fallback_used ? "fallback" : null) ||
    "unknown"
  );
}

async function runJourney(journey) {
  let sessionContext = {};
  let messages = [];
  const conversationId = `audit-85a-j${journey.id}-${Date.now()}`;
  const turnMetrics = [];
  const allFlags = [];
  const latencies = [];

  for (let i = 0; i < journey.turns.length; i++) {
    const query = journey.turns[i];
    const turn = i + 1;
    const winnerBefore = pickName(sessionContext.lastBestProduct);
    const discussionSet = inferDiscussionSet(sessionContext);

    const { status, latencyMs, data } = await callHttp(query, sessionContext, messages, conversationId);
    latencies.push(latencyMs);

    const trace = data.mia_debug?.pipelineTrace || {};
    const rd = trace.routingDecision || {};
    const reply = String(data.reply || "");
    const winnerAfter = pickName(data.session_context?.lastBestProduct);
    const products = extractApiProducts(data);
    const cardProduct = products[0] || null;
    const replyProduct = extractMentionedProductFromReply(reply);
    const finalResponseProduct = trace.final_response_product || trace.winner_real || replyProduct;
    const responsePath = trace.response_path || trace.responsePath || null;
    const turnType =
      trace.cognitive_turn_early?.turnType ||
      trace.unified_cognitive_router_audit?.cognitiveTurnType ||
      null;
    const routingMode = rd.mode || null;
    const provider = extractProvider(data, trace);
    const fallbackUsed = !!(
      trace.fallback_used ||
      data.mia_debug?.commercialOnlyFallback ||
      responsePath === "commercial_only_fallback"
    );
    const providerFailure = status >= 500 || data.error === true;

    const productsMentioned = extractProductMentions(reply);
    const winnerChanged = !!(winnerBefore && winnerAfter && !namesLikelyMatch(winnerBefore, winnerAfter));
    const winnerChangeExplained = winnerChanged
      ? detectChangeExplanation(reply, winnerBefore, winnerAfter)
      : false;

    const { flags, humanPerceptionScore, trustFlag, uxFlag, apiFlag } = evaluateTurn(journey, turn, {
      query,
      reply,
      data,
      latencyMs,
      httpStatus: status,
      winnerBefore,
      winnerAfter,
      discussionSet,
      productsMentioned,
      cardProduct,
      replyProduct,
      finalResponseProduct,
      responsePath,
      provider,
      fallbackUsed,
      providerFailure,
    });

    turnMetrics.push({
      turn,
      query,
      httpStatus: status,
      latencyMs,
      turnType,
      routingMode,
      responsePath,
      winnerBefore,
      winnerAfter,
      winnerChanged,
      winnerChangeExplained,
      discussionSet,
      allowedProducts: (data.session_context?.lastProducts || []).length,
      cardProduct: pickName(cardProduct),
      cardPrice: cardProduct?.price || null,
      cardSource: cardProduct?.source || cardProduct?.provider || null,
      replyProduct,
      finalResponseProduct,
      provider,
      fallbackUsed,
      genericFallbackDetected: flags.some((f) => f.type === "GENERIC_FALLBACK_RESPONSE"),
      externalProductLeak: flags.some((f) => f.type === "EXTERNAL_PRODUCT_LEAK"),
      sessionReplyDivergence: flags.some((f) => f.type === "SESSION_REPLY_DIVERGENCE"),
      trustFlag,
      uxFlag,
      apiFlag,
      humanPerceptionScore,
      flags,
      replyPreview: reply.slice(0, 100),
    });

    allFlags.push(...flags);
    sessionContext = data.session_context || sessionContext;
    messages = [...messages, { role: "user", content: query }, { role: "assistant", content: reply }];
  }

  const high = allFlags.filter((f) => f.severity === "high");
  const medium = allFlags.filter((f) => f.severity === "medium");
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;
  const maxLatency = latencies.length ? Math.max(...latencies) : 0;
  const avgPerception =
    turnMetrics.length
      ? Math.round(
          (turnMetrics.reduce((s, t) => s + t.humanPerceptionScore, 0) / turnMetrics.length) * 10
        ) / 10
      : 0;

  return {
    journey,
    turnMetrics,
    summary: {
      turns: journey.turns.length,
      highFlags: high.length,
      mediumFlags: medium.length,
      lowFlags: allFlags.filter((f) => f.severity === "low").length,
      avgLatencyMs: avgLatency,
      maxLatencyMs: maxLatency,
      avgHumanPerception: avgPerception,
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
        MIA_API_BASE: process.env.MIA_API_BASE || "http://localhost:3001",
        MIA_RUN_PRIOR_AUDITS: "0",
      },
      timeout: 600000,
    });
    results.push({ script, passed: r.status === 0, exitCode: r.status ?? 1 });
  }
  return results;
}

function computeVerdict(journeyResults, priorResults, globalLatency) {
  if (priorResults.some((r) => !r.passed)) return "C) FAIL";
  if (!HTTP_ENABLED) return "B) PARTIAL";

  const anyHigh = journeyResults.some((r) => r.summary.highFlags > 0);
  const criticalMedium = journeyResults.some((r) =>
    r.allFlags.some(
      (f) =>
        f.severity === "medium" &&
        [
          "CONFUSION_NOT_RECOVERED",
          "COMPREHENSION_NOT_RECOVERED",
          "CARD_REPLY_CONFLICT",
          "MISSING_CARD_PRODUCT",
          "LATENCY_TOO_HIGH",
        ].includes(f.type)
    )
  );

  if (anyHigh) return "C) FAIL";
  if (globalLatency.max > LATENCY_HIGH_MS * 2) return "B) PARTIAL";
  if (criticalMedium || journeyResults.some((r) => r.summary.mediumFlags > 0)) return "B) PARTIAL";
  if (journeyResults.every((r) => r.summary.ok)) return "A) ROBUST";
  return "B) PARTIAL";
}

async function main() {
  console.log("\nPATCH 8.5A — MVP Launch Readiness Audit\n");
  console.log(`Audit ID: MIA_MVP_LAUNCH_READINESS_8_5A`);
  console.log(`HTTP: ${HTTP_ENABLED ? "enabled" : "disabled (set MIA_HTTP_AUDIT=1)"}`);
  console.log(`API: ${API_ENDPOINT}\n`);

  let priorResults = [];
  if (RUN_PRIOR_AUDITS) {
    console.log("── Regressão: audits anteriores (11) ──\n");
    priorResults = runPriorAudits();
    for (const r of priorResults) {
      console.log(`  ${r.passed ? "✓" : "✗"} ${r.script}`);
    }
    console.log("");
  }

  const journeyResults = [];
  const allLatencies = [];

  if (HTTP_ENABLED) {
    for (const journey of JOURNEYS) {
      console.log(`────────────────────────────────────────────────────────────────`);
      console.log(`Jornada ${journey.id} — ${journey.name}`);
      console.log(`────────────────────────────────────────────────────────────────`);

      const result = await runJourney(journey);
      journeyResults.push(result);

      for (const t of result.turnMetrics) {
        const mark = t.flags.some((f) => f.severity === "high")
          ? "✗"
          : t.flags.some((f) => f.severity === "medium")
            ? "⚠"
            : "✓";
        console.log(
          `  T${t.turn} [${t.httpStatus}] ${mark} ${t.latencyMs}ms | ${t.query.slice(0, 38)}`
        );
        console.log(
          `       path=${t.responsePath || "—"} | winner=${t.winnerAfter || "—"} | card=${t.cardProduct || "—"} | perception=${t.humanPerceptionScore}`
        );
        if (t.flags.length) {
          console.log(`       flags: ${t.flags.map((f) => f.type).join(", ")}`);
        }
        allLatencies.push(t.latencyMs);
      }

      console.log(
        `\n  Resumo J${journey.id}: ${result.summary.ok ? "PASS" : result.summary.partial ? "PARTIAL" : "FAIL"} | H=${result.summary.highFlags} M=${result.summary.mediumFlags} | avg=${result.summary.avgLatencyMs}ms max=${result.summary.maxLatencyMs}ms | perception=${result.summary.avgHumanPerception}\n`
      );
    }
  } else {
    console.log("HTTP desabilitado — apenas regressão estática.\n");
  }

  const globalLatency = {
    avg: allLatencies.length
      ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length)
      : 0,
    max: allLatencies.length ? Math.max(...allLatencies) : 0,
    count: allLatencies.length,
  };

  const verdict = computeVerdict(journeyResults, priorResults, globalLatency);
  const allFlags = journeyResults.flatMap((r) => r.allFlags);
  const flagCounts = {};
  for (const f of allFlags) {
    flagCounts[f.type] = (flagCounts[f.type] || 0) + 1;
  }

  console.log("════════════════════════════════════════════════════════════════");
  console.log(`VEREDITO FINAL 8.5A: ${verdict}`);
  if (HTTP_ENABLED) {
    const clean = journeyResults.filter((r) => r.summary.ok).length;
    console.log(`Jornadas: ${clean}/${journeyResults.length} PASS limpo`);
    console.log(
      `Latência global: avg=${globalLatency.avg}ms max=${globalLatency.max}ms (${globalLatency.count} turnos)`
    );
    console.log(
      `Flags: high=${allFlags.filter((f) => f.severity === "high").length} medium=${allFlags.filter((f) => f.severity === "medium").length} low=${allFlags.filter((f) => f.severity === "low").length}`
    );
    if (Object.keys(flagCounts).length) {
      console.log(
        "Flag types:",
        Object.entries(flagCounts)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")
      );
    }
  }
  const priorFail = priorResults.filter((r) => !r.passed).length;
  console.log(`Regressão anterior: ${priorResults.length - priorFail}/${priorResults.length} PASS`);
  console.log("════════════════════════════════════════════════════════════════\n");

  if (verdict === "A) ROBUST") {
    console.log("Recomendação: pronto para convidar 10 usuários reais em teste fechado.\n");
  } else if (verdict === "B) PARTIAL") {
    console.log("Recomendação: teste fechado com monitoramento; não MVP público ainda.\n");
  } else {
    console.log("Recomendação: NÃO convidar usuários reais até corrigir flags high.\n");
  }

  process.exit(verdict === "C) FAIL" ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
