#!/usr/bin/env node
/**
 * PATCH 6.4 — Data Layer usage & effectiveness analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyDataLayerResponse,
  classifyFallbackKind,
  countDataLayerProductsInList,
  deriveDataLayerResolutionFlags,
  DATA_LAYER_RESPONSE_CLASSIFICATIONS,
  DATA_LAYER_FALLBACK_KINDS,
} from "../lib/miaDataLayerResolutionClassifier.js";
import {
  buildDataLayerUsageAnalyticsPayload,
  buildDataLayerUsageRecommendationMetadata,
  MIA_DATA_LAYER_USAGE_ANALYTICS_EVENT,
  MIA_DATA_LAYER_USAGE_ANALYTICS_VERSION,
} from "../lib/miaDataLayerUsageAnalytics.js";
import { buildMiaRecommendationShownPayload } from "../lib/miaAnalyticsPayload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-data-layer-usage.sql");
const USAGE_DOC = join(ANALYTICS_DIR, "DATA_LAYER_USAGE_ANALYTICS.md");
const PATCH_DOC = join(ANALYTICS_DIR, "PATCH_6.4_DATA_LAYER_USAGE_ANALYTICS.md");
const EVENT_CONTRACT = join(ANALYTICS_DIR, "contracts/EVENT_CONTRACT.md");
const CLASSIFIER_FILE = join(ROOT, "lib/miaDataLayerResolutionClassifier.js");
const ANALYTICS_LIB = join(ROOT, "lib/miaDataLayerUsageAnalytics.js");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");
const MIA_CHAT = join(ROOT, "components/MIAChat.jsx");

const REQUIRED_ALIASES = [
  "dia_referencia",
  "tipo_analise",
  "metrica",
  "valor_absoluto",
  "valor_relativo",
  "registros_total",
  "referencia_denominador",
  "amostra_analisavel",
];

const FORBIDDEN_CATALOG = [
  /\bfrom\s+product_specs\b/i,
  /\bfrom\s+phone_specs\b/i,
  /\bfrom\s+notebook_specs\b/i,
  /\bcreate\s+table\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\s+/i,
  /\bdelete\s+from\b/i,
];

const FORBIDDEN_DUPLICATE_61 = [
  /\bstatus_cobertura\b/i,
  /\bprioridade_expansao\b/i,
  /\bpct_exposicao_runtime_sobre_detail\b/i,
];

const FORBIDDEN_DUPLICATE_62 = [
  /\bseveridade\b/i,
  /\bdimensao_qualidade\b/i,
  /\bduplicacao_confirmada\b/i,
];

const FORBIDDEN_DUPLICATE_63 = [
  /\binventario_consolidado\b/i,
  /\bdistribuicao_familia\b/i,
  /\bconcentracao\b/i,
  /\binsight_estatistico\b/i,
];

const SPLIT_FILES = [
  "patch-64-query1-effectiveness-overview.sql",
  "patch-64-query2-coverage-dimensions.sql",
  "patch-64-query3-fallback-analytics.sql",
  "patch-64-query4-evolution-gaps-panel.sql",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

const sql = readFileSync(SQL_FILE, "utf8");
const usageDoc = readFileSync(USAGE_DOC, "utf8");
const patchDoc = existsSync(PATCH_DOC) ? readFileSync(PATCH_DOC, "utf8") : "";
const eventContract = readFileSync(EVENT_CONTRACT, "utf8");
const chatApi = readFileSync(CHAT_API, "utf8");
const miaChat = readFileSync(MIA_CHAT, "utf8");

console.log("\nPATCH 6.4 — Data Layer usage analytics audit\n");

console.log("SQL structure");
assert("main SQL exists", existsSync(SQL_FILE));
assert("uses analytics_events", /from\s+analytics_events/i.test(sql));
assert("filters data_layer_resolution", /event_name\s*=\s*'data_layer_resolution'/i.test(sql));
assert("excludes data_layer_usage_test", /data_layer_usage_test/i.test(sql));
for (const alias of REQUIRED_ALIASES) {
  assert(`SQL alias ${alias}`, sql.includes(alias));
}
for (const pattern of FORBIDDEN_CATALOG) {
  assert(`SQL avoids catalog mutation ${pattern}`, !pattern.test(sql));
}
for (const pattern of [...FORBIDDEN_DUPLICATE_61, ...FORBIDDEN_DUPLICATE_62, ...FORBIDDEN_DUPLICATE_63]) {
  assert(`SQL avoids duplicate metric ${pattern}`, !pattern.test(sql));
}
assert("SQL has 4 query sections", (sql.match(/^-- QUERY /gm) || []).length === 4);

console.log("\nSQL splits");
for (const split of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", split);
  assert(`split ${split} exists`, existsSync(path));
  const splitSql = readFileSync(path, "utf8");
  assert(`${split} is standalone SELECT`, /^with\s+/i.test(splitSql.trim()));
  assert(`${split} no mid-CTE fragment`, !/^\s*,\s*\w+\s+as\s+\(/i.test(splitSql.trim()));
}

console.log("\nClassifier");
assert(
  "FULL_DATA_LAYER",
  classifyDataLayerResponse({
    productsUsedCount: 2,
    dataLayerUsedAsPrimarySource: true,
    dataLayerProductsInResponse: 2,
  }) === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FULL_DATA_LAYER
);
assert(
  "PARTIAL_DATA_LAYER hybrid",
  classifyDataLayerResponse({
    productsUsedCount: 2,
    dataLayerUsedAsPrimarySource: true,
    dataLayerProductsInResponse: 2,
    hybridEnrichCount: 1,
  }) === DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER
);
assert(
  "FALLBACK_ONLY",
  classifyDataLayerResponse({
    productsUsedCount: 1,
    dataLayerUsedAsPrimarySource: false,
  }) === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FALLBACK_ONLY
);
assert(
  "NO_COMMERCIAL_RESULT",
  classifyDataLayerResponse({ productsUsedCount: 0 }) ===
    DATA_LAYER_RESPONSE_CLASSIFICATIONS.NO_COMMERCIAL_RESULT
);
assert(
  "priority follow-up DL reuse",
  classifyDataLayerResponse({
    productsUsedCount: 1,
    dataLayerUsedAsPrimarySource: false,
    dataLayerProductsInResponse: 1,
    hasPriorityFollowUp: true,
  }) === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FULL_DATA_LAYER
);
assert(
  "fallback necessary",
  classifyFallbackKind({
    responseClassification: DATA_LAYER_RESPONSE_CLASSIFICATIONS.FALLBACK_ONLY,
    candidatesRaw: 0,
  }) === DATA_LAYER_FALLBACK_KINDS.NECESSARY
);
assert(
  "fallback expected hybrid",
  classifyFallbackKind({
    responseClassification: DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER,
    hybridEnrichCount: 1,
  }) === DATA_LAYER_FALLBACK_KINDS.EXPECTED
);
assert(
  "count DL products",
  countDataLayerProductsInList([{ isDataLayerProduct: true }, {}]) === 1
);
assert(
  "flags hybrid",
  deriveDataLayerResolutionFlags(DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER)
    .hybrid_response === true
);

console.log("\nAnalytics payload");
const built = buildDataLayerUsageAnalyticsPayload({
  query: "celular até 2000",
  category: "phone",
  intent: "search",
  responsePath: "return_seguro",
  dataLayerUsedAsPrimarySource: true,
  analyticsContext: {
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    visitor_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    conversation_id: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  },
  displayProducts: [{ product_name: "iPhone 13", isDataLayerProduct: true, commercialEnriched: true }],
  searchMetrics: { candidatesRaw: 4, candidatesAfterIsolation: 3, hybridEnrichCount: 1 },
});
assert("event name", built.payload.event_name === MIA_DATA_LAYER_USAGE_ANALYTICS_EVENT);
assert("event_version metadata", built.payload.metadata?.event_version === MIA_DATA_LAYER_USAGE_ANALYTICS_VERSION);
assert(
  "classification partial",
  built.payload.metadata?.response_classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER
);
assert("retrocompatible insert row keys", "visitor_id" in built.payload && "metadata" in built.payload);
assert(
  "recommendation metadata extension",
  buildDataLayerUsageRecommendationMetadata(built.summary).data_layer_used === true
);
const recommendationPayload = buildMiaRecommendationShownPayload({
  queryText: "celular",
  cardProduct: { product_name: "iPhone 13" },
  productsCount: 1,
  dataLayerUsage: buildDataLayerUsageRecommendationMetadata(built.summary),
});
assert(
  "recommendation keeps legacy fields",
  recommendationPayload.metadata?.has_offer_card === true &&
    recommendationPayload.metadata?.products_count === 1
);
assert(
  "recommendation adds DL fields",
  recommendationPayload.metadata?.data_layer_response_classification ===
    DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER
);

console.log("\nRuntime instrumentation");
assert("classifier module exists", existsSync(CLASSIFIER_FILE));
assert("analytics lib exists", existsSync(ANALYTICS_LIB));
assert("chat imports emit", /emitDataLayerUsageAnalytics/.test(chatApi));
assert("chat records analytics", /recordDataLayerUsageForCommercialTurn/.test(chatApi));
assert("chat attaches summary", /data_layer_usage_analytics/.test(chatApi));
assert("MIAChat sends analytics_context", /analytics_context:\s*buildAnalyticsContextForChat/.test(miaChat));
assert("MIAChat enriches recommendation", /buildRecommendationShownPayloadFromApiResponse/.test(miaChat));

console.log("\nDocumentation");
assert("usage doc exists", existsSync(USAGE_DOC));
assert("usage doc mentions event_version", /event_version/i.test(usageDoc));
assert("usage doc mentions FULL_DATA_LAYER", /FULL_DATA_LAYER/.test(usageDoc));
assert("usage doc mentions data_layer_hit_rate", /data_layer_hit_rate/i.test(usageDoc));
assert("patch report exists", existsSync(PATCH_DOC));
assert("event contract extended", /data_layer_resolution/.test(eventContract));

console.log(`\nResult: ${passed}/${passed + failed} checks passed\n`);
process.exit(failed > 0 ? 1 : 0);
