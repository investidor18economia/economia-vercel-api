/**
 * PATCH 9.2W — Authority Closing Contract
 *
 * Ownership + tradeoffs + dominance → contrato formal de autoridade de fechamento.
 * Sem templates, copy ou hardcode por categoria.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { isGenericInsightBody } from "./miaDataLayerSemanticNormalizer.js";
import { selectPrimaryOwnership } from "./miaOwnershipExperienceLayer.js";

export const AUTHORITY_CLOSING_CONTRACT_VERSION = "9.2W.1";

export const AUTHORITY_CLASSES = Object.freeze([
  "dominance_authority",
  "tradeoff_authority",
  "ownership_authority",
  "confidence_authority",
  "stability_authority",
  "anti_regret_authority",
  "long_term_authority",
]);

const GENERIC_CONSEQUENCE_PATTERN =
  /ganho percept[ií]vel|detalhe pr[aá]tico que ajuda|renúncia percept[ií]vel|combina com o perfil de uso descrito/i;

const OWNERSHIP_TO_AUTHORITY = Object.freeze({
  long_term_satisfaction: {
    authorityClass: "long_term_authority",
    authorityReason: "satisfação prolongada sustenta a validade da escolha no horizonte de posse",
    ownershipWeight: 0.85,
  },
  reliability_over_time: {
    authorityClass: "stability_authority",
    authorityReason: "confiabilidade ao longo do uso mantém a recomendação estável",
    ownershipWeight: 0.8,
  },
  usage_stability: {
    authorityClass: "stability_authority",
    authorityReason: "rotina previsível reforça que a decisão permanece coerente",
    ownershipWeight: 0.78,
  },
  confidence_over_time: {
    authorityClass: "confidence_authority",
    authorityReason: "tranquilidade recorrente sustenta confiança na escolha",
    ownershipWeight: 0.76,
  },
  value_retention: {
    authorityClass: "anti_regret_authority",
    authorityReason: "valor percebido precisa se sustentar para conter arrependimento tardio",
    ownershipWeight: 0.74,
  },
  regret_accumulation: {
    authorityClass: "anti_regret_authority",
    authorityReason: "risco de arrependimento identificado exige contrapeso explícito",
    ownershipWeight: 0.72,
  },
  replacement_pressure: {
    authorityClass: "ownership_authority",
    authorityReason: "pressão de troca existe mas não invalida o ganho principal no perfil",
    ownershipWeight: 0.65,
  },
  future_friction: {
    authorityClass: "tradeoff_authority",
    authorityReason: "atrito futuro mapeado mas aceitável frente ao ganho dominante",
    ownershipWeight: 0.62,
  },
  adaptation_over_time: {
    authorityClass: "confidence_authority",
    authorityReason: "curva de adaptação não desloca o eixo que motivou a escolha",
    ownershipWeight: 0.6,
  },
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp01(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function resolveDominance(searchCognition = {}, explicit = "") {
  if (explicit) return cleanText(explicit).toLowerCase();
  const assertiveness = cleanText(searchCognition.assertiveness || "").toLowerCase();
  if (searchCognition.dominance === "clear" || assertiveness === "high") return "clear";
  if (assertiveness === "low") return "low";
  return "moderate";
}

function buildTrace({
  token,
  consequence,
  sensation,
  experience,
  friction,
  ownership,
  authority,
  authorityClass,
}) {
  return {
    token: token || null,
    consequence: cleanText(consequence),
    sensation: cleanText(sensation),
    experience: cleanText(experience),
    friction: cleanText(friction),
    ownership: cleanText(ownership),
    authority: cleanText(authority),
    authorityClass: authorityClass || "",
  };
}

function buildAuthorityCandidate({
  authorityClass,
  authorityReason,
  authorityStrength,
  sourceSensation,
  sourceExperience,
  sourceFriction,
  sourceOwnership,
  dominanceSupport,
  tradeoffAcceptance,
  ownershipSupport,
  derivedFrom,
}) {
  if (!authorityClass || !authorityReason) return null;
  const consequence = cleanText(
    sourceOwnership?.sourceConsequence ||
      sourceFriction?.sourceConsequence ||
      sourceExperience?.sourceConsequence ||
      sourceSensation?.consequence ||
      ""
  );
  if (!consequence || GENERIC_CONSEQUENCE_PATTERN.test(consequence)) return null;
  if (isGenericInsightBody(consequence)) return null;

  const sensation = cleanText(
    sourceOwnership?.sensation ||
      sourceFriction?.sensation ||
      sourceExperience?.sensation ||
      sourceSensation?.sensation ||
      ""
  );
  if (!sensation) return null;

  const experience = cleanText(
    sourceOwnership?.sourceExperience || sourceExperience?.experience || ""
  );
  const friction = cleanText(
    sourceOwnership?.sourceFriction || sourceFriction?.friction || ""
  );
  const effectiveExperience =
    experience || (derivedFrom === "dominance" && sensation ? sensation : "");
  if (!effectiveExperience && !friction) return null;

  const ownership = cleanText(sourceOwnership?.ownershipMeaning || "");
  const token =
    sourceOwnership?.sourceToken ||
    sourceFriction?.sourceToken ||
    sourceExperience?.sourceToken ||
    sourceSensation?.sourceToken ||
    "";

  return {
    authorityClass,
    authorityReason: cleanText(authorityReason),
    authorityStrength: clamp01(authorityStrength),
    sourceToken: token,
    sourceConsequence: consequence,
    sensation,
    experience: effectiveExperience,
    friction,
    ownership,
    dominanceSupport: dominanceSupport || null,
    tradeoffAcceptance: tradeoffAcceptance || null,
    ownershipSupport: ownershipSupport || null,
    derivedFrom,
    trace: buildTrace({
      token,
      consequence,
      sensation,
      experience: effectiveExperience,
      friction,
      ownership,
      authority: authorityReason,
      authorityClass,
    }),
  };
}

/**
 * @param {Record<string, unknown>} authority
 * @param {Record<string, unknown>} context
 */
