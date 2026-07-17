/**

 * PATCH 10.1E — Comparison Flow Crash Guard

 *

 * Detecção/resolução segura de comparação direta.

 * PATCH 11A.7F — anchored comparison contract + runtime null safety.

 * PATCH 11A.7G — same-product distinctness + canonical identity equivalence.

 */



import { extractMentionedProductCandidate } from "./miaDiscussionSetEnforcement.js";



export const COMPARISON_FLOW_CRASH_GUARD_VERSION = "11A.7G.1";



const COMPARISON_CONNECTOR_PATTERN = /\b(?:ou|vs|versus|contra)\b|\s+e\s+/i;

const COMPARE_VERB_PATTERN = /\b(comparar|compare|comparação|comparacao)\b/i;

const COMPARISON_INTENT_PATTERN =

  /\b(comparar|compare|comparação|comparacao|versus| vs | x )\b|\b(ou|versus|contra)\b|\s+e\s+/i;

const ANCHORED_COMPARISON_REQUEST_PATTERN =

  /\b(compara|comparar|compare)\s+(com|com o|com a|versus|vs)\b/i;

const PRODUCT_CONFIRMATION_PATTERN =

  /\b(mesmo|certo|ne|isso|falando do|falando de|quis dizer|quer dizer|estamos falando)\b/i;

const EXPLICIT_SELF_COMPARISON_PATTERN =

  /\b(com ele mesmo|com ela mesma|consigo mesmo|comigo mesmo|ele mesmo|ela mesma)\b/i;



function cleanText(value = "") {

  return String(value || "").replace(/\s+/g, " ").trim();

}



function normalizeProductKey(value = "") {

  return cleanText(value)

    .toLowerCase()

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/[^a-z0-9 ]/g, " ")

    .replace(/\s+/g, " ")

    .trim();

}



function cleanComparisonTerm(part = "") {

  return cleanText(part)

    .replace(/^\s*(é|e)\s+/i, " ")

    .replace(

      /\b(qual|quais|quem|melhor|pior|vale|mais|menos|tem|pena|entre|comparar|compare|comparação|comparacao)\b/gi,

      " "

    )

    .replace(/\b(celular|smartphone|telefone|aparelho|modelo|opção|opcao)\b/gi, " ")

    .replace(

      /\b(bateria|autonomia|carga|tomada|desempenho|performance|camera|câmera|foto|fotos|video|vídeo|tela|display|armazenamento|memoria|memória|espaço|espaco|custo|beneficio|benefício)\b/gi,

      " "

    )

    .replace(/[,:;()]/g, " ")

    .replace(/[?!.]/g, " ")

    .replace(/\s+/g, " ")

    .trim();

}



function normalizeTerms(parts = []) {

  const seen = new Set();



  return parts

    .map((part) => cleanComparisonTerm(part))

    .filter((part) => part.length >= 2)

    .filter((part) => {

      const key = normalizeProductKey(part);

      if (!key || seen.has(key)) return false;

      seen.add(key);

      return true;

    })

    .slice(0, 4);

}



function splitComparisonParts(raw = "") {

  const normalizedRaw = String(raw || "")

    .trim()

    .replace(/\s+x\s+/gi, " vs ")

    .replace(/\s+contra\s+/gi, " vs ")

    .replace(/\s+versus\s+/gi, " vs ");



  return normalizedRaw

    .replace(/[?!.]/g, " ")

    .split(COMPARISON_CONNECTOR_PATTERN)

    .map((part) => cleanText(part))

    .filter(Boolean);

}



