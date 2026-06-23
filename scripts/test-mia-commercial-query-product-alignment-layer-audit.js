/**
 * PATCH Comercial 4D-A — Commercial Query/Product Alignment Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-commercial-query-product-alignment-layer-audit.js
 *   node scripts/test-mia-commercial-query-product-alignment-layer-audit.js --http
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION,
  calculateCommercialAlignment,
  detectCommercialAccessorySignals,
  extractCommercialOfferCore,
  extractCommercialQueryCore,
  isAccessoryIntent,
} from "../lib/productSourceAdapter/commercialQueryProductAlignmentLayer.js";
import { selectCommercialOffers } from "../lib/productSourceAdapter/commercialSelectionEngine.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "pages/api/chat-gpt4o.js",
  "lib/productSourceAdapter/index.js",
];

const PRODUCT_HARDCODE_PATTERNS = [
  /if\s*\([^)]*includes\s*\(\s*["']iphone/i,
  /if\s*\([^)]*includes\s*\(\s*["']galaxy/i,
  /if\s*\([^)]*includes\s*\(\s*["']lenovo/i,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function offer(title, extra = {}) {
  return {
    title,
    price: extra.price ?? 1000,
    url: extra.url ?? `https://example.test/${encodeURIComponent(title)}`,
    image: extra.image ?? "https://example.test/image.jpg",
    source: extra.source ?? COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    ...extra,
  };
}

function assertMisaligned(query, title) {
  const alignment = calculateCommercialAlignment({ query, offer: offer(title) });
  assert(
    !alignment.isAligned && alignment.confidence !== "low",
    `expected misaligned: ${query} vs ${title} (${alignment.alignmentReason}, score=${alignment.alignmentScore})`
  );
}

function assertAligned(query, title) {
  const alignment = calculateCommercialAlignment({ query, offer: offer(title) });
  assert(alignment.isAligned, `expected aligned: ${query} vs ${title} (${alignment.alignmentReason})`);
}

function assertSelects(query, expectedTitlePattern, offers) {
  const result = selectCommercialOffers({ query, offers });
  assert(result.selectedOffer, "selectedOffer missing");
  assert(
    expectedTitlePattern.test(result.selectedOffer.title || ""),
    `expected ${expectedTitlePattern} got ${result.selectedOffer.title}`
  );
}

console.log(
  `\nPATCH Comercial 4D-A — Commercial Query/Product Alignment Layer Audit (${COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION})\n`
);

let pass = 0;
let fail = 0;

const deferred = [];

function runCase(name, fn) {
  deferred.push({ name, fn });
}

runCase("extractCommercialQueryCore normaliza núcleo", () => {
  assert(extractCommercialQueryCore("Capa Para Cadeira Gamer") === "capa cadeira gamer");
  assert(extractCommercialQueryCore("iPhone 13") === "iphone 13");
});

runCase("extractCommercialOfferCore normaliza título", () => {
  assert(
    extractCommercialOfferCore("Capa Para Cadeira Gamer Elástica Jacquard").includes("capa cadeira gamer")
  );
});

runCase("isAccessoryIntent detecta intenção de acessório", () => {
  assert(isAccessoryIntent("capa para cadeira gamer"));
  assert(!isAccessoryIntent("cadeira gamer"));
});

runCase("1. cadeira gamer não seleciona capa", () => {
  assertSelects(
    "cadeira gamer",
    /Cadeira Gamer/i,
    [
      offer("Capa Para Cadeira Gamer Elástica", { price: 42 }),
      offer("Cadeira Gamer Healer Preta", { price: 459 }),
    ]
  );
});

runCase("2. iphone 13 não seleciona película", () => {
  assertSelects(
    "iphone 13",
    /iPhone 13(?!.*pel[ií]cula)/i,
    [offer("Película iPhone 13", { price: 29 }), offer("Apple iPhone 13 128GB", { price: 3499 })]
  );
});

runCase("3. notebook lenovo não seleciona carregador", () => {
  assertSelects(
    "notebook lenovo",
    /Notebook Lenovo/i,
    [
      offer("Carregador Notebook Lenovo 65W", { price: 89 }),
      offer("Notebook Lenovo Ideapad 3 15 I5 256GB", { price: 3299 }),
    ]
  );
});

runCase("4. tv samsung não seleciona controle remoto", () => {
  assertSelects(
    "tv samsung",
    /Smart TV Samsung/i,
    [
      offer("Controle Remoto Samsung Smart TV", { price: 59 }),
      offer("Smart TV Samsung 55 4K UHD", { price: 2499 }),
    ]
  );
});

runCase("5. monitor gamer não seleciona suporte", () => {
  assertSelects(
    "monitor gamer",
    /Monitor Gamer/i,
    [
      offer("Suporte Para Monitor Articulado", { price: 99 }),
      offer("Monitor Gamer 27 165Hz IPS", { price: 1199 }),
    ]
  );
});

runCase("6. ps5 não seleciona controle", () => {
  assertSelects(
    "ps5",
    /Console.*PS5|PlayStation 5/i,
    [
      offer("Controle PS5 DualSense", { price: 399 }),
      offer("Console Sony PlayStation 5 825GB", { price: 3999 }),
    ]
  );
});

runCase("7. capa para cadeira gamer permite capa", () => {
  assertAligned("capa para cadeira gamer", "Capa Para Cadeira Gamer Elástica");
});

runCase("8. película iphone 13 permite película", () => {
  assertAligned("película iphone 13", "Película iPhone 13 Vidro Temperado");
});

runCase("9. carregador notebook lenovo permite carregador", () => {
  assertAligned("carregador notebook lenovo", "Carregador Notebook Lenovo 65W");
});

runCase("10. controle remoto samsung permite controle remoto", () => {
  assertAligned("controle remoto samsung", "Controle Remoto Samsung Smart TV");
});

runCase("11. suporte para monitor permite suporte", () => {
  assertAligned("suporte para monitor", "Suporte Para Monitor Articulado");
});

runCase("12. controle ps5 permite controle ps5", () => {
  assertAligned("controle ps5", "Controle PS5 DualSense");
});

runCase("13. película iphone 13 penaliza iphone 13", () => {
  assertMisaligned("película iphone 13", "Apple iPhone 13 128GB");
});

runCase("14. carregador notebook lenovo penaliza notebook", () => {
  assertMisaligned("carregador notebook lenovo", "Notebook Lenovo Ideapad 3 256GB");
});

runCase("15. capa cadeira gamer penaliza cadeira gamer", () => {
  assertMisaligned("capa cadeira gamer", "Cadeira Gamer Healer Preta");
});

runCase("16. notebook real continua alinhado", () => {
  assertAligned("notebook lenovo", "Notebook Lenovo Ideapad 3 256GB");
});

runCase("17. cadeira real continua alinhada", () => {
  assertAligned("cadeira gamer", "Cadeira Gamer Healer Preta");
});

runCase("18. celular real continua alinhado", () => {
  assertAligned("iphone 13", "Apple iPhone 13 128GB");
});

runCase("19. TV real continua alinhada", () => {
  assertAligned("tv samsung", "Smart TV Samsung 55 4K UHD");
});

runCase("20. monitor real continua alinhado", () => {
  assertAligned("monitor gamer", "Monitor Gamer 27 165Hz IPS");
});

runCase("21. console real continua alinhado", () => {
  assertAligned("ps5", "Console Sony PlayStation 5 825GB");
});

runCase("22. caso ambíguo preserva", () => {
  const alignment = calculateCommercialAlignment({
    query: "produto",
    offer: offer("Produto Especial X"),
  });
  assert(alignment.confidence === "low", "low confidence");
  assert(alignment.isAligned, "ambiguous preserved");
});

runCase("detectCommercialAccessorySignals é genérico", () => {
  const signals = detectCommercialAccessorySignals("Capa protetora com cabo");
  assert(signals.includes("capa") || signals.includes("capa_protetora"));
  assert(signals.includes("cabo"));
});

runCase("sem hardcodes de produto no layer", () => {
  const source = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialQueryProductAlignmentLayer.js"),
    "utf8"
  );
  for (const pattern of PRODUCT_HARDCODE_PATTERNS) {
    assert(!pattern.test(source), `hardcode detected: ${pattern}`);
  }
  assert(!source.includes("openai"), "no external model");
  assert(!source.includes("fetch("), "no provider calls");
});

runCase("no MIA integration", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(
      !content.includes("commercialQueryProductAlignmentLayer"),
      `${relativePath} must not import alignment layer`
    );
  }
});

for (const spec of deferred) {
  try {
    spec.fn();
    pass += 1;
    console.log(`✓ ${spec.name}`);
  } catch (err) {
    fail += 1;
    console.log(`✗ ${spec.name} → ${err.message}`);
  }
}

if (process.argv.includes("--http")) {
  console.log("\n── HTTP smoke (requires dev server) ──");
  try {
    const resp = await fetch(
      "http://localhost:3000/api/dev/commercial-alignment?q=cadeira%20gamer&limit=5"
    );
    const data = await resp.json();
    assert(resp.status !== 500, `endpoint status ${resp.status}`);
    assert(data.alignmentVersion === COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION, "version");
    assert(Array.isArray(data.offers), "offers array");
    pass += 1;
    console.log("✓ HTTP commercial-alignment endpoint");
  } catch (err) {
    fail += 1;
    console.log(`✗ HTTP commercial-alignment endpoint → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) COMMERCIAL QUERY/PRODUCT ALIGNMENT ROBUST"
    : "B) COMMERCIAL QUERY/PRODUCT ALIGNMENT GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
