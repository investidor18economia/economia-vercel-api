/**
 * PATCH 11A.9A — Legacy runtime trace coverage
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDLER = path.join(__dirname, "..", "pages", "api", "chat-gpt4o.js");

let passed = 0;
let failed = 0;

function expect(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label}`);
    failed += 1;
  }
}

const src = fs.readFileSync(HANDLER, "utf8");

console.log("\nPATCH 11A.9A — Legacy Runtime Trace Coverage\n");

expect(src.includes("function sendRuntimeResponse("), "single public response interface");
expect(src.includes("runtimeEnforcementToTrace"), "runtime enforcement trace helper");
expect(src.includes("bindActiveExternalCallAccounting"), "external accounting bind");
expect(src.includes("sealRuntimePayload"), "seal before send");
expect((src.match(/res\.status\(200\)\.json/g) || []).length === 1, "single HTTP 200 sender");

const legacyPaths = ["return_seguro", "commercial_only_fallback", "legacy_llm_search"];
for (const legacyPath of legacyPaths) {
  expect(src.includes(`"${legacyPath}"`), `handler references ${legacyPath}`);
}

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