export function extractComparisonTermsFromQuery(query = "") {

  const raw = String(query || "").trim();

  if (!raw) return [];



  const normalizedRaw = raw

    .replace(/\s+x\s+/gi, " vs ")

    .replace(/\s+contra\s+/gi, " vs ")

    .replace(/\s+versus\s+/gi, " vs ");



  const hasCompareVerb = COMPARE_VERB_PATTERN.test(normalizedRaw);

  const hasDirectComparisonConnector = COMPARISON_CONNECTOR_PATTERN.test(normalizedRaw);



  if (hasDirectComparisonConnector) {

    let parts = splitComparisonParts(normalizedRaw);



    if (hasCompareVerb) {

      parts = parts.map((part) =>

        part.replace(/\b(comparar|compare|comparação|comparacao)\b/gi, " ").trim()

      );

    }



    const terms = normalizeTerms(parts);

    if (terms.length >= 2) return terms;

  }



  const looksLikeMoreQuestion =

    /\b(qual|quais|quem)\b/i.test(raw) &&

    /\b(mais|melhor|maior|dura|aguenta|vale)\b/i.test(raw);



  if (looksLikeMoreQuestion && /\bentre\b/i.test(raw) && /\se\s/i.test(raw)) {

    const afterEntre = raw.split(/\bentre\b/i).pop() || "";

    const beforeQuestion = afterEntre.split(/\b(?:qual|quais|quem)\b/i)[0] || "";

    const terms = normalizeTerms(beforeQuestion.split(/\s+\be\b\s+/i));

    if (terms.length >= 2) return terms;

  }



  if (looksLikeMoreQuestion && /\se\s/i.test(raw)) {

    const beforeQuestion = raw.split(/\b(?:qual|quais|quem)\b/i)[0] || "";

    const terms = normalizeTerms(beforeQuestion.split(/\s+\be\b\s+/i));

    if (terms.length >= 2) return terms;

  }



  return [];

}



export function isDirectComparisonQuery(query = "") {

  const raw = cleanText(query);

  if (!raw) return false;

  if (extractComparisonTermsFromQuery(raw).length >= 2) return true;

  return COMPARISON_INTENT_PATTERN.test(raw) && /\b(ou|vs|versus|contra)\b|\s+e\s+/i.test(raw);

}



export function isExplicitAnchoredComparisonRequest(query = "") {

  const raw = cleanText(query);

  if (!raw) return false;

  if (ANCHORED_COMPARISON_REQUEST_PATTERN.test(raw)) return true;

  if (/\b(versus|vs)\b/i.test(raw) && COMPARE_VERB_PATTERN.test(raw)) return true;

  return false;

}



export function isProductConfirmationQuery(query = "") {

  const raw = cleanText(query);

  if (!raw) return false;

  if (isExplicitAnchoredComparisonRequest(raw)) return false;

  return PRODUCT_CONFIRMATION_PATTERN.test(raw);

}



export function isExplicitSelfComparisonRequest(query = "") {

  return EXPLICIT_SELF_COMPARISON_PATTERN.test(cleanText(query));

}



export function findMissingComparisonTerms(terms = [], products = []) {

  const list = Array.isArray(terms) ? terms.filter(Boolean) : [];

  const resolved = Array.isArray(products) ? products.filter(Boolean) : [];



  return list.filter((term) => {

    const termKey = normalizeProductKey(term);

    if (!termKey) return true;



    const termTokens = termKey.split(" ").filter((token) => token.length >= 2);

    if (!termTokens.length) return true;



    return !resolved.some((product) => {

      const nameKey = normalizeProductKey(

        product?.trustedSpecs?.official_name ||

          product?.product_name ||

          product?.title ||

          ""

      );

      if (!nameKey) return false;

      if (nameKey === termKey || nameKey.includes(termKey) || termKey.includes(nameKey)) {

        return true;

      }

      return termTokens.every((token) => nameKey.includes(token));

    });

  });

}



export function buildComparisonUnresolvedFallbackReply({

  query = "",

  resolvedTerms = [],

  missingTerms = [],

} = {}) {

  const missing = (missingTerms.length ? missingTerms : resolvedTerms).filter(Boolean);

  if (missing.length === 1) {

    return `Consigo comparar, mas não encontrei "${missing[0]}" com segurança no catálogo da MIA ainda. Me manda o nome um pouco mais completo para eu fechar a comparação.`;

  }

  return "Consigo comparar, mas não encontrei esses modelos com segurança no catálogo da MIA ainda. Me manda os nomes um pouco mais completos, tipo “Galaxy A15 ou Moto G84”, que eu comparo direto.";

}



