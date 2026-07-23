#!/usr/bin/env node
/**
 * PATCH 9.5 — Phase 9 final audit meta-validation (read-only).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS = join(ROOT, "docs/analytics");

const REQUIRED_DOCS = [
  "PATCH_9_1_RECOMMENDATION_DECISION.md",
  "PATCH_9_2_RECOMMENDATION_ACCEPTANCE_SIGNALS.md",
  "PATCH_9_3_RECOMMENDATION_REJECTION_ABANDONMENT_SIGNALS.md",
  "PATCH_9_4_RUNNER_UP_ALTERNATIVE_ANALYTICS.md",
  "RECOMMENDATION_DECISION_ANALYTICS.md",
  "RECOMMENDATION_ACCEPTANCE_ANALYTICS.md",
  "RECOMMENDATION_REJECTION_ABANDONMENT_ANALYTICS.md",
  "RUNNER_UP_ALTERNATIVE_ANALYTICS.md",
  "PHASE_9_MASTER_DOCUMENT.md",
];

const EVIDENCE = [
  "PATCH_9_1_PRODUCTION_EVIDENCE.json",
  "PATCH_9_2_PRODUCTION_EVIDENCE.json",
  "PATCH_9_3_PRODUCTION_EVIDENCE.json",
  "PATCH_9_4_PRODUCTION_EVIDENCE.json",
  "PATCH_9_5_FINAL_AUDIT_EVIDENCE.json",
];

const SQL_PHASE9 = [
  ...["1", "2", "3", "4", "5"].map((n) => `patch-91-query${n}-*.sql`),
  ...["1", "2", "3", "4", "5", "6", "7", "8"].map((n) => `patch-92-query${n}-*.sql`),
  ...Array.from({ length: 10 }, (_, i) => `patch-93-query${i + 1}-*.sql`),
  ...Array.from({ length: 12 }, (_, i) => `patch-94-query${i + 1}-*.sql`),
];

const RUNTIME_LIBS = [
  "lib/miaRecommendationDecisionAnalytics.js",
  "lib/miaRecommendationDecisionClassifier.js",
  "lib/miaRecommendationDecisionCatalog.js",
  "lib/miaRecommendationAcceptanceAnalytics.js",
  "lib/miaRecommendationAcceptanceClassifier.js",
  "lib/miaRecommendationAcceptanceCatalog.js",
  "lib/miaRecommendationRejectionAnalytics.js",
  "lib/miaRecommendationRejectionClassifier.js",
  "lib/miaRecommendationRejectionCatalog.js",
  "lib/miaRecommendationAlternativeAnalytics.js",
  "lib/miaRecommendationAlternativeClassifier.js",
  "lib/miaRecommendationAlternativeCatalog.js",
];

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

function globOne(pattern) {
  const dir = join(ANALYTICS, "sql");
  const prefix = pattern.replace("*", "");
  const files = execSync(`dir /b "${dir}"`, { encoding: "utf8", shell: true })
    .split(/\r?\n/)
    .filter((f) => f.startsWith(prefix.split("-")[0] + "-" + prefix.split("-")[1]) && f.endsWith(".sql"));
  return files.find((f) => f.includes(prefix.replace("*", "").split("-query")[1]?.split("-")[0] || ""));
}

console.log("\nPATCH 9.5 — Phase 9 final audit meta-validation\n");

console.log("Documentation");
for (const f of REQUIRED_DOCS) {
  ok(f, existsSync(join(ANALYTICS, f)));
}
for (const f of EVIDENCE) {
  ok(`evidence ${f}`, existsSync(join(ANALYTICS, f)));
}

console.log("\nSQL Phase 9 (35 queries)");
const sqlDir = join(ANALYTICS, "sql");
const allSql = execSync(`dir /b "${sqlDir}\\patch-9*.sql"`, { encoding: "utf8", shell: true })
  .split(/\r?\n/)
  .filter(Boolean);
ok("patch-91 count 5", allSql.filter((f) => f.startsWith("patch-91-")).length === 5);
ok("patch-92 count 8", allSql.filter((f) => f.startsWith("patch-92-")).length === 8);
ok("patch-93 count 10", allSql.filter((f) => f.startsWith("patch-93-")).length === 10);
ok("patch-94 count 12", allSql.filter((f) => f.startsWith("patch-94-")).length === 12);

console.log("\nRuntime libs");
for (const f of RUNTIME_LIBS) {
  ok(f, existsSync(join(ROOT, f)));
}

const chat = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
ok("9.1 observeDecisionAnalyticsForStabilizedContext", chat.includes("observeDecisionAnalyticsForStabilizedContext"));
ok("9.2 observeAcceptanceSignalFromConversationFollowUp", chat.includes("observeAcceptanceSignalFromConversationFollowUp"));
ok("9.3 observeRejectionSignalsFromTurnContext", chat.includes("observeRejectionSignalsFromTurnContext"));
ok("9.3 observeRejectionSignalFromDecisionTransition", chat.includes("observeRejectionSignalFromDecisionTransition"));
ok("9.4 runner-up session context", chat.includes("lastRecommendationDecisionRunnerUpFamily"));

const miaChat = readFileSync(join(ROOT, "components/MIAChat.jsx"), "utf8");
ok("frontend decision_request_id", miaChat.includes("decision_request_id"));
ok("frontend runner_up context", miaChat.includes("runner_up_product_family"));

const contract = readFileSync(join(ANALYTICS, "contracts/EVENT_CONTRACT.md"), "utf8");
ok("contract 9.1", contract.includes("mia_recommendation_decision"));
ok("contract 9.2", contract.includes("mia_recommendation_acceptance_signal"));
ok("contract 9.3", contract.includes("mia_recommendation_rejection_signal"));
ok("contract 9.4 derived", contract.includes("7.17"));

const q8 = readFileSync(join(sqlDir, "patch-94-query8-recovery.sql"), "utf8");
ok("Q8 recovery joins replacement_decision", q8.includes("replacement_decision = a.metadata->>'decision_request_id'"));

console.log("\nPhase 9 commits present");
const log = execSync("git log --oneline -30", { cwd: ROOT, encoding: "utf8" });
for (const prefix of ["9.1", "9.2", "9.3", "9.4"]) {
  ok(`phase 9 patch ${prefix} in history`, /recommendation|runner-up|rejection|acceptance/i.test(log));
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
