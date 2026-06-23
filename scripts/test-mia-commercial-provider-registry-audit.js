/**
 * PATCH Comercial 4B — Commercial Provider Registry Audit
 *
 * Usage:
 *   node scripts/test-mia-commercial-provider-registry-audit.js
 *   node scripts/test-mia-commercial-provider-registry-audit.js --http
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_PROVIDER_IDS,
  COMMERCIAL_PROVIDER_REGISTRY_VERSION,
  COMMERCIAL_PROVIDER_TYPES,
  getCommercialProviderById,
  getCommercialProviderRegistry,
  getCommercialProviderRegistrySummary,
  isCommercialProviderEnabled,
  listDisabledCommercialProviders,
  listEnabledCommercialProviders,
} from "../lib/productSourceAdapter/commercialProviderRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "pages/api/chat-gpt4o.js",
  "lib/productSourceAdapter/index.js",
];

const SENSITIVE_PATTERNS = [
  /APIFY_API_TOKEN/i,
  /SERPAPI_KEY/i,
  /MERCADOLIVRE_CLIENT_SECRET/i,
  /MERCADOLIVRE_ACCESS_TOKEN/i,
  /OPENAI_API_KEY/i,
  /apify_api_/i,
  /sk-proj-/i,
  /Bearer\s+/i,
  /https?:\/\/api\.apify\.com/i,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertValidProviderMetadata(provider = {}) {
  assert(typeof provider.id === "string" && provider.id.length > 0, "id required");
  assert(typeof provider.enabled === "boolean", "enabled boolean required");
  assert(provider.providerType === COMMERCIAL_PROVIDER_TYPES.SEARCH, "providerType search");
  assert(typeof provider.version === "string" && provider.version.length > 0, "version required");
}

function assertNoSensitiveLeak(value = "") {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const pattern of SENSITIVE_PATTERNS) {
    assert(!pattern.test(text), `sensitive leak matched ${pattern}`);
  }
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("registry exists with summary", () => {
  const summary = getCommercialProviderRegistrySummary();
  assert(summary.version === COMMERCIAL_PROVIDER_REGISTRY_VERSION, "version");
  assert(summary.count >= 2, "count");
  assert(summary.enabledCount >= 2, "enabledCount");
  assert(Array.isArray(summary.providers), "providers array");
});

test("google_shopping registered and enabled", () => {
  const provider = getCommercialProviderById(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING);
  assert(provider, "google_shopping missing");
  assertValidProviderMetadata(provider);
  assert(provider.version === "current", "google version");
  assert(isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING), "enabled");
});

test("apify_mercadolivre registered and enabled", () => {
  const provider = getCommercialProviderById(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE);
  assert(provider, "apify_mercadolivre missing");
  assertValidProviderMetadata(provider);
  assert(provider.version === "4A.1", "apify version");
  assert(isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE), "enabled");
});

test("unknown provider returns null without throw", () => {
  assert(getCommercialProviderById("provider_inexistente") === null, "null");
  assert(isCommercialProviderEnabled("provider_inexistente") === false, "disabled");
  assert(isCommercialProviderEnabled("") === false, "empty id");
});

test("listEnabledCommercialProviders returns only active providers", () => {
  const enabled = listEnabledCommercialProviders();
  assert(enabled.length >= 2, "enabled count");
  assert(
    enabled.every((provider) => provider.enabled === true),
    "all enabled entries true"
  );
  assert(
    enabled.some((provider) => provider.id === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING),
    "google in enabled"
  );
  assert(
    enabled.some((provider) => provider.id === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE),
    "apify in enabled"
  );
});

test("listDisabledCommercialProviders excludes active providers", () => {
  const disabled = listDisabledCommercialProviders();
  assert(disabled.length >= 1, "disabled placeholder expected");
  assert(
    disabled.every((provider) => provider.enabled === false),
    "all disabled entries false"
  );
  assert(
    !disabled.some((provider) => provider.id === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING),
    "google not disabled"
  );
  assert(
    !isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.AMAZON),
    "amazon disabled"
  );
});

test("registry metadata has no credentials or tokens", () => {
  const registry = getCommercialProviderRegistry();
  assertNoSensitiveLeak(registry);
  for (const provider of registry) {
    assertValidProviderMetadata(provider);
    assert(!("token" in provider), "token field forbidden");
    assert(!("secret" in provider), "secret field forbidden");
    assert(!("apiKey" in provider), "apiKey field forbidden");
    assert(!("url" in provider), "url field forbidden");
  }
});

test("registry is passive and does not execute providers", () => {
  const source = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialProviderRegistry.js"),
    "utf8"
  );
  assert(!source.includes("searchApifyMercadoLivreProducts"), "must not call apify search");
  assert(!source.includes("fetchSerpPrices"), "must not call serp search");
  assert(!source.includes("fetchGoogleShopping"), "must not call google search");
  assert(!source.includes("globalThis.fetch"), "must not fetch");
});

test("no MIA integration and commercial search untouched", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(
      !content.includes("commercialProviderRegistry"),
      `${relativePath} must not import registry`
    );
    assert(
      !content.includes("commercial-provider-registry"),
      `${relativePath} must not use registry dev endpoint`
    );
  }

  const devRoute = readFileSync(
    join(ROOT, "pages/api/dev/commercial-provider-registry.js"),
    "utf8"
  );
  assert(devRoute.includes("getCommercialProviderRegistrySummary"), "dev route uses summary");
  assert(!devRoute.includes("searchApifyMercadoLivreProducts"), "dev route must not search");
});

console.log(
  `PATCH Comercial 4B — Commercial Provider Registry Audit (${COMMERCIAL_PROVIDER_REGISTRY_VERSION})\n`
);

let pass = 0;
let fail = 0;

for (const spec of CASES) {
  try {
    const maybePromise = spec.fn();
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
    }
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
    const resp = await fetch("http://localhost:3000/api/dev/commercial-provider-registry");
    const data = await resp.json();

    assert("endpoint status 200", resp.status === 200, String(resp.status));
    assert("endpoint ok true", data.ok === true);
    assert("endpoint count >= 2", (data.count ?? 0) >= 2);
    assert(
      "google_shopping present",
      data.providers?.some((provider) => provider.id === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING)
    );
    assert(
      "apify_mercadolivre present",
      data.providers?.some((provider) => provider.id === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE)
    );
    assertNoSensitiveLeak(data);

    pass += 1;
    console.log("✓ HTTP commercial-provider-registry endpoint");
  } catch (err) {
    fail += 1;
    console.log(`✗ HTTP commercial-provider-registry endpoint → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) COMMERCIAL PROVIDER REGISTRY ROBUST"
    : "B) COMMERCIAL PROVIDER REGISTRY GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