function namesLikelyMatch(a = "", b = "") {

  const ka = normalizeProductKey(a);

  const kb = normalizeProductKey(b);

  if (!ka || !kb) return false;

  if (ka === kb) return true;



  const coreA = extractCoreModelKey(a);

  const coreB = extractCoreModelKey(b);

  if (coreA && coreB && coreA === coreB) {

    return extractVariantSignature(a) === extractVariantSignature(b);

  }



  const compactA = ka.replace(/\s+/g, "");

  const compactB = kb.replace(/\s+/g, "");

  if (

    compactA === compactB ||

    compactA.includes(compactB) ||

    compactB.includes(compactA)

  ) {

    return extractVariantSignature(a) === extractVariantSignature(b);

  }



  return (

    (ka.includes(kb) || kb.includes(ka)) &&

    extractVariantSignature(a) === extractVariantSignature(b)

  );

}



function extractVariantSignature(name = "") {

  const n = normalizeProductKey(name);

  if (/\bpro max\b/.test(n)) return "pro_max";

  if (/\bultra\b/.test(n)) return "ultra";

  if (/\bpro\b/.test(n)) return "pro";

  if (/\bplus\b/.test(n)) return "plus";

  if (/\bfe\b/.test(n)) return "fe";

  if (/\bse\b/.test(n)) return "se";

  if (/\blite\b/.test(n)) return "lite";

  if (/\bmini\b/.test(n)) return "mini";

  return "base";

}



function extractCoreModelKey(name = "") {

  let n = normalizeProductKey(name);

  n = n.replace(/\b\d+\s*(gb|tb)\b/g, " ");

  n = n.replace(/\b(pro max|pro|plus|ultra|lite|fe|se|mini)\b/g, " ");

  n = n.replace(/\s+/g, " ").trim();

  return n;

}



function readProductOfficialName(product = null) {

  if (!product || typeof product !== "object") return "";

  return cleanText(

    product.trustedSpecs?.official_name ||

      product.product_name ||

      product.title ||

      ""

  );

}



function readProductDetailId(product = null) {

  if (!product || typeof product !== "object") return "";

  return normalizeProductKey(

    product.trustedSpecs?.detail_id ||

      product.trustedSpecs?.detailId ||

      product.detail_id ||

      product.detailId ||

      ""

  );

}



function readProductFamilyKey(product = null) {

  if (!product || typeof product !== "object") return "";

  return normalizeProductKey(product.familyKey || product.trustedSpecs?.model_family || "");

}



export function resolveCanonicalProductIdentity(product = null) {

  const officialName = readProductOfficialName(product);

  const detailId = readProductDetailId(product);

  const familyKey = readProductFamilyKey(product);

  const coreModelKey = extractCoreModelKey(officialName);

  const variant = extractVariantSignature(officialName);



  let canonicalKey = "";

  let source = "official_name";



  if (detailId) {

    canonicalKey = `detail:${detailId}`;

    source = "detail_id";

  } else if (familyKey) {

    canonicalKey = `family:${familyKey}:${variant}`;

    source = "family_key";

  } else if (coreModelKey) {

    canonicalKey = `model:${coreModelKey}:${variant}`;

    source = "core_model";

  }



  return {

    canonicalKey,

    officialName,

    detailId,

    familyKey,

    coreModelKey,

    variant,

    source,

  };

}



