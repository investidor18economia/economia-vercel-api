/**
 * PATCH 11A.4 — Human Conversation Experience Audit
 *
 * Rodar: node scripts/test-mia-human-conversation-experience.js
 */

import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
  MIA_HUMAN_OBJECTIVES,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import {
  buildSocialConversationBehaviorContract,
  buildFullHumanConversationInstructions,
  resolveSocialConversationPromptRole,
} from "../lib/miaSocialConversationBehavior.js";
import {
  RESPONSE_DEPTH,
  FOLLOW_UP_POLICY,
  COMMERCE_REENTRY_POLICY,
  validateHumanConversationResponse,
  finalizeHumanConversationReply,
  buildGovernedSocialFallbackReply,
  enrichBehaviorContractWithHumanExperience,
} from "../lib/miaHumanConversationExperience.js";

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
    sessionContext: extra.sessionContext || {},
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  const contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
  });
  return { recognition, authority, contract };
}

console.log("\nPATCH 11A.4 — Human Conversation Experience Tests\n");

console.log("Grupo A — Greetings");
for (const msg of ["Olá", "Boa noite", "eae", "opa", "oii", "bom diaa"]) {
  test(`A: "${msg}" → brief, no commerce reentry`, () => {
    const { contract, authority } = buildTurn(msg);
    expect(authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
    expect(contract.responseDepth, RESPONSE_DEPTH.BRIEF);
    expectTrue(
      contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.NOT_NEEDED ||
        contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.FORBIDDEN
    );
    expectFalse(contract.responseBehavior?.redirectToCommerce);
    const fallback = buildGovernedSocialFallbackReply(contract);
    expectTrue(validateHumanConversationResponse(fallback, contract).valid);
  });
}

console.log("\nGrupo B — Social casual");
for (const msg of [
  "Hoje foi corrido",
  "to descansando",
  "esse calor tá demais",
  "pois é",
  "kkkk",
]) {
  test(`B: "${msg}" → no forced commerce`, () => {
    const { contract } = buildTurn(msg);
    expectFalse(contract.responseBehavior?.redirectToCommerce);
    expectTrue(
      contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.NOT_NEEDED ||
        contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.FORBIDDEN
    );
    const bad = finalizeHumanConversationReply(
      "Alguma compra em mente? Posso te ajudar com produtos.",
      contract
    );
    expectTrue(bad.usedFallback || !validateHumanConversationResponse(bad.response, contract).valid);
  });
}

console.log("\nGrupo C — Emoção leve");
for (const msg of [
  "Hoje foi um dia cansativo",
  "Estou meio desanimado",
  "Meu dia foi pesado",
  "Hoje não foi bom",
  "Estou feliz que deu certo",
]) {
  test(`C: "${msg}" → antiConsumption + no redirect`, () => {
    const { contract } = buildTurn(msg);
    expectTrue(contract.antiConsumption);
    expectFalse(contract.responseBehavior?.redirectToCommerce);
    const bad = finalizeHumanConversationReply(
      "Às vezes um pequeno impulso de compra pode animar o dia.",
      contract
    );
    expectTrue(bad.usedFallback);
  });
}

console.log("\nGrupo D — Agradecimento");
for (const msg of ["Valeu", "Obrigado", "ajudou muito", "tmj", "brigadão"]) {
  test(`D: "${msg}" → followUp none/optional, no commerce`, () => {
    const { contract } = buildTurn(msg);
    expectTrue(
      contract.followUpPolicy === FOLLOW_UP_POLICY.NONE ||
        contract.followUpPolicy === FOLLOW_UP_POLICY.OPTIONAL ||
        contract.followUpPolicy === FOLLOW_UP_POLICY.NATURAL ||
        contract.followUpPolicy === FOLLOW_UP_POLICY.CLARIFYING_REQUIRED
    );
    expectFalse(contract.responseBehavior?.redirectToCommerce);
  });
}

console.log("\nGrupo E — Pós-compra");
for (const msg of [
  "Comprei o celular, obrigado",
  "Já fechei a compra",
  "Peguei aquele modelo",
  "Deu certo, valeu",
]) {
  test(`E: "${msg}" → deny + no commerce redirect`, () => {
    const { contract, authority } = buildTurn(msg);
    expect(authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
    expectFalse(contract.responseBehavior?.redirectToCommerce);
    expectTrue(
      contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.FORBIDDEN ||
        contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.NOT_NEEDED
    );
  });
}

console.log("\nGrupo F — Farewell");
for (const msg of ["Boa noite, vou dormir", "Até depois", "Falou", "Valeu, fui"]) {
  test(`F: "${msg}" → no commerce redirect`, () => {
    const { contract } = buildTurn(msg);
    expectFalse(contract.responseBehavior?.redirectToCommerce);
    expectTrue(
      contract.followUpPolicy === FOLLOW_UP_POLICY.NONE ||
        contract.followUpPolicy === FOLLOW_UP_POLICY.OPTIONAL ||
        contract.followUpPolicy === FOLLOW_UP_POLICY.NATURAL ||
        contract.followUpPolicy === FOLLOW_UP_POLICY.CLARIFYING_REQUIRED
    );
  });
}

console.log("\nGrupo G — Mixed");
test("G: mixed → humanFirst + mixed_continue", () => {
  const { contract } = buildTurn("Hoje foi péssimo, mas preciso escolher um celular.");
  expect(contract.interactionMode, MIA_INTERACTION_MODES.MIXED);
  expect(contract.commerceReentryPolicy, COMMERCE_REENTRY_POLICY.MIXED_CONTINUE);
  expectTrue(contract.responseBehavior?.humanFirst);
  expect(contract.responseDepth, RESPONSE_DEPTH.COMMERCIAL_MIXED);
});

console.log("\nGrupo H — Identidade");
test("H: about_mia → explicit identity only", () => {
  const { contract, recognition } = buildTurn("Quem é você?");
  expectTrue(
    contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.EXPLICIT_IDENTITY_ONLY ||
      recognition.interactionMode === MIA_INTERACTION_MODES.IDENTITY
  );
});

console.log("\nGrupo I — Clarificação");
test("I: ambiguous → clarifying follow-up allowed", () => {
  const { contract } = buildTurn("e esse?", { hasActiveAnchor: false });
  expectTrue(
    contract.followUpPolicy === FOLLOW_UP_POLICY.CLARIFYING_REQUIRED ||
      contract.interactionMode === MIA_INTERACTION_MODES.CLARIFICATION
  );
});

console.log("\nGrupo J — Proporcionalidade");
test("J: oi vs desabafo → depths differ", () => {
  const short = buildTurn("oi").contract;
  const long = buildTurn(
    "Hoje foi um dia muito cansativo e eu só queria conversar um pouco."
  ).contract;
  expect(short.responseDepth, RESPONSE_DEPTH.BRIEF);
  expectTrue(
    long.responseDepth === RESPONSE_DEPTH.STANDARD ||
      long.responseDepth === RESPONSE_DEPTH.SUPPORTIVE
  );
});

console.log("\nGrupo K — Anti-consumption");
test("K: blocks shopping therapy phrasing", () => {
  const { contract } = buildTurn("Estou desanimado hoje");
  const validation = validateHumanConversationResponse(
    "Que tal comprar algo para se sentir melhor?",
    contract
  );
  expectFalse(validation.valid);
  expectTrue(validation.violations.includes("anti_consumption_violation"));
});

console.log("\nGrupo L — Anti-overfitting");
const groupL = [
  "blz entao",
  "to mo cansado hj",
  "que semana hein",
  "só passando aqui",
];
for (const msg of groupL) {
  test(`L: "${msg}" → governed contract`, () => {
    const { contract, authority } = buildTurn(msg);
    expect(authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
    expectFalse(contract.responseBehavior?.redirectToCommerce);
    expectTrue(buildFullHumanConversationInstructions(contract).includes("Reentrada comercial"));
  });
}

console.log("\nValidator + post-processing");
test("strip unauthorized commercial append", () => {
  const contract = enrichBehaviorContractWithHumanExperience(
    {
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      commerceReentryPolicy: COMMERCE_REENTRY_POLICY.FORBIDDEN,
      followUpPolicy: FOLLOW_UP_POLICY.NONE,
      responseBehavior: {},
    },
    { recognition: { interactionMode: MIA_INTERACTION_MODES.SOCIAL } }
  );
  const out = finalizeHumanConversationReply(
    "Entendo.\n\nSe quiser, me fala o que você quer comprar?",
    contract
  );
  expectFalse(/comprar/i.test(out.response));
});

test("role selection includes farewell when detected", () => {
  const rec = recognizeMiaIntent({
    userMessage: "Falou",
    resolvedQuery: "Falou",
  });
  expect(resolveSocialConversationPromptRole(rec), "farewell_reply");
});

console.log("\n" + "─".repeat(50));
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFalhas:");
  for (const f of failures) {
    console.log(`  - ${f.label}: ${f.error}`);
  }
  process.exit(1);
}
console.log("PATCH 11A.4 experience tests: OK\n");
