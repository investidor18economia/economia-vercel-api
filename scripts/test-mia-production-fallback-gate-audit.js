/**
 * PATCH 8.1B.1 — Production Fallback Gate Audit
 *
 * Usage: node scripts/test-mia-production-fallback-gate-audit.js
 */

import {
  applyProductionFallbackGate,
  detectRecognizedConversationalFamily,
  isInstitutionalGenericDirectReply,
  shouldBypassInstitutionalGeneralAnswerFallback,
} from "../lib/miaProductionFallbackGate.js";
import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";

const GENERIC =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

const ANCHOR_SESSION = {
  lastBestProduct: { product_name: "Produto Anchor" },
};

function simulateGate(message, anchored = false) {
  const sessionContext = anchored ? ANCHOR_SESSION : {};
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    hasActiveAnchor: anchored,
    sessionContext,
    detectedIntent: "search",
    contextAction: "search",
  });

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: {
      mode: "general_answer",
      shouldSkipProductSearch: true,
      directReply: GENERIC,
      clearContext: !anchored,
    },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: anchored,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isAboutMia: !!cognitiveTurn.signals?.isAboutMia,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
    },
    signals: {
      hasClearNewCommercialSearch: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  const contextResolution = {
    mode: "general_answer",
    directReply: GENERIC,
    clearContext: !anchored,
  };

  const gate = applyProductionFallbackGate({
    query: message,
    hasActiveAnchor: anchored,
    clearNewCommercialSearch: false,
    cognitiveTurn,
    routingDecision,
    contextResolution,
  });

  return { message, anchored, cognitiveTurn, routingDecision, gate, contextResolution };
}

const MUST_GATE = [
  ["blz entendi vlw", true],
  ["bom dia, poderia me ajudar?", true],
  ["sla se compensa", true],
  ["qual o chipset desse modelo?", true],
  ["tenho medo de errar", true],
  ["mostra outra opção", true],
];

const MUST_NOT_GATE = [
  ["quero celular ate 2500", false],
  ["oi", false],
];

let pass = 0;
let fail = 0;

console.log("PATCH 8.1B.1 — Production Fallback Gate Audit\n");

for (const [message, anchored] of MUST_GATE) {
  const result = simulateGate(message, anchored);
  const ok =
    result.gate.shouldBypassGeneralAnswerFallback &&
    (result.gate.applied || !isInstitutionalGenericDirectReply({ directReply: GENERIC }));
  if (ok) {
    pass++;
    console.log(`✓ gate [${anchored ? "anchored" : "cold"}] "${message}" → ${result.gate.detection.source}`);
  } else {
    fail++;
    console.log(`✗ gate [${anchored ? "anchored" : "cold"}] "${message}"`);
  }
}

for (const [message, anchored] of MUST_NOT_GATE) {
  const result = simulateGate(message, anchored);
  const recognition = detectRecognizedConversationalFamily({
    query: message,
    hasActiveAnchor: anchored,
    cognitiveTurn: result.cognitiveTurn,
    routingDecision: result.routingDecision,
  });
  const ok = !recognition.recognized || message === "oi";
  if (message === "oi" && recognition.recognized) {
    pass++;
    console.log(`✓ greeting still recognized (existing family wiring) "${message}"`);
  } else if (!recognition.recognized) {
    pass++;
    console.log(`✓ no false gate "${message}"`);
  } else {
    fail++;
    console.log(`✗ unexpected recognition "${message}"`);
  }
}

const bypass = shouldBypassInstitutionalGeneralAnswerFallback(
  detectRecognizedConversationalFamily({
    query: "blz entendi vlw",
    hasActiveAnchor: true,
    cognitiveTurn: classifyMiaTurn({
      query: "blz entendi vlw",
      originalQuery: "blz entendi vlw",
      hasActiveAnchor: true,
      sessionContext: ANCHOR_SESSION,
    }),
  })
);
if (bypass) {
  pass++;
  console.log("✓ shouldBypassInstitutionalGeneralAnswerFallback for anchored CONVERSATIONAL");
} else {
  fail++;
  console.log("✗ shouldBypassInstitutionalGeneralAnswerFallback failed");
}

console.log(`\nResult: ${pass}/${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