export function areProductsSemanticallyEquivalent(left = null, right = null) {

  const leftIdentity = resolveCanonicalProductIdentity(left);

  const rightIdentity = resolveCanonicalProductIdentity(right);



  const baseResult = {

    leftCanonicalIdentity: leftIdentity.canonicalKey || leftIdentity.coreModelKey || null,

    rightCanonicalIdentity: rightIdentity.canonicalKey || rightIdentity.coreModelKey || null,

    identitiesEquivalent: false,

    equivalent: false,

    confidence: "distinct",

    comparisonIdentityCheckPerformed: true,

  };



  if (!leftIdentity.officialName || !rightIdentity.officialName) {

    return { ...baseResult, confidence: "missing_identity" };

  }



  if (leftIdentity.detailId && rightIdentity.detailId) {

    if (leftIdentity.detailId === rightIdentity.detailId) {

      return {

        ...baseResult,

        equivalent: true,

        identitiesEquivalent: true,

        confidence: "detail_id",

      };

    }

    return {

      ...baseResult,

      confidence: "detail_id_mismatch",

    };

  }



  if (leftIdentity.variant !== rightIdentity.variant) {

    return {

      ...baseResult,

      confidence: "variant_distinct",

    };

  }



  if (

    leftIdentity.coreModelKey &&

    rightIdentity.coreModelKey &&

    leftIdentity.coreModelKey === rightIdentity.coreModelKey

  ) {

    return {

      ...baseResult,

      equivalent: true,

      identitiesEquivalent: true,

      confidence: "core_model",

    };

  }



  if (

    leftIdentity.familyKey &&

    rightIdentity.familyKey &&

    leftIdentity.familyKey === rightIdentity.familyKey &&

    leftIdentity.variant === rightIdentity.variant

  ) {

    return {

      ...baseResult,

      equivalent: true,

      identitiesEquivalent: true,

      confidence: "family_key",

    };

  }



  if (namesLikelyMatch(leftIdentity.officialName, rightIdentity.officialName)) {

    return {

      ...baseResult,

      equivalent: true,

      identitiesEquivalent: true,

      confidence: "alias",

    };

  }



  return baseResult;

}



function serializeComparisonSide(product = null) {

  if (!product || typeof product !== "object") return null;

  const name = readProductOfficialName(product);

  if (!name) return null;

  return {

    ...product,

    product_name: name,

  };

}



function buildComparisonContractBase({

  left = null,

  right = null,

  identityCheck = null,

  options = {},

} = {}) {

  const leftResolved = !!left;

  const rightResolved = !!right;



  return {

    leftProduct: left,

    rightProduct: right,

    comparisonLeftResolved: leftResolved,

    comparisonRightResolved: rightResolved,

    comparisonIdentityCheckPerformed: !!identityCheck?.comparisonIdentityCheckPerformed,

    leftCanonicalIdentity: identityCheck?.leftCanonicalIdentity || null,

    rightCanonicalIdentity: identityCheck?.rightCanonicalIdentity || null,

    identitiesEquivalent: !!identityCheck?.identitiesEquivalent,

    identityConfidence: identityCheck?.confidence || null,

    comparisonExecutionBlocked: !!options.comparisonExecutionBlocked,

    providerExecutionAllowed: options.providerExecutionAllowed !== false,

    stateMutationAllowed: options.stateMutationAllowed !== false,

    comparisonAllowed: !!options.comparisonAllowed,

    clarificationRequired: !!options.clarificationRequired,

    clarificationReason: options.clarificationReason || null,

    reasonCodes: options.reasonCodes || [],

  };

}



/**

 * PATCH 11A.7F + 11A.7G — structural comparison input + distinctness contract.

 */

