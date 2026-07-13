/**
 * PATCH Comercial 4E-B.6-AUDIT — Accessory Query Runtime Path Audit
 *
 * Usage:
 *   node scripts/test-mia-accessory-query-runtime-path-audit.js
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ACCESSORY_QUERY_RUNTIME_PATH_AUDIT_VERSION,
  auditAccessoryQueryRuntimePath,
  summarizeAccessoryQueryRuntimePathAudits,
} from "../lib/commercial/accessoryQueryRuntimePathAudit.js";
import { detectAccessoryIntent } from "../lib/commercial/accessoryIntentLockGuard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ACCESSORY_QUERIES = [
  "pelicula iphone 13",
  "capa iphone 13",
  "controle ps5",
  "cabo hdmi",
  "carregador notebook lenovo",
  "controle remoto samsung",
  "suporte monitor",
  "dock notebook",
  "fonte pc gamer",
  "mousepad gamer",
  "headset gamer",
  "case iphone 13",
  "pelicula galaxy a55",
];

const MAIN_PRODUCT_QUERIES = [
  "iphone 13",
  "galaxy a55",
  "ps5",
  "notebook lenovo",
  "monitor gamer",
  "tv samsung",
  "cadeira gamer",
];

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function runRegression(script, label) {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  assert(`regression ${label}`, result.status === 0);
}

console.log(
  `\nPATCH Comercial 4E-B.6-AUDIT — Accessory Query Runtime Path Audit (${ACCESSORY_QUERY_RUNTIME_PATH_AUDIT_VERSION})\n`
);

console.log("── Module contract ──");
const moduleSource = readFileSync(
  join(ROOT, "lib/commercial/accessoryQueryRuntimePathAudit.js"),
  "utf8"
);
assert("version 4E-B.6-AUDIT", ACCESSORY_QUERY_RUNTIME_PATH_AUDIT_VERSION === "4E-B.6-AUDIT");
assert("uses detectAccessoryIntent", moduleSource.includes("detectAccessoryIntent"));
assert("uses bootstrapSpecificProductLock", moduleSource.includes("bootstrapSpecificProductLock"));
assert("uses filterDataLayerCandidatesForCommercialFallback", moduleSource.includes("filterDataLayerCandidatesForCommercialFallback"));
assert("uses enforceAccessoryCommercialRuntimeSelection", moduleSource.includes("enforceAccessoryCommercialRuntimeSelection"));
assert("uses resolveOfficialCommercialOffer", moduleSource.includes("resolveOfficialCommercialOffer"));
assert("does not mutate runtime modules", !moduleSource.includes("StrReplace") && !moduleSource.includes("writeFileSync"));

console.log("\n── Accessory path audit (controlled) ──");
const accessoryReports = [];
for (const query of ACCESSORY_QUERIES) {
  const report = await auditAccessoryQueryRuntimePath({ query, mode: "controlled" });
  accessoryReports.push(report);

  assert(
    `${query} detects accessory intent`,
    report.accessoryIntent?.isAccessoryIntent === true,
    String(report.accessoryIntent?.matchedSignals)
  );
  assert(
    `${query} lock bypassed`,
    report.specificProductLock?.bypassed === true,
    report.specificProductLock?.reason || "lock active"
  );
}

console.log("\n── Main product preservation ──");
const mainReports = [];
for (const query of MAIN_PRODUCT_QUERIES) {
  const report = await auditAccessoryQueryRuntimePath({ query, mode: "controlled" });
  mainReports.push(report);
  assert(
    `${query} not accessory intent`,
    report.accessoryIntent?.isAccessoryIntent !== true
  );
  assert(`${query} main product verdict`, report.verdict?.passed === true, report.verdict?.failureReason || "");
}

const allReports = [...accessoryReports, ...mainReports];
const summary = summarizeAccessoryQueryRuntimePathAudits(allReports);

console.log("\n── Failure detection (expected for known manual failures) ──");
const knownManualFailures = [
  "pelicula iphone 13",
  "capa iphone 13",
  "controle ps5",
  "cabo hdmi",
  "carregador notebook lenovo",
];
for (const query of knownManualFailures) {
  const report = accessoryReports.find((r) => r.query === query);
  assert(
    `${query} audit identifies incompatible card`,
    report?.verdict?.passed === false,
    report?.card?.productName || "(empty)"
  );
  assert(
    `${query} audit names failure stage`,
    !!report?.verdict?.failureStage && report.verdict.failureStage !== "none",
    report?.verdict?.failureStage || "(none)"
  );
  assert(
    `${query} audit recommends patch`,
    !!report?.verdict?.recommendedPatch,
    report?.verdict?.recommendedPatch || "(none)"
  );
}

console.log("\n── Stage attribution sanity ──");
const failedAccessory = accessoryReports.filter((r) => !r.verdict?.passed);
const stageSet = new Set(failedAccessory.map((r) => r.verdict?.failureStage));
assert(
  "failures attributed to known stages",
  [...stageSet].every((s) =>
    [
      "cognitive_winner",
      "commercial_runtime_activation",
      "accessory_runtime_enforcement",
      "card_mapping",
      "data_layer_candidates",
      "response_builder",
      "specific_product_lock",
    ].includes(s)
  ),
  [...stageSet].join(", ")
);

console.log("\n── DEV endpoint ──");
const devSource = readFileSync(
  join(ROOT, "pages/api/dev/accessory-query-runtime-path-audit.js"),
  "utf8"
);
assert("dev endpoint exists", devSource.includes("auditAccessoryQueryRuntimePath"));
assert("dev endpoint uses buildAccessoryQueryRuntimePathDevPayload", devSource.includes("buildAccessoryQueryRuntimePathDevPayload"));

console.log("\n── Architecture preservation ──");
const UNTOUCHED = [
  "pages/api/chat-gpt4o.js",
  "lib/miaCognitiveRouter.js",
  "lib/miaProductExplanationBuilder.js",
  "components/MIAChat.jsx",
];
for (const file of UNTOUCHED) {
  const content = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} not importing audit module`, !content.includes("accessoryQueryRuntimePathAudit"));
}

console.log("\n── Regressions ──");
runRegression("test-mia-accessory-commercial-runtime-enforcement-audit.js", "4E-B.1");
runRegression("test-mia-non-data-layer-fallback-candidate-isolation-audit.js", "4E-B.3");
runRegression("test-mia-commercial-runtime-controlled-revalidation-audit.js", "4E-B.4");
runRegression("test-mia-api-handler-contract-compliance-audit.js", "4E-B.5");
runRegression("test-mia-tone-compliance-guard-audit.js", "Tone Compliance");

console.log("\n════════════════════════════════════════════════════════");
console.log("Accessory Runtime Path Audit");
console.log("════════════════════════════════════════════════════════");
console.log(`Total:     ${summary.total}`);
console.log(`Passed:    ${summary.passed}`);
console.log(`Failed:    ${summary.failed}`);
console.log("\nFailures by stage:");
for (const [stage, count] of Object.entries(summary.failuresByStage)) {
  if (count > 0) console.log(`- ${stage}: ${count}`);
}
console.log("\nRecommended patches:");
for (const patch of summary.recommendedPatches) {
  console.log(`- ${patch}`);
}
console.log("\n── Sample failure traces ──");
for (const row of summary.rows.filter((r) => !r.passed).slice(0, 5)) {
  console.log(
    `  ${row.query} → stage=${row.failureStage} card=${row.card || "(empty)"} winner=${row.winner || "(empty)"}`
  );
  console.log(`    reason: ${row.failureReason}`);
}

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(
  failed === 0
    ? "\nVeredito: A) ROBUST (audit-only — falhas reais identificadas corretamente)\n"
    : "\nVeredito: C) FAILED (harness audit)\n"
);
process.exit(failed > 0 ? 1 : 0);
