/**
 * PATCH 8.0B.3 — Tone Compliance Guard
 * PATCH 9.2Q — Specialist wire contract preservation
 *
 * Validação e correção determinística de estilo na saída.
 * Downstream only — não altera decisão, winner, ranking ou routing.
 */

import {
  TONE_PROFILES,
  detectStyleLeaks as detectBaseStyleLeaks,
} from "./miaConversationalTone.js";
import {
  hasDetectableSpecialistPresentation,
  isStructuredSpecialistReply,
} from "./miaSpecialistPresentationContract.js";

export const TONE_COMPLIANCE_GUARD_VERSION = "9.2Q.1";

const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu;

const VULGARITY_PATTERN =
  /\b(crl|krl|pqp|caralho|carai|porra|cacete|fdp|bct|pnc|merda|puto|puta)\b/gi;

const LAUGHTER_PATTERN = /\b(kkk+|rsrs+|hahaha+|hehe+|huehue+)\b/gi;

const PROFILE_RULES = Object.freeze({
  [TONE_PROFILES.FORMAL_POLITE]: {
    block: [
      /\bblz\b/gi,
      /\bvlw\b/gi,
      /\bmano\b/gi,
      /\bcara\b/gi,
      LAUGHTER_PATTERN,
      /\btmj\b/gi,
      /\bshow\b/gi,
    ],
    replace: [
      [/\bblz\b/gi, "certo"],
      [/\bvlw\b/gi, "obrigado"],
      [/\btmj\b/gi, "obrigado"],
    ],
    remove: [/\bmano\b/gi, /\bcara\b/gi, LAUGHTER_PATTERN, /\bshow\b/gi],
  },
  [TONE_PROFILES.INFORMAL_LIGHT]: {
    block: [
      /\b(parça|parca|truta)\b/gi,
      /\bmanooo+\b/gi,
      /\b(slk|seloko|coe)\b/gi,
      VULGARITY_PATTERN,
      /\b(kkkkk+)\b/gi,
      /\bbrabo demais\b/gi,
    ],
    replace: [[/\b(kkk+)\b/gi, ""]],
    remove: [
      /\b(parça|parca|truta|slk|seloko|coe)\b/gi,
      VULGARITY_PATTERN,
      LAUGHTER_PATTERN,
      /\bbrabo demais\b/gi,
      /\bmano\b/gi,
    ],
  },
  [TONE_PROFILES.INFORMAL_HIGH]: {
    block: [
      /\b(parça|parca|fi|truta)\b/gi,
      /\bmanooo+\b/gi,
      /\bmano\b/gi,
      /\b(slk|seloko|coe)\b/gi,
      VULGARITY_PATTERN,
      /\b(kkkkk+)\b/gi,
    ],
    replace: [[/\b(kkk+)\b/gi, ""]],
    remove: [
      /\b(parça|parca|fi|truta|slk|seloko|coe)\b/gi,
      /\bmano\b/gi,
      VULGARITY_PATTERN,
      LAUGHTER_PATTERN,
    ],
  },
  [TONE_PROFILES.TECHNICAL]: {
    block: [
      /\bentendo sua preocupa(c|ç)(a|ã)o\b/gi,
      /\bfica tranquilo\b/gi,
      /\bsem stress\b/gi,
      /\brelaxa\b/gi,
      LAUGHTER_PATTERN,
    ],
    replace: [],
    remove: [
      /\bentendo sua preocupa(c|ç)(a|ã)o\b/gi,
      /\bfica tranquilo\b/gi,
      /\bsem stress\b/gi,
      /\brelaxa\b/gi,
      LAUGHTER_PATTERN,
    ],
  },
  [TONE_PROFILES.LAYPERSON]: {
    block: [
      /\bbenchmark\b/gi,
      /\blat(e|ê)ncia\b/gi,
      /\bthrottling\b/gi,
      /\bipc\b/gi,
      /\btdp\b/gi,
      /\bnvme\b/gi,
      /\bchipset\b/gi,
    ],
    replace: [
      [/\bbenchmark\b/gi, "desempenho"],
      [/\blat(e|ê)ncia\b/gi, "demora"],
      [/\bthrottling\b/gi, "limitação de velocidade"],
      [/\bipc\b/gi, "eficiência"],
      [/\btdp\b/gi, "consumo"],
      [/\bnvme\b/gi, "armazenamento rápido"],
      [/\bchipset\b/gi, "processador"],
    ],
    remove: [],
  },
  [TONE_PROFILES.ANXIOUS_ANTI_REGRET]: {
    block: [
      /\bdesastre\b/gi,
      /\bcatastrof\w*\b/gi,
      /\bnunca compre\b/gi,
      /\bfuja\b/gi,
      /\bhorr(i|í)vel\b/gi,
      VULGARITY_PATTERN,
      LAUGHTER_PATTERN,
    ],
    replace: [],
    remove: [
      /\bdesastre\b/gi,
      /\bcatastrof\w*\b/gi,
      /\bnunca compre\b/gi,
      /\bfuja\b/gi,
      /\bhorr(i|í)vel\b/gi,
      VULGARITY_PATTERN,
      LAUGHTER_PATTERN,
    ],
  },
  [TONE_PROFILES.IRRITATED]: {
    block: [VULGARITY_PATTERN, LAUGHTER_PATTERN, /\bcalma a[ií]\b/gi, /\bvc que pediu\b/gi],
    replace: [],
    remove: [VULGARITY_PATTERN, LAUGHTER_PATTERN, /\bcalma a[ií]\b/gi, /\bvc que pediu\b/gi, /\bmano\b/gi],
  },
  [TONE_PROFILES.RUSHED]: {
    block: [/\bcomo eu j[aá] disse\b/gi, LAUGHTER_PATTERN],
    replace: [],
    remove: [LAUGHTER_PATTERN, /\bcomo eu j[aá] disse\b/gi],
  },
  [TONE_PROFILES.NEUTRAL_DEFAULT]: {
    block: [VULGARITY_PATTERN, /\b(parça|parca|slk|seloko)\b/gi, LAUGHTER_PATTERN],
    replace: [],
    remove: [VULGARITY_PATTERN, /\b(parça|parca|slk|seloko|mano)\b/gi, LAUGHTER_PATTERN],
  },
});

