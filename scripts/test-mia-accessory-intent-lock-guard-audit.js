/**
 * PATCH Comercial 4E-A.2 — Accessory Intent Lock Guard Audit
 *
 * Usage:
 *   node scripts/test-mia-accessory-intent-lock-guard-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ACCESSORY_INTENT_LOCK_GUARD_VERSION,
  ACCESSORY_INTENT_SIGNAL_RULES,
  buildAccessoryIntentDiagnostic,
  detectAccessoryIntent,
  shouldBypassSpecificProductLockForAccessoryIntent,
} from "../lib/commercial/accessoryIntentLockGuard.js";
import {
  bootstrapSpecificProductLock,
  resolveSpecificProductLock,
} from "../lib/miaSpecificProductResolutionLock.js";
import { buildCommercialShadowDiagnosticReport } from "../lib/productSourceAdapter/commercialShadowDiagnosticSummary.js";

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

function product(name, extra = {}) {
  return {
    product_name: name,
    familyKey: extra.familyKey || name.toLowerCase(),
    trustedSpecs: {
      official_name: name,
      aliases: extra.aliases || [],
      model_family: extra.model_family || "",
      detail_id: extra.detail_id || "",
      search_text: extra.search_text || "",
      category: extra.category || "celular",
    },
    ...extra,
  };
}

const ACCESSORY_POSITIVE = [
  { query: "película iphone 13", signal: "pelicula" },
  { query: "capa iphone 13", signal: "capa" },
  { query: "carregador notebook lenovo", signal: "carregador" },
  { query: "controle ps5", signal: "controle" },
  { query: "controle remoto samsung", signal: "controle remoto" },
  { query: "cabo hdmi", signal: "cabo" },
  { query: "suporte monitor", signal: "suporte" },
  { query: "dock notebook", signal: "dock" },
  { query: "headset gamer", signal: "headset" },
  { query: "mousepad gamer", signal: "mousepad" },
];

const ACCESSORY_NEGATIVE = [
  "iphone 13",
  "galaxy a55",
  "notebook lenovo",
  "cadeira gamer",
  "tv samsung",
  "monitor gamer",
  "ps5",
  "xbox series s",
];

const GUARD_FILES = [
  "lib/commercial/accessoryIntentLockGuard.js",
  "lib/miaSpecificProductResolutionLock.js",
  "lib/productSourceAdapter/commercialShadowDiagnosticSummary.js",
  "pages/api/dev/commercial-shadow-summary.js",
];

console.log(
  `\nPATCH Comercial 4E-A.2 — Accessory Intent Lock Guard Audit (${ACCESSORY_INTENT_LOCK_GUARD_VERSION})\n`
);

console.log("── Module contract ──");
assert("version 4E-A.2", ACCESSORY_INTENT_LOCK_GUARD_VERSION === "4E-A.2");
assert("signal rules expandable", ACCESSORY_INTENT_SIGNAL_RULES.length >= 15);
assert(
  "no brand hardcodes in guard module",
  !readFileSync(join(ROOT, "lib/commercial/accessoryIntentLockGuard.js"), "utf8").match(
    /includes\s*\(\s*["']iphone|includes\s*\(\s*["']galaxy/i
  )
);

for (const file of GUARD_FILES) {
  assert(`file exists: ${file}`, readFileSync(join(ROOT, file), "utf8").length > 0);
}

console.log("\n── detectAccessoryIntent — positive ──");
for (const { query, signal } of ACCESSORY_POSITIVE) {
  const intent = detectAccessoryIntent(query);
  assert(
    `"${query}" → accessory`,
    intent.isAccessoryIntent === true,
    JSON.stringify(intent)
  );
  assert(
    `"${query}" matched "${signal}"`,
    intent.matchedSignals.includes(signal),
    intent.matchedSignals.join(", ")
  );
  assert(
    `"${query}" confidence > 0`,
    intent.confidence > 0,
    String(intent.confidence)
  );
  assert(
    `"${query}" normalizedQuery present`,
    typeof intent.normalizedQuery === "string" && intent.normalizedQuery.length > 0
  );
}

console.log("\n── detectAccessoryIntent — negative ──");
for (const query of ACCESSORY_NEGATIVE) {
  const intent = detectAccessoryIntent(query);
  assert(
    `"${query}" → not accessory`,
    intent.isAccessoryIntent === false,
    JSON.stringify(intent)
  );
  assert(
    `"${query}" bypass false`,
    shouldBypassSpecificProductLockForAccessoryIntent(query) === false
  );
}

console.log("\n── Specific Product Lock integration ──");
const iphone13 = product("iPhone 13", { familyKey: "iphone 13" });
const candidates = [iphone13];

for (const { query } of ACCESSORY_POSITIVE.slice(0, 2)) {
  const lock = resolveSpecificProductLock({ query, products: candidates });
  assert(
    `resolveSpecificProductLock inactive for "${query}"`,
    lock.active === false && lock.reason === "accessory_intent_guard"
  );
  assert(
    `resolveSpecificProductLock preserves no iPhone lock for "${query}"`,
    lock.lockedProduct == null
  );

  const bootstrap = bootstrapSpecificProductLock({
    query,
    products: candidates,
    resolveIdentity: (q) => {
      const match = q.match(/iphone\s*13/i);
      return match ? { officialName: "iPhone 13" } : null;
    },
  });
  assert(
    `bootstrapSpecificProductLock inactive for "${query}"`,
    bootstrap.active === false && bootstrap.reason === "accessory_intent_guard"
  );
  assert(
    `bootstrap skips identity anchor for "${query}"`,
    bootstrap.matchSource !== "query_identity_anchor"
  );
}

const mainProductLock = resolveSpecificProductLock({
  query: "iphone 13",
  products: candidates,
});
assert(
  "main product query still locks when catalog match exists",
  mainProductLock.active === true || mainProductLock.reason !== "accessory_intent_guard",
  JSON.stringify({ active: mainProductLock.active, reason: mainProductLock.reason })
);

const bootstrapMain = bootstrapSpecificProductLock({
  query: "iPhone 13",
  products: [],
  resolveIdentity: (q) => ({ officialName: q }),
});
assert("main product bootstrap still active", bootstrapMain.active === true);
assert(
  "main product bootstrap still uses identity anchor",
  bootstrapMain.matchSource === "query_identity_anchor"
);

console.log("\n── Shadow diagnostic observability ──");
const shadowReport = buildCommercialShadowDiagnosticReport({
  trace: { query: "pelicula iphone 13", selection: {}, merge: {}, dedupe: {} },
});
assert(
  "shadow summary includes Accessory Intent YES",
  shadowReport.summary.includes("Accessory Intent:") &&
    shadowReport.summary.includes("YES")
);
assert(
  "shadow summary lists pelicula signal",
  shadowReport.summary.includes("pelicula")
);
assert(
  "shadow report accessoryIntent payload",
  shadowReport.accessoryIntent?.isAccessoryIntent === true &&
    shadowReport.accessoryIntent?.matchedSignals?.includes("pelicula")
);

const shadowNegative = buildCommercialShadowDiagnosticReport({
  trace: { query: "iphone 13", selection: {}, merge: {}, dedupe: {} },
});
assert(
  "shadow summary Accessory Intent NO for main product",
  shadowNegative.summary.includes("Accessory Intent:") &&
    shadowNegative.summary.includes("NO") &&
    shadowNegative.accessoryIntent?.isAccessoryIntent === false
);

console.log("\n── DEV diagnostic payload ──");
const diagnostic = buildAccessoryIntentDiagnostic("capa galaxy s24");
assert("diagnostic enabled", diagnostic.enabled === true);
assert("diagnostic matchedSignals", diagnostic.matchedSignals.includes("capa"));

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) ROBUST\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
