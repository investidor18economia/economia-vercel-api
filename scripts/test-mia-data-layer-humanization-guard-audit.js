/**
 * PATCH 9.2B — Data Layer Humanization Guard Audit
 *
 * Usage:
 *   node scripts/test-mia-data-layer-humanization-guard-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  applyDataLayerHumanizationGuard,
  assertUserFacingDataLayerText,
  detectRawDataLayerTokenLeak,
  humanizeDataLayerText,
  sanitizeDataLayerEvidenceText,
} from "../lib/miaDataLayerHumanizationGuard.js";
import {
  buildDataLayerEvidenceInjection,
  extractDataLayerEvidence,
  isEvidenceInjectionUseful,
} from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { buildExpertInsight } from "../lib/miaExpertInsightGenerationLayer.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { finalizeReplyWithSpecialistNarrative } from "../lib/miaSpecialistNarrativeEngine.js";
import { findInventedSpecViolations } from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-data-layer-evidence-injection-audit.js",
  "test-mia-expert-insight-generation-audit.js",
  "test-mia-specialist-narrative-engine-audit.js",
];

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const msg = `  ✗ ${label}${detail ? " — " + detail : ""}`;
    failures.push(msg.trim());
    console.log(msg);
  }
}

function noTechnicalLeak(text = "") {
  const body = String(text || "");
  return !detectRawDataLayerTokenLeak(body).leak && !/[_|]/.test(body) && assertUserFacingDataLayerText(body).ok;
}

function buildPipelineReply(trustedSpecs, query = "produto bom", category = "celular", axis = "performance") {
  const winnerName = trustedSpecs.official_name;
  const product = {
    product_name: winnerName,
    isDataLayerProduct: true,
    trustedSpecs,
    category,
  };

  const specialist = buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition: {
      primaryAxis: axis,
      consequenceChain: {
        impact: "mais folga no uso pesado do dia a dia",
        consequence: "menos chance de sentir limitação depois de alguns meses",
      },
    },
    querySignals: {},
    decisionMemory: {
      lastWinnerAdvantages: [axis],
      lastWinnerSacrifices: ["screen"],
      lastTradeoff: trustedSpecs.weaknesses?.[0] || "",
    },
    responsePath: "return_seguro",
    sessionContext: {},
  });

  if (!specialist.ok) return { reply: "", winnerName };

  const narrative = finalizeReplyWithSpecialistNarrative({
    reply: specialist.text,
    query,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    responsePath: "return_seguro",
  });

  return {
    reply: narrative.text || specialist.text,
    winnerName,
    specialist,
  };
}

console.log("\nPATCH 9.2B — Data Layer Humanization Guard Audit\n");

console.log("── A: snake_case simples ──");
const a = humanizeDataLayerText("excelente_revenda");
assert("A: humaniza", a.ok && a.humanized);
assert("A: sem underscore", !a.text.includes("_"));
assert("A: sem leak", noTechnicalLeak(a.text), a.text);

console.log("\n── B: múltiplos tokens com ; ──");
const b = humanizeDataLayerText("excelente_revenda;iphone_muito_procurado");
assert("B: humaniza", b.ok && b.humanized);
assert("B: sem ;", !b.text.includes(";"));
assert("B: sem _", !b.text.includes("_"));
assert("B: sem leak", noTechnicalLeak(b.text), b.text);

console.log("\n── C: token técnico de mercado ──");
const c = humanizeDataLayerText("market_strong_resale");
assert("C: humaniza ou suprime", c.ok || c.suppressed);
if (c.ok) {
  assert("C: sem market_", !/market_/i.test(c.text));
  assert("C: sem snake_case", !/_/.test(c.text));
}

console.log("\n── D: token de risco ──");
const d = humanizeDataLayerText("risk_price_pressure");
assert("D: humaniza ou suprime", d.ok || d.suppressed);
if (d.ok) {
  assert("D: sem risk_", !/risk_/i.test(d.text));
  assert("D: sem snake_case", !/_/.test(d.text));
}

console.log("\n── E: texto humano já bom ──");
const humanText = "câmera consistente mesmo em fotos noturnas";
const e = humanizeDataLayerText(humanText);
assert("E: preserva", e.text === humanText);
assert("E: não suprime", !e.suppressed);

console.log("\n── F: texto misto ──");
const f = humanizeDataLayerText("boa câmera;excelente_revenda");
assert("F: humaniza", f.ok);
assert("F: sem ;", !f.text.includes(";"));
assert("F: sem _", !f.text.includes("_"));

console.log("\n── G: notebook ──");
const notebookSpecs = {
  official_name: "Notebook Vega Pro 14",
  category: "notebook",
  strengths: ["desempenho equilibrado para estudo e trabalho sem travar em multitarefa básica"],
  market_notes: ["memoria_armazenamento_peso_real;market_strong_value"],
  ideal_for: ["quem precisa de notebook para uso diário sem exagero"],
  weaknesses: ["nao_e_melhor_opcao_edicao_pesada"],
};
const gInjection = buildDataLayerEvidenceInjection({
  product: { product_name: notebookSpecs.official_name, trustedSpecs: notebookSpecs },
  query: "notebook para estudo",
  category: "notebook",
  primaryAxis: "performance",
  allowedEvidence: notebookSpecs.official_name,
  responsePath: "return_seguro",
});
const gPipeline = buildPipelineReply(notebookSpecs, "notebook para estudo", "notebook", "performance");
assert("G: injeção sem leak", !gInjection.paragraph || noTechnicalLeak(gInjection.paragraph));
assert("G: resposta sem leak", noTechnicalLeak(gPipeline.reply));
assert("G: winner preservado", gPipeline.reply.includes(notebookSpecs.official_name));

console.log("\n── H: monitor ──");
const monitorSpecs = {
  official_name: "Monitor Helix View 27",
  category: "monitor",
  strengths: ["fluidez boa para uso prolongado em home office"],
  market_notes: ["market_home_office_fluidez;resolucao_maxima_hype"],
  weaknesses: ["nao_topo_edicao_cor"],
};
const hPipeline = buildPipelineReply(monitorSpecs, "monitor home office", "monitor", "screen");
assert("H: resposta sem leak", noTechnicalLeak(hPipeline.reply));
assert("H: winner preservado", hPipeline.reply.includes(monitorSpecs.official_name));

console.log("\n── I: cadeira ──");
const chairSpecs = {
  official_name: "Cadeira Atlas Ergo",
  category: "cadeira",
  strengths: ["suporte basico_home_office"],
  market_notes: ["ajuste altura_apoio_lombar"],
  ideal_for: ["quem passa o dia inteiro em home office"],
};
const iPipeline = buildPipelineReply(chairSpecs, "cadeira ergonômica", "cadeira", "comfort");
assert("I: resposta sem leak", noTechnicalLeak(iPipeline.reply));
assert("I: winner preservado", iPipeline.reply.includes(chairSpecs.official_name));

console.log("\n── J: fallback seguro ambíguo ──");
const j = humanizeDataLayerText("xqz_qwerty_unknown_token");
assert("J: suprime ambíguo", j.suppressed && !j.ok);
assert("J: não inventa frase longa", !j.text || j.text.length < 40);

console.log("\n── Integração 9.1G / 9.1H ──");
const rawSpecs = {
  official_name: "Modelo Orion X1",
  category: "celular",
  strengths: ["excelente_revenda;iphone_muito_procurado"],
  market_notes: ["risk_price_pressure"],
  ideal_for: ["ideal_for_basic_user"],
  weaknesses: ["tela de 60 Hz pode parecer menos fluida"],
};
const candidates = extractDataLayerEvidence(rawSpecs, "longevity");
assert("integração: candidatos humanizados", candidates.every((c) => noTechnicalLeak(c.text)));
const injection = buildDataLayerEvidenceInjection({
  product: { product_name: rawSpecs.official_name, trustedSpecs: rawSpecs },
  query: "celular bom",
  category: "celular",
  primaryAxis: "longevity",
  allowedEvidence: rawSpecs.official_name,
  responsePath: "return_seguro",
});
assert(
  "integração: parágrafo 9.1G sem leak",
  !injection.paragraph || noTechnicalLeak(injection.paragraph)
);
if (injection.ok) {
  const insight = buildExpertInsight({
    evidence: injection.evidence,
    product: { product_name: rawSpecs.official_name, trustedSpecs: rawSpecs },
    query: "celular bom",
    primaryAxis: "longevity",
    allowedEvidence: rawSpecs.official_name,
    responsePath: "return_seguro",
    structuredFacts: { mode: "data_layer" },
  });
  assert(
    "integração: 9.1H não usa evidência suprimida",
    insight.error !== "suppressed_raw_evidence" || !injection.ok
  );
  assert(
    "integração: insight sem leak",
    !insight.paragraph || noTechnicalLeak(insight.paragraph)
  );
}
assert(
  "integração: sem invenção",
  findInventedSpecViolations(injection.paragraph || "", rawSpecs.official_name).length === 0
);

console.log("\n── Guard em trustedSpecs ──");
const guarded = applyDataLayerHumanizationGuard(rawSpecs);
assert("guard: specs alterados", guarded.changed);
assert(
  "guard: strengths humanizados",
  guarded.specs.strengths?.every((entry) => noTechnicalLeak(entry))
);

console.log("\n── Regressão 9.1G / 9.1H / 9.2A ──");
let regressionFailures = 0;
const skipRegression = process.env.MIA_SKIP_NESTED_REGRESSION === "1";
if (skipRegression) {
  console.log("SKIP (MIA_SKIP_NESTED_REGRESSION=1)");
} else {
  for (const script of PRIOR_AUDITS) {
    const run = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
      encoding: "utf8",
      stdio: "pipe",
      cwd: ROOT,
      env: { ...process.env, MIA_SKIP_NESTED_REGRESSION: "1" },
    });
    const ok = run.status === 0;
    console.log(`${ok ? "PASS" : "FAIL"} ${script}`);
    if (!ok) regressionFailures++;
  }
}

console.log("\n══════════════════════════════════════");
console.log(`Static: ${passed} passed, ${failed} failed`);
console.log(`Regressions: ${skipRegression ? "skipped" : `${PRIOR_AUDITS.length - regressionFailures}/${PRIOR_AUDITS.length} passed`}`);
const verdict =
  failed === 0 && (skipRegression || regressionFailures === 0)
    ? "A) ROBUST"
    : failed === 0
      ? "B) PARTIAL"
      : "C) FAIL";
console.log(`VEREDITO FINAL: ${verdict}`);
console.log("══════════════════════════════════════\n");

if (failures.length) {
  console.log("Failures:");
  for (const msg of failures) console.log(msg);
}

process.exit(failed === 0 ? 0 : 1);
