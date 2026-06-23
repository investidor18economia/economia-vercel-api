/**
 * PATCH 10.1F — Commercial API Exhaustion Fallback Display Audit
 *
 * Usage:
 *   node scripts/test-mia-commercial-fallback-display-audit.js
 *   node scripts/test-mia-commercial-fallback-display-audit.js --http
 */

import {
  COMMERCIAL_FALLBACK_DISPLAY_VERSION,
  applyCommercialFallbackDisplayToPrices,
  deriveCommercialDisplayContext,
  hasValidCommercialPrice,
  resolveCommercialFallbackDisplay,
  resolveOfferCardPresentation,
} from "../lib/miaCommercialFallbackDisplay.js";

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

console.log(
  `\nPATCH 10.1F — Commercial API Exhaustion Fallback Display Audit (${COMMERCIAL_FALLBACK_DISPLAY_VERSION})\n`
);

console.log("── Price detection ──");
assert("valid BRL price accepted", hasValidCommercialPrice("R$ 2.499,00"));
assert("null price rejected", !hasValidCommercialPrice(null));

console.log("\n── CASO 1: real offer preserved ──");
const realOffer = resolveCommercialFallbackDisplay({
  winner: "Samsung Galaxy A35",
  hasOffer: true,
  hasPrice: true,
  hasUrl: true,
  hasStore: true,
  source: "Mercado Livre",
});
assert("real offer not rewritten", !realOffer.applied);
assert("real offer keeps store source", realOffer.displaySource === "Mercado Livre");

console.log("\n── CASO 2/5: data layer without commercial offer ──");
const dataLayerOffer = resolveCommercialFallbackDisplay({
  winner: "iPhone 15",
  hasOffer: false,
  hasPrice: false,
  hasUrl: false,
  hasStore: false,
  source: "query_product_anchor",
  dataLayerPrimary: true,
  specificProductQueryAnchor: true,
});
assert("data layer fallback applied", dataLayerOffer.applied);
assert(
  "friendly price status",
  dataLayerOffer.displayStatus === "Preço temporariamente indisponível"
);
assert(
  "data layer subtitle",
  /continua analisando este produto com base no Data Layer/i.test(dataLayerOffer.displaySubtitle || "")
);
assert(
  "data layer badge",
  dataLayerOffer.displayBadge === "✓ Produto disponível na base da MIA"
);
assert(
  "technical source masked",
  !/query_product_anchor/i.test(dataLayerOffer.displaySource || "")
);

console.log("\n── CASO 4: no URL copy ──");
const noUrlOffer = resolveCommercialFallbackDisplay({
  winner: "Galaxy M35",
  hasOffer: false,
  hasPrice: false,
  hasUrl: false,
  source: "Data Layer MIA",
  dataLayerPrimary: true,
});
assert(
  "no-url CTA is friendly",
  noUrlOffer.displayCta === "Nenhuma oferta atual encontrada"
);
assert(
  "no old broken copy",
  !/Oferta online ainda não encontrada/i.test(
    [noUrlOffer.displayCta, noUrlOffer.displayStatus, noUrlOffer.displaySubtitle].join(" ")
  )
);

console.log("\n── API exhaustion ──");
const exhausted = resolveCommercialFallbackDisplay({
  winner: "iPhone 11",
  commercialStatus: "rate_limited",
  hasOffer: false,
  hasPrice: false,
  hasUrl: false,
  source: "resultado",
  dataLayerPrimary: true,
});
assert("api exhaustion applied", exhausted.applied);
assert("api exhaustion fallback type", exhausted.fallbackType === "api_exhaustion");
assert(
  "api exhaustion mentions temporary commercial unavailability",
  /consulta comercial está temporariamente indisponível/i.test(exhausted.displaySubtitle || "")
);