export function calculateAuthorityRelevance(authority = {}, context = {}) {
  const query = cleanText(context.query || "");
  const primaryAxis = cleanText(context.primaryAxis || "");
  const querySignals = context.querySignals || {};
  const authorityClass = cleanText(authority.authorityClass || "");
  let relevance = Number(authority.baseRelevance || 0.5);

  if (primaryAxis === "value" || /\b(custo.?benef|econom|barato|orçamento)\b/i.test(query)) {
    if (authorityClass === "anti_regret_authority") relevance += 0.22;
    if (authorityClass === "tradeoff_authority") relevance += 0.18;
  }

  if (primaryAxis === "longevity" || /\b(longevo|anos|durar|vários anos|varios anos)\b/i.test(query)) {
    if (authorityClass === "long_term_authority") relevance += 0.24;
    if (authorityClass === "ownership_authority") relevance += 0.2;
  }

  if (primaryAxis === "performance" || /\b(desempenho|performance|potente|fps)\b/i.test(query)) {
    if (authorityClass === "dominance_authority") relevance += 0.22;
  }

  if (querySignals.avoidRegret || /\b(arrepend|não quero errar|nao quero errar)\b/i.test(query)) {
    if (authorityClass === "anti_regret_authority") relevance += 0.25;
  }

  if (/\b(pr[aá]tic|simples|f[aá]cil|dia a dia)\b/i.test(query)) {
    if (authorityClass === "stability_authority") relevance += 0.18;
    if (authorityClass === "confidence_authority") relevance += 0.12;
  }

  if (querySignals.technical) {
    if (authorityClass === "dominance_authority") relevance += 0.1;
    if (authorityClass === "tradeoff_authority") relevance += 0.08;
  }

  if (!querySignals.technical && authorityClass === "confidence_authority") relevance += 0.08;

  if (querySignals.acceptsTradeoff && authorityClass === "tradeoff_authority") relevance += 0.12;

  if (context.hasBudget && authorityClass === "anti_regret_authority") relevance += 0.1;

  return clamp01(relevance);
}

/**
 * @param {Array<Record<string, unknown>>} authorities
 * @param {Record<string, unknown>} context
 */
export function selectPrimaryAuthority(authorities = [], context = {}) {
  const ranked = [...(authorities || [])]
    .map((entry) => ({
      ...entry,
      contextualRelevance: calculateAuthorityRelevance(entry, context),
      contextScore:
        calculateAuthorityRelevance(entry, context) * 100 +
        Number(entry.authorityStrength || 0) * 30,
    }))
    .sort((a, b) => Number(b.contextScore || 0) - Number(a.contextScore || 0));

  return ranked.find((entry) => entry.contextualRelevance >= 0.45) || ranked[0] || null;
}

