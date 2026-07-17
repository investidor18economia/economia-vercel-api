/**
 * PATCH 11A.9 — Post-Seal Mutation Audit
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildPayloadFingerprint,
  createRuntimeEnforcementContext,
  deepSealPayload,
  detectPostSealMutation,
  sealRuntimePayload,
} from "../lib/miaRuntimeEnforcement.js";
import {
  auditHandlerPostSealPatterns,
  POST_SEAL_MUTATION_AUDIT_VERSION,
} from "../lib/miaPostSealMutationAudit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDLER_PATH = path.join(__dirname, "..", "pages", "api", "chat-gpt4o.js");

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

console.log("\nPATCH 11A.9 — Post-Seal Mutation Audit\n");

const handlerSource = fs.readFileSync(HANDLER_PATH, "utf8");
const handlerAudit = auditHandlerPostSealPatterns(handlerSource);

console.log("Grupo A — Handler static audit");
{
  expect(POST_SEAL_MUTATION_AUDIT_VERSION === "11A.9.1", "A: audit version");
  expect(handlerAudit.postSealMutationAuditComplete === true, "A: no risky post-seal patterns");
  expect(handlerAudit.debugInjectionAuthorizedBeforeSeal === true, "A: debug before seal strategy");
}

console.log("\nGrupo B — Deep fingerprint detects nested mutation");
{
  const ctx = createRuntimeEnforcementContext();
  const body = {
    reply: "ok",
    prices: [{ product_name: "A", price: 10 }],
    session_context: { lastInteractionType: "commercial" },
  };
  sealRuntimePayload(ctx, body);
  body.prices[0].price = 999;
  const check = detectPostSealMutation(ctx, body);
  expect(check.mutated === true, "B: nested price mutation detected");
  expect(ctx.postSealMutationDetected === true, "B: flag set");
}

console.log("\nGrupo C — Stable fingerprint when unchanged");
{
  const body = {
    reply: "hello",
    prices: [],
    winner: null,
    session_context: {},
  };
  const fp1 = buildPayloadFingerprint(body);
  const fp2 = buildPayloadFingerprint(deepSealPayload(body));
  expect(fp1 === fp2, "C: fingerprint stable across deep seal");
}

console.log("\nGrupo D — Provenance in fingerprint");
{
  const body = {
    reply: "x",
    session_context: {
      semanticStateProvenance: { source: "test" },
    },
  };
  const fp = buildPayloadFingerprint(body);
  body.session_context.semanticStateProvenance.source = "mutated";
  const fp2 = buildPayloadFingerprint(body);
  expect(fp !== fp2, "D: provenance mutation changes fingerprint");
}

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