console.log("\n── Price enrichment ──");
const enriched = applyCommercialFallbackDisplayToPrices(
  [
    {
      product_name: "iPhone 15",
      price: null,
      link: null,
      source: "query_product_anchor",
      specificProductQueryAnchor: true,
    },
  ],
  { dataLayerPrimary: true, specificProductQueryAnchor: true }
);
assert("enrichment applied", enriched.applied);
assert(
  "enriched price has displayStatus",
  enriched.prices[0]?.displayStatus === "Preço temporariamente indisponível"
);
assert(
  "enriched audit winner preserved",
  enriched.audit?.winner === "iPhone 15"
);

console.log("\n── Offer card presentation ──");
const presentation = resolveOfferCardPresentation({
  product_name: "Galaxy M35",
  price: null,
  link: null,
  source: "Data Layer MIA",
  displayStatus: "Preço temporariamente indisponível",
  displaySubtitle: "A MIA continua analisando este produto com base no Data Layer.",
  displayCta: "Nenhuma oferta atual encontrada",
  displayBadge: "✓ Produto disponível na base da MIA",
  commercial_fallback_display_applied: true,
});
assert(
  "presentation uses friendly price copy",
  presentation.priceText === "Preço temporariamente indisponível"
);
assert(
  "presentation uses friendly CTA",
  presentation.ctaText === "Nenhuma oferta atual encontrada"
);
assert(
  "presentation avoids old broken copy",
  !/Preço indisponível|Oferta online ainda não encontrada/i.test(
    [presentation.priceText, presentation.ctaText, presentation.subtitle].join(" ")
  )
);

if (process.argv.includes("--http")) {
  console.log("\n── HTTP smoke (requires dev server) ──");
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": "minha_chave_181199",
  };
  const cases = [
    { query: "iPhone 11", expectProduct: /iphone\s*11/i },
    { query: "iPhone 15", expectProduct: /iphone\s*15/i },
    { query: "Galaxy M35", expectProduct: /galaxy\s*m35/i },
  ];

  for (const testCase of cases) {
    try {
      const resp = await fetch("http://localhost:3000/api/chat-gpt4o", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: testCase.query,
          session_context: {},
          messages: [],
        }),
      });
      const data = await resp.json();
      const price = data?.prices?.[0] || {};
      const cardName = price.product_name || data?.session_context?.lastBestProduct?.product_name || "";

      assert(`${testCase.query}: status 200`, resp.status === 200, String(resp.status));
      assert(
        `${testCase.query}: winner card preserved`,
        testCase.expectProduct.test(cardName),
        cardName || "(empty)"
      );

      if (!hasValidCommercialPrice(price.price) || !price.link) {
        assert(
          `${testCase.query}: friendly fallback applied`,
          !!price.displayStatus || !!price.commercial_fallback_display_applied,
          JSON.stringify({
            displayStatus: price.displayStatus,
            displayCta: price.displayCta,
            source: price.source,
          })
        );
        assert(
          `${testCase.query}: no broken fallback copy in payload`,
          !/Preço indisponível|Oferta online ainda não encontrada|query_product_anchor/i.test(
            JSON.stringify(price)
          )
        );
      }
    } catch (err) {
      assert(`${testCase.query}: HTTP call`, false, err?.message || String(err));
    }
  }

  console.log("\n── HTTP real offer preservation ──");
  try {
    const resp = await fetch("http://localhost:3000/api/chat-gpt4o", {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: "celular até 2000",
        session_context: {},
        messages: [],
      }),
    });
    const data = await resp.json();
    const price = data?.prices?.[0] || {};
    assert("generic search status 200", resp.status === 200, String(resp.status));
    if (hasValidCommercialPrice(price.price) && price.link) {
      assert(
        "generic search with real offer not forced into exhaustion fallback",
        !price.commercial_fallback_display_applied,
        JSON.stringify(price)
      );
    } else {
      assert("generic search returns response", Boolean(data?.reply));
    }
  } catch (err) {
    assert("generic search HTTP call", false, err?.message || String(err));
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
