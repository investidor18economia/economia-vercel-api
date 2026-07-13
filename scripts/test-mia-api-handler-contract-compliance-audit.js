/**
 * PATCH Comercial 4E-B.5 — API Handler Contract Compliance Audit
 *
 * Usage:
 *   node scripts/test-mia-api-handler-contract-compliance-audit.js
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export const API_HANDLER_CONTRACT_COMPLIANCE_VERSION = "4E-B.5";

const CHAT_API = join(ROOT, "pages", "api", "chat-gpt4o.js");

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

function extractHandlerSource(source = "") {
  const start = source.indexOf("export default async function handler(req, res) {");
  if (start === -1) return "";
  return source.slice(start);
}

function countMatches(text = "", pattern = /x/g) {
  return [...text.matchAll(pattern)].length;
}

console.log(
  `\nPATCH Comercial 4E-B.5 — API Handler Contract Compliance Audit (${API_HANDLER_CONTRACT_COMPLIANCE_VERSION})\n`
);

const chatSource = readFileSync(CHAT_API, "utf8");
const handlerSource = extractHandlerSource(chatSource);

console.log("── Handler contract ──");
assert("chat-gpt4o handler exists", handlerSource.length > 0);
assert(
  "no bare return res.status in handler",
  !/\breturn\s+res\.status\s*\(/.test(handlerSource)
);
assert(
  "handler uses void res.status returns",
  countMatches(handlerSource, /\breturn\s+void\s+res\.status\s*\(/g) >= 20
);
assert(
  "no bare return respondWithContract in handler",
  !/\breturn\s+respondWithContract\s*\(/.test(handlerSource)
);
assert(
  "handler uses void respondWithContract returns",
  countMatches(handlerSource, /\breturn\s+void\s+respondWithContract\s*\(/g) >= 20
);
assert(
  "OPTIONS uses explicit end + return",
  /if \(req\.method === "OPTIONS"\)\s*\{\s*res\.status\(204\)\.end\(\);\s*return;\s*\}/.test(
    handlerSource
  )
);

console.log("\n── respondWithContract helper ──");
assert(
  "respondWithContract does not return blocked object",
  !chatSource.includes("return { blocked: false }")
);
assert(
  "respondWithContract blocked path returns void",
  /if \(violation\.violation\)[\s\S]{0,400}\n\s*return;\n\s*\}/.test(chatSource)
);
assert(
  "respondWithContract sends json then returns void",
  /res\.status\(200\)\.json\([\s\S]{0,200}\n\s*\);\n\s*return;\n\}/.test(chatSource)
);

console.log("\n── Response paths preserved ──");
assert("401 invalid_api_key path", handlerSource.includes('error: "invalid_api_key"'));
assert("405 method not allowed path", handlerSource.includes('"Method not allowed"'));
assert("500 catch path", handlerSource.includes("chat-gpt4o.js error:"));
assert("respondWithContract still used", handlerSource.includes("return void respondWithContract("));
assert("commercial runtime activation import", chatSource.includes("resolveAndApplyCommercialRuntimeActivation"));
assert("analytics track path untouched", chatSource.includes("trackMiaEvent") || chatSource.includes("mia_debug"));

console.log("\n── Architecture preservation ──");
const UNTOUCHED = [
  "lib/miaCognitiveRouter.js",
  "lib/productSourceAdapter/commercialRuntimeActivation.js",
  "lib/productSourceAdapter/accessoryCommercialRuntimeEnforcement.js",
  "lib/miaCommercialCardTrustLabels.js",
  "lib/commercial/nonDataLayerFallbackCandidateIsolation.js",
];
for (const file of UNTOUCHED) {
  const content = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} unchanged by handler patch`, !content.includes("return void res.status"));
}

console.log("\n── Regressions ──");
const regressions = [
  ["scripts/test-mia-commercial-runtime-controlled-revalidation-audit.js", "4E-B.4"],
  ["scripts/test-mia-non-data-layer-fallback-candidate-isolation-audit.js", "4E-B.3"],
  ["scripts/test-mia-non-data-layer-card-trust-label-fix-audit.js", "4E-B.2"],
  ["scripts/test-mia-accessory-commercial-runtime-enforcement-audit.js", "4E-B.1"],
  ["scripts/test-mia-commercial-runtime-controlled-activation-audit.js", "4E-B"],
  ["scripts/test-mia-tone-compliance-guard-audit.js", "Tone Compliance"],
];

for (const [script, label] of regressions) {
  const result = spawnSync(process.execPath, [join(ROOT, script)], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  assert(`regression ${label}`, result.status === 0, (result.stderr || result.stdout || "").split("\n").slice(-2).join(" "));
}

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) ROBUST\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