const GLOBAL_REMOVE = [VULGARITY_PATTERN, LAUGHTER_PATTERN, /\b(compra logo|garanto 100)\b/gi];

function normalizeProfileKey(toneProfile) {
  if (!toneProfile) return TONE_PROFILES.NEUTRAL_DEFAULT;
  if (typeof toneProfile === "string") return toneProfile;
  return toneProfile.toneProfile || TONE_PROFILES.NEUTRAL_DEFAULT;
}

function collectPatternViolations(text, patterns = [], code) {
  const violations = [];
  for (const pattern of patterns) {
    if (patternMatches(text, pattern)) violations.push(code);
  }
  return violations;
}

function countEmojis(text = "") {
  const matches = String(text || "").match(EMOJI_PATTERN);
  return matches ? matches.length : 0;
}

function countDecorativeEmojis(text = "", { preserveStructuralMarkers = false } = {}) {
  const body = String(text || "");
  const matches = body.match(EMOJI_PATTERN) || [];
  if (!preserveStructuralMarkers) return matches.length;

  return matches.filter((emoji, index) => {
    const offset = body.indexOf(emoji, index > 0 ? body.indexOf(matches[index - 1]) + 1 : 0);
    if (emoji === "✅" || emoji === "\u2705") {
      return !isStructuralTradeoffMarkerInContext(body, emoji, offset);
    }
    if (emoji === "⚠️" || emoji === "⚠" || emoji === "\u26A0") {
      return !isStructuralTradeoffMarkerInContext(body, emoji, offset);
    }
    if (emoji === "\uFE0F" && offset > 0 && body[offset - 1] === "\u26A0") {
      return !isStructuralTradeoffMarkerInContext(body, emoji, offset);
    }
    return true;
  }).length;
}

