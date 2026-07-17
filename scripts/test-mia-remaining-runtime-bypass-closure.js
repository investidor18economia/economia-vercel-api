/**
 * PATCH 11A.8A — Remaining Runtime Bypass Closure
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  authorizeRuntimeEarlyReturn,
  buildRuntimeDecisionEnvelope,
  finalizeCommercialDegradedResponse,
  finalizePreCognitiveFunctionalResponse,
  finalizeTechnicalRuntimeResponse,
  isImageTransportPath,
  isPreCognitiveFunctionalPath,
  resolveGateDenyCommercialPath,
  resolveResponsePathRegistry,
  RUNTIME_CLASSES,
  RUNTIME_PRECEDENCE_VERSION,
} from "../lib/miaRuntimePrecedence.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import {
  MIA_INTERACTION_MODES,
  recognizeMiaIntent,
} from "../lib/miaIntentRecognitionLayer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDLER_PATH = path.join(__dirname, "..", "pages", "api", "chat-gpt4o.js");

let passed = 0;
let failed = 0;

function expect(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label}`);
    failed += 1;
  }
}

function buildAuthority(message, mode = MIA_INTERACTION_MODES.COMMERCE) {
  const recognition = recognizeMiaIntent({ message, sessionContext: {} });
  recognition.interactionMode = mode;
  const authority = buildIntentAuthorityFromRecognition(recognition);
  if (mode === MIA_INTERACTION_MODES.COMMERCE) {
    authority.commercialPermission = COMMERCIAL_PERMISSION.ALLOW;
  }
  return authority;
}

function buildCommercialEnvelope(responsePath, {
  gateAllowed = true,
  transitionApplied = true,
  provenanceApplied = true,
} = {}) {
  const authority = buildAuthority("Quero um celular barato");
  return buildRuntimeDecisionEnvelope({
    responsePath,
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    intentAuthority: authority,
    routingDecision: { mode: "commercial_search", finalAuthority: true },
    commercialEntryGate: {
      commercialEntryAllowed: gateAllowed,
      reasonCode: gateAllowed ? "allow" : "deny",
    },
    degradation: { active: true, reasonCode: "no_result" },
    finalization: { applied: true, validatorApplied: true },
    semanticState: { transitionApplied, provenanceApplied },
  });
}

console.log("\nPATCH 11A.8A — Remaining Runtime Bypass Closure\n");

console.log("Grupo A — Direct HTTP 200 inventory");
{
  const handlerSource = fs.readFileSync(HANDLER_PATH, "utf8");
  const directMatches = [...handlerSource.matchAll(/res\.status\(200\)\.json/g)];
  expect(directMatches.length === 1, "A: exactly one internal res.status(200).json remains");
  expect(handlerSource.includes("function sendHttpRuntimeResponse"), "A: sendHttpRuntimeResponse present");
  expect(handlerSource.includes("function sendRuntimeResponse("), "A: single public interface present");
  expect(handlerSource.includes("function __sendRuntimeTechnicalResponse("), "A: technical wrapper internal");
  expect(handlerSource.includes("function __sendRuntimeCommercialDegradedResponse("), "A: degraded wrapper internal");

  const registeredPaths = [
    "image_identification_failed",
    "image_search_error",
    "image_search_no_offers",
    "image_search_success",
    "search_guidance",
    "commercial_new_search_no_result",
    "commercial_provider_unavailable",
    "impossible_purchase",
    "commercial_weak_purchase_range",
  ];
  for (const p of registeredPaths) {
    expect(handlerSource.includes(`"${p}"`), `A: handler references ${p}`);
  }
}

console.log("\nGrupo B — Image transport paths");
{
  for (const pathId of ["image_identification_failed", "image_search_error"]) {
    const registry = resolveResponsePathRegistry(pathId);
    expect(registry.runtimeClass === RUNTIME_CLASSES.TRANSPORT, `B: ${pathId} is transport`);
    expect(isImageTransportPath(pathId), `B: ${pathId} flagged transport`);

    const result = finalizeTechnicalRuntimeResponse({
      responsePath: pathId,
      body: { reply: "ok", prices: [] },
    });
    expect(result.authorization.allowed, `B: ${pathId} authorized`);
    expect(result.trace.technicalPathAuthorized === true, `B: ${pathId} technicalPathAuthorized`);
    expect(!result.body.session_context, `B: ${pathId} no session mutation`);
  }
}

console.log("\nGrupo C — Image pre-cognitive functional");
{
  const noOffers = finalizePreCognitiveFunctionalResponse({
    responsePath: "image_search_no_offers",
    body: {
      reply: "sem ofertas",
      prices: [{ product_name: "fake" }],
      session_context: { lastBestProduct: { product_name: "fake" } },
    },
    degradation: { providerAttempted: true, providerSucceeded: false },
  });
  expect(noOffers.body.prices.length === 0, "C: image no-offers strips prices");
  expect(isPreCognitiveFunctionalPath("image_search_no_offers"), "C: pre-cognitive path flagged");

  const success = finalizePreCognitiveFunctionalResponse({
    responsePath: "image_search_success",
    body: {
      reply: "achei",
      prices: [{ product_name: "Phone", price: "100" }],
      session_context: { lastIntent: "image_search" },
    },
    providerAccounting: { providerCallDelta: 1 },
  });
  expect(success.body.prices.length === 1, "C: image success keeps prices");
  expect(success.trace.functionalPathAuthorized === true, "C: image success functional");
}

console.log("\nGrupo D — Commercial no-result");
{
  const authority = buildAuthority("Quero notebook gamer");
  const result = finalizeCommercialDegradedResponse({
    responsePath: "commercial_new_search_no_result",
    body: {
      reply: "Não achei",
      prices: [{ product_name: "fake" }],
      winner: "fake",
      session_context: { lastBestProduct: { product_name: "fake" }, lastProducts: [{}] },
    },
    intentAuthority: authority,
    routingDecision: { mode: "commercial_search", finalAuthority: true },
    commercialEntryGate: { commercialEntryAllowed: true, reasonCode: "allow" },
    degradation: { reasonCode: "no_result", providerAttempted: true, providerSucceeded: false },
    semanticState: { transitionApplied: true, provenanceApplied: true },
  });
  expect(result.authorization.allowed, "D: no-result authorized");
  expect(result.body.prices.length === 0, "D: prices cleared");
  expect(result.body.session_context.lastBestProduct == null, "D: winner stripped from session");
  expect(
    result.body.mia_debug.commercialResultStatus === "no_result",
    "D: commercialResultStatus no_result"
  );
}

console.log("\nGrupo E — Provider unavailable");
{
  const authority = buildAuthority("Quero fone bluetooth");
  const result = finalizeCommercialDegradedResponse({
    responsePath: "commercial_provider_unavailable",
    body: {
      reply: "Provider off",
      prices: [],
      session_context: { lastBestProduct: { product_name: "Anchor" } },
    },
    intentAuthority: authority,
    routingDecision: { mode: "commercial_search", finalAuthority: true },
    commercialEntryGate: { commercialEntryAllowed: true, reasonCode: "allow" },
    degradation: {
      reasonCode: "provider_unavailable",
      providerAttempted: true,
      providerSucceeded: false,
    },
    semanticState: { transitionApplied: true, provenanceApplied: true },
  });
  expect(result.body.mia_debug.degradation.reasonCode === "provider_unavailable", "E: reason code");
  expect(result.body.prices.length === 0, "E: no false recommendation prices");
}

console.log("\nGrupo F — Gate deny protection");
{
  const socialDeny = buildAuthority("kkkk", MIA_INTERACTION_MODES.SOCIAL);
  const gateDeny = resolveGateDenyCommercialPath({
    responsePath: "commercial_new_search_no_result",
    intentAuthority: socialDeny,
    commercialEntryGate: { commercialEntryAllowed: false, reasonCode: "deny" },
  });
  expect(gateDeny.suppressed, "F: commercial degraded suppressed on deny");

  const result = finalizeCommercialDegradedResponse({
    responsePath: "commercial_new_search_no_result",
    body: { reply: "não devia", prices: [{ product_name: "x" }], session_context: {} },
    intentAuthority: socialDeny,
    routingDecision: { mode: "social", finalAuthority: true },
    commercialEntryGate: { commercialEntryAllowed: false, reasonCode: "deny" },
    semanticState: { transitionApplied: true, provenanceApplied: true },
    providerAccounting: { providerCallDelta: 0 },
  });
  expect(result.gateDenySuppressed, "F: degraded finalizer suppressed");
  expect(result.normalizedResponsePath === "non_commercial_governed_fallback", "F: normalized path");
  expect(result.body.prices.length === 0, "F: prices stripped on deny");
}

console.log("\nGrupo G — Gate allow no-result");
{
  const envelope = buildCommercialEnvelope("commercial_new_search_no_result");
  const auth = authorizeRuntimeEarlyReturn({
    responsePath: "commercial_new_search_no_result",
    envelope,
  });
  expect(auth.allowed, "G: gate allow no-result authorized");
  expect(envelope.commercialEntry.allowed === true, "G: gate allow recorded");
}

console.log("\nGrupo H — Weak purchase range degraded with cards");
{
  const authority = buildAuthority("Quero celular até 300");
  const result = finalizeCommercialDegradedResponse({
    responsePath: "commercial_weak_purchase_range",
    body: {
      reply: "Ressalvas",
      prices: [{ product_name: "Phone", price: "350" }],
      session_context: { lastBestProduct: { product_name: "Phone" } },
    },
    intentAuthority: authority,
    routingDecision: { mode: "commercial_search", finalAuthority: true },
    commercialEntryGate: { commercialEntryAllowed: true, reasonCode: "allow" },
    degradation: { reasonCode: "weak_purchase_range", providerAttempted: true, providerSucceeded: true },
    semanticState: { transitionApplied: true, provenanceApplied: true },
  });
  expect(result.body.prices.length === 1, "H: weak range keeps caveat cards");
  expect(result.body.mia_debug.degradation.active === true, "H: degradation active");
}

console.log("\nGrupo I — Unknown path fail-closed");
{
  const unknown = resolveResponsePathRegistry("totally_unknown_functional_path");
  expect(unknown.failClosed === true, "I: unknown path fail-closed");
  const envelope = buildRuntimeDecisionEnvelope({ responsePath: "totally_unknown_functional_path" });
  const auth = authorizeRuntimeEarlyReturn({
    responsePath: "totally_unknown_functional_path",
    envelope,
  });
  expect(!auth.allowed, "I: unknown path blocked");
}

console.log("\nGrupo J — Registry completeness");
{
  const paths = [
    "image_identification_failed",
    "image_search_error",
    "image_search_no_offers",
    "image_search_success",
    "search_guidance",
    "commercial_new_search_no_result",
    "commercial_provider_unavailable",
    "impossible_purchase",
    "commercial_weak_purchase_range",
    "non_commercial_governed_fallback",
  ];
  for (const p of paths) {
    const reg = resolveResponsePathRegistry(p);
    expect(reg.registryKey === p || reg.category !== "unknown", `J: ${p} registered`);
  }
  expect(RUNTIME_PRECEDENCE_VERSION === "11A.9.1", "J: runtime version bumped");
}

console.log("\nGrupo K — Payload invariants");
{
  const stripped = finalizeCommercialDegradedResponse({
    responsePath: "impossible_purchase",
    body: {
      reply: "impossível",
      prices: [{ product_name: "x" }],
      session_context: { lastProducts: [{}], lastBestProduct: {} },
    },
    intentAuthority: buildAuthority("Quero iPhone de 50 reais"),
    routingDecision: { mode: "commercial_search", finalAuthority: true },
    commercialEntryGate: { commercialEntryAllowed: true, reasonCode: "allow" },
    degradation: { reasonCode: "impossible_purchase" },
    semanticState: { transitionApplied: true, provenanceApplied: true },
  });
  expect(stripped.body.prices.length === 0, "K: impossible purchase no prices");
}

console.log("\nGrupo L — Trace fields");
{
  const result = finalizeTechnicalRuntimeResponse({
    responsePath: "image_identification_failed",
    body: { reply: "fail", prices: [] },
  });
  expect(result.trace.directHttpBypassPrevented === true, "L: bypass prevented flag");
  expect(result.trace.runtimeClass === RUNTIME_CLASSES.TRANSPORT, "L: runtimeClass in trace");
}

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 11A.8A closure tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(60)}\n`);

if (failed > 0) process.exit(1);
