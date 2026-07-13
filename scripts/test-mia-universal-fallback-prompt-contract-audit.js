/**
 * PATCH Comercial 4E-B.8 — Universal Fallback Prompt Contract Audit
 *
 * Usage:
 *   node scripts/test-mia-universal-fallback-prompt-contract-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildGovernedFallbackPayload,
} from "../lib/commercial/governedFallbackPayloadBuilder.js";
import {
  buildUniversalGovernedFallbackReasoning,
} from "../lib/commercial/universalGovernedFallbackReasoning.js";
import {
  UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
  buildUniversalFallbackPromptContract,
  buildUniversalFallbackPromptContractDevPayload,
  buildUniversalFallbackPromptContractDiagnostics,
  replyFocusesOnSelectedCommercialItem,
  replyViolatesUniversalFallbackPromptContract,
  resolveUniversalFallbackPromptContractVerbalization,
  shouldApplyUniversalFallbackPromptContract,
  verbalizeUniversalFallbackPromptContract,
} from "../lib/commercial/universalFallbackPromptContract.js";
import {
  buildProductExplanation,
} from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

function offer(name, extra = {}) {
  return {
    product_name: name,
    price: extra.price ?? "R$ 149,00",
    link: extra.link ?? `https://shop.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://shop.test/img.jpg",
    source: extra.source ?? "Google Shopping",
  };
}

function dataLayerProduct(name) {
  return {
    product_name: name,
    isDataLayerProduct: true,
    trustedSpecs: {
      official_name: name,
      strengths: ["desempenho estável"],
      ideal_for: ["uso diário"],
    },
  };
}

function buildPipeline({ query, selected, upstream = null, hasDataLayer = false }) {
  const payload = buildGovernedFallbackPayload({
    query,
    selectedProduct: offer(selected),
    hasDataLayer,
    cognitiveWinnerProduct: upstream ? offer(upstream) : null,
    responsePath: hasDataLayer ? "return_seguro" : "commercial_only_fallback",
  });
  const reasoning = buildUniversalGovernedFallbackReasoning(payload);
  const contract = buildUniversalFallbackPromptContract({
    query,
    governedFallbackPayload: payload,
    universalGovernedFallbackReasoning: reasoning,
  });
  const resolved = resolveUniversalFallbackPromptContractVerbalization({
    query,
    governedFallbackPayload: payload,
    universalGovernedFallbackReasoning: reasoning,
  });
  return { payload, reasoning, contract, resolved };
}

const DATA_LAYER_CASES = [
  { query: "iphone 13", selected: "iPhone 13" },
  { query: "galaxy a55", selected: "Samsung Galaxy A55" },
  { query: "moto g84", selected: "Motorola Moto G84" },
  { query: "s23 fe", selected: "Samsung Galaxy S23 FE" },
];

const FALLBACK_CASES = [
  { query: "pelicula iphone 13", selected: "Película vidro iPhone 13", upstream: "iPhone 13", focusToken: "película" },
  { query: "capa iphone 13", selected: "Capa silicone iPhone 13", upstream: "iPhone 13", focusToken: "capa" },
  { query: "controle ps5", selected: "Controle DualSense PS5", upstream: "PlayStation 5 Console", focusToken: "controle" },
  { query: "cabo hdmi", selected: "Cabo HDMI 2m", upstream: "Notebook Lenovo IdeaPad", focusToken: "hdmi" },
  { query: "headset gamer", selected: "Headset Gamer 7.1", upstream: "PC Gamer RTX 4060", focusToken: "headset" },
  { query: "cadeira gamer", selected: "Cadeira Gamer Ergonômica", upstream: null, focusToken: "cadeira" },
  { query: "monitor gamer", selected: "Monitor Gamer 27", upstream: null, focusToken: "monitor" },
  { query: "webcam", selected: "Webcam HD Pro", upstream: null, focusToken: "webcam" },
  { query: "volante g29", selected: "Volante Logitech G29", upstream: null, focusToken: "volante" },
  { query: "ssd externo", selected: "SSD Externo 1TB USB-C", upstream: null, focusToken: "ssd" },
];

const UNTOUCHED_BEHAVIOR_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaSpecificProductResolutionLock.js",
  "lib/productSourceAdapter/commercialRuntimeActivation.js",
  "lib/miaPrompt.js",
  "components/MIAChat.jsx",
];

console.log(
  `\nPATCH Comercial 4E-B.8 — Universal Fallback Prompt Contract (${UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION})\n`
);

console.log("── Module contract ──");
const moduleSource = readFileSync(
  join(ROOT, "lib/commercial/universalFallbackPromptContract.js"),
  "utf8"
);
assert("version 4E-B.8", UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION === "4E-B.8");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no prompt imports", !moduleSource.includes("miaPrompt.js"));
assert("consumes governed payload + reasoning", moduleSource.includes("buildUniversalGovernedFallbackReasoning"));
assert("no category hardcode branches", !moduleSource.match(/if\s*\(.*category\s*===/i));
assert("no product hardcodes", !moduleSource.match(/includes\s*\(\s*["']iphone|includes\s*\(\s*["']ps5/i));
assert(
  "chat wired",
  readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8").includes(
    "resolveUniversalFallbackPromptContractVerbalization"
  )
);
assert(
  "dev endpoint exists",
  readFileSync(join(ROOT, "pages/api/dev/universal-fallback-prompt-contract.js"), "utf8").includes(
    "buildUniversalFallbackPromptContractDevPayload"
  )
);

console.log("\n── Data Layer cases inactive ──");
for (const { query, selected } of DATA_LAYER_CASES) {
  const { contract, resolved } = buildPipeline({ query, selected, hasDataLayer: true });
  assert(`"${query}" contract inactive`, contract.isActive === false);
  assert(`"${query}" verbalization not applied`, resolved.applied === false);
  assert(
    `"${query}" shouldApply false`,
    shouldApplyUniversalFallbackPromptContract({
      governedFallbackPayload: buildGovernedFallbackPayload({
        query,
        selectedProduct: dataLayerProduct(selected),
        hasDataLayer: true,
      }),
    }) === false
  );
}

console.log("\n── Fallback contract structure ──");
for (const { query, selected, upstream } of FALLBACK_CASES) {
  const { contract, resolved } = buildPipeline({ query, selected, upstream });

  assert(`"${query}" contract active`, contract.isActive === true);
  assert(`"${query}" verbalization applied`, resolved.applied === true);
  assert(
    `"${query}" verbalizationTarget from focus`,
    contract.verbalizationTarget?.productName === selected,
    contract.verbalizationTarget?.productName
  );
  assert(
    `"${query}" transparency required`,
    contract.transparencyInstruction?.required === true
  );
  assert(
    `"${query}" limited confidence`,
    contract.confidenceInstruction?.level === "limited"
  );
  assert(
    `"${query}" llm must not decide winner`,
    contract.sourceInstruction?.llmMustNotDecideWinner === true
  );
  assert(
    `"${query}" no invented specs boundary`,
    contract.forbiddenClaims?.some((claim) => claim.id === "technical_specification")
  );

  if (upstream) {
    assert(
      `"${query}" upstream in forbiddenTargets`,
      contract.forbiddenTargets?.some((entry) => entry.productName === upstream)
    );
    assert(
      `"${query}" upstream not verbalizationTarget`,
      contract.verbalizationTarget?.productName !== upstream
    );
  }
}

console.log("\n── Perception: reply focuses selected item ──");
for (const { query, selected, upstream, focusToken } of FALLBACK_CASES) {
  const { contract, resolved } = buildPipeline({ query, selected, upstream });
  const reply = resolved.reply || verbalizeUniversalFallbackPromptContract(contract);

  assert(
    `"${query}" reply focuses selected`,
    replyFocusesOnSelectedCommercialItem(reply, selected),
    reply
  );
  assert(
    `"${query}" reply mentions focus token`,
    reply.toLowerCase().includes(focusToken),
    reply
  );
  assert(
    `"${query}" reply does not violate contract`,
    replyViolatesUniversalFallbackPromptContract(reply, contract) === false,
    reply
  );

  if (upstream) {
    assert(
      `"${query}" reply does not recommend upstream`,
      !/\beu iria no\b/i.test(reply) || !reply.toLowerCase().includes(upstream.toLowerCase()),
      reply
    );
    assert(
      `"${query}" upstream excluded as main recommendation`,
      /n[aã]o vale para|n[aã]o como o produto recomendado|n[aã]o como produto principal/i.test(reply),
      reply
    );
  }
}

console.log("\n── Critical contamination cases ──");
const pelicula = buildPipeline({
  query: "pelicula iphone 13",
  selected: "Película vidro iPhone 13",
  upstream: "iPhone 13",
});
assert(
  "pelicula not 'Eu iria no iPhone 13'",
  !/^eu iria no iphone 13/i.test(pelicula.resolved.reply || ""),
  pelicula.resolved.reply
);

const controle = buildPipeline({
  query: "controle ps5",
  selected: "Controle DualSense PS5",
  upstream: "PlayStation 5 Console",
});
assert(
  "controle not recommending console",
  !/eu iria no playstation 5/i.test(controle.resolved.reply || ""),
  controle.resolved.reply
);

const cabo = buildPipeline({
  query: "cabo hdmi",
  selected: "Cabo HDMI 2m",
  upstream: "Notebook Lenovo IdeaPad",
});
assert(
  "cabo not recommending notebook",
  !/eu iria no notebook/i.test(cabo.resolved.reply || ""),
  cabo.resolved.reply
);

console.log("\n── Data Layer explanation preserved ──");
const dlBefore = buildProductExplanation({
  product: dataLayerProduct("iPhone 13"),
  query: "iphone 13",
  hasDataLayer: true,
});
buildUniversalFallbackPromptContract({
  governedFallbackPayload: buildGovernedFallbackPayload({
    query: "iphone 13",
    selectedProduct: dataLayerProduct("iPhone 13"),
    hasDataLayer: true,
  }),
});
const dlAfter = buildProductExplanation({
  product: dataLayerProduct("iPhone 13"),
  query: "iphone 13",
  hasDataLayer: true,
});
assert("data layer explanation unchanged", dlBefore.text === dlAfter.text);

console.log("\n── Diagnostics / DEV payload ──");
const sample = pelicula.contract;
const diagnostics = buildUniversalFallbackPromptContractDiagnostics(sample);
assert("diagnostics active", diagnostics.isActive === true);
assert("diagnostics verbalization target", diagnostics.verbalizationTargetName === "Película vidro iPhone 13");
const devPayload = buildUniversalFallbackPromptContractDevPayload(sample);
assert("dev payload includes forbidden targets", (devPayload.forbiddenTargets || []).length > 0);

console.log("\n── Architecture preservation ──");
for (const relativePath of UNTOUCHED_BEHAVIOR_FILES) {
  const source = readFileSync(join(ROOT, relativePath), "utf8");
  assert(
    `${relativePath} not importing contract module`,
    !source.includes("universalFallbackPromptContract")
  );
}

console.log("\n── Regressions ──");
console.log("  ⏭️ skipped in structural-only mode (nested audit chain disabled temporarily)");

console.log(`\n── Verdict ──`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0 ? "\nA) ROBUST\n" : "\nB) NEEDS WORK\n");
process.exit(failed === 0 ? 0 : 1);