function isStructuralTradeoffMarkerInContext(text = "", emoji = "", offset = 0) {
  const body = String(text || "");
  const window = body.slice(Math.max(0, offset), offset + 48);

  if (emoji === "✅" || emoji === "\u2705") {
    return /^✅\s*O que voc[eê] ganha/i.test(window);
  }

  if (emoji === "⚠️" || emoji === "⚠" || emoji === "\u26A0" || emoji === "\uFE0F") {
    if (/^⚠️?\s*O que voc[eê] abre m[aã]o/i.test(window)) return true;
    if (emoji === "\uFE0F" && body[offset - 1] === "\u26A0") {
      return /^⚠️?\s*O que voc[eê] abre m[aã]o/i.test(body.slice(offset - 1, offset + 47));
    }
  }

  return false;
}

function shouldPreserveSpecialistPresentation(input = {}) {
  if (input.preserveSpecialistPresentation) return true;
  if (input.specialistPresentation?.tradeoff?.gains?.length) return true;

  const response = String(input.response || "");
  return (
    hasDetectableSpecialistPresentation(response) ||
    isStructuredSpecialistReply(response)
  );
}

/**
 * @param {string} text
 * @param {{ preserveParagraphBreaks?: boolean, preserveSpecialistMarkers?: boolean }} [options]
 */
