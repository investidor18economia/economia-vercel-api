/**
 * PATCH 8.0B.2 — Conversational Tone Adaptation
 *
 * Detecta perfil de tom do usuário e produz guidelines para verbalização.
 * Downstream only — não altera Router, Routing, Contracts ou Decision Engine.
 */

export const TONE_PROFILES = Object.freeze({
  NEUTRAL_DEFAULT: "NEUTRAL_DEFAULT",
  INFORMAL_LIGHT: "INFORMAL_LIGHT",
  INFORMAL_HIGH: "INFORMAL_HIGH",
  FORMAL_POLITE: "FORMAL_POLITE",
  TECHNICAL: "TECHNICAL",
  LAYPERSON: "LAYPERSON",
  ANXIOUS_ANTI_REGRET: "ANXIOUS_ANTI_REGRET",
  RUSHED: "RUSHED",
  IRRITATED: "IRRITATED",
});

const FORBIDDEN_GLOBAL = Object.freeze([
  "parça",
  "parca",
  "mano kkk",
  "kkkk",
  "slk",
  "seloko",
  "crl",
  "krl",
  "pqp",
  "caralho",
  "porra",
  "vendedor",
  "influencer",
  "compra logo",
  "garanto 100",
]);

const VULGARITY_PATTERN =
  /\b(crl|krl|pqp|caralho|carai|porra|cacete|fdp|bct|pnc|merda|puto|puta)\b/i;

const FORCED_SLANG_PATTERN =
  /\b(parça|parca|slk|seloko|coe mano|koe mano|brabo demais|top demais slk)\b/i;

const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u;

function baseNormalize(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text, patterns = []) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return list.some((p) => (typeof p === "string" ? text.includes(p) : p.test(text)));
}

function countEmojis(text = "") {
  const matches = String(text || "").match(new RegExp(EMOJI_PATTERN.source, "gu"));
  return matches ? matches.length : 0;
}

function detectFormalPolite(original = "", normalized = "") {
  const o = baseNormalize(original);
  const n = normalized || o;
  return hasAny(n, [
    /\bpor favor\b/,
    /\bgostaria de\b/,
    /\bgostaria de saber\b/,
    /\bpoderia me\b/,
    /\bpoderia\b/,
    /\bteria como explicar\b/,
    /\btenho uma duvida\b/,
    /\bprezado\b/,
    /\bcordialmente\b/,
    /\bsolicito\b/,
  ]) || hasAny(o, [/por favor/i, /gostaria/i, /poderia/i]);
}

function detectInformalHigh(original = "", normalized = "", appliedNormalizations = []) {
  const o = baseNormalize(original);
  const tags = Array.isArray(appliedNormalizations) ? appliedNormalizations.join(" ") : "";
  const wordCount = o.split(/\s+/).filter(Boolean).length;

  if (
    VULGARITY_PATTERN.test(o) ||
    hasAny(o, [/\bslk\b/, /\bkoe\b/, /\bcoe\b/, /\bseloko\b/, /\bce loko\b/, /\bpqp\b/, /\bkrl\b/]) ||
    /compound:profanity|token:slk|phrase:ce_loko|phrase:seloko/.test(tags)
  ) {
    return true;
  }

  if (hasAny(o, [/\bvish\b/, /\beita\b/, /\boxe\b/, /\buai\b/, /\brapaz\b/, /\bdoidera\b/])) {
    return true;
  }

  if (/\bkoe\b/.test(o) && /\bmano\b/.test(o)) return true;

  if (/\bkkkk\b/.test(o) && hasAny(o, [/\bslk\b/, /\bmano\b/, /\bcrl\b/, /\bkrl\b/])) {
    return true;
  }

  if (/\bq fita\b/.test(o) && wordCount > 2) return true;

  return false;
}

function detectInformalLight(original = "", normalized = "", appliedNormalizations = []) {
  const o = baseNormalize(original);
  const n = normalized || o;
  const tags = Array.isArray(appliedNormalizations) ? appliedNormalizations.join(" ") : "";
  return (
    hasAny(n, [
      /\bblz\b/,
      /\bvaleu\b/,
      /\bfala ai\b/,
      /\bvoce acha que\b/,
      /\bsei la\b/,
      /\btambem\b/,
      /\bagora\b/,
      /\bmesmo\b/,
    ]) ||
    hasAny(o, [
      /\bvc\b/,
      /\bvlw\b/,
      /\bblz\b/,
      /\btmj\b/,
      /\bfala ai\b/,
      /\bqual a boa\b/,
      /\bq fita\b/,
      /\bdemorou\b/,
      /\bfechow\b/,
    ]) ||
    /abbrev:|informal:/.test(tags)
  );
}

