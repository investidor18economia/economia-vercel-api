/**
 * PATCH Comercial 4E-A — Commercial Runtime Shadow Integration Audit
 *
 * Usage:
 *   node scripts/test-mia-commercial-runtime-shadow-audit.js
 *   node scripts/test-mia-commercial-runtime-shadow-audit.js --http
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_RUNTIME_SHADOW_VERSION,
  areSameCommercialShadowOffers,
  buildCommercialShadowDiagnostics,
  buildCommercialShadowPayload,
  executeCommercialRuntimeShadow,
  isCommercialRuntimeShadowEnabled,
  logCommercialShadowObservation,
  normalizeLegacyCommercialOfferForShadow,
  runCommercialShadowPipeline,
} from "../lib/productSourceAdapter/commercialRuntimeShadow.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { selectCommercialOffers } from "../lib/productSourceAdapter/commercialSelectionEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DECISION_ENGINE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/miaSpecialistDecisionExplanationLayer.js",
  "lib/productSourceAdapter/index.js",
];

const ORIGINAL_SHADOW_FLAG = process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withShadowFlag(value, fn) {
  if (value == null) {
    delete process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;
  } else {
    process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW = value;
  }
  try {
    return fn();
  } finally {
    if (ORIGINAL_SHADOW_FLAG == null) {
      delete process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;
    } else {
      process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW = ORIGINAL_SHADOW_FLAG;
    }
  }
}

function legacyProduct(name, extra = {}) {
  return {
    product_name: name,
    price: extra.price ?? "R$ 100,00",
    link: extra.link ?? `https://example.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://example.test/img.jpg",
    source: extra.source ?? "Google Shopping",
    provider: extra.provider ?? "serpapi",
    ...extra,
  };
}

function shadowOffer(title, extra = {}) {
  return {
    title,
    price: extra.price ?? 100,
    url: extra.url ?? `https://example.test/${encodeURIComponent(title)}`,
    image: extra.image ?? "https://example.test/img.jpg",
    source: extra.source ?? COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    ...extra,
  };
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("feature flag off por default", () => {
  withShadowFlag(undefined, () => {
    assert(isCommercialRuntimeShadowEnabled() === false, "default disabled");
  });
});

test("feature flag on quando ENABLE_COMMERCIAL_RUNTIME_SHADOW=true", () => {
  withShadowFlag("true", () => {
    assert(isCommercialRuntimeShadowEnabled() === true, "enabled");
  });
});

test("feature flag off não executa pipeline", async () => {
  await withShadowFlag("false", async () => {
    const result = await executeCommercialRuntimeShadow({
      query: "iphone 13",
      winner: legacyProduct("Apple iPhone 13"),
      fetchGoogle: async () => {
        throw new Error("must_not_run");
      },
    });
    assert(result.skipped === true, "skipped");
    assert(result.payload === null, "no payload");
  });
});

test("feature flag on executa pipeline mockado", async () => {
  await withShadowFlag("true", async () => {
    const result = await executeCommercialRuntimeShadow({
      query: "cadeira gamer",
      winner: legacyProduct("Cadeira Gamer Healer"),
      legacyOffer: legacyProduct("Cadeira Gamer Healer"),
      fetchGoogle: async () => ({
        ok: true,
        products: [
          {
            product_name: "Cadeira Gamer Healer",
            price: "R$ 459,00",
            link: "https://example.test/cadeira",
            thumbnail: "https://example.test/cadeira.jpg",
            source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
          },
        ],
      }),
      fetchApify: async () => ({
        ok: true,
        products: [
          {
            title: "Capa Para Cadeira Gamer",
            price: 42,
            url: "https://example.test/capa",
            image: "https://example.test/capa.jpg",
            source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
          },
          {
            title: "Cadeira Gamer Healer Preta",
            price: 459,
            url: "https://example.test/cadeira",
            image: "https://example.test/cadeira.jpg",
            source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
          },
        ],
      }),
    });

    assert(result.skipped === false, "executed");
    assert(result.payload?.shadowOffer, "shadow offer present");
    assert(result.diagnostics?.enabled === true, "diagnostics enabled");
  });
});

test("pipeline novo falha sem propagar erro", async () => {
  await withShadowFlag("true", async () => {
    const result = await executeCommercialRuntimeShadow({
      query: "iphone 13",
      winner: legacyProduct("Apple iPhone 13"),
      fetchGoogle: async () => {
        throw new Error("provider_down");
      },
      fetchApify: async () => {
        throw new Error("provider_down");
      },
    });

    assert(result.skipped === false, "attempted");
    assert(result.diagnostics?.pipelineOk === false, "pipeline failed");
    assert(result.diagnostics?.pipelineError, "error captured");
    assert(result.payload?.legacyOffer, "legacy preserved in payload");
  });
});

test("pipeline novo retorna vazio", async () => {
  await withShadowFlag("true", async () => {
    const result = await executeCommercialRuntimeShadow({
      query: "produto inexistente xyz",
      winner: legacyProduct("Produto XYZ"),
      fetchGoogle: async () => ({ ok: false, products: [] }),
      fetchApify: async () => ({ ok: false, products: [] }),
    });

    assert(result.pipelineResult?.ok === false, "empty pipeline");
    assert(result.payload?.shadowOffer == null, "no shadow offer");
    assert(result.diagnostics?.hasShadowOffer === false, "diagnostics no shadow");
  });
});

test("legacy provider mapeia serpapi para google_shopping", () => {
  const legacy = normalizeLegacyCommercialOfferForShadow(
    legacyProduct("Notebook Lenovo", { provider: "serpapi" })
  );
  assert(legacy.provider === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, "mapped provider");
});

test("buildCommercialShadowPayload compara legacy vs shadow", () => {
  const payload = buildCommercialShadowPayload({
    query: "iphone 13",
    winner: legacyProduct("Apple iPhone 13 128GB"),
    legacyOffer: legacyProduct("Apple iPhone 13 128GB", {
      link: "https://shop.test/iphone13",
    }),
    shadowOffer: shadowOffer("Apple iPhone 13 128GB", {
      url: "https://shop.test/iphone13",
    }),
  });

  assert(payload.sameOffer === true, "same offer");
  assert(payload.legacyProvider === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, "legacy provider");
  assert(payload.shadowProvider === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE, "shadow provider");
});

test("areSameCommercialShadowOffers detecta títulos equivalentes", () => {
  assert(
    areSameCommercialShadowOffers(
      { title: "Cadeira Gamer Healer", url: "" },
      { title: "cadeira gamer healer preta", url: "" }
    ),
    "title overlap"
  );
});

test("buildCommercialShadowDiagnostics estrutura mínima", () => {
  const diagnostics = buildCommercialShadowDiagnostics({
    query: "iphone 13",
    winner: "iphone_13",
    sameOffer: false,
    legacyProvider: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    shadowProvider: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    legacyOffer: { title: "iPhone 13" },
    shadowOffer: { title: "Película iPhone 13" },
    pipelineOk: true,
  });

  assert(diagnostics.enabled === true, "enabled");
  assert(diagnostics.sameOffer === false, "sameOffer");
  assert(diagnostics.legacyProvider === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, "legacy");
  assert(diagnostics.shadowProvider === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE, "shadow");
});

test("logCommercialShadowObservation não expõe tokens", () => {
  const originalLog = console.log;
  let captured = "";
  console.log = (...args) => {
    captured = args.join(" ");
  };

  try {
    withShadowFlag("true", () => {
      logCommercialShadowObservation({
        query: "iphone 13",
        winner: "iphone_13",
        sameOffer: false,
        legacyProvider: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
        shadowProvider: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
        legacyOffer: { title: "iPhone 13" },
        shadowOffer: { title: "Capa iPhone 13" },
        pipelineOk: true,
      });
    });
  } finally {
    console.log = originalLog;
  }

  assert(captured.includes("[CommercialShadow]"), "prefix");
  assert(captured.includes("sameOffer=false"), "sameOffer");
  assert(!captured.includes("APIFY_API_TOKEN"), "no token leak");
  assert(!captured.includes("SERPAPI_KEY"), "no serp key leak");
});

test("legacy selection engine permanece independente do shadow", () => {
  const legacyWinner = selectCommercialOffers({
    offers: [
      shadowOffer("Produto Alpha", { price: 100 }),
      shadowOffer("Produto Beta", { price: 200 }),
    ],
  });

  assert(legacyWinner.selectedOffer?.title === "Produto Alpha", "cheapest wins without shadow");
  assert(legacyWinner.diagnostics.queryApplied === false, "no query alignment without query");
});

test("runCommercialShadowPipeline isolado com mocks", async () => {
  const result = await runCommercialShadowPipeline({
    query: "monitor gamer",
    fetchGoogle: async () => ({
      ok: true,
      products: [
        {
          product_name: "Monitor Gamer 27",
          price: "R$ 1.199,00",
          link: "https://example.test/monitor",
          thumbnail: "https://example.test/monitor.jpg",
          source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
        },
      ],
    }),
    fetchApify: async () => ({ ok: true, products: [] }),
  });

  assert(result.ok === true, "pipeline ok");
  assert(result.shadowOffer?.title, "selected shadow offer");
});

test("chat-gpt4o integra shadow sem alterar prices/reply", () => {
  const source = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  assert(source.includes("executeCommercialRuntimeShadow"), "shadow imported");
  assert(source.includes("commercial_runtime_shadow"), "tracer patch");
  assert(!source.includes("shadowOffer:"), "shadow offer not assigned to response body");
  assert(!source.includes("payload.shadowOffer"), "shadow not wired to payload");
  assert(
    source.includes("Shadow failure must never affect legacy commercial flow"),
    "failure guard comment"
  );
});

test("Decision Engine isolado do shadow", () => {
  for (const relativePath of DECISION_ENGINE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(
      !content.includes("commercialRuntimeShadow"),
      `${relativePath} must not import shadow layer`
    );
    assert(!content.includes("shadowOffer"), `${relativePath} must not consume shadowOffer`);
    assert(!content.includes("shadowScore"), `${relativePath} must not consume shadowScore`);
    assert(
      !content.includes("shadowSelection"),
      `${relativePath} must not consume shadowSelection`
    );
  }
});

test("shadow module não chama LLM ou providers externos diretamente além do pipeline", () => {
  const source = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialRuntimeShadow.js"),
    "utf8"
  );
  assert(!source.includes("openai"), "no openai");
  assert(!source.includes("callOpenAI"), "no callOpenAI");
  assert(source.includes("COMMERCIAL_RUNTIME_SHADOW_VERSION"), "version export");
});

console.log(
  `\nPATCH Comercial 4E-A — Commercial Runtime Shadow Audit (${COMMERCIAL_RUNTIME_SHADOW_VERSION})\n`
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
    const resp = await fetch(
      "http://localhost:3000/api/dev/commercial-shadow?q=cadeira%20gamer"
    );
    const data = await resp.json();
    assert(resp.status !== 500, `endpoint status ${resp.status}`);
    assert(data.shadowVersion === COMMERCIAL_RUNTIME_SHADOW_VERSION, "version");
    assert(typeof data.sameOffer === "boolean", "sameOffer boolean");
    pass += 1;
    console.log("✓ HTTP commercial-shadow endpoint");
  } catch (err) {
    fail += 1;
    console.log(`✗ HTTP commercial-shadow endpoint → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) COMMERCIAL RUNTIME SHADOW ROBUST"
    : "B) COMMERCIAL RUNTIME SHADOW GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
