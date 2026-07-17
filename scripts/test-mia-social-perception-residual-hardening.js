/**
 * PATCH 11A.5F — Social Perception Residual Hardening
 *
 * Rodar: node scripts/test-mia-social-perception-residual-hardening.js
 */

import {
  recognizeMiaIntent,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildIntentAuthorityFromRecognition,
} from "../lib/miaIntentAuthority.js";
import {
  buildSocialConversationBehaviorContract,
} from "../lib/miaSocialConversationBehavior.js";
import {
  finalizeHumanConversationReply,
  RESPONSE_DEPTH,
} from "../lib/miaHumanConversationExperience.js";
import {
  validateSocialLinguisticIntegrity,
  validateIdentityResponse,
  validateFarewellExtension,
  validateSocialResponsePerception,
  buildSpecificGovernedFallback,
  stripPerceptionViolations,
} from "../lib/miaSocialResponsePerception.js";
import {
  buildBriefOfficialIdentityReply,
  containsStaleBrandReference,
} from "../lib/miaCompanyKnowledge.js";
import { applyToneComplianceGuard } from "../lib/miaToneComplianceGuard.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    → ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function expect(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${label ? ` [${label}]` : ""}`
    );
  }
}

function expectTrue(val, label = "") {
  if (!val) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(val, label = "") {
  if (val) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

function buildTurn(message, extra = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    detectedIntent: extra.detectedIntent || "search",
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  const contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages: extra.conversationMessages || [],
  });
  return { recognition, authority, contract };
}

console.log("\nPATCH 11A.5F — Social Perception Residual Hardening Tests\n");

console.log("Grupo A — Short reactions");
for (const msg of ["kkkk", "kk", "haha", "boa", "show", "pois é", "aí sim", "hm"]) {
  test(`A: "${msg}" → valid short reaction`, () => {
    const { contract } = buildTurn(msg);
    expectTrue(contract.shortReactionMode);
    expect(contract.responseDepth, RESPONSE_DEPTH.MINIMAL);
    const fallback = buildSpecificGovernedFallback(contract);
    expectTrue(validateSocialLinguisticIntegrity(fallback, contract).valid);
    expectFalse(/poise/i.test(fallback));
    const finalized = finalizeHumanConversationReply("Parece que algo te divertiu!", contract);
    expectFalse(/poise/i.test(finalized.response));
    expectFalse(FORCED_QUESTION(finalized.response));
  });
}

console.log("\nGrupo B — Linguistic integrity");
test("B: rejects poise.", () => {
  expectFalse(validateSocialLinguisticIntegrity("poise.", { shortReactionMode: true }).valid);
});
test("B: accepts Pois é.", () => {
  expectTrue(validateSocialLinguisticIntegrity("Pois é.", { shortReactionMode: true }).valid);
});
test("B: rejects sim..", () => {
  expectFalse(validateSocialLinguisticIntegrity("sim..", {}).valid);
});
test("B: tone guard does not corrupt Hehe!", () => {
  const out = applyToneComplianceGuard({
    response: "Hehe!",
    toneProfile: { toneProfile: "informal_light" },
    socialResponse: true,
    shortReactionMode: true,
    responseDepth: "minimal",
  });
  expect(out.response, "Hehe!");
});

console.log("\nGrupo C — Identity accuracy");
for (const msg of [
  "Quem é você?",
  "Quem é você mesmo?",
  "O que é a MIA?",
  "Você é da Teilor?",
  "Você é uma pessoa?",
]) {
  test(`C: "${msg}" → MIA/Teilor, no EconomIA`, () => {
    const { contract } = buildTurn(msg);
    const reply = buildBriefOfficialIdentityReply(msg);
    expectTrue(/\bMIA\b/i.test(reply));
    expectTrue(/\bTeilor\b/i.test(reply));
    expectFalse(containsStaleBrandReference(reply));
    const v = validateIdentityResponse(reply, contract, msg);
    expectTrue(v.valid, msg);
  });
}

console.log("\nGrupo D — Conversation capability");
for (const msg of [
  "Você consegue conversar normalmente?",
  "Você só fala de compras?",
  "Dá pra trocar ideia com você?",
]) {
  test(`D: "${msg}" → brief capability`, () => {
    const { contract } = buildTurn(msg);
    const reply = buildBriefOfficialIdentityReply(msg);
    expectTrue(/\bcompras\b/i.test(reply) || /\bconversar\b/i.test(reply));
    expectFalse(containsStaleBrandReference(reply));
    expectFalse(/\?\s*$/.test(reply));
  });
}

console.log("\nGrupo E — Farewell");
for (const msg of [
  "Boa noite, vou descansar",
  "Até depois",
  "Valeu, fui",
  "Falou",
  "Vou dormir",
]) {
  test(`E: "${msg}" → brief closed farewell`, () => {
    const { contract } = buildTurn(msg);
    expectTrue(contract.farewellMode);
    const longReply =
      "Boa noite! Aproveite seu descanso. Espero que tenha uma ótima noite de sono!";
    expectFalse(validateFarewellExtension(longReply, contract).valid);
    const fallback = buildSpecificGovernedFallback(contract);
    expectTrue(validateFarewellExtension(fallback, contract).valid);
    expectFalse(/\?\s*$/.test(fallback));
  });
}

console.log("\nGrupo F — Post-processing");
test("F: stripPerceptionViolations preserves Pois é.", () => {
  const out = stripPerceptionViolations("Pois é.", { closureStyle: "closed" });
  expect(out, "Pois é.");
});
test("F: finalize rejects institutional identity LLM output", () => {
  const { contract } = buildTurn("Quem é você mesmo?");
  const bad =
    "Eu sou a MIA, sua assistente inteligente de compras do app EconomIA. Minha função é ajudar você.";
  const out = finalizeHumanConversationReply(bad, contract);
  expectFalse(containsStaleBrandReference(out.response));
  expectTrue(/\bTeilor\b/i.test(out.response));
});

console.log("\nGrupo G — Anti-overfitting");
for (const msg of ["vlw fui", "flw", "cê é robo?", "quem eh vc"]) {
  test(`G: "${msg}" → governed without corruption`, () => {
    const { contract } = buildTurn(msg);
    const fallback = buildSpecificGovernedFallback(contract);
    expectFalse(/poise/i.test(fallback));
    expectTrue(validateSocialLinguisticIntegrity(fallback, contract).valid);
  });
}

function FORCED_QUESTION(text) {
  return /\?\s*$/.test(String(text || ""));
}

console.log("\n" + "─".repeat(50));
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFalhas:");
  for (const f of failures) {
    console.log(`  - ${f.label}: ${f.error}`);
  }
  process.exit(1);
}
console.log("PATCH 11A.5F residual hardening tests: OK\n");