function buildDominanceSupport(winner, primaryAxis, dominance) {
  if (!winner || !primaryAxis) return null;
  return {
    winner,
    primaryAxis,
    dominance: dominance || "moderate",
    rationale: "winner permanece à frente no eixo dominante da busca",
    strength: dominance === "clear" ? 0.88 : dominance === "moderate" ? 0.72 : 0.58,
  };
}

function buildTradeoffAcceptance(sacrifice = {}, friction = null, sensation = null) {
  const normalizedSacrifice =
    sacrifice && typeof sacrifice === "object"
      ? sacrifice
      : typeof sacrifice === "string"
        ? { text: sacrifice }
        : {};
  const text = cleanText(normalizedSacrifice.text || "");
  if (!text || text.length < 6) return null;
  return {
    sacrificeText: text,
    sacrificeToken: cleanText(normalizedSacrifice.token || ""),
    frictionClass: friction?.frictionClass || "",
    frictionRelevance: Number(friction?.contextualRelevance || 0),
    acceptable: Number(friction?.contextualRelevance || 0.5) < 0.75,
    rationale: "tradeoff mapeado não invalida o ganho principal para o perfil",
    sensationClass: sensation?.perceptionClass || "",
  };
}

function mapBridgeReasons(primary, bridgeClosing = {}, winner = "") {
  const sustaining = [];
  const alignment = (bridgeClosing.sustainingReasons || []).find(
    (entry) => entry.type === "decision_alignment"
  );
  const support = (bridgeClosing.sustainingReasons || []).find(
    (entry) => entry.type === "sensation_support"
  );

  if (primary?.dominanceSupport && alignment?.reason) {
    sustaining.push({ ...alignment, weight: primary.dominanceSupport.strength || 0.8 });
  } else if (alignment?.reason) {
    sustaining.push(alignment);
  }

  if (support?.reason) sustaining.push(support);

  if (!sustaining.length && primary?.sensation) {
    sustaining.push({
      type: "sensation_support",
      reason: primary.sensation,
      derivedFrom: primary.sourceToken || "sensation",
      weight: primary.authorityStrength || 0.7,
    });
  }

  let tradeoffReason = bridgeClosing.tradeoffReason || null;
  if (primary?.tradeoffAcceptance?.sacrificeText && !tradeoffReason) {
    const sacrifice = primary.tradeoffAcceptance.sacrificeText;
    tradeoffReason = {
      type: "tradeoff_acceptance",
      reason: primary.friction
        ? `mesmo com ${sacrifice.toLowerCase()}, ${primary.friction}`
        : `mesmo com ${sacrifice.toLowerCase()}, o ganho principal ainda pesa mais no seu caso`,
      derivedFrom: primary.tradeoffAcceptance.sacrificeToken || "tradeoff_sacrifice",
      sacrificeText: sacrifice,
      weight: 0.75,
    };
  }

  return {
    sustainingReasons: sustaining,
    tradeoffReason,
    winnerName: winner,
    derivedFromDecision: sustaining.length > 0 || Boolean(tradeoffReason),
  };
}

/**
 * @param {{
 *   winner?: string,
 *   dominance?: string,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   sensations?: Array<Record<string, unknown>>,
 *   experiences?: Array<Record<string, unknown>>,
 *   frictions?: Array<Record<string, unknown>>,
 *   ownershipExperiences?: Array<Record<string, unknown>>,
 *   authorityBridge?: Record<string, unknown>,
 *   searchCognition?: Record<string, unknown>,
 *   reasoning?: Record<string, unknown>,
 *   query?: string,
 *   primaryAxis?: string,
 *   querySignals?: Record<string, unknown>,
 * }} input
 */
