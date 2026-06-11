/**
 * MIA Unknown Product Correction Audit
 *
 * PATCH 5.3C — Auditoria do guard anti-alucinação.
 *
 * Módulo diagnóstico puro. NÃO altera comportamento, resposta, guard
 * nem nenhuma lógica decisória. Apenas explica POR QUE o guard disparou.
 *
 * Responde:
 *  1. Qual sentença da resposta ativou o guard.
 *  2. Qual produto/trecho foi detectado como desconhecido.
 *  3. Quais produtos eram permitidos no contexto.
 *  4. Se a menção é provavelmente falso positivo (alias do âncora ou spec técnica).
 */

// ─────────────────────────────────────────────────────────────
// Constantes internas (espelho do guard — somente leitura)
// ─────────────────────────────────────────────────────────────

// Mesmo regex usado pelo responseMentionsUnknownProduct.
// Reproduzido aqui SOMENTE para diagnóstico — nunca altera o guard.
// PATCH 5.3F — \b ao redor de toda a alternância para evitar substring match
// em palavras comuns como "algo" (→ "lg"), "monitoramento" (→ "monitor"), etc.
const SUSPICIOUS_PRODUCT_WORDS_REGEX =
  /\b(samsung|galaxy|redmi|realme|motorola|moto|iphone|infinix|xiaomi|poco|lg|philco|brastemp|electrolux|consul|notebook|monitor|ps5|xbox|playstation|macbook|[a-z]{1,5}\s?\d{1,4})\b/i;

// PATCH 5.3D — Espelho da safe-list técnica (para manter audit preciso)
// Deve permanecer em sync com _TECH_SPEC_SAFE_REGEX em chat-gpt4o.js.
const _AUDIT_TECH_SPEC_SAFE_REGEX =
  /^(a1[4-9]|ios\s?\d{1,2}|android\s?\d{1,2}|wifi\s?[5-7]e?|wi-fi\s?[5-7]e?)$/i;

function _isSafelyTechnicalSpecMatch(match) {
  return _AUDIT_TECH_SPEC_SAFE_REGEX.test(String(match || "").trim());
}

// ─────────────────────────────────────────────────────────────
// Helpers internos de normalização (sem importar do monólito)
// ─────────────────────────────────────────────────────────────

