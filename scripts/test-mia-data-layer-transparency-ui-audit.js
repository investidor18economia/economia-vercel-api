/**
 * PATCH Comercial 4E-A.4 — Data Layer Transparency UI Audit
 *
 * Usage:
 *   node scripts/test-mia-data-layer-transparency-ui-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  attachCommercialKnowledgeMetadataToChatResponse,
  COMMERCIAL_KNOWLEDGE_TRANSPARENCY_PAYLOAD_VERSION,
} from "../lib/miaCommercialKnowledgeTransparencyPayload.js";
import {
  COMMERCIAL_KNOWLEDGE_TRANSPARENCY_VERSION,
  MIA_HOW_IT_WORKS_AUDIT_ANCHOR,
  MIA_HOW_IT_WORKS_AUDIT_HREF,
  shouldShowCommercialTransparencyNotice,
} from "../lib/miaCommercialKnowledgeTransparency.js";
import { buildCommercialKnowledgeMetadata } from "../lib/commercial/nonDataLayerCommercialResponseGuard.js";

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

const DATA_LAYER_WINNER = {
  product_name: "iPhone 13",
  isDataLayerProduct: true,
  trustedSpecs: {
    official_name: "iPhone 13",
    strengths: ["desempenho estável"],
    ideal_for: ["uso diário"],
  },
};

const FALLBACK_WINNER = {
  product_name: "Cadeira Gamer XYZ",
  price: "R$ 899,00",
  category: "chair",
};

const GUARD_FILES = [
  "lib/miaCommercialKnowledgeTransparencyPayload.js",
  "lib/miaCommercialKnowledgeTransparency.js",
  "components/MIACommercialTransparencyNotice.jsx",
  "components/MIAHowItWorksPanel.jsx",
  "components/MIAChat.jsx",
  "styles/mia-chat.css",
];

const UNTOUCHED_FILES = [
  "lib/miaProductExplanationBuilder.js",
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/productSourceAdapter/commercialSelectionEngine.js",
  "lib/miaSpecificProductResolutionLock.js",
];

console.log(
  `\nPATCH Comercial 4E-A.4 — Data Layer Transparency UI Audit (${COMMERCIAL_KNOWLEDGE_TRANSPARENCY_VERSION})\n`
);

console.log("── Module contract ──");
assert("payload version 4E-A.4", COMMERCIAL_KNOWLEDGE_TRANSPARENCY_PAYLOAD_VERSION === "4E-A.4");
for (const file of GUARD_FILES) {
  assert(`file exists: ${file}`, readFileSync(join(ROOT, file), "utf8").length > 0);
}

console.log("\n── Backend/payload ──");
const dataLayerBody = attachCommercialKnowledgeMetadataToChatResponse(
  {
    reply: "Resposta comercial auditada.",
    prices: [{ product_name: "iPhone 13", price: "R$ 3.499,00" }],
    session_context: { lastBestProduct: DATA_LAYER_WINNER },
  },
  { winnerProduct: DATA_LAYER_WINNER, dataLayerPrimary: true }
);
assert(
  "Data Layer transparencyRequired=false",
  dataLayerBody.knowledgeMetadata?.transparencyRequired === false
);
assert(
  "Data Layer knowledgeSource=data_layer",
  dataLayerBody.knowledgeMetadata?.knowledgeSource === "data_layer"
);

const fallbackBody = attachCommercialKnowledgeMetadataToChatResponse(
  {
    reply: "Resposta comercial confiante.",
    prices: [{ product_name: "Cadeira Gamer XYZ", price: "R$ 899,00" }],
    session_context: { lastBestProduct: FALLBACK_WINNER },
  },
  { winnerProduct: FALLBACK_WINNER, dataLayerPrimary: false }
);
assert(
  "Governed fallback transparencyRequired=true",
  fallbackBody.knowledgeMetadata?.transparencyRequired === true
);
assert(
  "Governed fallback knowledgeSource=governed_fallback",
  fallbackBody.knowledgeMetadata?.knowledgeSource === "governed_fallback"
);
assert(
  "metadata preserved on payload",
  fallbackBody.knowledgeMetadata?.confidence === "medium" &&
    fallbackBody.knowledgeMetadata?.isAudited === false
);

console.log("\n── Frontend helpers ──");
assert(
  "notice hidden for data layer",
  shouldShowCommercialTransparencyNotice(dataLayerBody.knowledgeMetadata) === false
);
assert(
  "notice visible for governed fallback",
  shouldShowCommercialTransparencyNotice(fallbackBody.knowledgeMetadata) === true
);

console.log("\n── UI component ──");
const noticeSource = readFileSync(
  join(ROOT, "components/MIACommercialTransparencyNotice.jsx"),
  "utf8"
);
assert("notice copy present", noticeSource.includes("COMMERCIAL_TRANSPARENCY_NOTICE_PREFIX"));
assert("Saiba mais link present", noticeSource.includes("Saiba mais"));
assert("href uses audit anchor constant", noticeSource.includes("MIA_HOW_IT_WORKS_AUDIT_HREF"));
assert("no large button class", !noticeSource.match(/mia-btn|button className=\"mia-offer-card-cta\"/));
assert("no modal", !/modal|dialog/i.test(noticeSource));
assert("consumes transparencyRequired only", noticeSource.includes("shouldShowCommercialTransparencyNotice"));

console.log("\n── MIAChat wiring ──");
const chatSource = readFileSync(join(ROOT, "components/MIAChat.jsx"), "utf8");
assert("chat imports transparency notice", chatSource.includes("MIACommercialTransparencyNotice"));
assert("chat extracts knowledgeMetadata", chatSource.includes("extractKnowledgeMetadataFromApiResponse"));
assert("history stores knowledgeMetadata", chatSource.includes("knowledgeMetadata"));
assert("chat opens how-it-works audit section", chatSource.includes("openHowItWorksAuditSection"));
assert("chat does not recalculate knowledge source", !chatSource.includes("detectCommercialKnowledgeSource"));

console.log("\n── How it works page section ──");
const howSource = readFileSync(join(ROOT, "components/MIAHowItWorksPanel.jsx"), "utf8");
assert("section id=auditoria exists", howSource.includes('id="auditoria"'));
assert("audit title present", howSource.includes("Como a MIA audita os produtos"));
assert("smartphones auditado", howSource.includes("Smartphones/celulares — auditado"));
assert("notebooks em construção", howSource.includes("Notebooks — em construção"));
assert("pcs gamer em construção", howSource.includes("PCs gamer — em construção"));
assert("tvs em construção", howSource.includes("TVs — em construção"));
assert("monitores em construção", howSource.includes("Monitores — em construção"));
assert("acessórios em construção", howSource.includes("Acessórios — em construção"));
assert("scroll anchor support", howSource.includes("scrollToAnchor"));

console.log("\n── Styles ──");
const cssSource = readFileSync(join(ROOT, "styles/mia-chat.css"), "utf8");
assert("discreet notice styles", cssSource.includes(".mia-commercial-transparency-notice"));
assert("cyan link color", cssSource.includes(".mia-commercial-transparency-notice__link"));
assert("audit list styles", cssSource.includes(".mia-how-audit-list"));
assert("mobile-friendly small text", cssSource.includes("font-size: 12.5px"));

console.log("\n── API wiring ──");
const apiSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert("chat api attaches knowledgeMetadata", apiSource.includes("attachCommercialKnowledgeMetadataToChatResponse"));

console.log("\n── Architecture preservation ──");
for (const file of UNTOUCHED_FILES) {
  const content = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} untouched by transparency UI`, !content.includes("MIACommercialTransparencyNotice"));
}
assert(
  "builder not modified for UI",
  !readFileSync(join(ROOT, "lib/miaProductExplanationBuilder.js"), "utf8").includes("transparencyRequired")
);

console.log("\n── Guard metadata contract ──");
const governedMeta = buildCommercialKnowledgeMetadata({ product: FALLBACK_WINNER, hasDataLayer: false });
const dataMeta = buildCommercialKnowledgeMetadata({ product: DATA_LAYER_WINNER, hasDataLayer: true });
assert("guard fallback transparencyRequired", governedMeta.transparencyRequired === true);
assert("guard data layer transparencyRequired false", dataMeta.transparencyRequired === false);
assert("audit anchor constant", MIA_HOW_IT_WORKS_AUDIT_ANCHOR === "auditoria");
assert("audit href ends with #auditoria", MIA_HOW_IT_WORKS_AUDIT_HREF.endsWith("#auditoria"));

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) ROBUST\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
