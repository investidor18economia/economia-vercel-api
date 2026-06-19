/**
 * PATCH 9.2B — Data Layer Humanization Guard
 *
 * Sanitiza texto do Data Layer antes de virar evidência visível ao usuário.
 * Determinístico — sem LLM, sem hardcode de produto/categoria.
 */

export const DATA_LAYER_HUMANIZATION_GUARD_VERSION = "9.2B.1";

export const HUMANIZATION_GUARD_FLAGS = Object.freeze({
  SNAKE_CASE_LEAK: "SNAKE_CASE_LEAK",
  TECHNICAL_SEPARATOR_LEAK: "TECHNICAL_SEPARATOR_LEAK",
  INTERNAL_PREFIX_LEAK: "INTERNAL_PREFIX_LEAK",
  PURE_SLUG_LEAK: "PURE_SLUG_LEAK",
  SUPPRESSED_AMBIGUOUS: "SUPPRESSED_AMBIGUOUS",
  HUMANIZED: "HUMANIZED",
});

const PROTECTED_FIELDS = Object.freeze([
  "strengths",
  "market_notes",
  "risk_notes",
  "ideal_for",
  "strategic_notes",
  "notes",
  "weaknesses",
  "avoid_if",
]);

const INTERNAL_FIELD_PREFIXES = Object.freeze([
  /^market_/i,
  /^risk_/i,
  /^ideal_/i,
  /^avoid_/i,
  /^strength_/i,
  /^weakness_/i,
  /^strategic_/i,
  /^note_/i,
]);

const PORTUGUESE_HINT =
  /\b(muito|procurado|revenda|consistente|basico|básico|usuario|usuário|noturna|beneficio|benefício|custo|camera|câmera|bateria|durabilidade|excelente|forte|alta|boa|bom|pressao|pressão|preço|preco|office|home|trabalho|estudo|multitarefa|fluidez|conforto|ergonom|ajuste|suporte|atualiza|anos|carregador|memoria|memória|armazenamento|desempenho|equilibrado|prolongado|streaming|filmes|series|séries|topo|edicao|edição|cor|melhor|opcao|opção|pesada|basico|básico|nao|não|altura|lombar|ergonômica|ergonomica)\b/i;

const SNAKE_CASE_PATTERN = /[a-z0-9]+(?:_[a-z0-9]+)+/i;

const PURE_SLUG_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)+$/i;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function capitalizeLead(text = "") {
  const body = cleanText(text);
  if (!body) return "";
  return body.charAt(0).toUpperCase() + body.slice(1);
}

function stripInternalPrefixes(token = "") {
  let body = cleanText(token);
  for (const pattern of INTERNAL_FIELD_PREFIXES) {
    body = body.replace(pattern, "");
  }
  return body;
}

function tokenToHumanWords(token = "") {
  let body = stripInternalPrefixes(cleanText(token).toLowerCase());
  body = body.replace(/_/g, " ");
  body = body.replace(/\bcusto beneficio\b/g, "custo-benefício");
  body = body.replace(/\bcamera\b/g, "câmera");
  body = body.replace(/\bpreco\b/g, "preço");
  body = body.replace(/\bpressao\b/g, "pressão");
  return cleanText(body);
}

function softenLeadingBrandSlug(text = "") {
  const body = cleanText(text);
  const match = body.match(/^([a-z0-9]+)\s+(.*)$/i);
  if (!match) return body;

  const [, lead, rest] = match;
  if (PORTUGUESE_HINT.test(lead)) return body;
  if (/^[a-z0-9]+$/i.test(lead) && PORTUGUESE_HINT.test(rest)) {
    return cleanText(`modelo ${rest}`);
  }
  return body;
}

function isHumanEnough(text = "") {
  const body = cleanText(text);
  if (!body) return false;
  if (hasTechnicalSeparatorLeak(body)) return false;
  if (SNAKE_CASE_PATTERN.test(body)) return false;
  if (PURE_SLUG_PATTERN.test(body)) return false;

  const words = body.split(/\s+/).filter(Boolean);
  if (words.length < 2 && body.length < 12) return false;

  const compactTokens = words.filter((word) => /^[a-z0-9_]+$/i.test(word) && word.includes("_"));
  if (compactTokens.length > 0) return false;

  if (!PORTUGUESE_HINT.test(body)) return false;

  return true;
}

function hasTechnicalSeparatorLeak(text = "") {
  const body = cleanText(text);
  if (!body) return false;
  if (/[|]/.test(body)) return true;

  if (!/;/.test(body)) return false;

  const parts = body.split(";").map((entry) => cleanText(entry)).filter(Boolean);
  if (parts.length < 2) return false;

  return parts.every(
    (part) =>
      SNAKE_CASE_PATTERN.test(part) ||
      PURE_SLUG_PATTERN.test(part) ||
      /^[a-z0-9_]+$/i.test(part)
  );
}

export function detectRawDataLayerTokenLeak(text = "") {
  const body = cleanText(text);
  const reasons = [];

  if (!body) {
    return { leak: false, reasons: [] };
  }

  if (hasTechnicalSeparatorLeak(body)) {
    reasons.push(HUMANIZATION_GUARD_FLAGS.TECHNICAL_SEPARATOR_LEAK);
  }

  if (SNAKE_CASE_PATTERN.test(body)) {
    reasons.push(HUMANIZATION_GUARD_FLAGS.SNAKE_CASE_LEAK);
  }

  if (PURE_SLUG_PATTERN.test(body)) {
    reasons.push(HUMANIZATION_GUARD_FLAGS.PURE_SLUG_LEAK);
  }

  if (INTERNAL_FIELD_PREFIXES.some((pattern) => pattern.test(body))) {
    reasons.push(HUMANIZATION_GUARD_FLAGS.INTERNAL_PREFIX_LEAK);
  }

  const compactParts = body.split(/[;|]/).map((entry) => cleanText(entry)).filter(Boolean);
  if (compactParts.length > 1 && compactParts.every((part) => SNAKE_CASE_PATTERN.test(part))) {
    reasons.push(HUMANIZATION_GUARD_FLAGS.PURE_SLUG_LEAK);
  }

  return {
    leak: reasons.length > 0,
    reasons,
  };
}