function _normalizeKey(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _getFamilyKey(title = "") {
  const t = _normalizeKey(title)
    .replace(/\b(4g|5g|128gb|256gb|512gb|1tb|2gb|3gb|4gb|6gb|8gb|12gb|16gb|32gb|ram|rom|bateria|mah|hz|android|dual|chip|cor|rosa|azul|preto|cinza|verde|branco|lacrado|novo|original)\b/g, " ")
    .replace(/\b(de|da|do|com|sem|para|por|e|a|o|os|as)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const knownPatterns = [
    /(motorola\s+)?moto\s+g\d+/,
    /realme\s+note\s+\d+/,
    /galaxy\s+a\d+/,
    /samsung\s+galaxy\s+a\d+/,
    /samsung\s+a\s?\d+/,
    /redmi\s+note\s+\d+(\s+pro)?/,
    /infinix\s+hot\s+\d+\w*/,
    /iphone\s+\d+(\s+pro|\s+plus|\s+pro max)?/,
    /poco\s+\w+\d*/,
    /ps5/,
    /xbox\s+series\s+[sx]/,
    /macbook\s+\w+/,
  ];

  for (const pattern of knownPatterns) {
    const match = t.match(pattern);
    if (match?.[0]) return match[0].trim();
  }

  return t.split(" ").slice(0, 5).join(" ").trim();
}

// ─────────────────────────────────────────────────────────────
// Espelho do isDecisionRedirectSentence (PATCH 5.4C)
// Reproduzido aqui para diagnóstico — sincronizar com chat-gpt4o.js.
// ─────────────────────────────────────────────────────────────

/**
 * Espelho de isDecisionRedirectSentence.
 * Retorna true quando a sentença tenta redirecionar a decisão para outro produto.
 * Retorna false para menções contextuais que não alteram a decisão.
 * PATCH 5.4C — separação de intenção de redirecionamento vs menção contextual.
 */
function _mirrorIsDecisionRedirect(sentence) {
  const s = _normalizeKey(String(sentence || ""));
  if (!s) return false;

  if (/\b(recomendo|recomendaria|recomende|indico|indicaria|sugiro|sugeriria)\b/.test(s)) return true;
  if (/\b(troque|trocaria|trocar (por|pelo|pela|pra|pro)|mudar (para|pro|pra)|mudaria (para|pro|pra))\b/.test(s)) return true;
  if (/\b(pegue|compre|prefira|opte por|fique com|va de)\b/.test(s)) return true;
  if (/\beu (compraria|escolheria|pegaria|trocaria|ficaria (com|no|na))\b/.test(s)) return true;
  if (/\b(a melhor (escolha|opcao|alternativa) (seria|e))\b/.test(s)) return true;
  if (/\b(o ideal (seria|e)|minha (escolha|indicacao) (seria|e))\b/.test(s)) return true;
  if (/\b(poderia (considerar|optar|experimentar))\b/.test(s)) return true;
  if (/\bvale mais (pegar|comprar)\b/.test(s)) return true;

  if (/\b(seria|e) ([\w]+ ){0,3}(opcao|alternativa|escolha)\b/.test(s)) return true;

  if (/\b(e|seria) (melhor|superior|mais indicad[ao]|mais adequad[ao])\b/.test(s)) {
    const preservesCurrentWinner =
      /\b(nao muda|mas nao|mas isso nao|continua (sendo)?|permanece|nao e necessario|nao precisa)\b/.test(s);
    if (!preservesCurrentWinner) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// Detector de sentenças suspeitas (somente para diagnóstico)
// ─────────────────────────────────────────────────────────────

/**
 * Encontra as sentenças que teriam disparado o guard, e por quê.
 * Espelha exatamente a lógica de responseMentionsUnknownProduct (PATCH 5.4C).
 * NÃO altera nada — apenas lê e relata.
 *
 * @param {string} reply
 * @param {Array}  allowedProducts
 * @returns {{ triggeredSentences, contextualMentions, allowedKeys, allowedFamilyKeys }}
 */
function _detectTriggeringSentences(reply = "", allowedProducts = []) {
  if (!reply || !Array.isArray(allowedProducts) || allowedProducts.length === 0) {
    return { triggeredSentences: [], allowedKeys: [], allowedFamilyKeys: [] };
  }

  const allowedKeys = allowedProducts
    .map((p) => _normalizeKey(p.product_name || ""))
    .filter(Boolean);

  const allowedFamilyKeys = allowedProducts
    .map((p) => _getFamilyKey(p.product_name || ""))
    .filter(Boolean);

  // PATCH 5.3E — espelho do short key check do guard
  const allowedShortKeys = allowedProducts
    .map((p) => {
      const words = _getFamilyKey(p.product_name || "").split(" ");
      const short = words.slice(0, 2).join(" ");
      return (words.length >= 2 && short.length >= 6) ? short : null;
    })
    .filter(Boolean);

  const sentences = String(reply)
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const triggeredSentences = [];
  const contextualMentions = [];  // PATCH 5.4C: menções permitidas por serem contextuais

  for (const sentence of sentences) {
    if (!SUSPICIOUS_PRODUCT_WORDS_REGEX.test(sentence)) continue;

    const sentenceKey = _normalizeKey(sentence);

    const mentionsAllowed =
      allowedKeys.some((key) => sentenceKey.includes(key) || key.includes(sentenceKey)) ||
      allowedFamilyKeys.some((key) => sentenceKey.includes(key)) ||
      allowedShortKeys.some((key) => sentenceKey.includes(key)); // PATCH 5.3E

    if (!mentionsAllowed) {
      // Extrai o(s) trecho(s) suspeito(s) que dispararam o regex
      const suspectedMatches = [];
      const regexGlobal = new RegExp(SUSPICIOUS_PRODUCT_WORDS_REGEX.source, "gi");
      let m;
      while ((m = regexGlobal.exec(sentence)) !== null) {
        suspectedMatches.push(m[0]);
      }

      // PATCH 5.3D — Espelha o comportamento do guard: se todos os matches
      // são specs técnicas seguras, a sentença não teria disparado o guard.
      if (suspectedMatches.length > 0 && suspectedMatches.every(_isSafelyTechnicalSpecMatch)) {
        continue;
      }

      // PATCH 5.4C — Espelha o check de intenção de redirecionamento.
      // Sentença com produto desconhecido mas SEM linguagem de redirecionamento
      // é menção contextual — registrar em contextualMentions, não em triggeredSentences.
      if (!_mirrorIsDecisionRedirect(sentence)) {
        contextualMentions.push({
          sentence: sentence.slice(0, 120),
          suspectedMatches,
          sentenceKeyPreview: sentenceKey.slice(0, 80),
          reason: "contextual_mention_no_redirect_signal",
        });
        continue;
      }

      triggeredSentences.push({
        sentence: sentence.slice(0, 120),
        suspectedMatches,
        sentenceKeyPreview: sentenceKey.slice(0, 80),
        isDecisionRedirect: true,
      });
    }
  }

  return { triggeredSentences, contextualMentions, allowedKeys, allowedFamilyKeys };
}

// ─────────────────────────────────────────────────────────────
// Detector de falso positivo
// ─────────────────────────────────────────────────────────────

/**
 * Heurística diagnóstica: tenta determinar se o disparo é falso positivo.
 *
 * Casos de falso positivo mais comuns:
 *  - Chip/processador mencionado (A15, Dimensity 7050, Snapdragon, etc.)
 *  - Especificação técnica (4G, 5G, A55 como referência a chip, não produto)
 *  - Alias do produto âncora (o LLM usou nome curto que o regex não reconheceu)
 *
 * @param {Array}  triggeredSentences
 * @param {object} anchorProduct
 * @param {Array}  allowedFamilyKeys
 * @returns {{ likelyFalsePositive, reason }}
 */
function _assessFalsePositive(triggeredSentences, anchorProduct, allowedFamilyKeys) {
  if (!triggeredSentences.length) {
    return { likelyFalsePositive: false, reason: "no_trigger" };
  }

  const anchorFamilyKey = anchorProduct?.product_name
    ? _getFamilyKey(anchorProduct.product_name)
    : "";

  // Padrões que costumam ser falsos positivos:
  // chips (A15, Dimensity, Snapdragon), siglas de conectividade (4G, 5G, WiFi 6E),
  // versões de SO (Android 14, iOS 17), codecs (H265, HEVC)
  const knownTechSpecPatterns = /\b(a\d{2}|dimensity|snapdragon|helio|exynos|mediatek|adreno|mali|ios\s?\d+|android\s?\d+|wifi\s?6|wi-fi\s?6|h265|hevc|av1|4g|5g)\b/i;

  for (const { suspectedMatches, sentenceKeyPreview } of triggeredSentences) {
    // Verifica se a SENTENÇA contém a família completa do produto âncora
    // (usa sentenceKeyPreview para evitar falso positivo por coincidência de marca)
    if (anchorFamilyKey && sentenceKeyPreview.includes(anchorFamilyKey)) {
      return {
        likelyFalsePositive: true,
        reason: "suspected_anchor_alias",
      };
    }

    // Verifica se a menção suspeita é um padrão técnico conhecido
    for (const match of suspectedMatches) {
      if (knownTechSpecPatterns.test(match)) {
        return {
          likelyFalsePositive: true,
          reason: "tech_spec_or_chip_name",
        };
      }
    }

    // Verifica se a sentença contém a família COMPLETA de produto permitido
    if (allowedFamilyKeys.some((fk) => sentenceKeyPreview.includes(fk))) {
      return {
        likelyFalsePositive: true,
        reason: "allowed_product_family_present_in_sentence",
      };
    }
  }

  return {
    likelyFalsePositive: false,
    reason: "genuine_unknown_product_mention",
  };
}

// ─────────────────────────────────────────────────────────────
// Construtor de auditoria (função pura, testável)
// ─────────────────────────────────────────────────────────────

/**
 * Monta o objeto de auditoria do guard anti-alucinação.
 *
 * Função pura — não produz side effects, não altera reply nem guard,
 * nunca retorna null.
 *
 * @param {object} input
 * @param {string}  [input.rawReply]                    — texto bruto antes da correção
 * @param {string}  [input.correctedReply]               — texto após a correção
 * @param {Array}   [input.allowedProducts]              — _guardAllowedProducts (já com autoridade)
 * @param {object}  [input.anchorProduct]                — lastBestProduct
 * @param {boolean} [input.richExplanationActive]        — se rich path estava ativo
 * @param {string}  [input.contextModeSelected]          — "explanation_anchored" etc.
 * @param {Array}   [input.decisionAuthorityProducts]    — PATCH 5.3E: winners/anchors adicionados
 * @param {boolean} [input.authorityInclusionApplied]    — PATCH 5.3E: se a inclusão foi aplicada
 * @returns {object} audit snapshot
 */
export function buildUnknownProductCorrectionAudit(input = {}) {
  const safeInput = (input && typeof input === "object") ? input : {};
  const {
    rawReply = "",
    correctedReply = "",
    allowedProducts = [],
    anchorProduct = null,
    richExplanationActive = false,
    contextModeSelected = "unknown",
    decisionAuthorityProducts = [],          // PATCH 5.3E
    authorityInclusionApplied = false,       // PATCH 5.3E
  } = safeInput;

  const { triggeredSentences, contextualMentions, allowedKeys, allowedFamilyKeys } =
    _detectTriggeringSentences(rawReply, allowedProducts);

  const { likelyFalsePositive, reason: fpReason } =
    _assessFalsePositive(triggeredSentences, anchorProduct, allowedFamilyKeys);

  // PATCH 5.4C — campos de intenção de redirecionamento
  const decisionRedirectDetected = triggeredSentences.length > 0;
  const contextualMentionAllowed = Array.isArray(contextualMentions) && contextualMentions.length > 0;
  const guardIntentMode = decisionRedirectDetected
    ? "decision_redirect"
    : contextualMentionAllowed
    ? "contextual_mention_allowed"
    : "no_unknown_mention";

  // ── Flags ──────────────────────────────────────────────────
  const flags = [];

  flags.push("UNKNOWN_PRODUCT_CORRECTION_APPLIED");

  if (richExplanationActive) {
    flags.push("RICH_EXPLANATION_WAS_ACTIVE");
    flags.push("CORRECTION_OVERRODE_RICH_EXPLANATION");
  }

  if (anchorProduct?.product_name) {
    flags.push("ANCHOR_PRESENT");
  }

  // PATCH 5.3E — flags de autoridade da decisão
  if (authorityInclusionApplied) {
    flags.push("AUTHORITY_INCLUSION_APPLIED");
  }
  if (
    anchorProduct?.product_name &&
    Array.isArray(allowedProducts) &&
    allowedProducts.some((p) => p.product_name === anchorProduct.product_name)
  ) {
    flags.push("ANCHOR_INCLUDED_IN_ALLOWED");
  }

  if (triggeredSentences.length > 0) {
    const anchorFamilyKey = anchorProduct?.product_name
      ? _getFamilyKey(anchorProduct.product_name)
      : "";

    // Usa sentenceKeyPreview completo para evitar falso positivo por coincidência de marca
    const hasAnchorAlias = anchorFamilyKey
      ? triggeredSentences.some(({ sentenceKeyPreview }) =>
          sentenceKeyPreview.includes(anchorFamilyKey)
        )
      : false;

    const hasAllowedAlias = !hasAnchorAlias && triggeredSentences.some(({ sentenceKeyPreview }) =>
      allowedFamilyKeys.some((fk) => sentenceKeyPreview.includes(fk))
    );

    if (hasAnchorAlias) {
      flags.push("UNKNOWN_MENTION_IS_ANCHOR_ALIAS");
    } else if (hasAllowedAlias) {
      flags.push("UNKNOWN_MENTION_IS_ALLOWED_PRODUCT_ALIAS");
    } else {
      flags.push("UNKNOWN_MENTION_NOT_IN_ALLOWED_PRODUCTS");
    }

    // PATCH 5.4C — flag de redirecionamento de decisão confirmado
    flags.push("DECISION_REDIRECT_DETECTED");
    flags.push("UNKNOWN_MENTION_RECOMMENDATION_REDIRECT");
  } else {
    flags.push("NO_UNKNOWN_MENTION_DETAILS_AVAILABLE");
  }

  // PATCH 5.4C — flag de menção contextual permitida
  if (contextualMentionAllowed) {
    flags.push("CONTEXTUAL_UNKNOWN_MENTION_ALLOWED");
    flags.push("UNKNOWN_MENTION_CONTEXTUAL");
  }

  const _safeAuthorityProducts = Array.isArray(decisionAuthorityProducts) ? decisionAuthorityProducts : [];

  return {
    auditVersion: "5.3C",
    correctionApplied: true,
    richExplanationActive,
    contextModeSelected,
    // ── Produtos ─────────────────────────────────────────────
    anchorProduct: anchorProduct?.product_name || null,
    allowedProducts: allowedProducts
      .map((p) => p.product_name || "")
      .filter(Boolean)
      .slice(0, 10),
    allowedFamilyKeysPreview: allowedFamilyKeys.slice(0, 10),
    // ── Autoridade da decisão (PATCH 5.3E) ───────────────────
    decisionAuthorityProducts: _safeAuthorityProducts
      .map((p) => p.product_name || "")
      .filter(Boolean),
    anchorIncluded: !!(
      anchorProduct?.product_name &&
      Array.isArray(allowedProducts) &&
      allowedProducts.some((p) => p.product_name === anchorProduct.product_name)
    ),
    winnerIncluded: _safeAuthorityProducts.length > 0 &&
      _safeAuthorityProducts.every((ap) =>
        Array.isArray(allowedProducts) &&
        allowedProducts.some((p) => p.product_name === ap.product_name)
      ),
    authorityInclusionApplied,
    // ── Resposta ─────────────────────────────────────────────
    rawReplyPreview: rawReply ? String(rawReply).slice(0, 200) : null,
    correctedReplyPreview: correctedReply ? String(correctedReply).slice(0, 120) : null,
    // ── Diagnóstico do disparo ────────────────────────────────
    suspectedUnknownMentions: triggeredSentences.map((s) => ({
      sentencePreview: s.sentence.slice(0, 80),
      matches: s.suspectedMatches.slice(0, 5),
    })),
    triggerCount: triggeredSentences.length,
    detectionReason: triggeredSentences.length > 0
      ? `${triggeredSentences.length} sentence(s) mentioned suspicious product words not in allowedProducts`
      : "trigger_details_not_available",
    // ── Avaliação de falso positivo ───────────────────────────
    likelyFalsePositive,
    falsePositiveReason: fpReason,
    // ── PATCH 5.4C — intenção de redirecionamento ─────────────
    guardIntentMode,
    decisionRedirectDetected,
    contextualMentionAllowed,
    contextualMentions: (contextualMentions || []).map((s) => ({
      sentencePreview: s.sentence.slice(0, 80),
      matches: s.suspectedMatches.slice(0, 5),
      reason: s.reason,
    })),
    // ── Flags ─────────────────────────────────────────────────
    flags,
  };
}

// ─────────────────────────────────────────────────────────────
// Logger (side effect — usar apenas em handlers)
// ─────────────────────────────────────────────────────────────

/**
 * Registra o audit snapshot do guard anti-alucinação.
 * Deve ser chamado SOMENTE quando process.env.MIA_DEBUG === "true".
 *
 * @param {object} audit — resultado de buildUnknownProductCorrectionAudit
 * @param {object} [pipelineTracer]
 */
export function logUnknownProductCorrectionAudit(audit, pipelineTracer = null) {
  if (!audit) return;

  if (pipelineTracer && typeof pipelineTracer.patch === "function") {
    pipelineTracer.patch({ unknown_product_correction_audit: audit });
  }

  const fpTag = audit.likelyFalsePositive ? "⚠️ LIKELY FALSE POSITIVE" : "🔴 GENUINE TRIGGER";
  const overrideTag = audit.richExplanationActive ? " | OVERRIDES RICH EXPLANATION" : "";

  console.log(
    `[MIA_UNKNOWN_PRODUCT_CORRECTION_AUDIT 5.3C] ${fpTag}${overrideTag}`,
    JSON.stringify({
      anchorProduct: audit.anchorProduct,
      allowedProducts: audit.allowedProducts,
      allowedFamilyKeysPreview: audit.allowedFamilyKeysPreview,
      rawReplyPreview: audit.rawReplyPreview,
      suspectedUnknownMentions: audit.suspectedUnknownMentions,
      likelyFalsePositive: audit.likelyFalsePositive,
      falsePositiveReason: audit.falsePositiveReason,
      flags: audit.flags,
    }, null, 2)
  );
}
