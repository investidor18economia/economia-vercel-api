/**
 * PATCH 11A.5 — Social Response Perception & Personality Audit
 *
 * Rodar: node scripts/test-mia-social-response-perception-personality.js
 */

import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import {
  buildSocialConversationBehaviorContract,
  buildFullHumanConversationInstructions,
} from "../lib/miaSocialConversationBehavior.js";
import {
  validateHumanConversationResponse,
  finalizeHumanConversationReply,
  buildGovernedSocialFallbackReply,
  FOLLOW_UP_POLICY,
} from "../lib/miaHumanConversationExperience.js";
import {
  SOCIAL_DISTANCE,
  CLOSURE_STYLE,
  RESPONSE_OPENING,
  validateSocialResponsePerception,
  extractContentAnchors,
  extractRepetitionSignalsFromHistory,
  buildSpecificGovernedFallback,
} from "../lib/miaSocialResponsePerception.js";

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
    conversationMessages: extra.conversationMessages || [],
  });
  return { recognition, authority, contract };
}

console.log("\nPATCH 11A.5 — Social Response Perception & Personality Tests\n");

console.log("Grupo A — Specificity");
for (const msg of [
  "Esse calor está demais.",
  "Hoje o trabalho foi pesado.",
  "Finalmente consegui descansar.",
  "Meu cachorro destruiu meu chinelo.",
]) {
  test(`A: "${msg}" → mustReferenceUserContent + anchor`, () => {
    const { contract } = buildTurn(msg);
    expectTrue(contract.mustReferenceUserContent);
    expectTrue(contract.contentAnchors.length > 0);
    const fallback = buildGovernedSocialFallbackReply(contract);
    expectTrue(validateHumanConversationResponse(fallback, contract).valid);
    expectFalse(/estou por aqui/i.test(fallback));
  });
}

console.log("\nGrupo B — Genericity guard");
test("B: rejects interchangeable generic reply", () => {
  const { contract } = buildTurn("Esse calor está demais.");
  const bad = validateSocialResponsePerception("Entendo. Estou por aqui.", contract);
  expectFalse(bad.valid);
  expectTrue(bad.violations.includes("generic_response_violation"));
});

test("B: rejects generic-only empathy", () => {
  const { contract } = buildTurn("Hoje o trabalho foi pesado.");
  const bad = validateSocialResponsePerception("Imagino. Se precisar, é só chamar.", contract);
  expectFalse(bad.valid);
});

console.log("\nGrupo C — Personality");
test("C: blocks therapeutic tone", () => {
  const { contract } = buildTurn("Estou cansado.");
  const bad = validateSocialResponsePerception(
    "Você deveria respirar fundo e procurar ajuda.",
    contract
  );
  expectTrue(bad.violations.includes("over_support_violation"));
});

test("C: blocks toxic positivity", () => {
  const { contract } = buildTurn("Hoje estou desanimado.");
  const bad = validateSocialResponsePerception("Vai dar tudo certo, fique positivo!", contract);
  expectTrue(bad.violations.includes("toxic_positivity_violation"));
});

test("C: blocks false intimacy", () => {
  const { contract } = buildTurn("oi");
  const bad = validateSocialResponsePerception("Oi amiga, como você está?", contract);
  expectTrue(bad.violations.includes("false_intimacy_violation"));
});

console.log("\nGrupo D — Closure");
test("D: acknowledgement → closed", () => {
  const { contract } = buildTurn("valeu");
  expect(contract.closureStyle, CLOSURE_STYLE.CLOSED);
});

test("D: farewell → closed", () => {
  const { contract } = buildTurn("falou");
  expect(contract.closureStyle, CLOSURE_STYLE.CLOSED);
});

test("D: casual comment → soft_closed", () => {
  const { contract } = buildTurn("pois é né");
  expectTrue(
    contract.closureStyle === CLOSURE_STYLE.SOFT_CLOSED ||
      contract.closureStyle === CLOSURE_STYLE.NO_CLOSING
  );
});

console.log("\nGrupo E — Repetition");
test("E: detects repeated opener risk", () => {
  const { contract } = buildTurn("Estou cansado.", {
    conversationMessages: [
      { role: "assistant", content: "Poxa, dia pesado." },
      { role: "user", content: "sim" },
      { role: "assistant", content: "Poxa, entendo." },
    ],
  });
  expectTrue(contract.repetitionSignals.recentResponseOpeners.includes("poxa"));
  const bad = validateSocialResponsePerception("Poxa, cansaço pesa.", contract);
  expectTrue(bad.violations.includes("repetitive_opening_violation"));
});

console.log("\nGrupo F — Emoção leve");
for (const msg of [
  "Estou cansado.",
  "Hoje estou desanimado.",
  "Foi um dia frustrante.",
  "Agora estou mais tranquilo.",
]) {
  test(`F: "${msg}" → supportive_reserved + anti-consumption`, () => {
    const { contract } = buildTurn(msg);
    expect(
      contract.personalityPolicy.socialDistance,
      SOCIAL_DISTANCE.SUPPORTIVE_RESERVED
    );
    expectTrue(contract.antiConsumption);
    const instructions = buildFullHumanConversationInstructions(contract);
    expectTrue(instructions.includes("Percepção e personalidade governadas"));
  });
}