function detectTechnical(normalized = "") {
  return hasAny(normalized, [
    /\btecnicamente\b/,
    /\bbenchmark\b/,
    /\blatencia\b/,
    /\blatência\b/,
    /\bchipset\b/,
    /\bfps\b/,
    /\bnvme\b/,
    /\bdesempenho bruto\b/,
    /\bprocessador\b/,
    /\bclock\b/,
    /\btdp\b/,
    /\bips\b/,
    /\bhz\b/,
  ]);
}

function detectLayperson(normalized = "") {
  return hasAny(normalized, [
    /\bsou leigo\b/,
    /\bnao entendo\b/,
    /\bnao entendo muito\b/,
    /\bnao manjo\b/,
    /\bnao sei nada\b/,
    /\bexplica simples\b/,
    /\bexplica facil\b/,
    /\bnao entendo nada\b/,
    /\bnao entendesse nada\b/,
    /\bcomo se eu nao entendesse\b/,
    /\bzero conhecimento\b/,
  ]);
}

function detectAnxious(normalized = "", conversationAct = "", turnType = "") {
  if (conversationAct === "anti_regret") return true;
  return (
    hasAny(normalized, [
      /\btenho medo\b/,
      /\btenho muito medo\b/,
      /\bestou insegur\w*\b/,
      /\bmedo de errar\b/,
      /\bmedo d errar\b/,
      /\bnao quero me arrepender\b/,
      /\bdor de cabeca\b/,
      /\bto com receio\b/,
      /\btenho receio\b/,
      /\bnao quero errar\b/,
      /\bescolha tranquila\b/,
      /\barrepender\b/,
      /\barrependimento\b/,
      /\bevitar arrependimento\b/,
      /\bvou me arrepender\b/,
      /\bcomprar sem medo\b/,
    ]) ||
    (turnType === "OBJECTION" &&
      hasAny(normalized, [/\bmedo\b/, /\barrepender\b/, /\breceio\b/, /\bdor de cabeca\b/]))
  );
}

function detectRushed(normalized = "") {
  return hasAny(normalized, [
    /\brapido\b/,
    /\b rápido\b/,
    /\bsem enrolar\b/,
    /\bdireto ao ponto\b/,
    /\bme responde curto\b/,
    /\bresposta curta\b/,
    /\burgente\b/,
    /\bagora mesmo\b/,
    /\bdireto\b/,
  ]);
}

function detectIrritated(original = "", normalized = "") {
  const o = baseNormalize(original);
  const n = normalized || o;
  return hasAny(n, [
    /\bque saco\b/,
    /\bisso ta me irritando\b/,
    /\bcomplicado demais\b/,
    /\bestou puto\b/,
    /\bto puto\b/,
    /\bnada presta\b/,
    /\bestou irritad\w*\b/,
    /\bque merda\b/,
    /\bnao aguento\b/,
  ]) || VULGARITY_PATTERN.test(o);
}

function buildProfileLevels(toneProfile) {
  const map = {
    [TONE_PROFILES.NEUTRAL_DEFAULT]: {
      formalityLevel: "neutral",
      warmthLevel: "medium",
      brevityLevel: "medium",
      technicalLevel: "medium",
      emotionalSupportLevel: "medium",
      shouldUseEmoji: false,
    },
    [TONE_PROFILES.INFORMAL_LIGHT]: {
      formalityLevel: "low",
      warmthLevel: "medium_high",
      brevityLevel: "medium",
      technicalLevel: "medium",
      emotionalSupportLevel: "medium",
      shouldUseEmoji: false,
    },
    [TONE_PROFILES.INFORMAL_HIGH]: {
      formalityLevel: "low",
      warmthLevel: "high",
      brevityLevel: "medium",
      technicalLevel: "low",
      emotionalSupportLevel: "medium_high",
      shouldUseEmoji: false,
    },
    [TONE_PROFILES.FORMAL_POLITE]: {
      formalityLevel: "high",
      warmthLevel: "medium",
      brevityLevel: "medium",
      technicalLevel: "medium",
      emotionalSupportLevel: "medium",
      shouldUseEmoji: false,
    },
    [TONE_PROFILES.TECHNICAL]: {
      formalityLevel: "medium_high",
      warmthLevel: "low",
      brevityLevel: "medium",
      technicalLevel: "high",
      emotionalSupportLevel: "low",
      shouldUseEmoji: false,
    },
    [TONE_PROFILES.LAYPERSON]: {
      formalityLevel: "medium",
      warmthLevel: "high",
      brevityLevel: "medium",
      technicalLevel: "low",
      emotionalSupportLevel: "medium_high",
      shouldUseEmoji: false,
    },
    [TONE_PROFILES.ANXIOUS_ANTI_REGRET]: {
      formalityLevel: "medium",
      warmthLevel: "high",
      brevityLevel: "medium",
      technicalLevel: "low",
      emotionalSupportLevel: "high",
      shouldUseEmoji: false,
    },
    [TONE_PROFILES.RUSHED]: {
      formalityLevel: "medium",
      warmthLevel: "medium",
      brevityLevel: "high",
      technicalLevel: "medium",
      emotionalSupportLevel: "low",
      shouldUseEmoji: false,
    },
    [TONE_PROFILES.IRRITATED]: {
      formalityLevel: "medium_high",
      warmthLevel: "medium",
      brevityLevel: "high",
      technicalLevel: "medium",
      emotionalSupportLevel: "medium_high",
      shouldUseEmoji: false,
    },
  };
  return map[toneProfile] || map[TONE_PROFILES.NEUTRAL_DEFAULT];
}