export function validateComparisonInputContract({

  leftProduct = null,

  rightProduct = null,

  query = "",

} = {}) {

  const left = serializeComparisonSide(leftProduct);

  const right = serializeComparisonSide(rightProduct);



  if (!left && !right) {

    const contract = buildComparisonContractBase({

      left: null,

      right: null,

      options: {

        comparisonDistinctnessStatus: "partial_missing_both",

        comparisonInputStatus: "partial",

        comparisonMissingSide: "both",

        clarificationRequired: true,

        clarificationReason: "missing_both_products",

        comparisonAllowed: false,

        comparisonExecutionBlocked: true,

        providerExecutionAllowed: false,

        stateMutationAllowed: false,

        reasonCodes: ["missing_both_products"],

      },

    });

    return {

      ...contract,

      comparisonDistinctnessStatus: "partial_missing_both",

      comparisonInputStatus: "partial",

      comparisonMissingSide: "both",

    };

  }



  if (!left) {

    const contract = buildComparisonContractBase({

      left: null,

      right,

      options: {

        comparisonDistinctnessStatus: "partial_missing_left",

        comparisonInputStatus: "partial",

        comparisonMissingSide: "left",

        clarificationRequired: true,

        clarificationReason: "missing_left_product",

        comparisonAllowed: false,

        comparisonExecutionBlocked: true,

        providerExecutionAllowed: false,

        stateMutationAllowed: false,

        reasonCodes: ["missing_left_product"],

      },

    });

    return {

      ...contract,

      comparisonDistinctnessStatus: "partial_missing_left",

      comparisonInputStatus: "partial",

      comparisonMissingSide: "left",

    };

  }



  if (!right) {

    const contract = buildComparisonContractBase({

      left,

      right: null,

      options: {

        comparisonDistinctnessStatus: "partial_missing_right",

        comparisonInputStatus: "partial",

        comparisonMissingSide: "right",

        clarificationRequired: true,

        clarificationReason: "missing_right_product",

        comparisonAllowed: false,

        comparisonExecutionBlocked: true,

        providerExecutionAllowed: false,

        stateMutationAllowed: false,

        reasonCodes: ["missing_right_product"],

      },

    });

    return {

      ...contract,

      comparisonDistinctnessStatus: "partial_missing_right",

      comparisonInputStatus: "partial",

      comparisonMissingSide: "right",

    };

  }



  const identityCheck = areProductsSemanticallyEquivalent(left, right);

  const selfComparison = isExplicitSelfComparisonRequest(query);



  if (identityCheck.equivalent || selfComparison) {

    const contract = buildComparisonContractBase({

      left,

      right,

      identityCheck,

      options: {

        comparisonDistinctnessStatus: "same_product",

        comparisonInputStatus: "same_product",

        comparisonMissingSide: null,

        clarificationRequired: true,

        clarificationReason: selfComparison

          ? "explicit_self_comparison"

          : "same_product_on_both_sides",

        comparisonAllowed: false,

        comparisonExecutionBlocked: true,

        providerExecutionAllowed: false,

        stateMutationAllowed: false,

        reasonCodes: [

          selfComparison ? "explicit_self_comparison" : "same_product_on_both_sides",

        ],

      },

    });

    return {

      ...contract,

      comparisonDistinctnessStatus: "same_product",

      comparisonInputStatus: "same_product",

      comparisonMissingSide: null,

    };

  }



  if (!left.product_name || !right.product_name) {

    const contract = buildComparisonContractBase({

      left,

      right,

      identityCheck,

      options: {

        comparisonDistinctnessStatus: "invalid_identity",

        comparisonInputStatus: "partial",

        comparisonMissingSide: !left.product_name ? "left" : "right",

        clarificationRequired: true,

        clarificationReason: "invalid_identity",

        comparisonAllowed: false,

        comparisonExecutionBlocked: true,

        providerExecutionAllowed: false,

        stateMutationAllowed: false,

        reasonCodes: ["invalid_identity"],

      },

    });

    return {

      ...contract,

      comparisonDistinctnessStatus: "invalid_identity",

      comparisonInputStatus: "partial",

      comparisonMissingSide: !left.product_name ? "left" : "right",

    };

  }



  const contract = buildComparisonContractBase({

    left,

    right,

    identityCheck,

    options: {

      comparisonDistinctnessStatus: "complete_distinct",

      comparisonInputStatus: "complete",

      comparisonMissingSide: null,

      clarificationRequired: false,

      clarificationReason: null,

      comparisonAllowed: true,

      comparisonExecutionBlocked: false,

      providerExecutionAllowed: true,

      stateMutationAllowed: true,

      reasonCodes: ["both_products_valid_distinct"],

    },

  });



  return {

    ...contract,

    comparisonDistinctnessStatus: "complete_distinct",

    comparisonInputStatus: "complete",

    comparisonMissingSide: null,

  };

}



export function isComparisonExecutionAllowed(contract = {}) {

  const status =

    contract.comparisonDistinctnessStatus || contract.comparisonInputStatus || "";

  return status === "complete_distinct" || status === "complete";

}



export function isSameProductComparisonContract(contract = {}) {

  return (

    contract.comparisonDistinctnessStatus === "same_product" ||

    contract.comparisonInputStatus === "same_product"

  );

}



