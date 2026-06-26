/**
 * PATCH 10.1A — Specific Product Resolution Lock Audit
 *
 * Usage:
 *   node scripts/test-mia-specific-product-resolution-lock-audit.js
 *   node scripts/test-mia-specific-product-resolution-lock-audit.js --http
 */

import {
  SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION,
  applySpecificProductLockToProducts,
  bootstrapSpecificProductLock,
  enforceSpecificProductLockWinner,
  isGenericProductSearchQuery,
  resolveSpecificProductLock,
  scoreStrongSpecificProductMatch,
} from "../lib/miaSpecificProductResolutionLock.js";

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

function product(name, extra = {}) {
  const official = name;
  return {
    product_name: official,
    familyKey: extra.familyKey || name.toLowerCase(),
    trustedSpecs: {
      official_name: official,
      aliases: extra.aliases || [],
      model_family: extra.model_family || "",
      detail_id: extra.detail_id || "",
      search_text: extra.search_text || "",
      category: extra.category || "celular",
    },
    ...extra,
  };
}

console.log(`\nPATCH 10.1A — Specific Product Resolution Lock Audit (${SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION})\n`);

console.log("── Generic query guard ──");
assert("celular até 2000 is generic", isGenericProductSearchQuery("celular até 2000"));
assert("melhor custo benefício is generic", isGenericProductSearchQuery("melhor celular custo benefício"));
assert("Samsung bom is generic", isGenericProductSearchQuery("Samsung bom"));
assert("iPhone 15 is not generic", !isGenericProductSearchQuery("iPhone 15"));
assert("Galaxy M35 is not generic", !isGenericProductSearchQuery("Galaxy M35"));

console.log("\n── Strong match scoring ──");
const iphone15 = product("iPhone 15", { familyKey: "iphone 15" });
const galaxyA15 = product("Samsung Galaxy A15 5G", { familyKey: "galaxy a15" });
const galaxyM35 = product("Samsung Galaxy M35", { familyKey: "galaxy m35" });
const galaxyS24Fe = product("Samsung Galaxy S24 FE", { familyKey: "samsung galaxy s24 fe" });

assert(
  "iPhone 15 query matches iPhone 15 strongly",
  scoreStrongSpecificProductMatch(iphone15, "iPhone 15").score >= 700
);
assert(
  "iPhone 15 query does not strongly match Galaxy A15",
  scoreStrongSpecificProductMatch(galaxyA15, "iPhone 15").score < 700
);
assert(
  "Galaxy M35 query matches Galaxy M35",
  scoreStrongSpecificProductMatch(galaxyM35, "Galaxy M35").score >= 700
);
assert(
  "Galaxy S24 FE query matches Galaxy S24 FE",
  scoreStrongSpecificProductMatch(galaxyS24Fe, "Galaxy S24 FE").score >= 700
);

console.log("\n── Lock resolution ──");
const candidates = [galaxyA15, iphone15, galaxyM35];
const lockIphone15 = resolveSpecificProductLock({ query: "iPhone 15", products: candidates });
assert("iPhone 15 lock active", lockIphone15.active);
assert(
  "iPhone 15 lock picks iPhone 15",
  lockIphone15.lockedProduct?.product_name === "iPhone 15",
  lockIphone15.lockedProduct?.product_name || "null"
);

const lockGeneric = resolveSpecificProductLock({
  query: "celular até 2000",
  products: candidates,
});
assert("generic query does not lock", !lockGeneric.active);

const lockM35 = resolveSpecificProductLock({
  query: "Galaxy M35",
  products: [galaxyA15, product("Samsung Galaxy S23 FE", { familyKey: "samsung galaxy s23 fe" }), galaxyM35],
});
assert("Galaxy M35 lock active", lockM35.active);
assert(
  "Galaxy M35 lock picks M35",
  lockM35.lockedProduct?.product_name === "Samsung Galaxy M35"
);

console.log("\n── Query anchor bootstrap ──");
const bootstrapLock = bootstrapSpecificProductLock({
  query: "iPhone 15",
  products: [galaxyA15],
  resolveIdentity: (q) => ({ officialName: q }),
});
assert("bootstrap activates without catalog match", bootstrapLock.active);
assert(
  "bootstrap anchors iPhone 15",
  bootstrapLock.lockedProduct?.product_name === "iPhone 15"
);
assert(
  "bootstrap blocks Galaxy A15 substitution",
  bootstrapLock.matchSource === "query_identity_anchor"
);

console.log("\n── Accessory intent guard (4E-A.2) ──");
const accessoryBootstrap = bootstrapSpecificProductLock({
  query: "pelicula iphone 13",
  products: [iphone15],
  resolveIdentity: () => ({ officialName: "iPhone 13" }),
});
assert("accessory query does not activate lock", !accessoryBootstrap.active);
assert(
  "accessory query blocked by guard",
  accessoryBootstrap.reason === "accessory_intent_guard"
);
assert(
  "accessory query does not anchor main product",
  accessoryBootstrap.matchSource !== "query_identity_anchor"
);

const accessoryResolve = resolveSpecificProductLock({
  query: "capa iphone 13",
  products: [iphone15],
});
assert("accessory resolve inactive", !accessoryResolve.active);
assert("iPhone 15 main product lock still works", lockIphone15.active);

console.log("\n── Winner enforcement ──");
const wrongWinner = enforceSpecificProductLockWinner({
  lock: lockIphone15,
  selectedBestProduct: galaxyA15,
  products: candidates,
});
assert("wrong winner replaced", wrongWinner.preventedReplacement);
assert(
  "enforced winner is iPhone 15",
  wrongWinner.selectedBestProduct?.product_name === "iPhone 15"
);

const reordered = applySpecificProductLockToProducts(candidates, lockIphone15);
assert(
  "locked product moved to first position",
  reordered.products[0]?.product_name === "iPhone 15"
);

if (process.argv.includes("--http")) {
  console.log("\n── HTTP smoke (requires dev server) ──");
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": "minha_chave_181199",
  };
  const cases = [
    { query: "iPhone 15", expect: /iphone\s*15/i },
    { query: "iPhone 16", expect: /iphone\s*16/i },
    { query: "Galaxy M35", expect: /galaxy\s*m35/i },
    { query: "Galaxy S24 FE", expect: /galaxy\s*s24\s*fe/i },
    { query: "celular até 2000", expect: null },
    { query: "melhor celular custo benefício", expect: null },
    { query: "Samsung bom", expect: null },
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
      const cardName = data?.prices?.[0]?.product_name || data?.session_context?.lastBestProduct?.product_name || "";
      const hasError = /Tive um problema/i.test(data?.reply || "");
      assert(`${testCase.query}: status 200`, resp.status === 200, String(resp.status));
      assert(`${testCase.query}: no API error message`, !hasError, data?.reply || "");
      if (testCase.expect) {
        assert(
          `${testCase.query}: card matches expected product`,
          testCase.expect.test(cardName) || testCase.expect.test(data?.reply || ""),
          cardName || "(empty)"
        );
      } else {
        assert(`${testCase.query}: generic search returns response`, Boolean(data?.reply));
      }
    } catch (err) {
      assert(`${testCase.query}: HTTP call`, false, err?.message || String(err));
    }
  }
}

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) FULLY CLOSED\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