function buildForbiddenStyle(toneProfile, responsePathHint = "") {
  const base = [...FORBIDDEN_GLOBAL];
  if (toneProfile !== TONE_PROFILES.INFORMAL_LIGHT && toneProfile !== TONE_PROFILES.INFORMAL_HIGH) {
    base.push("mano", "parça", "parca", "beleza demais");
  }
  if (
    toneProfile === TONE_PROFILES.FORMAL_POLITE ||
    toneProfile === TONE_PROFILES.TECHNICAL ||
    toneProfile === TONE_PROFILES.ANXIOUS_ANTI_REGRET ||
    toneProfile === TONE_PROFILES.IRRITATED
  ) {
    base.push("emoji", "kkk", "rsrs");
  }
  if (String(responsePathHint).includes("anti_regret")) {
    base.push("compra agora", "vai fundo", "pode ir sem medo absoluto");
  }
  return [...new Set(base)];
}

function buildToneInstructions(toneProfile, levels) {
  const common = [
    "Mantenha autoridade, clareza e confiança.",
    "Nunca copie palavrão, gíria pesada ou risada do usuário.",
    "Não mude decisão, ranking, winner nem recomendação.",
  ];

  const byProfile = {
    [TONE_PROFILES.NEUTRAL_DEFAULT]: [
      "Tom claro, direto e humano.",
      "Evite rigidez corporativa e evite exagero casual.",
    ],
    [TONE_PROFILES.INFORMAL_LIGHT]: [
      "Tom um pouco mais natural e leve, sem parecer adolescente.",
      "Pode soar conversacional, mas continue confiável.",
    ],
    [TONE_PROFILES.INFORMAL_HIGH]: [
      "Tom acolhedor e simples, reconhecendo informalidade sem imitar gírias.",
      "Seja direta e humana; não imite vocativos informais nem palavrão.",
    ],
    [TONE_PROFILES.FORMAL_POLITE]: [
      "Tom profissional, respeitoso e calmo.",
      "Evite gírias, abreviações e emoji.",
    ],
    [TONE_PROFILES.TECHNICAL]: [
      "Tom objetivo com termos técnicos leves quando úteis.",
      "Não simplifique demais nem infantilize.",
    ],
    [TONE_PROFILES.LAYPERSON]: [
      "Explique de forma simples, sem jargão.",
      "Use consequências práticas do dia a dia.",
    ],
    [TONE_PROFILES.ANXIOUS_ANTI_REGRET]: [
      "Tom acolhedor e seguro, sem pressionar compra.",
      "Reconheça a preocupação e mantenha tradeoffs honestos.",
    ],
    [TONE_PROFILES.RUSHED]: [
      "Resposta curta e objetiva, sem textão.",
      "Vá direto ao ponto principal.",
    ],
    [TONE_PROFILES.IRRITATED]: [
      "Tom calmo, firme e não defensivo.",
      "Não ironize, não copie palavrão, não responda seco demais.",
    ],
  };

  const lengthHint =
    levels.brevityLevel === "high"
      ? "Prefira 1-2 frases curtas."
      : levels.warmthLevel === "high"
        ? "Pode usar 2-3 frases com acolhimento moderado."
        : "Prefira 2-3 frases claras.";

  return [...common, ...(byProfile[toneProfile] || byProfile[TONE_PROFILES.NEUTRAL_DEFAULT]), lengthHint];
}

/**
 * @param {{
 *   originalMessage?: string,
 *   normalizedMessage?: string,
 *   appliedNormalizations?: string[],
 *   turnType?: string,
 *   conversationAct?: string,
 *   responsePathHint?: string
 * }} input
 */