export function buildSameProductComparisonClarificationReply({

  query = "",

  anchorName = "",

  contract = {},

} = {}) {

  const name = cleanText(

    contract.leftProduct?.product_name ||

      contract.rightProduct?.product_name ||

      anchorName ||

      "esse modelo"

  );



  if (contract.clarificationReason === "explicit_self_comparison") {

    return `${name} é o mesmo modelo dos dois lados — não daria diferença comparar consigo mesmo. Me diz outro produto se quiser uma comparação real.`;

  }



  return `Isso ainda é ${name}, o mesmo que já está em contexto. Me diz qual outro modelo você quer colocar do lado para eu comparar.`;

}



export function buildAnchoredComparisonIncompleteReply({

  query = "",

  candidate = "",

  contract = {},

} = {}) {

  if (isSameProductComparisonContract(contract)) {

    return buildSameProductComparisonClarificationReply({

      query,

      candidate,

      contract,

    });

  }



  if (contract.reasonCodes?.includes("same_product_both_sides")) {

    const name = cleanText(contract.leftProduct?.product_name || candidate || "esse produto");

    return `Você já está com ${name} como referência principal. Me diz outro modelo para eu comparar lado a lado.`;

  }



  return buildComparisonUnresolvedFallbackReply({

    query,

    resolvedTerms: candidate ? [candidate] : [],

    missingTerms: candidate ? [candidate] : [],

  });

}



export function comparisonRuntimeGuardToTrace(contract = {}, extra = {}) {

  return {

    comparisonInputStatus: contract.comparisonInputStatus || "missing",

    comparisonDistinctnessStatus: contract.comparisonDistinctnessStatus || null,

    comparisonLeftResolved: !!contract.comparisonLeftResolved,

    comparisonRightResolved: !!contract.comparisonRightResolved,

    comparisonMissingSide: contract.comparisonMissingSide || null,

    clarificationRequired: !!contract.clarificationRequired,

    clarificationReason: contract.clarificationReason || null,

    reasonCodes: contract.reasonCodes || [],

    comparisonIdentityCheckPerformed: !!contract.comparisonIdentityCheckPerformed,

    leftCanonicalIdentity: contract.leftCanonicalIdentity || null,

    rightCanonicalIdentity: contract.rightCanonicalIdentity || null,

    identitiesEquivalent: !!contract.identitiesEquivalent,

    comparisonExecutionBlocked:

      extra.comparisonExecutionBlocked ?? !!contract.comparisonExecutionBlocked,

    providerCallsPrevented: !!extra.providerCallsPrevented,

    stateMutationBlocked: !!extra.stateMutationBlocked,

    runtimeCrashPrevented: !!extra.runtimeCrashPrevented,

    commercialDegradationMode: extra.commercialDegradationMode || null,

  };

}



function extractAnchoredComparisonCitation(query = "", anchorName = "") {

  const text = cleanText(query);

  if (!text) return null;

  const patterns = [

    /\bcompar(?:a|ar|ando|e)\s+(?:esse|essa|este|esta|isso)\s+com\s+(?:o|a)?\s*(.+?)(?:\?|\.|$)/i,

    /\bcompar(?:a|ar|ando|e)\s+com\s+(?:o|a)?\s*(.+?)(?:\?|\.|$)/i,

  ];

  for (const pattern of patterns) {

    const match = text.match(pattern);

    const cited = cleanComparisonTerm(match?.[1] || "");

    if (cited.length >= 2) return cited;

  }

  return null;

}



/**

 * Resolve anchor + produto citado para comparação ancorada.

 */