console.log("\nGrupo G — Humor e reação");
for (const msg of ["kkkk", "boa", "aí sim", "pois é né"]) {
  test(`G: "${msg}" → light distance or brief`, () => {
    const { contract } = buildTurn(msg);
    expectTrue(
      contract.personalityPolicy.socialDistance === SOCIAL_DISTANCE.LIGHT_PLAYFUL ||
        contract.closureStyle === CLOSURE_STYLE.NO_CLOSING ||
        contract.closureStyle === CLOSURE_STYLE.SOFT_CLOSED
    );
  });
}

console.log("\nGrupo H — Greeting");
for (const msg of ["oi", "boa noite", "eae", "opa"]) {
  test(`H: "${msg}" → friendly_brief, no forced availability`, () => {
    const { contract } = buildTurn(msg);
    expect(contract.personalityPolicy.socialDistance, SOCIAL_DISTANCE.FRIENDLY_BRIEF);
    const fallback = buildGovernedSocialFallbackReply(contract);
    expectFalse(/estou por aqui|como posso ajudar/i.test(fallback));
  });
}

console.log("\nGrupo I — Acknowledgement");
for (const msg of ["valeu", "obrigado", "ajudou muito", "comprei, deu certo"]) {
  test(`I: "${msg}" → closed, no forced availability`, () => {
    const { contract } = buildTurn(msg);
    expect(contract.closureStyle, CLOSURE_STYLE.CLOSED);
    const fallback = buildGovernedSocialFallbackReply(contract);
    expectFalse(/estou por aqui|fico feliz em ajudar/i.test(fallback));
  });
}

console.log("\nGrupo J — Farewell");
for (const msg of ["falou", "até depois", "boa noite, vou dormir", "valeu, fui"]) {
  test(`J: "${msg}" → closed farewell`, () => {
    const { contract } = buildTurn(msg);
    expect(contract.closureStyle, CLOSURE_STYLE.CLOSED);
    const bad = validateSocialResponsePerception("Até! Se precisar, estou por aqui.", contract);
    expectTrue(bad.violations.includes("forced_availability_violation"));
  });
}

console.log("\nGrupo K — Identity");
for (const msg of [
  "Quem é você?",
  "Você só sabe falar de compras?",
  "Posso conversar normalmente?",
]) {
  test(`K: "${msg}" → professional_clear identity`, () => {
    const { contract } = buildTurn(msg);
    expect(
      contract.personalityPolicy.socialDistance,
      SOCIAL_DISTANCE.PROFESSIONAL_CLEAR
    );
    const fallback = buildSpecificGovernedFallback(contract);
    expectTrue(/MIA/i.test(fallback));
    expectFalse(/lista de capacidades|pitch/i.test(fallback));
  });
}

console.log("\nGrupo L — Proporcionalidade");
test("L: oi vs desabafo → different depth and opening", () => {
  const short = buildTurn("oi").contract;
  const long = buildTurn("Hoje foi um dia bem difícil e estou esgotado.").contract;
  expectTrue(short.responseDepth !== long.responseDepth || short.messageLength < long.messageLength);
  expect(short.responseOpening, RESPONSE_OPENING.NO_PREFACE);
  expectTrue(
    long.responseOpening === RESPONSE_OPENING.LIGHT_EMPATHY ||
      long.responseOpening === RESPONSE_OPENING.CONTEXTUAL_OBSERVATION
  );
});

console.log("\nGrupo M — Anti-overfitting");
for (const msg of ["blz ent", "to mo cansado", "q semana hein", "só passando"]) {
  test(`M: "${msg}" → perception contract present`, () => {
    const { contract, authority } = buildTurn(msg);
    expect(authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
    expectTrue(!!contract.perceptionVersion);
    expectTrue(!!contract.personalityPolicy);
  });
}

console.log("\nFinalize pipeline");
test("finalize replaces generic LLM reply", () => {
  const { contract } = buildTurn("Esse calor está demais.");
  const out = finalizeHumanConversationReply("Entendo. Estou por aqui.", contract);
  expectFalse(/estou por aqui/i.test(out.response));
  expectTrue(validateHumanConversationResponse(out.response, contract).valid);
});

test("content anchors extract concrete topics", () => {
  const anchors = extractContentAnchors("Meu cachorro destruiu meu chinelo.");
  expectTrue(anchors.includes("cachorro") || anchors.includes("chinelo"));
});

test("repetition signals from history", () => {
  const signals = extractRepetitionSignalsFromHistory([
    { role: "assistant", content: "Entendo." },
    { role: "assistant", content: "Entendo seu ponto." },
  ]);
  expectTrue(signals.recentResponseOpeners.includes("entendo"));
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
console.log("PATCH 11A.5 perception tests: OK\n");