export function buildAuthorityClosingContract(input = {}) {
  const winner = cleanText(input.winner || "");
  const query = cleanText(input.query || "");
  const primaryAxis = cleanText(
    input.primaryAxis || input.searchCognition?.primaryAxis || ""
  );
  const dominance = resolveDominance(input.searchCognition || {}, input.dominance || "");
  const budget = extractBudget(query);
  const ctx = {
    query,
    primaryAxis,
    hasBudget: budget != null,
    querySignals: input.querySignals || {},
  };

  const sensations = input.sensations || [];
  const experiences = input.experiences || [];
  const frictions = input.frictions || [];
  const ownershipExperiences = input.ownershipExperiences || [];
  const sacrifices = (input.tradeoffs?.sacrifices || []).map((entry) =>
    typeof entry === "string" ? { text: entry } : entry
  );
  const primarySacrifice = sacrifices[0] || null;
  const topSensation = sensations[0] || null;
  const topExperience = experiences[0] || null;
  const topFriction = frictions[0] || null;
  const primaryOwnership =
    selectPrimaryOwnership(ownershipExperiences, ctx, topExperience, topFriction) ||
    ownershipExperiences[0] ||
    null;

  const dominanceSupport = buildDominanceSupport(winner, primaryAxis, dominance);
  const tradeoffAcceptance = buildTradeoffAcceptance(
    primarySacrifice,
    topFriction,
    topSensation
  );

  const authorities = [];

  if (dominanceSupport) {
    authorities.push(
      buildAuthorityCandidate({
        authorityClass: "dominance_authority",
        authorityReason: dominanceSupport.rationale,
        authorityStrength: dominanceSupport.strength,
        sourceSensation: topSensation,
        sourceExperience: topExperience,
        sourceFriction: topFriction,
        sourceOwnership: primaryOwnership,
        dominanceSupport,
        tradeoffAcceptance,
        ownershipSupport: primaryOwnership
          ? {
              ownershipClass: primaryOwnership.ownershipClass,
              ownershipMeaning: primaryOwnership.ownershipMeaning,
              timeHorizon: primaryOwnership.timeHorizon,
            }
          : null,
        derivedFrom: "dominance",
      })
    );
  }

  if (tradeoffAcceptance && primarySacrifice) {
    authorities.push(
      buildAuthorityCandidate({
        authorityClass: "tradeoff_authority",
        authorityReason: tradeoffAcceptance.rationale,
        authorityStrength: tradeoffAcceptance.acceptable ? 0.8 : 0.62,
        sourceSensation: topSensation,
        sourceExperience: topExperience,
        sourceFriction: topFriction,
        sourceOwnership: primaryOwnership,
        dominanceSupport,
        tradeoffAcceptance,
        ownershipSupport: primaryOwnership
          ? {
              ownershipClass: primaryOwnership.ownershipClass,
              ownershipMeaning: primaryOwnership.ownershipMeaning,
            }
          : null,
        derivedFrom: "tradeoff",
      })
    );
  }

  if (primaryOwnership) {
    const map = OWNERSHIP_TO_AUTHORITY[primaryOwnership.ownershipClass];
    const authorityClass = map?.authorityClass || "ownership_authority";
    const authorityReason =
      map?.authorityReason ||
      "experiência de posse sustenta que a escolha continua fazendo sentido";
    authorities.push(
      buildAuthorityCandidate({
        authorityClass,
        authorityReason,
        authorityStrength: map?.ownershipWeight || primaryOwnership.confidence || 0.7,
        sourceSensation: topSensation,
        sourceExperience: topExperience,
        sourceFriction: topFriction,
        sourceOwnership: primaryOwnership,
        dominanceSupport,
        tradeoffAcceptance,
        ownershipSupport: {
          ownershipClass: primaryOwnership.ownershipClass,
          ownershipMeaning: primaryOwnership.ownershipMeaning,
          timeHorizon: primaryOwnership.timeHorizon,
          satisfactionSignal: primaryOwnership.satisfactionSignal,
          regretSignal: primaryOwnership.regretSignal,
        },
        derivedFrom: "ownership",
      })
    );
  }

  const regretFriction = frictions.find((entry) =>
    /regret|expectation/i.test(entry.frictionClass || "")
  );
  const regretOwnership = ownershipExperiences.find((entry) =>
    /regret|value_retention/i.test(entry.ownershipClass || "")
  );
  if (regretFriction || regretOwnership) {
    authorities.push(
      buildAuthorityCandidate({
        authorityClass: "anti_regret_authority",
        authorityReason:
          "risco de arrependimento mapeado e contrapesado pelo ganho dominante",
        authorityStrength: 0.76,
        sourceSensation: topSensation,
        sourceExperience: topExperience,
        sourceFriction: regretFriction || topFriction,
        sourceOwnership: regretOwnership || primaryOwnership,
        dominanceSupport,
        tradeoffAcceptance,
        ownershipSupport: regretOwnership
          ? {
              ownershipClass: regretOwnership.ownershipClass,
              ownershipMeaning: regretOwnership.ownershipMeaning,
            }
          : null,
        derivedFrom: "anti_regret",
      })
    );
  }

  const stabilityOwnership = ownershipExperiences.find((entry) =>
    /stability|reliability|confidence_over_time|usage_stability|reliability_over_time/.test(
      entry.ownershipClass || ""
    )
  );
  if (stabilityOwnership) {
    authorities.push(
      buildAuthorityCandidate({
        authorityClass: "stability_authority",
        authorityReason: "estabilidade percebida mantém a recomendação coerente",
        authorityStrength: 0.77,
        sourceSensation: topSensation,
        sourceExperience: topExperience,
        sourceFriction: topFriction,
        sourceOwnership: stabilityOwnership,
        dominanceSupport,
        tradeoffAcceptance,
        ownershipSupport: {
          ownershipClass: stabilityOwnership.ownershipClass,
          ownershipMeaning: stabilityOwnership.ownershipMeaning,
        },
        derivedFrom: "stability",
      })
    );
  }

  const primary = selectPrimaryAuthority(authorities.filter(Boolean), ctx);
  const bridgeClosing = input.authorityBridge?.closingAuthority || {};

  if (!primary) {
    return {
      ok: Boolean(input.authorityBridge?.ok),
      closingAuthority: bridgeClosing,
      primaryAuthority: null,
      authorities: [],
      version: AUTHORITY_CLOSING_CONTRACT_VERSION,
      contractGoverned: false,
    };
  }

  const authorityConfidence = clamp01(
    primary.authorityStrength * 0.45 +
      (primary.contextualRelevance || calculateAuthorityRelevance(primary, ctx)) * 0.35 +
      (primary.ownershipSupport ? 0.12 : 0) +
      (primary.tradeoffAcceptance?.acceptable ? 0.08 : 0)
  );

  const bridgeMapped = mapBridgeReasons(primary, bridgeClosing, winner);

  const closingAuthority = {
    authorityClass: primary.authorityClass,
    authorityReason: primary.authorityReason,
    authorityStrength: primary.authorityStrength,
    authorityConfidence,
    tradeoffAcceptance: primary.tradeoffAcceptance,
    ownershipSupport: primary.ownershipSupport,
    dominanceSupport: primary.dominanceSupport,
    trace: primary.trace,
    winnerName: winner,
    dominance,
    primaryAxis,
    confidence: authorityConfidence,
    contractGoverned: true,
    contextApplied: (primary.contextualRelevance || 0) >= 0.55,
    ...bridgeMapped,
    version: AUTHORITY_CLOSING_CONTRACT_VERSION,
  };

  return {
    ok: isAuthorityTraceable(closingAuthority),
    closingAuthority,
    primaryAuthority: primary,
    authorities: authorities.filter(Boolean),
    version: AUTHORITY_CLOSING_CONTRACT_VERSION,
    contractGoverned: true,
  };
}

export function isAuthorityTraceable(authority = {}) {
  const trace = authority.trace || {};
  return Boolean(
    trace.consequence &&
      trace.sensation &&
      (trace.experience || trace.friction) &&
      trace.authority &&
      trace.authorityClass &&
      AUTHORITY_CLASSES.includes(trace.authorityClass) &&
      authority.contractGoverned === true &&
      !GENERIC_CONSEQUENCE_PATTERN.test(trace.consequence || "")
  );
}

export function classifyAuthorityOrigin(authority = {}) {
  if (!authority) return "template";
  if (/pr[oó]ximo passo que eu seguiria/i.test(authority.closingText || "")) return "template";
  if (!authority.contractGoverned) return "template";
  if (isAuthorityTraceable(authority)) {
    if (authority.contextApplied && authority.authorityConfidence >= 0.7) return "real";
    return "derived";
  }
  if (authority.authorityClass) return "pseudo";
  return "template";
}

export function isContractGovernedClosing(closingAuthority = {}) {
  return Boolean(
    closingAuthority?.contractGoverned &&
      closingAuthority?.authorityClass &&
      isAuthorityTraceable(closingAuthority)
  );
}