export async function resolveAnchoredComparisonPair({

  anchorProduct = null,

  query = "",

  rememberedProducts = [],

  resolveProductFn = null,

} = {}) {

  const left = serializeComparisonSide(anchorProduct);

  const anchorName = left?.product_name || "";

  const candidate = extractMentionedProductCandidate(query, anchorName);

  const anchorMatchedCitation = extractAnchoredComparisonCitation(query, anchorName);



  let right = null;

  if (candidate) {

    const memoryMatch = (Array.isArray(rememberedProducts) ? rememberedProducts : []).find(

      (product) => namesLikelyMatch(product?.product_name, candidate)

    );

    if (memoryMatch) {

      right = serializeComparisonSide(memoryMatch);

    } else if (typeof resolveProductFn === "function") {

      const resolved = await resolveProductFn(candidate, query);

      right = serializeComparisonSide(resolved);

    }

  } else if (

    left &&

    anchorMatchedCitation &&

    namesLikelyMatch(anchorMatchedCitation, anchorName)

  ) {

    right = left;

  } else if (left && anchorMatchedCitation && typeof resolveProductFn === "function") {

    const resolved = await resolveProductFn(anchorMatchedCitation, query);

    const resolvedSide = serializeComparisonSide(resolved);

    if (resolvedSide && areProductsSemanticallyEquivalent(left, resolvedSide).equivalent) {

      right = resolvedSide;

    }

  }



  return validateComparisonInputContract({

    leftProduct: left,

    rightProduct: right,

    query,

  });

}



export function assertComparisonInputContract(contract = {}) {

  if (isComparisonExecutionAllowed(contract)) return contract;

  throw new Error(

    `comparison_input_contract_invalid:${(contract.reasonCodes || []).join(",") || "unknown"}`

  );

}



export function buildComparisonFlowCrashGuardAudit(input = {}) {

  return {

    applied: !!input.applied,

    query: input.query || null,

    detectedComparison: !!input.detectedComparison,

    resolvedProductsCount: input.resolvedProductsCount ?? 0,

    resolvedProducts: input.resolvedProducts || [],

    missingProducts: input.missingProducts || [],

    winner: input.winner || null,

    responsePath: input.responsePath || "",

    preventedCrash: !!input.preventedCrash,

    fallbackUsed: !!input.fallbackUsed,

    errorBeforeGuard: input.errorBeforeGuard || null,

  };

}



export function logComparisonFlowCrashGuardAudit(audit = {}) {

  console.log(

    "COMPARISON_FLOW_CRASH_GUARD_AUDIT",

    JSON.stringify({

      version: COMPARISON_FLOW_CRASH_GUARD_VERSION,

      ...buildComparisonFlowCrashGuardAudit(audit),

    })

  );

}



/**

 * Executa fluxo de comparação com fallback 200 em erro inesperado.

 * @param {{ query?: string, execute: Function, onFallback: Function }} input

 */

export async function executeComparisonFlowSafely(input = {}) {

  const query = cleanText(input.query || "");

  const terms = extractComparisonTermsFromQuery(query);

  const detectedComparison = isDirectComparisonQuery(query);



  try {

    const result = await input.execute({

      terms,

      detectedComparison,

    });



    logComparisonFlowCrashGuardAudit({

      applied: true,

      query,

      detectedComparison,

      resolvedProductsCount: result?.resolvedProductsCount ?? 0,

      resolvedProducts: result?.resolvedProducts || [],

      missingProducts: result?.missingProducts || [],

      winner: result?.winner || null,

      responsePath: result?.responsePath || "",

      preventedCrash: false,

      fallbackUsed: !!result?.fallbackUsed,

      errorBeforeGuard: null,

    });



    return result;

  } catch (error) {

    const message = error?.message || String(error || "unknown_error");



    logComparisonFlowCrashGuardAudit({

      applied: true,

      query,

      detectedComparison,

      resolvedProductsCount: 0,

      resolvedProducts: [],

      missingProducts: terms,

      winner: null,

      responsePath: "comparison_flow_crash_guard",

      preventedCrash: true,

      fallbackUsed: true,

      errorBeforeGuard: message,

    });



    if (typeof input.onFallback === "function") {

      return input.onFallback({ error: message, terms, detectedComparison });

    }



    return {

      fallbackUsed: true,

      preventedCrash: true,

      responsePath: "comparison_flow_crash_guard",

      reply: buildComparisonUnresolvedFallbackReply({

        query,

        resolvedTerms: terms,

        missingTerms: terms,

      }),

    };

  }

}