export function collapseWhitespace(text = "", options = {}) {
  const preserveParagraphBreaks =
    options.preserveParagraphBreaks === true || options.preserveSpecialistMarkers === true;

  if (preserveParagraphBreaks) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split(/\n\s*\n/)
      .map((paragraph) =>
        paragraph
          .split("\n")
          .map((line) => line.replace(/[^\S\n]{2,}/g, " ").replace(/[ \t]+$/g, "").trim())
          .filter(Boolean)
          .join("\n")
      )
      .filter(Boolean)
      .join("\n\n")
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return String(text || "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function patternMatches(text, pattern) {
  if (!pattern || typeof pattern.test !== "function") return false;
  const re = new RegExp(pattern.source, pattern.flags);
  return re.test(String(text || ""));
}

function applyReplacements(text, replacements = []) {
  let out = text;
  for (const [pattern, replacement] of replacements) {
    const re = new RegExp(pattern.source, pattern.flags);
    out = out.replace(re, replacement);
  }
  return out;
}

function shouldPreserveSocialLaughter(input = {}) {
  return (
    input.shortReactionMode === true ||
    input.identityMode === true ||
    input.farewellMode === true ||
    (input.socialResponse === true &&
      (input.responseDepth === "minimal" || input.skipLaughterStripping === true))
  );
}

function applyToneCorrections(text, rules, input = {}) {
  const preserveLaughter = shouldPreserveSocialLaughter(input);
  let correctedText = text;

  correctedText = applyReplacements(correctedText, rules.replace || []);
  correctedText = applyRemovals(correctedText, rules.remove || []);

  if (!preserveLaughter) {
    correctedText = applyRemovals(correctedText, GLOBAL_REMOVE);
  } else {
    correctedText = applyRemovals(
      correctedText,
      GLOBAL_REMOVE.filter((p) => p !== LAUGHTER_PATTERN)
    );
  }

  return correctedText;
}

function applyRemovals(text, removals = []) {
  let out = text;
  for (const pattern of removals) {
    const re = new RegExp(pattern.source, pattern.flags);
    out = out.replace(re, "");
  }
  return out;
}

/**
 * @param {{
 *   response?: string,
 *   toneProfile?: object|string,
 *   preserveSpecialistPresentation?: boolean,
 *   specialistPresentation?: object|null,
 * }} input
 * @returns {string[]}
 */
export function detectStyleLeaks(input = {}) {
  const response = String(input.response || "");
  const toneProfile =
    typeof input.toneProfile === "object"
      ? input.toneProfile
      : { toneProfile: normalizeProfileKey(input.toneProfile) };
  const profileKey = normalizeProfileKey(toneProfile);
  const rules = PROFILE_RULES[profileKey] || PROFILE_RULES[TONE_PROFILES.NEUTRAL_DEFAULT];
  const violations = [];
  const preserveSpecialist = shouldPreserveSpecialistPresentation(input);

  for (const leak of detectBaseStyleLeaks(response, toneProfile)) {
    violations.push(leak);
  }

  for (const pattern of rules.block || []) {
    if (patternMatches(response, pattern)) violations.push(`profile:${profileKey}`);
  }

  for (const pattern of GLOBAL_REMOVE) {
    if (patternMatches(response, pattern)) violations.push("global:forbidden");
  }

  const emojiCount = preserveSpecialist
    ? countDecorativeEmojis(response, { preserveStructuralMarkers: true })
    : countEmojis(response);

  if (emojiCount > 1) violations.push("emojiLeak");
  if (emojiCount > 0 && toneProfile && !toneProfile.shouldUseEmoji) {
    violations.push("emojiMisuse");
  }

  return [...new Set(violations)];
}

/**
 * @param {{
 *   response?: string,
 *   toneProfile?: object|string,
 *   preserveSpecialistPresentation?: boolean,
 *   specialistPresentation?: object|null,
 * }} input
 * @returns {{
 *   response: string,
 *   violations: string[],
 *   corrected: boolean,
 *   remainingViolations?: string[],
 *   specialistPreserved?: boolean,
 *   allowedStructuralMarkers?: boolean,
 * }}
 */
export function applyToneComplianceGuard(input = {}) {
  const original = String(input.response || "");
  const toneProfile =
    typeof input.toneProfile === "object"
      ? input.toneProfile
      : { toneProfile: normalizeProfileKey(input.toneProfile) };
  const profileKey = normalizeProfileKey(toneProfile);
  const rules = PROFILE_RULES[profileKey] || PROFILE_RULES[TONE_PROFILES.NEUTRAL_DEFAULT];
  const preserveSpecialist = shouldPreserveSpecialistPresentation(input);
  const leakInput = {
    response: original,
    toneProfile,
    preserveSpecialistPresentation: preserveSpecialist,
    specialistPresentation: input.specialistPresentation || null,
  };

  const violations = detectStyleLeaks(leakInput);
  if (violations.length === 0) {
    return {
      response: original,
      violations: [],
      corrected: false,
      remainingViolations: [],
      specialistPreserved: preserveSpecialist,
      allowedStructuralMarkers: preserveSpecialist,
    };
  }

  let correctedText = original;

  if (shouldPreserveSocialLaughter(input)) {
    const filteredRules = {
      ...rules,
      replace: (rules.replace || []).filter(([pattern]) => pattern !== LAUGHTER_PATTERN && !/\(kkk\+\)/.test(pattern.source)),
      remove: (rules.remove || []).filter(
        (pattern) => pattern !== LAUGHTER_PATTERN && !/\(kkk\+\)/.test(pattern.source)
      ),
    };
    correctedText = applyToneCorrections(correctedText, filteredRules, input);
  } else {
    correctedText = applyToneCorrections(correctedText, rules, input);
  }

  if (!preserveSpecialist) {
    if (!toneProfile.shouldUseEmoji) {
      correctedText = correctedText.replace(EMOJI_PATTERN, "");
    } else {
      const emojis = correctedText.match(EMOJI_PATTERN) || [];
      if (emojis.length > 1) {
        let kept = 0;
        correctedText = correctedText.replace(EMOJI_PATTERN, (m) => (kept++ === 0 ? m : ""));
      }
    }
  } else if (!toneProfile.shouldUseEmoji) {
    correctedText = correctedText.replace(EMOJI_PATTERN, (emoji, offset, full) =>
      isStructuralTradeoffMarkerInContext(full, emoji, offset) ? emoji : ""
    );
  }

  correctedText = collapseWhitespace(correctedText, {
    preserveParagraphBreaks: preserveSpecialist,
    preserveSpecialistMarkers: preserveSpecialist,
  });

  const remainingViolations = detectStyleLeaks({
    response: correctedText,
    toneProfile,
    preserveSpecialistPresentation: preserveSpecialist,
    specialistPresentation: input.specialistPresentation || null,
  });

  return {
    response: correctedText,
    violations,
    corrected: correctedText !== original,
    remainingViolations,
    specialistPreserved: preserveSpecialist,
    allowedStructuralMarkers: preserveSpecialist,
  };
}

export { TONE_PROFILES };