export function deriveConversationalToneProfile(input = {}) {
  const originalMessage = String(input.originalMessage || "");
  const normalizedMessage = baseNormalize(
    input.normalizedMessage || originalMessage
  );
  const appliedNormalizations = input.appliedNormalizations || [];
  const conversationAct = String(input.conversationAct || "");
  const turnType = String(input.turnType || "");
  const responsePathHint = String(input.responsePathHint || "");

  let toneProfile = TONE_PROFILES.NEUTRAL_DEFAULT;

  if (detectIrritated(originalMessage, normalizedMessage)) {
    toneProfile = TONE_PROFILES.IRRITATED;
  } else if (detectAnxious(normalizedMessage, conversationAct, turnType)) {
    toneProfile = TONE_PROFILES.ANXIOUS_ANTI_REGRET;
  } else if (detectLayperson(normalizedMessage)) {
    toneProfile = TONE_PROFILES.LAYPERSON;
  } else if (detectFormalPolite(originalMessage, normalizedMessage)) {
    toneProfile = TONE_PROFILES.FORMAL_POLITE;
  } else if (detectTechnical(normalizedMessage)) {
    toneProfile = TONE_PROFILES.TECHNICAL;
  } else if (detectRushed(normalizedMessage)) {
    toneProfile = TONE_PROFILES.RUSHED;
  } else if (detectInformalHigh(originalMessage, normalizedMessage, appliedNormalizations)) {
    toneProfile = TONE_PROFILES.INFORMAL_HIGH;
  } else if (detectInformalLight(originalMessage, normalizedMessage, appliedNormalizations)) {
    toneProfile = TONE_PROFILES.INFORMAL_LIGHT;
  }

  const levels = buildProfileLevels(toneProfile);
  const forbiddenStyle = buildForbiddenStyle(toneProfile, responsePathHint);
  const toneInstructions = buildToneInstructions(toneProfile, levels);

  const allowEmoji =
    levels.shouldUseEmoji &&
    ![
      TONE_PROFILES.TECHNICAL,
      TONE_PROFILES.ANXIOUS_ANTI_REGRET,
      TONE_PROFILES.IRRITATED,
      TONE_PROFILES.FORMAL_POLITE,
    ].includes(toneProfile) &&
    !String(responsePathHint).includes("anti_regret");

  return {
    toneProfile,
    formalityLevel: levels.formalityLevel,
    warmthLevel: levels.warmthLevel,
    brevityLevel: levels.brevityLevel,
    technicalLevel: levels.technicalLevel,
    emotionalSupportLevel: levels.emotionalSupportLevel,
    shouldUseEmoji: allowEmoji,
    forbiddenStyle,
    toneInstructions,
  };
}

export function buildToneAdaptationPromptSection(toneProfileResult = null) {
  if (!toneProfileResult?.toneProfile) return "";

  const lines = [
    "Adaptação de tom deste turno (somente estilo — não altere decisão):",
    `• Perfil: ${toneProfileResult.toneProfile}`,
    `• Formalidade: ${toneProfileResult.formalityLevel}`,
    `• Objetividade: ${toneProfileResult.brevityLevel}`,
    `• Suporte emocional: ${toneProfileResult.emotionalSupportLevel}`,
  ];

  if (toneProfileResult.shouldUseEmoji) {
    lines.push("• Emoji: no máximo 1 emoji leve, só se couber naturalmente.");
  } else {
    lines.push("• Emoji: não usar.");
  }

  lines.push("• Regras:");
  toneProfileResult.toneInstructions.forEach((rule) => lines.push(`  - ${rule}`));
  lines.push(`• Nunca use: ${toneProfileResult.forbiddenStyle.slice(0, 8).join(", ")}`);

  return `\n${lines.join("\n")}\n`;
}

export function detectStyleLeaks(text = "", toneProfileResult = null) {
  const leaks = [];
  const t = String(text || "");
  const lower = t.toLowerCase();

  if (VULGARITY_PATTERN.test(lower)) leaks.push("vulgarityLeak");
  if (FORCED_SLANG_PATTERN.test(lower)) leaks.push("forcedSlangLeak");

  const emojiCount = countEmojis(t);
  if (emojiCount > 1) leaks.push("emojiLeak");
  if (
    emojiCount > 0 &&
    toneProfileResult &&
    !toneProfileResult.shouldUseEmoji
  ) {
    leaks.push("emojiMisuse");
  }

  if (toneProfileResult?.forbiddenStyle) {
    for (const forbidden of toneProfileResult.forbiddenStyle) {
      if (forbidden === "emoji") continue;
      if (forbidden.length >= 4 && lower.includes(forbidden.toLowerCase())) {
        leaks.push(`forbidden:${forbidden}`);
      }
    }
  }

  return [...new Set(leaks)];
}

export function validateResponseStyleAgainstTone(text = "", toneProfileResult = null) {
  const leaks = detectStyleLeaks(text, toneProfileResult);
  return {
    ok: leaks.length === 0,
    leaks,
  };
}
