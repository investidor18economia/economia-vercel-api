/**
 * PATCH 7.9X-H.1 / 8.1B.2 — COMPREHENSION Flow Robustness Audit (AUDIT ONLY)
 *
 * Full-stack trace: Router → Bridge/Contract → Routing → Response Path → User perception.
 * SUCCESS and FAILURE both route to comprehension_flow (PATCH 8.1B.2).
 *
 * Usage: node scripts/test-mia-comprehension-flow-robustness-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isComprehensionFamilyQuery,
  isComprehensionSuccessFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isAcknowledgementFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isAntiRegretFamilyQuery,
  isSocialValidationFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isConstraintChangeFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isGreetingFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { detectGenericConversationalFallback } from "../lib/miaConversationalFamilyClosureStandard.js";

const MOCK_WINNER = {
  product_name: "Produto Recomendado Atual",
  price: "R$ 1.899",
};

const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
};

const SESSION_NO_ANCHOR = {};

const GENERIC_WELCOME_DIRECT_REPLY =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

const FAILURE_GROUPS = [
  {
    id: "A",
    label: "falha de compreensão direta",
    phrases: [
      "não entendi",
      "não entendi direito",
      "não ficou claro",
      "não saquei",
      "como assim?",
      "explica melhor",
      "pode explicar de novo?",
      "não peguei",
    ],
  },
  {
    id: "B",
    label: "falha parcial / pedido de clareza",
    phrases: [
      "fiquei confuso",
      "me perdi um pouco",
      "não acompanhei",
      "não ficou tão claro",
      "explica de outro jeito",
      "fala de um jeito mais simples",
      "simplifica pra mim",
      "não consegui entender a lógica",
    ],
  },
];

const SUCCESS_GROUPS = [
  {
    id: "C",
    label: "sucesso direto",
    phrases: [
      "entendi",
      "agora entendi",
      "entendi sim",
      "saquei",
      "saquei agora",
      "peguei",
      "tá, peguei",
      "ahh entendi",
    ],
  },
  {
    id: "D",
    label: "sucesso da lógica",
    phrases: [
      "entendi a lógica",
      "saquei o raciocínio",
      "entendi o ponto",
      "peguei a ideia",
      "entendi o motivo",
      "agora entendi por que",
    ],
  },
  {
    id: "E",
    label: "clareza / sentido",
    phrases: [
      "agora ficou claro",
      "clareou",
      "boa, clareou",
      "ficou mais claro",
      "agora fez sentido",
      "faz sentido mesmo",
      "tá explicado",
      "bem explicado",
    ],
  },
  {
    id: "F",
    label: "compreensão progressiva",
    phrases: [
      "agora caiu a ficha",
      "agora eu vi",
      "agora consegui entender",
      "agora conectei os pontos",
      "agora ficou redondo",
      "agora entendi o caminho",
    ],
  },
];

const COMPOUND_GUARDS = [
  { group: "SD", input: "entendi, mas não me convenceu", expect: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "faz sentido, mas fiquei com um pé atrás", expect: "SOFT_DISAGREEMENT" },
  { group: "SD", input: "saquei, mas não gostei muito", expect: "SOFT_DISAGREEMENT" },
  { group: "CC", input: "entendi, mas você tem certeza?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "saquei, mas ainda sustenta isso?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "CC", input: "faz sentido, mas não está forçando a barra?", expect: "CONFIDENCE_CHALLENGE" },
  { group: "AR", input: "entendi, mas tenho medo de errar", expect: "ANTI_REGRET" },
  { group: "AR", input: "faz sentido, mas não quero me arrepender", expect: "ANTI_REGRET" },
  { group: "AR", input: "saquei, mas tô cabreiro", expect: "ANTI_REGRET" },
  { group: "SV", input: "entendi, mas a galera recomenda?", expect: "SOCIAL_VALIDATION" },
  { group: "SV", input: "faz sentido, mas o povo fala bem?", expect: "SOCIAL_VALIDATION" },
  { group: "SV", input: "saquei, mas quem comprou gostou?", expect: "SOCIAL_VALIDATION" },
  { group: "AE", input: "entendi, tem outro?", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "saquei, mostra alternativas", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "AE", input: "faz sentido, quero ver opções", expect: "ALTERNATIVE_EXPLORATION" },
  { group: "SBD", input: "entendi, qual ficou em segundo?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "saquei, tem plano B?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "SBD", input: "faz sentido, quem veio logo atrás?", expect: "SECOND_BEST_DISCOVERY" },
  { group: "CC2", input: "entendi, mas quero gastar menos", expect: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "faz sentido, mas agora câmera importa mais", expect: "CONSTRAINT_CHANGE" },
  { group: "CC2", input: "saquei, mas vou usar mais para fotos", expect: "CONSTRAINT_CHANGE" },
  { group: "DC", input: "entendi, vou nele", expect: "DECISION_CONFIRMATION" },
  { group: "DC", input: "faz sentido, acho que fechou", expect: "DECISION_CONFIRMATION" },
  { group: "DC", input: "saquei, então é esse", expect: "DECISION_CONFIRMATION" },
  { group: "ACK", input: "ok", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "blz", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "show", expect: "ACKNOWLEDGEMENT" },
  { group: "ACK", input: "pode seguir", expect: "ACKNOWLEDGEMENT" },
  { group: "GREET", input: "oi", expect: "GREETING" },
  { group: "GREET", input: "bom dia", expect: "GREETING" },
  { group: "GREET", input: "salve", expect: "GREETING" },
];

function buildIdealComprehensionFailurePreview(hasAnchor) {
  if (hasAnchor) {
    return "Claro. Mantemos Produto Recomendado Atual como referência. Posso explicar a escolha de forma mais simples.";
  }
  return "Claro. Me diz qual parte ficou confusa que eu explico de um jeito mais simples.";
}

function buildIdealComprehensionSuccessPreview(hasAnchor) {
  if (hasAnchor) {
    return "Ótimo, ficou claro então. Mantemos Produto Recomendado Atual como referência — se quiser, posso detalhar algum ponto ou comparar com outra opção.";
  }
  return "Boa, entendi. Quando quiser, me fala o que você está pensando em comprar que eu te ajudo a decidir.";
}

function hasComprehensionRoutingHold(routingDecision) {
  return (
    routingDecision.conversationAct === "comprehension" ||
    routingDecision.responsePathHint === "comprehension_reply" ||
    routingDecision.responsePathHint === "comprehension_anchored"
  );
}

function hasAcknowledgementRoutingHold(routingDecision) {
  return (
    routingDecision.conversationAct === "acknowledgement" ||
    routingDecision.responsePathHint === "acknowledgement_reply" ||
    routingDecision.responsePathHint === "acknowledgement_anchored"
  );
}

function simulateFullStack(message, hasActiveAnchor, subtype) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = "search";
  const legacyContextAction = "search";

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: legacyIntent,
    contextAction: legacyContextAction,
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, legacyIntent);
  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: legacyContextAction,
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: hasActiveAnchor,
    looksLikeShortPriorityFollowUp: false,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: {
      mode: "general_answer",
      shouldSkipProductSearch: false,
      directReply: GENERIC_WELCOME_DIRECT_REPLY,
      clearContext: !hasActiveAnchor,
    },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isComprehensionSuccess: !!cognitiveTurn.signals?.isComprehensionSuccess,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  const openedNewSearch =
    routingDecision.mode === "new_search" ||
    routingDecision.allowNewSearch === true ||
    (routingDecision.mode === "search" && routingDecision.allowNewSearch === true);

  const isFailure = subtype === "failure";
  const isSuccess = subtype === "success";

  const idealTurnFailure = hasActiveAnchor
    ? cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST
    : cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL;

  const idealTurnSuccess =
    cognitiveTurn.turnType === MIA_TURN_TYPES.REACTION ||
    cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL;

  const routerPass = isFailure
    ? !!cognitiveTurn.signals?.isComprehension &&
      isComprehensionFamilyQuery(message) &&
      idealTurnFailure &&
      cognitiveTurn.turnType !== MIA_TURN_TYPES.NEW_SEARCH
    : isComprehensionSemanticFamilyQuery(message) &&
      !!cognitiveTurn.signals?.isComprehensionSuccess &&
      !!cognitiveTurn.signals?.isComprehension &&
      !cognitiveTurn.signals?.isAcknowledgement &&
      idealTurnSuccess &&
      cognitiveTurn.turnType !== MIA_TURN_TYPES.NEW_SEARCH;

  const routingPassFailure =
    !openedNewSearch &&
    hasComprehensionRoutingHold(routingDecision) &&
    routingDecision.allowNewSearch === false &&
    (hasActiveAnchor
      ? routingDecision.shouldPreserveAnchor === true &&
        routingDecision.allowReplaceWinner === false
      : true);

  const routingPassSuccess =
    !openedNewSearch &&
    hasComprehensionRoutingHold(routingDecision) &&
    routingDecision.allowNewSearch === false &&
    (hasActiveAnchor
      ? routingDecision.shouldPreserveAnchor === true &&
        routingDecision.allowReplaceWinner === false
      : true);

  const routingPass = isFailure ? routingPassFailure : routingPassSuccess;

  const handlerComprehensionGate =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isComprehension === true ||
      cognitiveTurn.signals?.isComprehensionSuccess === true ||
      isComprehensionFamilyQuery(message) ||
      isComprehensionSuccessFamilyQuery(message) ||
      hasComprehensionRoutingHold(routingDecision)
    );

  const handlerAcknowledgementGate =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isAcknowledgement === true ||
      isAcknowledgementFamilyQuery(message) ||
      hasAcknowledgementRoutingHold(routingDecision)
    );

  const bridgeIntent = bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent;
  const contractPass =
    routingPass &&
    handlerComprehensionGate &&
    guardResult.contextAction !== "search";

  let responsePathFinal = "unknown";
  let finalResponsePreview = "";
  let genericFallbackDetected = false;
  let effectiveIntent = bridgeIntent;
  let expectedPath = "comprehension_flow";

  if (openedNewSearch) {
    responsePathFinal = "default_product_search";
    finalResponsePreview = "(busca comercial — sem fluxo de compreensão)";
  } else if (handlerComprehensionGate) {
    responsePathFinal = "comprehension_flow";
    effectiveIntent = "comprehension";
    finalResponsePreview = isFailure
      ? buildIdealComprehensionFailurePreview(hasActiveAnchor)
      : buildIdealComprehensionSuccessPreview(hasActiveAnchor);
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else if (!hasActiveAnchor && !openedNewSearch) {
    responsePathFinal = "context_resolution_direct_reply_early_return";
    finalResponsePreview = GENERIC_WELCOME_DIRECT_REPLY;
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else if (
    isFailure &&
    hasActiveAnchor &&
    routingDecision.conversationAct === "cognitive_explanation_anchored"
  ) {
    responsePathFinal = handlerComprehensionGate
      ? "comprehension_flow"
      : "cognitive_explanation_branch";
    effectiveIntent = handlerComprehensionGate ? "comprehension" : bridgeIntent;
    finalResponsePreview = handlerComprehensionGate
      ? buildIdealComprehensionFailurePreview(true)
      : "Resposta via branch cognitive_explanation_anchored — sem comprehension_flow.";
    genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  } else {
    responsePathFinal =
      routingDecision.responsePathHint || routingDecision.mode || "unknown";
    finalResponsePreview = `(path=${responsePathFinal})`;
  }

  const responsePathPass = responsePathFinal === expectedPath;
  const finalResponsePass =
    responsePathPass && !genericFallbackDetected && handlerComprehensionGate;

  const userPerception = assessUserPerception({
    subtype,
    responsePathFinal,
    expectedPath,
    finalResponsePreview,
    genericFallbackDetected,
    handlerComprehensionGate,
    handlerAcknowledgementGate,
    hasActiveAnchor,
    routerPass,
  });

  const leaks = classifyLeaks({
    subtype,
    routerPass,
    idealTurnFailure,
    idealTurnSuccess,
    routingPass,
    routingPassFailure,
    routingPassSuccess,
    contractPass,
    responsePathPass,
    finalResponsePass,
    handlerComprehensionGate,
    handlerAcknowledgementGate,
    clearNewSearch,
    routingDecision,
    guardResult,
    bridgeIntent,
    bridgeAudit,
    openedNewSearch,
    cognitiveTurn,
    hasActiveAnchor,
    userPerception,
    expectedPath,
    responsePathFinal,
  });

  return {
    classification: {
      subtype,
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      semanticFamily: isComprehensionSemanticFamilyQuery(message),
      failureFamily: isComprehensionFamilyQuery(message),
      reasons: cognitiveTurn.reasons || [],
    },
    bridge: {
      active: bridgeAudit.active,
      toIntent: bridgeIntent,
      contextAction: guardResult.contextAction,
    },
    routing: {
      mode: routingDecision.mode,
      conversationAct: routingDecision.conversationAct,
      responsePathHint: routingDecision.responsePathHint,
      reasons: routingDecision.reasons,
      clearNewSearch,
      openedNewSearch,
      shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
    },
    response: {
      handlerComprehensionGate,
      handlerAcknowledgementGate,
      effectiveIntent,
      responsePathFinal,
      expectedPath,
      finalResponsePreview,
      genericFallbackDetected,
    },
    layers: {
      routerPass,
      routingPass,
      contractPass,
      responsePathPass,
      finalResponsePass,
    },
    userPerception,
    leaks,
  };
}

function assessUserPerception(ctx) {
  if (ctx.responsePathFinal === ctx.expectedPath && !ctx.genericFallbackDetected) {
    return ctx.hasActiveAnchor ? "SIM" : "PARCIAL";
  }
  if (ctx.routerPass && ctx.responsePathFinal.includes("comprehension") && ctx.subtype === "failure") {
    return "PARCIAL";
  }
  if (ctx.genericFallbackDetected || ctx.responsePathFinal === "default_product_search") {
    return "NÃO";
  }
  if (!ctx.routerPass) {
    return "NÃO";
  }
  return "PARCIAL";
}

function classifyLeaks(ctx) {
  const leaks = [];
  const isFailure = ctx.subtype === "failure";
  const isSuccess = ctx.subtype === "success";

  if (!ctx.routerPass) {
    if (isFailure && !ctx.cognitiveTurn.signals?.isComprehension) {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: "COMPREHENSION_FAILURE não reconhecido — falha de compreensão não capturada",
      });
    } else if (isSuccess && !ctx.cognitiveTurn.signals?.isComprehensionSuccess) {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: "COMPREHENSION_SUCCESS não reconhecido — isComprehensionSuccess ausente",
      });
    } else if (isFailure && !ctx.idealTurnFailure) {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: `turnType=${ctx.cognitiveTurn.turnType} — esperado EXPLANATION_REQUEST (anchored) ou CONVERSATIONAL (cold)`,
      });
    } else if (isSuccess && !ctx.idealTurnSuccess) {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: `turnType=${ctx.cognitiveTurn.turnType} — esperado REACTION/CONVERSATIONAL para sucesso`,
      });
    } else {
      leaks.push({
        type: "ROUTER_LEAK",
        detail: "detector/family mismatch apesar de sinal parcial",
      });
    }
  }

  if (ctx.routerPass && isSuccess && !ctx.routingPassSuccess) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: "COMPREHENSION_SUCCESS sem comprehension routing hold",
    });
  }

  if (ctx.routerPass && isSuccess && ctx.responsePathFinal === "acknowledgement_flow") {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: "COMPREHENSION_SUCCESS caiu em acknowledgement_flow (colisão ACK)",
    });
  }

  if (ctx.routerPass && isFailure && !ctx.routingPassFailure) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: `Router OK mas routing act=${ctx.routingDecision.conversationAct || ctx.routingDecision.mode} hint=${ctx.routingDecision.responsePathHint}`,
    });
  }

  if (
    ctx.routerPass &&
    isFailure &&
    !ctx.routingPassFailure &&
    ctx.responsePathFinal === "comprehension_flow"
  ) {
    leaks.push({
      type: "ROUTING_LEAK",
      detail: "Handler bypass: comprehension_flow ativo sem conversationAct=comprehension (cognitive_explanation precedence)",
    });
  }

  if (ctx.routingPass && !ctx.contractPass) {
    leaks.push({
      type: "CONTRACT_LEAK",
      detail: `Bridge intent=${ctx.bridgeIntent} contextAction=${ctx.guardResult.contextAction}`,
    });
  }

  if (ctx.routerPass && isFailure && ctx.handlerComprehensionGate && !ctx.responsePathPass) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: `Handler gate true mas path=${ctx.responsePathFinal} (esperado ${ctx.expectedPath})`,
    });
  }

  if (ctx.routerPass && isSuccess && ctx.handlerComprehensionGate && !ctx.responsePathPass) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: `Success gate true mas path=${ctx.responsePathFinal} (esperado comprehension_flow)`,
    });
  }

  if (ctx.routerPass && isFailure && !ctx.handlerComprehensionGate && ctx.clearNewSearch) {
    leaks.push({
      type: "RESPONSE_PATH_LEAK",
      detail: "clearNewCommercialSearch bloqueia comprehension_flow apesar de isComprehension=true",
    });
  }

  if (ctx.responsePathPass && !ctx.finalResponsePass) {
    leaks.push({
      type: "VERBALIZATION_LEAK",
      detail: "Fluxo correto mas resposta genérica ou fallback institucional",
    });
  }

  if (ctx.routerPass && ctx.finalResponsePass && ctx.userPerception === "NÃO") {
    leaks.push({
      type: "USER_PERCEPTION_LEAK",
      detail: "Stack técnico passou mas percepção não reflete estado de compreensão",
    });
  }

  return leaks;
}

function pct(n, d) {
  if (!d) return "0.0";
  return ((n / d) * 100).toFixed(1);
}

function summarizeSubset(records) {
  const total = records.length;
  return {
    total,
    router: records.filter((r) => r.layers.routerPass).length,
    routing: records.filter((r) => r.layers.routingPass).length,
    response: records.filter((r) => r.layers.responsePathPass).length,
    final: records.filter((r) => r.layers.finalResponsePass).length,
    sim: records.filter((r) => r.userPerception === "SIM").length,
    partial: records.filter((r) => r.userPerception === "PARCIAL").length,
    no: records.filter((r) => r.userPerception === "NÃO").length,
  };
}

function printFlowMap() {
  console.log("── FASE 1 — Mapa do fluxo COMPREHENSION ──\n");
  console.log("1. Classificação (lib/miaCognitiveRouter.js PATCH 7.7K / 8.1B.2)");
  console.log("   • detectsComprehensionFailureSignal → signals.isComprehension (FAILURE)");
  console.log("   • detectsNaturalPositiveComprehensionSignal → signals.isComprehensionSuccess + isComprehension");
  console.log("   • resolveTurnType: FAILURE → CONVERSATIONAL (cold) | EXPLANATION_REQUEST (anchored)");
  console.log("   • resolveTurnType: SUCCESS → REACTION/CONVERSATIONAL + comprehension (ACK excluído)\n");
  console.log("2. Bridge / Contract");
  console.log("   • FAILURE: EXPLANATION_REQUEST ancorado → contextAction=decision (legacy)");
  console.log("   • SUCCESS: REACTION → comprehension response path (8.1B.2)\n");
  console.log("3. Routing (lib/miaRoutingDecisionContract.js)");
  console.log("   • FAILURE cold: comprehension hold");
  console.log("   • FAILURE anchored: cognitive_explanation_anchored ANTES do hold comprehension");
  console.log("   • SUCCESS: comprehension hold ANTES de acknowledgement\n");
  console.log("4. Response Path (pages/api/chat-gpt4o.js PATCH 7.7M / 8.1B.2)");
  console.log("   • FAILURE + SUCCESS: isComprehension | isComprehensionSuccess → comprehension_flow\n");
  console.log("5. Resposta final");
  console.log("   • FAILURE: comprehension_reply — simplifica/reexplica");
  console.log("   • SUCCESS: comprehension_reply — confirma entendimento (não ACK curto)\n");
}

function evaluatePositive(group, phrase, hasActiveAnchor, subtype) {
  return {
    kind: "positive",
    subtype,
    group: group.id,
    groupLabel: group.label,
    input: phrase,
    context: hasActiveAnchor ? "anchored" : "cold",
    ...simulateFullStack(phrase, hasActiveAnchor, subtype),
  };
}

function evaluateCompoundGuard(spec) {
  const trace = simulateFullStack(spec.input, true, "compound");
  const dominant =
    trace.classification.isComprehension && trace.response.responsePathFinal === "comprehension_flow"
      ? "COMPREHENSION_DOMINANT_LEAK"
      : null;
  const leakedToComprehension =
    trace.response.responsePathFinal === "comprehension_flow" &&
    trace.classification.isComprehension;
  return {
    kind: "compound",
    ...spec,
    context: "anchored",
    leakedToComprehension,
    dominantTurn: trace.classification.turnType,
    dominantAct: trace.routing.conversationAct,
    dominantPath: trace.response.responsePathFinal,
    ok: !leakedToComprehension,
    ...trace,
  };
}

printFlowMap();

console.log("PATCH 7.9X-H.1 — COMPREHENSION Flow Robustness Audit (AUDIT ONLY)\n");
console.log("HTTP usage: false | SerpAPI risk: false | Production changes: NONE\n");

const positiveRecords = [];
for (const group of FAILURE_GROUPS) {
  for (const phrase of group.phrases) {
    positiveRecords.push(evaluatePositive(group, phrase, false, "failure"));
    positiveRecords.push(evaluatePositive(group, phrase, true, "failure"));
  }
}
for (const group of SUCCESS_GROUPS) {
  for (const phrase of group.phrases) {
    positiveRecords.push(evaluatePositive(group, phrase, false, "success"));
    positiveRecords.push(evaluatePositive(group, phrase, true, "success"));
  }
}

const compoundRecords = COMPOUND_GUARDS.map(evaluateCompoundGuard);

const failureRecords = positiveRecords.filter((r) => r.subtype === "failure");
const successRecords = positiveRecords.filter((r) => r.subtype === "success");
const failureStats = summarizeSubset(failureRecords);
const successStats = summarizeSubset(successRecords);

const posTotal = positiveRecords.length;
const posRouter = positiveRecords.filter((r) => r.layers.routerPass).length;
const posRouting = positiveRecords.filter((r) => r.layers.routingPass).length;
const posContract = positiveRecords.filter((r) => r.layers.contractPass).length;
const posResponse = positiveRecords.filter((r) => r.layers.responsePathPass).length;
const posFinal = positiveRecords.filter((r) => r.layers.finalResponsePass).length;
const posSim = positiveRecords.filter((r) => r.userPerception === "SIM").length;
const posPartial = positiveRecords.filter((r) => r.userPerception === "PARCIAL").length;
const posNo = positiveRecords.filter((r) => r.userPerception === "NÃO").length;

const compoundLeaks = compoundRecords.filter((r) => !r.ok).length;

console.log("── FASE 2 — Amostra de leaks (router OK, downstream falhou) ──\n");
for (const r of positiveRecords.filter((x) => x.layers.routerPass && !x.layers.finalResponsePass).slice(0, 8)) {
  console.log(`[${r.subtype}/${r.group}/${r.context}] "${r.input}"`);
  console.log(`  ROUTING: act=${r.routing.conversationAct} hint=${r.routing.responsePathHint}`);
  console.log(`  PATH: ${r.response.responsePathFinal} expected=${r.response.expectedPath}`);
  console.log(`  LEAKS: ${r.leaks.filter((l) => l.type !== "ARCHITECTURAL_DESIGN_ACCEPTED").map((l) => l.type).join(", ")}`);
  console.log("");
}

console.log(`── FASE 3 — Suite positiva (${posTotal} cenários) ──\n`);
console.log("Sub | Grp | Ctx | Frase | Rtr | Rtg | Ctr | Path | Final | Perc");
console.log("-".repeat(115));
for (const r of positiveRecords) {
  const mark = (ok) => (ok ? "✓" : "✗");
  console.log(
    `${r.subtype.slice(0, 4).padEnd(4)} | ${r.group} | ${r.context.padEnd(7)} | ${r.input.slice(0, 24).padEnd(24)} | ${mark(r.layers.routerPass)} | ${mark(r.layers.routingPass)} | ${mark(r.layers.contractPass)} | ${mark(r.layers.responsePathPass)} | ${mark(r.layers.finalResponsePass)} | ${r.userPerception}`
  );
}

console.log(`\n── FASE 3b — Compostos / guardas (${compoundRecords.length} cenários, anchored) ──\n`);
for (const r of compoundRecords) {
  console.log(
    `  ${r.ok ? "✓ OK" : "✗ LEAK"} [${r.group}] "${r.input}" → ${r.dominantTurn}/${r.dominantAct}/${r.dominantPath}`
  );
}

console.log("\n── FASE 4 — Taxa por camada (positivos) ──\n");
console.log(`Cenários positivos: ${posTotal}`);
console.log(`Router:           ${posRouter}/${posTotal} (${pct(posRouter, posTotal)}%)`);
console.log(`Routing:          ${posRouting}/${posTotal} (${pct(posRouting, posTotal)}%)`);
console.log(`Bridge/Contract:  ${posContract}/${posTotal} (${pct(posContract, posTotal)}%)`);
console.log(`Response Path:    ${posResponse}/${posTotal} (${pct(posResponse, posTotal)}%)`);
console.log(`Resposta Final:   ${posFinal}/${posTotal} (${pct(posFinal, posTotal)}%)`);
console.log(`Percepção SIM:    ${posSim}/${posTotal} (${pct(posSim, posTotal)}%)`);
console.log(`Percepção PARCIAL:${posPartial}/${posTotal} (${pct(posPartial, posTotal)}%)`);
console.log(`Percepção NÃO:    ${posNo}/${posTotal} (${pct(posNo, posTotal)}%)`);
console.log(`Compostos leak COMP:${compoundLeaks}/${compoundRecords.length}`);

console.log("\n── Métrica separada: FAILURE ──\n");
console.log(`  Router:   ${failureStats.router}/${failureStats.total} (${pct(failureStats.router, failureStats.total)}%)`);
console.log(`  Routing:  ${failureStats.routing}/${failureStats.total} (${pct(failureStats.routing, failureStats.total)}%)`);
console.log(`  Path:     ${failureStats.response}/${failureStats.total} (${pct(failureStats.response, failureStats.total)}%)`);
console.log(`  Full:     ${failureStats.final}/${failureStats.total} (${pct(failureStats.final, failureStats.total)}%)`);

console.log("\n── Métrica separada: SUCCESS ──\n");
console.log(`  Router:   ${successStats.router}/${successStats.total} (${pct(successStats.router, successStats.total)}%)`);
console.log(`  Routing:  ${successStats.routing}/${successStats.total} (${pct(successStats.routing, successStats.total)}%)`);
console.log(`  Path:     ${successStats.response}/${successStats.total} (${pct(successStats.response, successStats.total)}%)`);
console.log(`  Full:     ${successStats.final}/${successStats.total} (${pct(successStats.final, successStats.total)}%)`);

console.log("\n── Por contexto (router / routing / full) ──\n");
for (const ctx of ["cold", "anchored"]) {
  const rows = positiveRecords.filter((r) => r.context === ctx);
  const rPass = rows.filter((r) => r.layers.routerPass).length;
  const rtPass = rows.filter((r) => r.layers.routingPass).length;
  const fPass = rows.filter((r) => r.layers.finalResponsePass).length;
  console.log(
    `  ${ctx.padEnd(8)}: router ${rPass}/${rows.length} (${pct(rPass, rows.length)}%) | routing ${rtPass}/${rows.length} (${pct(rtPass, rows.length)}%) | full ${fPass}/${rows.length} (${pct(fPass, rows.length)}%)`
  );
}

const leakCounts = {};
for (const r of positiveRecords) {
  for (const leak of r.leaks) {
    if (leak.type === "ARCHITECTURAL_DESIGN_ACCEPTED") continue;
    leakCounts[leak.type] = (leakCounts[leak.type] || 0) + 1;
  }
}

console.log("\n── Vazamentos por tipo (positivos, excl. design aceito) ──\n");
if (Object.keys(leakCounts).length === 0) {
  console.log("  (nenhum)");
} else {
  for (const [type, count] of Object.entries(leakCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}

const uniquePatterns = new Map();
for (const r of positiveRecords) {
  for (const leak of r.leaks) {
    if (leak.type === "ARCHITECTURAL_DESIGN_ACCEPTED") continue;
    const key = `${leak.type}::${leak.detail}`;
    if (!uniquePatterns.has(key)) uniquePatterns.set(key, []);
    uniquePatterns.get(key).push(`[${r.subtype}/${r.context}] "${r.input}"`);
  }
}

console.log("\n── Causa raiz (padrões únicos) ──\n");
for (const [key, examples] of uniquePatterns.entries()) {
  const [type, detail] = key.split("::");
  console.log(`  ${type}`);
  console.log(`    ${detail}`);
  console.log(`    Frequência: ${examples.length} | Ex.: ${examples.slice(0, 2).join("; ")}`);
  console.log("");
}

console.log("── Veredito ──\n");
const routerScore = (posRouter / posTotal) * 100;
const routingScore = (posRouting / posTotal) * 100;
const fullScore = (posFinal / posTotal) * 100;
const failureFullScore = (failureStats.final / failureStats.total) * 100;
const successFullScore = (successStats.final / successStats.total) * 100;
const compoundClean = compoundLeaks === 0;

const fullRobust =
  routerScore >= 90 &&
  fullScore >= 90 &&
  failureFullScore >= 90 &&
  successFullScore >= 90 &&
  compoundClean;

if (fullRobust) {
  console.log("A) COMPREHENSION FULL STACK ROBUST");
} else {
  console.log("B) COMPREHENSION POSSUI GAP FULL STACK");
  if (failureStats.router / failureStats.total < 0.9) {
    console.log(`   FAILURE router ${pct(failureStats.router, failureStats.total)}% — vocabulário de falha incompleto (7.7K).`);
  }
  if (failureStats.routing / failureStats.total < 0.9) {
    console.log(`   FAILURE routing ${pct(failureStats.routing, failureStats.total)}% — cognitive_explanation precede comprehension hold (anchored).`);
  }
  if (successFullScore < 100) {
    console.log(`   SUCCESS full ${pct(successStats.final, successStats.total)}% — verificar comprehension response path (8.1B.2).`);
  }
}

console.log("\n── Recomendação (audit-only) ──\n");
if (fullRobust) {
  console.log("Próximo patch sugerido: PATCH 7.9X-I.1 — Greeting Flow Robustness Audit");
} else if (failureStats.router / failureStats.total < 0.9) {
  console.log("PATCH 7.9X-H.2 — Comprehension Failure Vocabulary Expansion");
} else if (failureStats.routing / failureStats.total < 0.9 && failureFullScore >= 90) {
  console.log("PATCH 7.9X-H.2 — Comprehension Routing Hold Authority (espelhar 7.9X-G.2)");
} else {
  console.log("Investigar camada dominante nos leaks acima.");
}

console.log("\nPATCH 7.9X-H.1 audit COMPLETE — AUDIT ONLY\n");
process.exit(fullRobust ? 0 : 1);