export function humanizeDataLayerText(text = "") {
  const original = cleanText(text);
  if (!original) {
    return {
      text: "",
      ok: false,
      suppressed: true,
      humanized: false,
      flags: [],
    };
  }

  const detection = detectRawDataLayerTokenLeak(original);
  if (!detection.leak) {
    return {
      text: original,
      ok: true,
      suppressed: false,
      humanized: false,
      flags: [],
    };
  }

  const parts = original.split(/[;|]/).map((entry) => cleanText(entry)).filter(Boolean);
  const sourceParts =
    parts.length > 1 &&
    (parts.some((part) => SNAKE_CASE_PATTERN.test(part) || PURE_SLUG_PATTERN.test(part)) ||
      parts.every((part) => /^[a-z0-9_]+$/i.test(part)))
      ? parts
      : [original.replace(/[|]/g, " ")];
  const humanizedParts = sourceParts
    .map((part) => {
      const partDetection = detectRawDataLayerTokenLeak(part);
      if (!partDetection.leak) return cleanText(part);
      return softenLeadingBrandSlug(tokenToHumanWords(part));
    })
    .filter(Boolean);

  if (!humanizedParts.length) {
    return {
      text: "",
      ok: false,
      suppressed: true,
      humanized: false,
      flags: [HUMANIZATION_GUARD_FLAGS.SUPPRESSED_AMBIGUOUS, ...detection.reasons],
    };
  }

  const joined =
    humanizedParts.length > 1
      ? humanizedParts.join(" e ")
      : humanizedParts[0];

  if (!isHumanEnough(joined)) {
    return {
      text: "",
      ok: false,
      suppressed: true,
      humanized: false,
      flags: [HUMANIZATION_GUARD_FLAGS.SUPPRESSED_AMBIGUOUS, ...detection.reasons],
    };
  }

  return {
    text: capitalizeLead(joined),
    ok: true,
    suppressed: false,
    humanized: true,
    flags: [HUMANIZATION_GUARD_FLAGS.HUMANIZED, ...detection.reasons],
  };
}

export function sanitizeDataLayerEvidenceText(text = "") {
  return humanizeDataLayerText(text);
}

function sanitizeListField(value, max = 3) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeDataLayerEvidenceText(entry))
      .filter((result) => result.ok && result.text)
      .map((result) => result.text)
      .slice(0, max);
  }

  if (typeof value === "string" && value.trim()) {
    const result = sanitizeDataLayerEvidenceText(value);
    return result.ok && result.text ? [result.text] : [];
  }

  return [];
}

export function applyDataLayerHumanizationGuard(trustedSpecs = null) {
  if (!trustedSpecs || typeof trustedSpecs !== "object") {
    return {
      specs: trustedSpecs,
      changed: false,
      suppressedFields: [],
    };
  }

  const specs = { ...trustedSpecs };
  const suppressedFields = [];
  let changed = false;

  for (const field of PROTECTED_FIELDS) {
    if (!(field in trustedSpecs)) continue;

    const original = trustedSpecs[field];
    const sanitized = sanitizeListField(original, 6);

    const originalList = Array.isArray(original)
      ? original.map((entry) => cleanText(entry)).filter(Boolean)
      : typeof original === "string" && original.trim()
        ? [cleanText(original)]
        : [];

    if (JSON.stringify(originalList) !== JSON.stringify(sanitized)) {
      changed = true;
      if (originalList.length && !sanitized.length) {
        suppressedFields.push(field);
      }
    }

    if (sanitized.length) {
      specs[field] = sanitized;
    } else if (field in specs) {
      delete specs[field];
      if (originalList.length) suppressedFields.push(field);
    }
  }

  return {
    specs,
    changed,
    suppressedFields,
  };
}

export function getHumanizedTrustedSpecs(trustedSpecs = null) {
  return applyDataLayerHumanizationGuard(trustedSpecs).specs;
}

export function auditDataLayerHumanizationText(text = "", context = {}) {
  const flags = [];
  const body = cleanText(text);

  const detection = detectRawDataLayerTokenLeak(body);
  if (detection.leak) {
    flags.push(...detection.reasons);
  }

  if (context.expectHuman && detection.leak) {
    flags.push(HUMANIZATION_GUARD_FLAGS.SUPPRESSED_AMBIGUOUS);
  }

  if (context.expectPreserved && context.original && cleanText(context.original) !== body) {
    if (detectRawDataLayerTokenLeak(context.original).leak) {
      // expected change
    } else if (body !== cleanText(context.original)) {
      flags.push("UNEXPECTED_CHANGE");
    }
  }

  return flags;
}

export function resolveUserFacingDataLayerText(text = "") {
  const original = cleanText(text);
  if (!original) return "";

  const sanitized = sanitizeDataLayerEvidenceText(original);
  if (sanitized.ok && sanitized.text) return sanitized.text;

  if (!detectRawDataLayerTokenLeak(original).leak) return original;
  return "";
}
export function assertUserFacingDataLayerText(text = "") {
  const body = cleanText(text);
  if (!body) return { ok: true, flags: [] };

  const detection = detectRawDataLayerTokenLeak(body);
  return {
    ok: !detection.leak,
    flags: detection.reasons,
  };
}
