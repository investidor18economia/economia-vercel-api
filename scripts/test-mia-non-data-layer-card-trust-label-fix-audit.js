/**
 * PATCH Comercial 4E-B.2 — Non-Data-Layer Card Trust Label Fix Audit
 *
 * Usage:
 *   node scripts/test-mia-non-data-layer-card-trust-label-fix-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_CARD_TRUST_LABELS_VERSION,
  DATA_LAYER_CARD_BADGE,
  DATA_LAYER_CARD_SOURCE_LABEL,
  GOVERNED_FALLBACK_CARD_BADGE,
  GOVERNED_FALLBACK_CARD_SUBTITLE,
  applyCommercialCardTrustLabels,
  collectCardTrustLabelText,
  containsFalseDataLayerTrustCopy,
  resolveOfferCardPresentationWithTrustLabels,
  shouldApplyGovernedFallbackCardTrustLabels,
} from "../lib/miaCommercialCardTrustLabels.js";
import { resolveOfferCardPresentation } from "../lib/miaCommercialFallbackDisplay.js";
import { buildCommercialKnowledgeMetadata } from "../lib/commercial/nonDataLayerCommercialResponseGuard.js";
import {
  COMMERCIAL_TRANSPARENCY_NOTICE_PREFIX,
  shouldShowCommercialTransparencyNotice,
} from "../lib/miaCommercialKnowledgeTransparency.js";

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

function assertNoFalseDataLayerCopy(label, text) {
  assert(
    `${label} sem falso Data Layer`,
    !containsFalseDataLayerTrustCopy(text) &&
      !/produto disponível na base da mia/i.test(text) &&
      !/conhecimento validado da mia/i.test(text),
    text || "(empty)"
  );
}

const DATA_LAYER_PRODUCTS = [
  {
    query: "iphone 13",
    product: {
      product_name: "iPhone 13",
      isDataLayerProduct: true,
      trustedSpecs: {
        official_name: "iPhone 13",
        strengths: ["desempenho estável"],
        ideal_for: ["uso diário"],
      },
    },
  },
  {
    query: "galaxy a55",
    product: {
      product_name: "Samsung Galaxy A55",
      isDataLayerProduct: true,
      trustedSpecs: {
        official_name: "Galaxy A55",
        strengths: ["tela fluida"],
        ideal_for: ["uso diário"],
      },
    },
  },
  {
    query: "s23 fe",
    product: {
      product_name: "Samsung Galaxy S23 FE",
      isDataLayerProduct: true,
      trustedSpecs: {
        official_name: "Galaxy S23 FE",
        strengths: ["câmera versátil"],
        ideal_for: ["fotos"],
      },
    },
  },
];

const FALLBACK_PRODUCTS = [
  { query: "cadeira gamer", product_name: "Cadeira Gamer Ergonômica" },
  { query: "tv samsung", product_name: "TV Samsung 55" },
  { query: "webcam logitech", product_name: "Webcam Logitech C920" },
  { query: "volante g29", product_name: "Volante Logitech G29" },
  { query: "controle ps5", product_name: "Controle DualSense PS5" },
];

function buildFallbackOfferCard(productName) {
  return {
    product_name: productName,
    price: null,
    link: null,
    source: "query_product_anchor",
    specificProductQueryAnchor: true,
    displayStatus: "Preço temporariamente indisponível",
    displaySubtitle: "A MIA continua analisando este produto com base no Data Layer.",
    displayCta: "Nenhuma oferta atual encontrada",
    displayBadge: "✓ Produto disponível na base da MIA",
    displaySource: "Conhecimento validado da MIA",
    commercial_fallback_display_applied: true,
  };
}

function buildDataLayerOfferCard(productName) {
  return {
    product_name: productName,
    price: null,
    link: null,
    source: "query_product_anchor",
    specificProductQueryAnchor: true,
    displayStatus: "Preço temporariamente indisponível",
    displaySubtitle: "A MIA continua analisando este produto com base no Data Layer.",
    displayCta: "Nenhuma oferta atual encontrada",
    displayBadge: DATA_LAYER_CARD_BADGE,
    displaySource: DATA_LAYER_CARD_SOURCE_LABEL,
    commercial_fallback_display_applied: true,
  };
}

const UNTOUCHED_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/productSourceAdapter/commercialSelectionEngine.js",
  "lib/miaSpecificProductResolutionLock.js",
  "pages/api/chat-gpt4o.js",
];

console.log(
  `\nPATCH Comercial 4E-B.2 — Non-Data-Layer Card Trust Label Fix Audit (${COMMERCIAL_CARD_TRUST_LABELS_VERSION})\n`
);

console.log("── Module contract ──");
assert("version 4E-B.2", COMMERCIAL_CARD_TRUST_LABELS_VERSION === "4E-B.2");
assert(
  "uses knowledgeMetadata transparencyRequired",
  readFileSync(join(ROOT, "lib/miaCommercialCardTrustLabels.js"), "utf8").includes(
    "transparencyRequired"
  )
);
assert(
  "does not recalculate knowledge source",
  !readFileSync(join(ROOT, "lib/miaCommercialCardTrustLabels.js"), "utf8").includes(
    "detectCommercialKnowledgeSource"
  )
);
assert(
  "consumes resolveOfferCardPresentation",
  readFileSync(join(ROOT, "lib/miaCommercialCardTrustLabels.js"), "utf8").includes(
    "resolveOfferCardPresentation"
  )
);

console.log("\n── Data Layer labels preserved ──");
for (const fixture of DATA_LAYER_PRODUCTS) {
  const metadata = buildCommercialKnowledgeMetadata({
    product: fixture.product,
    hasDataLayer: true,
  });
  const offerCard = buildDataLayerOfferCard(fixture.product.product_name);
  const presentation = resolveOfferCardPresentationWithTrustLabels(offerCard, metadata);
  const text = collectCardTrustLabelText(presentation);

  assert(`${fixture.query} metadata audited`, metadata.isAudited === true);
  assert(`${fixture.query} keeps validated badge`, presentation.badge === DATA_LAYER_CARD_BADGE);
  assert(
    `${fixture.query} keeps validated source`,
    presentation.sourceLabel === DATA_LAYER_CARD_SOURCE_LABEL
  );
  assert(`${fixture.query} trust mode data_layer`, presentation.trustLabelMode === "data_layer");
  assert(`${fixture.query} still mentions validated knowledge`, /validado/i.test(text));
}

console.log("\n── Governed fallback labels corrected ──");
for (const fixture of FALLBACK_PRODUCTS) {
  const metadata = buildCommercialKnowledgeMetadata({
    product: { product_name: fixture.product_name },
    hasDataLayer: false,
  });
  const offerCard = buildFallbackOfferCard(fixture.product_name);
  const presentation = resolveOfferCardPresentationWithTrustLabels(offerCard, metadata);
  const text = collectCardTrustLabelText(presentation);

  assert(`${fixture.query} metadata requires transparency`, metadata.transparencyRequired === true);
  assert(
    `${fixture.query} uses assisted badge`,
    presentation.badge === GOVERNED_FALLBACK_CARD_BADGE
  );
  assertNoFalseDataLayerCopy(`${fixture.query} card text`, text);
  assert(
    `${fixture.query} assisted subtitle`,
    presentation.subtitle === GOVERNED_FALLBACK_CARD_SUBTITLE
  );
  assert(`${fixture.query} trust mode governed_fallback`, presentation.trustLabelMode === "governed_fallback");
}

console.log("\n── Real offer preserved for fallback ──");
const fallbackWithOffer = resolveOfferCardPresentationWithTrustLabels(
  {
    product_name: "Cadeira Gamer XYZ",
    price: "R$ 899,00",
    link: "https://example.com/cadeira",
    source: "Mercado Livre",
  },
  buildCommercialKnowledgeMetadata({
    product: { product_name: "Cadeira Gamer XYZ" },
    hasDataLayer: false,
  })
);
assert(
  "fallback with real offer keeps store source",
  fallbackWithOffer.sourceLabel === "Mercado Livre" || !fallbackWithOffer.useDataLayerPresentation
);
assertNoFalseDataLayerCopy("fallback with real offer", collectCardTrustLabelText(fallbackWithOffer));

console.log("\n── applyCommercialCardTrustLabels unit ──");
const basePresentation = resolveOfferCardPresentation(buildFallbackOfferCard("TV Samsung 55"));
const governed = applyCommercialCardTrustLabels({
  presentation: basePresentation,
  knowledgeMetadata: buildCommercialKnowledgeMetadata({
    product: { product_name: "TV Samsung 55" },
    hasDataLayer: false,
  }),
});
assert(
  "applyCommercial replaces badge",
  governed.presentation.badge === GOVERNED_FALLBACK_CARD_BADGE
);
assert(
  "shouldApplyGovernedFallback true",
  shouldApplyGovernedFallbackCardTrustLabels(
    buildCommercialKnowledgeMetadata({ product: { product_name: "TV" }, hasDataLayer: false })
  )
);

console.log("\n── UI wiring ──");
const chatSource = readFileSync(join(ROOT, "components/MIAChat.jsx"), "utf8");
assert(
  "chat uses resolveOfferCardPresentationWithTrustLabels",
  chatSource.includes("resolveOfferCardPresentationWithTrustLabels")
);
assert("chat passes knowledgeMetadata to card", chatSource.includes("item.knowledgeMetadata"));
assert(
  "chat does not recalculate knowledge source",
  !chatSource.includes("detectCommercialKnowledgeSource")
);
assert("assisted badge class wired", chatSource.includes("mia-offer-card-trust-badge--assisted"));
assert(
  "transparency notice preserved",
  chatSource.includes("MIACommercialTransparencyNotice")
);

const cssSource = readFileSync(join(ROOT, "styles/mia-chat.css"), "utf8");
assert("assisted badge styles", cssSource.includes(".mia-offer-card-trust-badge--assisted"));
assert("mobile card source styles preserved", cssSource.includes(".mia-offer-card-source"));

console.log("\n── 4E-A.4 notice preserved ──");
const fallbackMeta = buildCommercialKnowledgeMetadata({
  product: { product_name: "Cadeira Gamer" },
  hasDataLayer: false,
});
assert(
  "transparency notice still visible for fallback",
  shouldShowCommercialTransparencyNotice(fallbackMeta) === true
);
assert(
  "notice copy unchanged",
  COMMERCIAL_TRANSPARENCY_NOTICE_PREFIX.includes("auditoria completa")
);
const noticeSource = readFileSync(
  join(ROOT, "components/MIACommercialTransparencyNotice.jsx"),
  "utf8"
);
assert("Saiba mais link preserved", noticeSource.includes("Saiba mais"));

console.log("\n── Architecture preservation ──");
for (const file of UNTOUCHED_FILES) {
  const content = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} not importing card trust labels`, !content.includes("miaCommercialCardTrustLabels"));
}

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) ROBUST\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
