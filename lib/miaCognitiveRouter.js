/**
 * MIA Cognitive Router — Shadow Mode
 *
 * PATCH 5.1A — Observação sem controle de fluxo.
 *
 * Este módulo classifica o tipo cognitivo do turno do usuário.
 * Ele NÃO altera nenhuma decisão, winner, card, ranking ou resposta.
 * Todos os resultados têm `shadowOnly: true`.
 *
 * Princípios (docs/mia_engineering_rules_md_complete.md):
 *   - MIA owns the intelligence. The LLM only verbalizes.
 *   - Cognição explícita, governável, inspetável.
 *   - Sem hardcodes amadores. Sem respostas prontas.
 *   - Determinístico onde possível. LLM-agnostic.
 *
 * Uso no handler (observacional):
 *   const cognitiveTurn = classifyMiaTurn({ query, originalQuery, ... });
 *   pipelineTracer.patch({ cognitive_turn: cognitiveTurn }); // apenas log
 */

import { classifyAboutMiaSubtopics } from "./miaCompanyKnowledge.js";
import { normalizeCompoundInput } from "./miaCompoundInputNormalizer.js";
import { detectsReasoningBreakdownSignal } from "./miaContradictionRecoveryLayer.js";
import { detectsEscalatedUserConfusionDiscourse } from "./miaEscalatedConfusionSignals.js";
import { detectsExplanationBreakdownSignal } from "./miaUserConfusionRecoveryLayer.js";
import { detectsAnchoredComparisonIntent } from "./miaDiscussionSetEnforcement.js";

// ─────────────────────────────────────────────────────────────
// Constantes de tipo de turno
// ─────────────────────────────────────────────────────────────

export const MIA_TURN_TYPES = Object.freeze({
  NEW_SEARCH: "NEW_SEARCH",
  FOLLOW_UP: "FOLLOW_UP",
  REFINEMENT: "REFINEMENT",
  // PATCH 7.5 — Specialization of REFINEMENT: user explicitly requests a
  // ranked position or top-N list. Same routing behavior (preserve anchor),
  // adds formal retrieval metadata (requestedRank / requestedTopN).
  ALTERNATIVE_REQUEST: "ALTERNATIVE_REQUEST",
  COMPARISON: "COMPARISON",
  COMPARISON_FOLLOWUP: "COMPARISON_FOLLOWUP",
  PRIORITY_SHIFT: "PRIORITY_SHIFT",
  REACTION: "REACTION",
  OBJECTION: "OBJECTION",
  EXPLANATION_REQUEST: "EXPLANATION_REQUEST",
  VALUE_QUESTION: "VALUE_QUESTION",
  COMMERCIAL_QUESTION: "COMMERCIAL_QUESTION",
  CONVERSATIONAL: "CONVERSATIONAL",
  CONVERSATIONAL_CONFUSION: "CONVERSATIONAL_CONFUSION",
  ABOUT_MIA: "ABOUT_MIA",
  UNKNOWN: "UNKNOWN",
});

// ─────────────────────────────────────────────────────────────
// Categoria unificada de explicação pós-decisão (PATCH 5.5C)
// Agrupa todos os subtypes que respondem à mesma intenção:
//   "explica/justifica/desafia a recomendação atual"
// turnType externo permanece EXPLANATION_REQUEST.
// ─────────────────────────────────────────────────────────────

export const POST_DECISION_EXPLANATION_CATEGORY = "POST_DECISION_EXPLANATION";

// ─────────────────────────────────────────────────────────────
// Helpers de normalização (independentes, sem importar do monólito)
// ─────────────────────────────────────────────────────────────

function normalize(str = "") {
  const compound = normalizeCompoundInput({ originalMessage: str });
  return compound.normalizedMessage
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/[?!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** PATCH 7.9Z.2A — "ou" in social/emotional compounds ≠ product comparison disjunction. */
function isNonCommercialOuCompound(q) {
  if (!q || !/\bou\b/.test(q)) return false;
  return (
    /\b(fala|falam|gostou|gostam|recomenda|reclama|arrepende|problema|da problema|aprovado|aceito|curte|curtem|sustenta|erro|errar|indica|indicam)\b.*\bou\b/.test(q) ||
    /\bou\b.*\b(fala|falam|gostou|gostam|recomenda|reclama|arrepende|problema|da problema|aprovado|aceito|curte|curtem|erro|errar|indica|indicam)\b/.test(q) ||
    (/\bsera que\b/.test(q) && !/\b(eu vou|vou me arrepender|vou errar|escolhendo errado)\b/.test(q))
  );
}

function hasCommercialComparisonDisjunction(q) {
  if (!q) return false;
  if (/\b(versus|\bvs\b)\b/.test(q)) return true;
  if (/\b(compara|compare|comparando|comparar)\b/.test(q)) return true;
  if (isNonCommercialOuCompound(q)) return false;
  if (/\boutr[oa]\b/.test(q) && /\bou\b/.test(q)) return true;
  if (
    /\b(celular|smartphone|notebook|tv|tablet|monitor|mouse|teclado|iphone|galaxy|produto|modelo|opcao|aparelho)\b.*\bou\b/.test(q)
  ) {
    return true;
  }
  return false;
}

/** PATCH 8.1B.7 — "nao quero" emotional frame ≠ affirmative commercial search. */
function hasAffirmativeCommercialSearchVerb(q) {
  if (!q || !/\b(quero|preciso|busco|buscar|procurar|procurando|me acha|me indica|me recomenda)\b/.test(q)) {
    return false;
  }
  if (!/\bnao quero\b/.test(q)) return true;
  const afterNegated = q.replace(/\bnao quero\b/g, " ").replace(/\s+/g, " ").trim();
  return /\b(quero|preciso|busco|buscar|procurar|procurando|me acha|me indica|me recomenda)\b/.test(afterNegated);
}

/** PATCH 8.1B.7 — product mention as anchored reference, not new-search tail. */
function hasAnchoredProductReferenceFrame(q) {
  if (!q) return false;
  if (
    !/\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung|monitor|mouse|teclado|cadeira|pc|produto|modelo|aparelho|opcao)\b/.test(
      q
    )
  ) {
    return false;
  }
  if (hasExplicitNewCommercialSearchFrame(q)) return false;
  if (hasAffirmativeCommercialSearchVerb(q)) return false;
  return (
    /\b(esse|essa|nesse|nessa|deste|desta|este|esta|isso|o|a|do|da|no|na)\b/.test(q) ||
    /\bnao quero\b/.test(q) ||
    /\b(ta|esta)\s+caro\b/.test(q) ||
    /\bcaro demais\b/.test(q) ||
    /\bmuito caro\b/.test(q)
  );
}

function shouldSuppressCommercialTailForAnchoredReference(q) {
  return hasAnchoredProductReferenceFrame(q);
}

// ─────────────────────────────────────────────────────────────
// Extratores de sinais do turno
// Cada função retorna boolean e é responsável por um sinal
// específico — sem sobreposição intencional.
// ─────────────────────────────────────────────────────────────

function detectsNewSearchSignal(q, { hasActiveAnchor, detectedIntent, contextResolution }) {
  // Sinal explícito via pipeline existente
  if (contextResolution?.mode === "new_search") return true;
  if (detectedIntent === "search" && !hasActiveAnchor) return true;

  // Verbos de busca + produto/categoria sem âncora
  const newSearchVerbs = /\b(quero|busca|procura|recomenda|indica|sugere|mostra|acha|encontra|ve|comprar)\b/;
  const productOrCategorySignal = /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone)\b/;
  const budgetSignal = /\b(ate|até|por|abaixo|menos de)\s+r?\$?\s*\d/;

  if (!hasActiveAnchor) {
    if (newSearchVerbs.test(q) && (productOrCategorySignal.test(q) || budgetSignal.test(q))) return true;
    if (budgetSignal.test(q) && productOrCategorySignal.test(q)) return true;
  }

  return false;
}

function detectsComparisonSignal(q, { contextResolution, detectedIntent, comparisonContext, hasActiveAnchor = false }) {
  if (detectedIntent === "comparison") return true;
  if (contextResolution?.mode === "comparison_early_explicit") return true;

  if (hasActiveAnchor && detectsAnchoredComparisonIntent(q, { hasActiveAnchor: true })) {
    return true;
  }

  const hasOr = /\bou\b/.test(q);
  const hasVs = /\bvs\b|\bversus\b/.test(q);
  // "diferença" só é sinal de comparação quando usada em contexto comparativo
  // (entre dois itens, ou "qual a diferença"). "faz diferença" é sinal de consequência.
  const hasDiff =
    /\b(comparar|compare|compara|comparando)\b/.test(q) ||
    /diferenca entre|diferença entre/.test(q) ||
    /qual (a |)(diferenca|diferença)\b/.test(q);

  return hasOr || hasVs || hasDiff;
}

function detectsComparisonFollowUpSignal(q, { comparisonContext, contextResolution, hasActiveAnchor }) {
  if (contextResolution?.mode === "comparison_context_lock") return true;
  if (contextResolution?.lockedComparisonFollowUp) return true;

  const hasActiveComparison =
    comparisonContext?.locked === true ||
    (Array.isArray(comparisonContext?.products) && comparisonContext.products.length >= 2);

  if (!hasActiveComparison) return false;

  // Follow-up curto dentro de comparação ativa
  const shortQuery = q.length < 60;
  const isAxisQuestion = /\b(bateria|camera|fotos|desempenho|performance|preco|preco|armazenamento|memoria|autonomia|custo)\b/.test(q);
  const isDecisionQuestion =
    /qual.*eu|eu fico|fico com|me decide|veredito|melhor dos dois|qual e melhor|qual dos dois|qual das duas|dos dois|das duas|pegava qual|pegaria qual|se fosse (voce|vc)/.test(q);

  return shortQuery && (isAxisQuestion || isDecisionQuestion);
}

function detectsPriorityShiftSignal(q, { hasActiveAnchor, cso }) {
  if (!hasActiveAnchor) return false;
  // PATCH 7.9Z.3 — explicit new product category ≠ priority shift on current anchor
  if (hasNewSearchProductCategoryBlock(q)) return false;
  if (cso?.conversationalIntent === "priority_change") return true;

  // ── Layer original — mantido intacto para não causar regressão ──────────
  const _origShiftVerbs = /\b(muda|mudar|prioridade|priorizar|foca|focar|agora|na verdade|pensando bem|na real|prefiro|quero mais|mais importante)\b/;
  const _origAxisTerms  = /\b(bateria|camera|fotos|desempenho|performance|preco|armazenamento|durabilidade|leveza|tamanho)\b/;
  if (_origShiftVerbs.test(q) && _origAxisTerms.test(q)) return true;

  // ── PATCH 5.8A — Eixos de prioridade de uso (expandidos) ────────────────
  // Cada termo representa uma família semântica de prioridade, não frases fixas.
  // battery/longevity · camera/media · gaming · work/study · weight · mobility
  const _axisExpanded =
    /\b(bateria|autonomia|carregamento|camera|foto|fotos|fotografar|video|videos|jogo|jogar|games|gaming|game|jogos|gamer|desempenho|performance|processador|trabalho|trabalhar|estudo|estudar|produtividade|leve|leveza|peso|compacto|portatil|portabilidade|durar|dure|durabilidade|anos|resistencia|resistente|mobilidade|viagem|viajar|armazenamento|espaco)\b|fora de casa/;

  // ── PATCH 5.8A — Layer B: Marcadores contextuais/contrastivos ───────────
  // Sinais que revelam contraste ou adição de contexto de uso.
  // "mas eu jogo", "e se for pra durar", "no meu caso uso bastante"
  const _contextualMarkers =
    /\b(mas|so que|ja que|pensando|no meu caso|e se for|e se|pra isso|nesse caso)\b/;

  if (_contextualMarkers.test(q) && _axisExpanded.test(q)) return true;

  // ── PATCH 5.8A — Layer C: Verbos de preferência/necessidade + eixo ───────
  // O usuário expressa diretamente o que precisa/quer/usa.
  // "quero câmera", "preciso de bateria", "uso pra trabalho", "vou usar pra estudar"
  const _preferenceVerbs =
    /\b(prefiro|preciso|quero|uso|vou usar|vou utilizar|dependo|priorizo)\b/;

  if (_preferenceVerbs.test(q) && _axisExpanded.test(q)) return true;

  // ── PATCH 5.8A — Layer D: Revelação direta de caso de uso ───────────────
  // O usuário revela sua atividade/contexto de uso sem marcador explícito.
  // "eu jogo", "jogo bastante", "uso pra trabalho", "vou usar pra estudar"
  // Padrão: eu + verbo de atividade, ou verbo de atividade + intensificador
  const _usageReveal =
    /\b(eu (jogo|jogar|fotografo|filmo|trabalho|estudo|uso|viajo)|jogo muito|jogo bastante|uso pra|uso para|vou usar pra|vou usar para)\b/;

  if (_usageReveal.test(q)) return true;

  // ── PATCH 6.6 — Layer E: Revelação de uso intenso com eixo ──────────────
  //
  // Família E1: verbo de atividade × intensificador × eixo de prioridade
  //   "costumo jogar muito", "tiro muita foto", "gravo bastante vídeo", "rodo jogo pesado"
  //
  // Família E2: "passo/fico horas" + gerundivo de atividade
  //   "eu passo horas jogando", "fico horas tirando foto"
  //
  // NÃO depende de frases fixas — cada componente é uma família semântica independente.

  const _eActivityVerbs = /\b(tiro|gravo|fotografo|filmo|rodo|costumo)\b/;
  const _eIntensity     = /\b(muito|muita|muitos|muitas|bastante|pesado)\b/;
  // Verbos de atividade de foto/vídeo são também eixos de prioridade por si mesmos
  const _eActivityIsAxis = /\b(fotografo|filmo|gravo)\b/;

  if (
    _eActivityVerbs.test(q) &&
    _eIntensity.test(q) &&
    (_axisExpanded.test(q) || _eActivityIsAxis.test(q))
  ) return true;

  if (
    /\b(passo|fico)\s+horas\b/.test(q) &&
    (
      /\b(jogando|tirando|gravando|filmando|fotografando|trabalhando|estudando)\b/.test(q) ||
      _axisExpanded.test(q)
    )
  ) return true;

  // PATCH 7.8B — constraint revelation after deictic reference (guard: não engolir como DECISION_CONFIRMATION)
  if (/\bvou nesse mas\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\bmas se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;

  // ── PATCH 6.6 — Layer F: Foco/prioridade declarada com eixo ─────────────
  //
  // "meu foco é game", "meu foco em bateria", "priorizo longevidade"
  // "o mais importante é durar", "pra mim pesa mais câmera"
  //
  // Inclui "longevidade" como eixo estendido (não presente em _axisExpanded 5.8A).

  if (
    (/\b(meu foco|minha prioridade|o mais importante|pra mim pesa mais|eu valorizo)\b/.test(q) &&
      (_axisExpanded.test(q) || /\blongevidade\b/.test(q))) ||
    (/\bfoco\s+(e|em|no|na)\b/.test(q) && _axisExpanded.test(q)) ||
    (/\bpriorizo\b/.test(q) && (_axisExpanded.test(q) || /\blongevidade\b/.test(q)))
  ) return true;

  // ── PATCH 6.6 — Layer G: Longevidade / intenção de não trocar cedo ───────
  //
  // "não quero trocar tão cedo", "vida útil", "qual envelhece melhor?"
  // Sinal: o usuário prioriza durabilidade temporal do produto.

  if (
    /\bnao quero (trocar|mudar)\b/.test(q) ||
    /\bvida\s+util\b/.test(q) ||
    (/\b(envelhece|envelhecer)\b/.test(q) && /\bmelhor\b/.test(q)) ||
    /\blongevidade\b/.test(q)
  ) return true;

  // ── Layer H: Safety / Reliability Axis (PATCH 7.6H) ─────────────────────
  //
  // Intenção: o usuário muda o eixo decisório para segurança, confiabilidade,
  // tranquilidade — eixo emocional de risco, não eixo técnico de performance.
  //
  // H1 — Comparative safety adjectives: "qual é mais seguro/confiável/tranquilo"
  // H2 — Anti-problem seeking: "qual dá menos dor de cabeça/problema/risco"
  // H3 — Confidence-inspiring: "qual inspira/transmite mais confiança"
  // H4 — Reputation/track record: "qual tem melhor reputação"
  // H5 — Reliability outcome: "qual continua bom", "qual dura mais", "qual aguenta mais"
  //
  // TODOS os padrões H1/H2/H5 requerem "qual" como âncora semântica —
  // evita falsos positivos em contextos não-produto ("seguro do carro",
  // "problema de internet", "manutenção da casa").
  // hasActiveAnchor garantido no topo da função.

  const _safetyAdj =
    /\b(seguro|segura|confiavel|confiável|tranquilo|tranquila|estavel|estável|solido|sólido|consistente|duradouro|duradoura|arriscado|arriscada)\b/.test(q);

  const _safetyOutcomeNoun =
    /\b(problema|problemas|dor\s+de\s+cabeca|manutencao|risco|riscos|falha|defeito|incomodar)\b/.test(q);

  // H1 — comparative adjective + "qual"
  const _h1SafetyComparative =
    /\bqual\b/.test(q) &&
    _safetyAdj &&
    /\b(mais|menos|melhor)\b/.test(q);

  // H2 — negative outcome + "qual"
  const _h2AntiProblem =
    /\bqual\b/.test(q) &&
    _safetyOutcomeNoun &&
    /\b(menos|nao\s+ter|evitar)\b/.test(q);

  // H3 — confidence-inspiring verbs (require "qual" OR comparative "mais")
  const _h3ConfidenceInspiring =
    (/\b(inspira|transmite|passa|gera)\s+(mais\s+)?(confianca|confiança|seguranca|segurança|tranquilidade)\b/.test(q) &&
      /\bqual\b/.test(q)) ||
    /\bparece\s+(menos\s+)?(arriscado|arriscada)\b/.test(q);

  // H4 — reputation / track record
  const _h4Reputation =
    /\bmelhor\s+(reputacao|reputação|historico|histórico)\b/.test(q) ||
    /\bmais\s+renomado\b/.test(q) ||
    /\bcostuma\s+(ser\s+)?(mais\s+)?(confiavel|confiável|consistente)\b/.test(q);

  // H5 — reliability over time (requires "qual")
  const _h5ReliabilityOutcome =
    /\bqual\b/.test(q) &&
    (
      /\b(continua|vai\s+continuar|tende\s+a\s+continuar)\s+(bom|boa|funcionando|bem)\b/.test(q) ||
      /\b(dura|durar|aguenta|aguentar)\s+(mais|por\s+mais)\b/.test(q) ||
      /\bmantem\s+(valor|qualidade|padrao|padrão)\b/.test(q) ||
      /\bmenos\s+manutencao\b/.test(q)
    );

  if (_h1SafetyComparative || _h2AntiProblem || _h3ConfidenceInspiring || _h4Reputation || _h5ReliabilityOutcome) return true;

  // ── PATCH 7.6V-C — Layer I: Peace of mind / purchase calm ───────────────────
  // Requer "qual" + estrutura de escolha/compra — evita "seguro da loja/garantia".
  const _v7cPeaceOfMind =
    /\bqual\b/.test(q) &&
    (
      /\b(compro|comprar|compraria)\s+(mais\s+)?(sossegad[oa]|tranquil[oa])\b/.test(q) ||
      /\b(me\s+deixa|me\s+deixaria|me\s+deixou)\s+(mais\s+)?(sossegad[oa]|tranquil[oa]|em\s+paz)\b/.test(q) ||
      /\b(me\s+da|me\s+daria)\s+(mais\s+)?(paz|tranquilidade|seguranca)\b/.test(q) ||
      (/\b(mais\s+)?segur[oa]\b/.test(q) && /\b(comprar|compro|compraria)\b/.test(q))
    );

  // ── PATCH 7.6V-C — Layer J: Future longevity / aging ────────────────────────
  const _v7cFutureLongevity =
    /\bqual\b/.test(q) &&
    (
      (
        /\b(aguenta|segura|dura|durar|vai\s+durar)\s+(melhor|mais)\b/.test(q) &&
        /\b(proximos\s+anos|futuro|por\s+mais\s+tempo|mais\s+tempo)\b/.test(q)
      ) ||
      /\bfica\s+menos\s+defasad[oa]\b/.test(q) ||
      /\bvai\s+durar\s+melhor\b/.test(q) ||
      /\bsegura\s+melhor\s+(pelos\s+)?proximos\s+anos\b/.test(q) ||
      /\bfica\s+melhor\s+por\s+mais\s+tempo\b/.test(q) ||
      /\bvai\s+durar\s+melhor\s+(nos\s+)?proximos\s+anos\b/.test(q)
    );

  if (_v7cPeaceOfMind || _v7cFutureLongevity) return true;

  // ── PATCH 7.6V-N — Layer K: Regret-risk minimization axis ───────────────────
  // Usuário reprioriza por menor chance/risco de arrependimento — não projective risk.
  const _v7nRegretRiskAxis =
    /\bqual\b/.test(q) &&
    (
      (/\b(menos|menor)\s+(chance|risco)\b/.test(q) && /\barrepender\b/.test(q)) ||
      /\b(eu\s+)?teria\s+menos\s+(chance|risco)\s+de\s+(me\s+)?arrepender\b/.test(q) ||
      /\bcom\s+menos\s+risco\s+de\s+(me\s+)?arrepender\b/.test(q)
    );

  // ── PATCH 7.6V-N — Layer L: Perceived longevity / stays good over time ────────
  const _v7nStaysGoodOverTime =
    /\bqual\b/.test(q) &&
    (
      /\b(fica|ficar|segue|continua)\s+(bom|boa|bem|util|valido)\s+por\s+mais\s+tempo\b/.test(q) ||
      /\b(fica|ficar)\s+(bom|boa|bem)\s+por\s+mais\s+(tempo|anos)\b/.test(q) ||
      /\bpor\s+mais\s+tempo\b/.test(q) &&
        /\b(fica|ficar|dura|durar|segue|continua)\s+(bom|boa|bem)\b/.test(q)
    );

  if (_v7nRegretRiskAxis || _v7nStaysGoodOverTime) return true;

  // PATCH 7.7K — constraint hypotheticals after comprehension prefix
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|investir)\s+menos\b/.test(q)) return true;

  return false;
}

function detectsObjectionSignal(q, { hasActiveAnchor }) {
  if (!hasActiveAnchor) return false;

  // PATCH 7.9Y.1 — resistência leve (SD) vence OBJECTION genérico
  if (hasSoftDisagreementDominantMasTail(q) || detectsNaturalSoftDisagreementCore(q)) {
    return false;
  }
  // PATCH 8.1B.5 — pedido curto de alternativa paralela ≠ objeção forte
  if (/^outr[oa] opcao$/.test(q)) return false;

  const objectionPatterns = [
    /nao gostei|não gostei/,
    /nao gosto|não gosto/,
    /nao quero esse|não quero esse/,
    /outro opcao|outra opcao|outra opção/,
    /nao e o que|nao foi o que|não é o que|não foi o que/,
    /era outro|esperava outro/,
    /desconsider/,
  ];

  if (objectionPatterns.some((re) => re.test(q))) return true;

  // ── PATCH 5.8C — Objeção de preço ───────────────────────────────────────
  // "acho caro", "parece caro", "muito caro", "caro demais" etc.
  // Sinal semântico: avaliação de preço elevado sobre o produto recomendado.
  // Proteção: hasActiveAnchor (garantido acima).
  // NÃO captura "tá caro" (coberto por VALUE_QUESTION).
  if (
    /\b(acho|parece|ficou|muito|bastante|bem)\s*(caro|cara|salgado|salgada)\b/.test(q) ||
    /\b(caro|cara) demais\b/.test(q)
  ) return true;

  // ── PATCH 6.5 — Objeção de preço: vocabulário expandido ─────────────────
  //
  // Quatro novos clusters semânticos de objeção financeira para cobrir
  // formas reais de expressão de resistência ao preço:
  //
  //   PESO FINANCEIRO    — "pesou no bolso", "tá puxado", "preço ficou pesado"
  //   ESTOURO ORÇAMENTO  — "passou do orçamento", "estourou o limite"
  //   EXPECTATIVA        — "ficou acima do que eu esperava"
  //   GASTO INDESEJADO   — "não queria gastar tudo isso", "queria gastar menos"
  //   DESCONFORTO PREÇO  — "esse valor me incomoda", "não sei se vale esse preço"
  //
  // NÃO captura "barato", "promoção", "desconto", "oferta" (refinement/busca).
  // NÃO captura "tá caro" isolado (coberto por VALUE_QUESTION).
  // Proteção: hasActiveAnchor (garantido no topo da função).

  // PESO FINANCEIRO — verbos/adjetivos de peso com referência de preço ou contexto
  const financialWeightSignal =
    (/\b(pesou|pesado|pesada)\b/.test(q) && /\b(bolso|preco|valor|custo)\b/.test(q)) ||
    /\b(ta|esta)\s+(puxado|puxada|salgado|salgada)\b/.test(q) ||
    /\b(preco|valor)\s*(ficou|esta|saiu|veio)\s*(pesado|pesada|puxado|puxada)\b/.test(q);

  // ESTOURO DE ORÇAMENTO — verbos de ultrapassagem + referência de limite
  const budgetOverrunSignal =
    /\b(passou|estourou|excedeu|ultrapassou)\b/.test(q) &&
    /\b(orcamento|limite|verba|bolso)\b/.test(q);

  // EXPECTATIVA EXCEDIDA — ficou/saiu acima do que esperava/queria
  const priceExpectationSignal =
    (/\b(ficou|saiu|veio|esta)\b/.test(q) && /\bacima\b/.test(q) &&
      /\b(esperava|queria|planejava|pensava|imaginava)\b/.test(q)) ||
    /mais\s+(caro|cara)\s+(do\s+que|que)\s+(eu\s+)?(esperava|imaginava|queria|pensava|planejava)\b/.test(q);

  // GASTO INDESEJADO — não queria gastar / queria gastar menos
  const unwantedExpenseSignal =
    (/\bnao queria\b/.test(q) && /\b(gastar|chegar|pagar|investir)\b/.test(q)) ||
    /\bqueria\s+(gastar|pagar)\s+menos\b/.test(q);

  // DESCONFORTO DIRETO COM PREÇO — me incomoda, não sei se vale, está caro para mim
  const priceDiscomfortSignal =
    (/\b(valor|preco)\b/.test(q) && /\b(me incomoda|incomoda|me preocupa)\b/.test(q)) ||
    (/\bnao sei se vale\b/.test(q) && /\b(preco|valor|custo|isso)\b/.test(q)) ||
    /\b(esta|ficou|saiu)\s+(caro|cara)\s+(pra|para)\s+(mim|eu)\b/.test(q);

  return (
    financialWeightSignal ||
    budgetOverrunSignal   ||
    priceExpectationSignal ||
    unwantedExpenseSignal  ||
    priceDiscomfortSignal
  );
}

// ─────────────────────────────────────────────────────────────
// PATCH 5.4 — Post-Decision Explanation Intent Layer
// ─────────────────────────────────────────────────────────────

/**
 * Guard interno: detecta se a query é na verdade um pedido de alternativa
 * ou refinamento. Usado para evitar que perguntas sobre ganho/perda/consequência
 * sejam classificadas como explicação quando o usuário quer outro produto.
 *
 * Baseado em sinais estruturais de SUBSTITUIÇÃO/NOVA BUSCA, não em frases fixas.
 */
function _hasAlternativeOrRefinementSignal(q) {
  // Sinal de substituição explícita ou pedido de novo produto
  if (/\b(tem outro|tem algo|alternativa|outro opcao|outra opcao|mais barato|mais barata|mais economico|outro modelo|outra marca)\b/.test(q)) return true;
  // Sinal de troca/mudança de produto
  if (/\b(troca|trocar|mudaria|mudar de|prefiro outro|quero outro|diferente)\b/.test(q)) return true;
  // Rejeição explícita do produto atual
  if (/\b(nao quero esse|não quero esse|nao quero essa|não quero essa)\b/.test(q)) return true;
  // Comparação explícita com outro produto específico
  if (/\bcomparado (com|ao|a)\b/.test(q) || /\bvs\b|\bversus\b/.test(q)) return true;
  return false;
}

/**
 * Detecta intenções pós-decisão de explicação estrutural.
 *
 * PATCH 5.4 — Três novos clusters semânticos estruturais:
 *
 * Cluster 4 — Consequência prática:
 *   O usuário quer entender o impacto real da escolha no cotidiano.
 *   Sinal: verbo/substantivo de CONSEQUÊNCIA + referência prática.
 *
 * Cluster 5 — Ganho / benefício:
 *   O usuário quer entender o que ganha com o produto escolhido.
 *   Sinal: verbo/substantivo de GANHO + contexto de escolha atual.
 *
 * Cluster 6 — Perda / tradeoff:
 *   O usuário quer entender o que sacrifica com a escolha atual.
 *   Sinal: verbo/substantivo de PERDA/SACRIFÍCIO + contexto de escolha.
 *
 * Todos os clusters requerem:
 *   - âncora ativa (a escolha existe)
 *   - ausência de sinal de substituição/refinamento
 *
 * NÃO depende de frases fixas — cada cluster representa um PADRÃO
 * SEMÂNTICO com múltiplas realizações textuais.
 *
 * @param {string} q — query normalizada
 * @param {{ hasActiveAnchor: boolean, cso?: object|null }} opts
 * @returns {{
 *   active: boolean,
 *   subtype: "consequence"|"benefit"|"tradeoff"|"decision_defense"|"confidence_challenge"|null,
 *   category: "POST_DECISION_EXPLANATION"|null
 * }}
 */
function detectsPostDecisionExplanationSignal(q, { hasActiveAnchor, cso = null }) {
  if (!hasActiveAnchor) return { active: false, subtype: null, category: null };

  // ── PRE-GUARD: "mudaria/mudar" + referência de opinião/decisão ──────────
  // "mudaria" e "mudar de" estão no guard geral como sinais de troca de produto.
  // Mas "mudar de ideia / mudar sua opinião / mudaria de ideia / mudaria sua
  // recomendação" não são pedidos de produto alternativo — são desafios à
  // estabilidade da decisão da MIA (confidence_challenge).
  // Este check estreito precede o guard para capturar ambas as formas verbais:
  //   - infinitivo: "o que te faria mudar de ideia?" / "mudar sua opinião?"
  //   - condicional: "mudaria de ideia?" / "mudaria sua recomendação?"
  // NÃO captura: "mudar de produto/modelo/marca" (sem "de ideia|opiniao|...").
  if (
    /\b(mudaria|mudar)\b/.test(q) &&
    /\b(de (ideia|opiniao)|sua (opiniao|recomendacao|escolha|decisao))\b/.test(q)
  ) {
    return { active: true, subtype: "confidence_challenge", category: POST_DECISION_EXPLANATION_CATEGORY };
  }

  if (_hasAlternativeOrRefinementSignal(q)) return { active: false, subtype: null, category: null };

  // ── Cluster 4: Consequência prática ──────────────────────────────────────
  // Detecta quando o usuário quer entender o impacto real/prático da escolha.
  // Sinal: referência a cotidiano/prática + verbo/substantivo de consequência.
  //
  // PATCH 5.4B — cobertura morfológica expandida:
  //   • consequencias: plural sem acento (após normalize())
  //   • \bimpacto\b: standalone, sem qualificador obrigatório
  //   • \bafet\w+\b: raiz "afet-" cobre afetaria, afetará, afetar, afetando
  //   • efeito|efeitos: substantivos de efeito prático
  const practicalConsequenceSignal =
    /\b(na pratica|na prática|no dia a dia|no cotidiano|no uso real)\b/.test(q) ||
    /\b(o que (muda|altera|afeta|impacta))\b/.test(q) ||
    /\b(consequencia|consequência|consequencias)\b/.test(q) ||
    /\bfaz diferenca\b|\bfaz diferença\b/.test(q) ||
    /\bimpacto\b/.test(q) ||
    /\b(diferenca (pratica|prática|real|concreta)|diferença (pratica|prática|real|concreta))\b/.test(q) ||
    /\bafet\w+\b/.test(q) ||
    /\b(efeito|efeitos)\b/.test(q);

  if (practicalConsequenceSignal) return { active: true, subtype: "consequence", category: POST_DECISION_EXPLANATION_CATEGORY };

  // ── Cluster 5: Ganho / benefício ─────────────────────────────────────────
  // Detecta quando o usuário quer entender o que ganha com a escolha.
  // Sinal: verbo/substantivo de GANHO direcionado ao produto/escolha atual.
  //
  // PATCH 5.4B — cobertura morfológica expandida:
  //   • (ganho|ganh\w+): raiz "ganh-" cobre ganharia, ganharei, ganhar, ganhando
  //   • "qual (seria|seria a|seria o) X": aceita modal entre "qual" e o substantivo
  //   • vantagens|beneficios|benefícios: formas plurais
  const benefitGainSignal =
    /\bo que (eu |)(ganho|ganh\w+)\b/.test(q) ||
    /\bqual (a |o |e a |e o |seria a |seria o |seria |)(vantagem|beneficio|benefício|diferencial|ponto forte)\b/.test(q) ||
    /\b(vantagens|beneficios|benefícios)\b/.test(q) ||
    /\bem que (ele|ela|isso) (se destaca|e melhor|é melhor|fica melhor|e superior|é superior)\b/.test(q) ||
    /\bo que (ele|ela) (tem de bom|tem de melhor|tem de especial)\b/.test(q);

  if (benefitGainSignal) return { active: true, subtype: "benefit", category: POST_DECISION_EXPLANATION_CATEGORY };

  // ── Cluster 6: Perda / tradeoff ──────────────────────────────────────────
  // Detecta quando o usuário quer entender o que sacrifica com a escolha.
  // Sinal: verbo/substantivo de PERDA/SACRIFÍCIO + contexto da escolha atual.
  //
  // PATCH 5.4B — cobertura morfológica expandida:
  //   • (perco|perd\w+): raiz "perd-" cobre perderia, perderei, perder, perdendo
  //   • perda|perdas: substantivos de perda (singular e plural)
  const lossTradeoffSignal =
    /\bo que (eu |)(perco|perd\w+)\b/.test(q) ||
    /\b(perda|perdas)\b/.test(q) ||
    /\b(abro mao|abro mão|abrir mao|abrir mão)\b/.test(q) ||
    /\bqual (o |a |)(tradeoff|sacrificio|sacrifício|desvantagem|limitacao|limitação|ponto fraco)\b/.test(q) ||
    /\b(perde (em|no|na|com))\b/.test(q);

  if (lossTradeoffSignal) return { active: true, subtype: "tradeoff", category: POST_DECISION_EXPLANATION_CATEGORY };

  // ── Cluster 7: Defesa da decisão atual (PATCH 5.5A) ──────────────────────
  // Detecta quando o usuário questiona se a recomendação JÁ FEITA continua
  // válida/justificada. Distingue-se de VALUE_QUESTION pela presença de:
  //
  //   A — marcador de CONTINUIDADE temporal: "ainda", "continua", "segue"
  //   B — JUSTIFICAÇÃO com "por que" (pedindo motivo da decisão, não avaliação)
  //   C — dúvida existencial: "mesmo" / "realmente" + validade ("vale", "compensa")
  //   D — "continua" + estado de validade em andamento
  //   E — formulações diretas de defesa/continuidade da escolha
  //
  // NÃO usa frases fixas — cada sinal representa um padrão semântico de
  // CONTINUIDADE + VALIDADE que pode ter múltiplas realizações textuais.
  //
  // Proteção: âncora ativa (garantida pelo guard no início desta função)
  // e ausência de pedido de alternativa/refinamento (_hasAlternativeOrRefinementSignal).

  // Sinal A — marcador temporal de continuidade ("ainda") + termo de validade
  const continuityValiditySignal =
    /\bainda\b/.test(q) &&
    /\b(vale|compensa|e (bom|boa|certo|certa|valido|valida|o melhor|a melhor)|faz sentido|recomendado|recomendada|indicado|indicada)\b/.test(q);

  // Sinal B — "por que" (justificação) + âncora semântica de validade
  // Requer "ainda" OU "a pena" OU outro marcador de validade da decisão.
  // Evita ativar para "por que vale tanto?" (custo, não defesa).
  const justificationSignal =
    /\bpor que\b/.test(q) &&
    (
      /\bainda\b/.test(q) ||
      /\ba pena\b/.test(q) ||
      /\bcompensa\b/.test(q) ||
      /\bfaz sentido\b/.test(q)
    );

  // Sinal C — dúvida existencial: "mesmo" ou "realmente" + validade
  // Cobre: "vale mesmo?", "realmente compensa?", "faz sentido mesmo?"
  const validityDoubtSignal =
    /\b(vale|compensa|faz sentido)\b/.test(q) &&
    /\b(mesmo|realmente|de verdade)\b/.test(q);

  // Sinal D — "continua" + estado de validade contínuo em andamento
  // Cobre: "continua valendo", "continua fazendo sentido", "continua sendo o melhor"
  const continuationStateSignal =
    /\bcontinua\b/.test(q) &&
    /\b(valendo|compensando|fazendo sentido|sendo (bom|boa|certo|certa|valido|valida|o melhor|a melhor|recomendado|recomendada))\b/.test(q);

  // Sinal E — formulações diretas de defesa/confirmação da decisão
  // Cobre: "ainda faz sentido", "ainda é a melhor opção", "faz sentido manter"
  const directDefenseSignal =
    /\bainda (faz sentido|e (boa|bom|o melhor|a melhor|valido|valida|certo|certa))\b/.test(q) ||
    /\bcontinua fazendo sentido\b/.test(q) ||
    /\bfaz sentido manter\b/.test(q);

  if (
    continuityValiditySignal ||
    justificationSignal ||
    validityDoubtSignal ||
    continuationStateSignal ||
    directDefenseSignal
  ) {
    return { active: true, subtype: "decision_defense", category: POST_DECISION_EXPLANATION_CATEGORY };
  }

  // ── Cluster 8: Desafio de confiança/estabilidade (PATCH 5.5B) ────────────
  // Detecta quando o usuário questiona por que a recomendação é ESTÁVEL,
  // se a MIA manteria a escolha, ou o que faria a decisão mudar.
  //
  // Difere de decision_defense:
  //   decision_defense = "essa escolha ainda vale?" (validade do produto)
  //   confidence_challenge = "por que você não mudou?" / "você ainda escolheria?"
  //                          (estabilidade/confiança na própria recomendação)
  //
  // Os 5 sinais são independentes e não usam frases fixas:
  //
  //   A — desafio de não-mudança: por que a decisão não mudou (verbos no passado)
  //   B — hipotética de manutenção: "ainda" + verbo de comprometimento/decisão
  //   C — o que faria mudar: pedido de condição para reconsideração
  //   D — desafio direto de confiança: "tem certeza", "confia/confiaria"
  //   E — estabilidade da recomendação: sustentaria/resiste + decisão
  //   CSO — sinal auxiliar opcional: trust_challenge do contexto de sessão

  // Sinal A — "por que não" + verbo de não-mudança (past tense — fora do guard)
  const nonChangeChallengeSignal =
    /\bpor que\b/.test(q) &&
    /\bnao\b/.test(q) &&
    /\b(mudou|trocou|alterou|manteve|continuou com|persistiu)\b/.test(q);

  // Sinal B — "ainda" + verbo de comprometimento/decisão (≠ decision_defense que usa validade)
  // "ainda manteria", "ainda escolheria", "ainda recomendaria", "ainda confiaria"
  const hypotheticalCommitmentSignal =
    /\bainda\b/.test(q) &&
    /\b(manteria|escolheria|recomendaria|indicaria|optaria|sustentaria|confiaria)\b/.test(q);

  // Sinal C — o que faria a MIA mudar/reconsiderar
  // "mudar" sozinho (sem "de X") está fora do guard; "repensar/reconsiderar/rever" idem
  const whatWouldChangeSignal =
    /\bo que (faria|te faria|lhe faria|faz)\b/.test(q) &&
    /\b(mudar|repensar|reconsiderar|rever|revisar)\b/.test(q);

  // Sinal D — desafio direto de confiança/certeza
  // "tem certeza que", "confia nessa", "você confiaria"
  // PATCH 5.8C — standalone: "sério?", "realmente?", "mesmo?" como desafio retórico
  // (query curta = desafio implícito à recomendação, sem precisar repetir o produto)
  const directConfidenceChallengeSignal =
    /\btem certeza\b/.test(q) ||
    /\b(voce |vc )?(confia|confiaria)\b/.test(q) ||
    /^(serio|realmente|mesmo|e serio|e mesmo)$/.test(q);

  // Sinal E — estabilidade explícita: "sustenta/resiste" + referência à decisão
  const decisionStabilitySignal =
    /\b(sustenta|sustentaria|resiste|resistiria)\b/.test(q) &&
    /\b(escolha|recomendacao|decisao|indicacao|essa opiniao)\b/.test(q);

  // Sinal F — Projeção pessoal de confiança (PATCH 6.5)
  //
  // O usuário projeta a decisão na pessoa da MIA para testar comprometimento
  // pessoal — "você compraria?", "se fosse seu dinheiro?", "você bancaria?".
  //
  // Distingue-se de Signal B (hypotheticalCommitment): Signal B requer "ainda"
  // e questiona validade temporal; Signal F foca em COMPROMETIMENTO PESSOAL
  // sem marcador temporal, podendo ser query curta sem âncora explícita.
  //
  // Famílias:
  //   COMPRA PESSOAL   — "você compraria/escolheria/iria nele"
  //   DINHEIRO PRÓPRIO — "se fosse seu dinheiro/bolso"
  //   COMPROMETIMENTO  — "você bancaria/manteria essa decisão"
  //   CONFIANÇA DIRETA — "dá pra confiar mesmo?"
  //   FORÇA DA RECOM.  — "não está forçando essa escolha?"
  //   PRIORIDADE ATUAL — "essa continua sendo sua primeira opção?"
  // Guard: "qual voce escolheria" é pedido de alternativa (REFINEMENT), não desafio pessoal
  const _notConditionalAlternativeFrame =
    !/\bse (eu|vc|voce) nao quiser\b/.test(q) &&
    !/\bse nao ficar com\b/.test(q);

  const personalCommitmentSignal = _notConditionalAlternativeFrame && (
    // "você compraria/iria/optaria/pegaria" — compra pessoal
    /\b(voce|vc)\s+(compraria|iria|optaria|pegaria)\b/.test(q) ||
    // "você escolheria" somente sem "qual" (senão é pedido de alternativa)
    (/\b(voce|vc)\s+escolheria\b/.test(q) && !/\bqual\b/.test(q)) ||
    // "se fosse seu dinheiro / seu bolso"
    /\bse fosse (seu|o seu)\s+(dinheiro|bolso)\b/.test(q) ||
    // "você bancaria/manteria/defenderia essa decisão" (sem exigir "ainda")
    (/\b(voce|vc)\s+(bancaria|manteria|defenderia)\b/.test(q)) ||
    // "dá pra confiar mesmo?", "dá pra confiar nessa recomendação?"
    /\bda\s+pra\s+confiar\b/.test(q) ||
    // "não está forçando essa escolha?" / "está empurrando essa decisão?"
    /\b(esta|nao esta)\s+(forcando|forçando|empurrando)\b/.test(q) ||
    // "essa continua sendo sua primeira opção?" (confirmação de prioridade)
    /\bprimeira\s+opcao\b/.test(q)
  );

  // CSO opcional — amplifica sem depender exclusivamente
  const csoTrustChallenge = cso?.conversationalIntent === "trust_challenge";

  if (
    nonChangeChallengeSignal ||
    hypotheticalCommitmentSignal ||
    whatWouldChangeSignal ||
    directConfidenceChallengeSignal ||
    decisionStabilitySignal ||
    personalCommitmentSignal ||
    csoTrustChallenge
  ) {
    return { active: true, subtype: "confidence_challenge", category: POST_DECISION_EXPLANATION_CATEGORY };
  }

  return { active: false, subtype: null, category: null };
}

/**
 * Detecção de EXPLANATION_REQUEST por clusters semânticos.
 *
 * PATCH 5.2C — Estratégia de três clusters semânticos originais.
 * PATCH 5.4 — Adicionados clusters 4-6: consequência, ganho, perda/tradeoff.
 *
 * Todos os clusters compartilham a mesma saída: turnType EXPLANATION_REQUEST,
 * que já tem o tratamento completo na cadeia de autoridade (cognitive_anchor_hold,
 * intent preservation, rich explanation path).
 *
 * Não depende de frases específicas — cada cluster representa
 * um PADRÃO DE INTENÇÃO com múltiplas realizações textuais.
 */
function detectsExplanationRequestSignal(q, { hasActiveAnchor, cso = null }) {
  if (!hasActiveAnchor) return false;
  // PATCH 7.7K — tail comercial/follow-up não é falha de compreensão pura.
  if (hasComprehensionCommercialTail(q)) return false;

  // ─── Cluster 1: Pedido explícito de explicação / justificativa ───────────
  // Verbos e construções que pedem raciocínio, lógica ou justificativa diretamente.
  const explicitExplanationPatterns = [
    /por que (voce|vc|a mia|recomendou|escolheu|indicou|optou)/,
    /qual o motivo/,
    /\bexplica\b/,
    /\bexplique\b/,
    /como (voce|vc) chegou/,
    /como chegou nessa/,
    /por que esse/,
    /qual e a logica|qual é a lógica/,
    /raciocinio|raciocínio/,
    /me conta o raciocinio|me conta a logica/,
  ];
  if (explicitExplanationPatterns.some((re) => re.test(q))) return true;

  // ─── Cluster 2: Falha de compreensão sobre a recomendação/decisão ────────
  // O usuário expressa que NÃO entendeu algo relacionado à escolha feita.
  const comprehensionFailureSignal =
    /(nao entendi|nao compreendi|nao percebi)\b/.test(q) ||
    /\b(nao ficou claro|nao esta claro|nao ta claro|ficou confuso|ficou confusa)\b/.test(q);

  if (comprehensionFailureSignal) {
    const decisionReference = /(escolha|decisao|decisão|recomendacao|recomendação|indicacao|indicação|opcao|opção)\b/.test(q);
    if (decisionReference) return true;
    return true; // hasActiveAnchor já garantido
  }

  // ─── Cluster 3: Perguntas sobre a origem / causa da decisão ─────────────
  const decisionOriginPatterns = [
    /o que (te|lhe|voce|vc) (fez|levou|motivou|te fez) (escolher|optar|recomendar|indicar)/,
    /o que (te|voce|vc) viu nele/,
    /por que (ele|ela) ganhou/,
    /por que foi (escolhido|selecionado|recomendado)/,
    /o que (te|voce|vc) fez (preferir|optar)/,
    /por que (optou|escolheu) (esse|essa|ele|ela)/,
    /que (criterio|critério|fator|motivo) (fez|levou)/,
  ];
  if (decisionOriginPatterns.some((re) => re.test(q))) return true;

  // ─── Clusters 4-8: Intenções pós-decisão estruturais (PATCH 5.4–5.5B) ────
  // Consequência prática, ganho/benefício, perda/tradeoff, defesa e desafio.
  // Ver detectsPostDecisionExplanationSignal para detalhes de cada cluster.
  const postDecision = detectsPostDecisionExplanationSignal(q, { hasActiveAnchor, cso });
  if (postDecision.active) return true;

  // ─── Cluster 9: Minimal explanation follow-up (PATCH 5.8B) ───────────
  // Com âncora ativa, follow-ups mínimos são interpretados como
  // "explica/justifica a recomendação anterior".
  //
  // Cobre os únicos casos não tratados pelos clusters 1-8:
  //   "por quê?" → normalize → "por que"
  //   "pq?"      → normalize → "pq"
  //   "como assim?" → normalize → "como assim"
  //
  // Proteção: queries curtas (≤ 3 palavras) e sem negação.
  // Queries longas com "por que" já são cobertas pelo Cluster 1.
  const _isShortQuery  = q.split(" ").length <= 3;
  const _hasNegation   = /\bnao\b/.test(q);
  const minimalExplanationFollowUp =
    (_isShortQuery && !_hasNegation && (/\bpor que\b/.test(q) || /^pq$/.test(q))) ||
    /^como assim$/.test(q);

  if (minimalExplanationFollowUp) return true;

  // ─── Cluster 10: Decision Reasoning — o que fez o produto ganhar (PATCH 6.5) ─────
  //
  // O usuário quer entender O QUE tornou o produto o vencedor ou o fator
  // decisivo da escolha — com o PRODUTO como sujeito (vs Cluster 1/3 onde
  // o sujeito implícito é a MIA).
  //
  // Famílias:
  //   GANHOU/VENCEU   — "o que fez ele ganhar?", "por que ficou em primeiro?"
  //   DIFERENCIAL     — "qual o diferencial?", "o que ele faz melhor?", "qual a lógica?"
  //   FATOR DECISIVO  — "o que pesou?", "qual foi o fator decisivo?"

  // Sinal: produto como SUJEITO do ganho/vitória/seleção
  // Cobre formas conjugadas: "vencer" (inf), "venceu" (pret), "vencesse" (subj), etc.
  const selectionVictorySignal =
    (/\bo que (fez|levou)\b/.test(q) && /\b(ganhar|venc\w+|ser escolhido|ficar em primeiro)\b/.test(q)) ||
    (/\b(por que|pq)\b/.test(q) && /\b(ganhou|venc\w+|ficou em primeiro|foi escolhido|levou)\b/.test(q));

  // Sinal: pedido de DIFERENCIAL/VANTAGEM com foco no produto
  const differentialProductSignal =
    (/\b(qual|quais)\b/.test(q) &&
      /\b(diferencial|vantagem principal|ponto forte|ponto positivo|destaque)\b/.test(q)) ||
    (/\bo que\b/.test(q) && /\b(faz melhor|tem de melhor|tem de especial|se destaca)\b/.test(q)) ||
    /\bprincipal\s+(vantagem|diferencial|ponto|destaque)\b/.test(q) ||
    /\bqual\s+(a|o)\s+(logica|criterio)\b/.test(q);

  // Sinal: FATOR/MOTIVO DECISIVO — o que pesou na decisão
  const decisiveFactorSignal =
    (/\b(o que|qual)\b/.test(q) && /\b(pesou|pesaram)\b/.test(q)) ||
    /\b(fator|motivo)\s*(decisivo|principal|que\s+pesou)\b/.test(q) ||
    (/\b(o que|qual)\b/.test(q) &&
      /\b(te\s+levou|levou)\b/.test(q) &&
      /\b(recomendar|escolher|indicar|optar)\b/.test(q));

  if (selectionVictorySignal || differentialProductSignal || decisiveFactorSignal) return true;

  // ─── Cluster 11: Simplification / Plain Language Request (PATCH 7.6H) ────
  //
  // Intenção: usuário quer entender, mas com menos complexidade.
  // Diferente do Cluster 1 ("explica" + contexto): aqui o foco é no FORMAT
  // da explicação, não na justificativa. A âncora ativa direciona para a decisão atual.
  //
  // S1 — Verbo de simplificação: "simplifica", "resume", "traduz"
  // S2 — Pedido de resumo: "pode resumir?", "qual é o resumo?"
  // S3 — Forma simples: "fala simples", "de forma simples", "linguagem normal"
  // S4 — Sem tecnicismo: "sem tecnicês", "sem jargão", "sem complicar"

  const simplificationRequest =
    /\bsimplifica\b/.test(q) ||
    /\bresume\s+(isso|pra\s+mim|pra\s+eu)?\b/.test(q) ||
    /\bpode\s+resumir\b/.test(q) ||
    /\bqual\s+(e\s+)?(o\s+|a\s+)?(resumo|essencial)\b/.test(q) ||
    /\btraduz\s+(isso|pra|para)\b/.test(q) ||
    /\b(fala|explica)\s+(de\s+(um\s+jeito|forma|um\s+modo))\s+simples\b/.test(q) ||
    /\bfala\s+simples\b/.test(q) ||
    /\b(sem\s+tecnicez|sem\s+jargao|sem\s+complicar|sem\s+tecnico)\b/.test(q) ||
    /\blinguagem\s+(simples|normal|comum|acessivel)\b/.test(q) ||
    /\bfala\s+(normal|basico)\b/.test(q);

  if (simplificationRequest) return true;

  // ─── Cluster 12: Hypothetical Choice / Decisive Position (PATCH 7.6H) ────
  //
  // Intenção: usuário pede a posição definitiva do sistema — "o que você manteria
  // se tivesse que escolher um". Não é comparação nova, não é busca — é um pedido
  // de explicação da decisão em forma de escolha hipotética.
  //
  // H1 — Conditional framing: "se você tivesse que escolher/ficar com/levar"
  // H2 — Direct preference solicitation: "qual você manteria/levaria/escolheria"
  // H3 — Final/definitive choice: "qual seria sua escolha final"
  // H4 — Survival/single winner: "qual sobreviveria ao corte", "se fosse pra ficar com um só"
  //
  // NÃO inclui "qual você manteria entre dois produtos" (seria COMPARISON_FOLLOWUP).
  // Com âncora ativa, o referente é sempre a recomendação atual, não nova busca.

  const hypotheticalChoiceRequest =
    // H1 — Conditional framing with explicit subject
    /\bse (voce|vc) tivesse que (escolher|ficar com|levar|comprar)\b/.test(q) ||
    // H2 — Direct preference solicitation
    /\bqual (voce|vc) (manteria|levaria|escolheria|ficaria com|compraria)\b/.test(q) ||
    // H3 — Final/definitive choice label
    /\bqual seria (sua|a) (escolha|decisao) (final|definitiva|certa)\b/.test(q) ||
    // H4 — Survival/single winner framing
    /\bqual (sobreviveria|ficaria|restaria)\b/.test(q) ||
    /\bse (for|fosse) pra (ficar|escolher|levar) (com\s+)?(um|uma) (so|só)\b/.test(q) ||
    /\bse (eu|vc|voce) so pudesse (levar|escolher|ficar com|comprar) (um|uma)\b/.test(q) ||
    // H5 — Implicit subject final choice (PATCH 7.6O-A)
    // Cobre frases sem "voce/vc/eu" explícito que expressam a mesma intenção:
    // "se só pudesse levar um", "se pudesse escolher só um", "se fosse ficar com um"
    /\bse\s+(so\s+)?pudesse\s+(levar|escolher|ficar\s+com|comprar)\s+(um|uma)\b/.test(q) ||
    /\bse\s+fosse\s+(ficar\s+com|escolher|levar)\s+(um|uma)\b/.test(q) ||
    // H6 — Definitive/final marker (PATCH 7.6O-A)
    // "escolha definitiva", "decisão final", "última escolha"
    /\b(ultima|last)\s+(escolha|opcao|opção|decisao|decisão)\b/.test(q) ||
    /\b(escolha|decisao)\s+(definitiva|unica)\b/.test(q);

  if (hypotheticalChoiceRequest) return true;

  return false;
}

function detectsValueQuestionSignal(q, { hasActiveAnchor }) {
  if (!hasActiveAnchor) return false;
  if (isAnchoredValueAxisFollowUpQuery(q)) return false;

  const valuePatterns = [
    /vale a pena/,
    /compensa/,
    /e uma boa compra|é uma boa compra/,
    /vale o preco|vale o preço/,
    /ta caro|ta barato|tá caro|tá barato/,
    /custo beneficio|custo-beneficio|custo benefício/,
    /faz sentido comprar/,
    /devo comprar/,
  ];

  return valuePatterns.some((re) => re.test(q));
}

function detectsCommercialQuestionSignal(q, { hasActiveAnchor, comparisonContext, rawQuery = "" }) {
  // URL detection — usar rawQuery porque normalize() remove ":"
  const checkForUrl = rawQuery || q;
  const hasUrl = /https?:\/\//.test(checkForUrl);
  const hasMktplace = /mercadolivre|amazon|kabum|americanas|shopee|magalu|magazineluiza/.test(q);

  if (hasUrl || hasMktplace) return true;

  const commercialPatterns = [
    /e esse aqui/,
    /esse modelo/,
    /esse produto/,
    /essa versao|essa versao/,
    /essa opcao|essa opcao/,
    /(na|da|no|do) (loja|amazon|meli|kabum|shopee|americanas|magalu)/,
    /esse.*aqui/,
  ];

  return commercialPatterns.some((re) => re.test(q));
}

// ─────────────────────────────────────────────────────────────
// PATCH 7.5 — Alternative Request Signal
// ─────────────────────────────────────────────────────────────

/**
 * Portuguese ordinal words → rank number (accent-free, post-normalize()).
 * Only ranks 2-10 are semantically meaningful for "which position?".
 * Rank 1 (winner) is always the current recommendation — never a request.
 */
const ORDINAL_RANK_MAP = new Map([
  ["segundo", 2], ["segunda", 2],
  ["terceiro", 3], ["terceira", 3],
  ["quarto", 4],   ["quarta", 4],
  ["quinto", 5],   ["quinta", 5],
  ["sexto", 6],    ["sexta", 6],
  ["setimo", 7],   ["setima", 7],   // sétimo/sétima after normalize()
  ["oitavo", 8],   ["oitava", 8],
  ["nono", 9],     ["nona", 9],
  ["decimo", 10],  ["decima", 10],  // décimo/décima after normalize()
]);

/**
 * Detects whether the user is requesting a specific ranking position or
 * a top-N list from the last decision snapshot.
 *
 * Returns structured retrieval metadata consumed by resolveRankingRequest().
 * Requires active anchor — ranking only has meaning in a decision context.
 *
 * Three families:
 *   A — Top-N: "top 3", "melhores 5", "primeiros 10"
 *   B — Explicit ordinal: "terceiro", "quinto", "décimo"
 *   C — Runner-up / rank-2: "plano B", "depois dele", "quem ficou em segundo"
 *
 * Does NOT depend on specific phrases — each family is a semantic pattern.
 *
 * @param {string} q — normalized query
 * @param {{ hasActiveAnchor: boolean }} opts
 * @returns {{ detected: boolean, requestedRank: number|null, requestedTopN: number|null }}
 */
function detectsAlternativeRequestSignal(q, { hasActiveAnchor }) {
  const NONE = { detected: false, requestedRank: null, requestedTopN: null };
  if (!hasActiveAnchor) return NONE;

  // PATCH 7.9B — tails comerciais dominantes não viram runner-up rank-2
  if (/\b(compara|compare|comparando)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return NONE;
  if (hasCommercialComparisonDisjunction(q)) return NONE;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return NONE;
  if (/\b(se eu )?gastar menos\b/.test(q)) return NONE;
  if (/\bmais barato\b/.test(q)) return NONE;
  if (/\bpara (jogos|jogar|trabalho|estudar|fotos|foto|camera|bateria)\b/.test(q)) return NONE;

  // ── Family A: Top-N ───────────────────────────────────────────────────────
  // "top 3", "top5", "melhores 5", "primeiros 10"
  const topNMatch =
    q.match(/\btop\s*(\d+)\b/) ||
    q.match(/\bmelhores\s+(\d+)\b/) ||
    q.match(/\bprimeiros\s+(\d+)\b/);
  if (topNMatch) {
    const n = parseInt(topNMatch[1], 10);
    if (!isNaN(n) && n >= 1) return { detected: true, requestedRank: null, requestedTopN: n };
  }

  // ── Family B: Explicit ordinal position (ranks 3–10) ──────────────────────
  // Detects "qual o terceiro?", "e o quinto?", "terceiro lugar", etc.
  // "segundo/segunda" is handled in Family C (runner-up) instead.
  for (const [word, rank] of ORDINAL_RANK_MAP) {
    if (word === "segundo" || word === "segunda") continue; // handled below
    if (new RegExp(`\\b${word}\\b`).test(q)) {
      const isShort = q.split(" ").length <= 5;
      const hasRankContext =
        /\b(lugar|posicao|opcao|colocado|classificado|produto|modelo|item|qual|quem)\b/.test(q);
      if (isShort || hasRankContext) {
        return { detected: true, requestedRank: rank, requestedTopN: null };
      }
    }
  }

  // ── Family C: Runner-up / rank-2 ──────────────────────────────────────────
  // Semantic families: "plano B / backup", "quem ficou em segundo",
  // "depois dele / o próximo", "se eu não quiser esse".
  // All mean "the next best option after the winner" → formal rank 2.
  const isRunnerUp =
    /\bplano\s+b\b/.test(q) ||
    /\bquase\s+(ganhou|venceu)\b/.test(q) ||
    (/\b(ficou|fico)\b/.test(q) && /\bem segundo\b/.test(q)) ||
    (/\b(segundo|segunda)\b/.test(q) &&
      /\b(opcao|opção|lugar|posicao|posição|classificado|escolha|colocado)\b/.test(q)) ||
    /\bdepois\s+(dele|desse|deles|dela|dessa)\b/.test(q) ||
    /\b(o\s+proximo|a\s+proxima|opcao\s+seguinte|proxima\s+opcao)\b/.test(q) ||
    (/\b(reserva|backup)\b/.test(q) &&
      !/\b(bateria|carga|energia)\s+reserva\b/.test(q)) ||
    /\bse (eu|vc|voce) nao quiser (esse|essa)\b/.test(q) ||
    /\bse nao ficar com (esse|essa|ele|ela)\b/.test(q) ||
    // PATCH 7.9X-B — natural runner-up metaphors
    /\bcarta na manga\b/.test(q) ||
    /\bsubstituto natural\b/.test(q) ||
    /\bsubstituto direto\b/.test(q) ||
    /\be se o primeiro nao der\b/.test(q) ||
    (/\bse eu nao pegar (esse|essa|ele|ela)\b/.test(q) && /\bqual sobra\b/.test(q)) ||
    (/\bse o primeiro sair\b/.test(q) && /\bqual fica\b/.test(q));

  if (isRunnerUp) return { detected: true, requestedRank: 2, requestedTopN: null };

  // ── Family D: Relative Ranking Discovery (PATCH 7.6G) ─────────────────────
  // Intenção: runner-up por posição relativa, sem ordinal explícito.
  // O usuário usa metáforas de proximidade/competição, não palavras ordinais.
  //
  // R1 — "logo atrás" (relative position guard: excludes location contexts)
  // R2 — "ficou colado" / "ficou por pouco" (narrow margin)
  // R3 — "quase levou" / "quase foi escolhido" (near-win framing)
  // R4 — "ficou/chegou mais perto" (comparative proximity, no location context)
  // R5 — "veio logo depois" (sequential without product-delivery context)
  //
  // All resolve to rank 2 (runner-up semantics).
  // Guards prevent location/logistics contexts from triggering.

  const _locationCtx = /\b(casa|rua|bairro|trabalho|escola|entrega|loja|cidade|pedido|correios|pacote|frete)\b/;

  const isRelativeRanking =
    // R1
    (/\blogo\s+(atras|atrás)\b/.test(q) && !_locationCtx.test(q)) ||
    // R2 — "ficou/tinha/chegou colado" (ranking proximity metaphor, masc/fem)
    /\b(ficou|tinha|chegou|estava)\s+(alguem\s+|algum\s+)?colad[ao]\b/.test(q) ||
    /\b(perdeu|ficou)\s+por\s+pouco\b/.test(q) ||
    // R3
    /\bquase\s+(levou|foi\s+escolhid[ao])\b/.test(q) ||
    // R4
    (/\b(ficou|chegou|estava)\s+(mais\s+)?(perto|proximo|proxim[ao])\b/.test(q) &&
      !/\b(casa|loja|entrega|km|distancia|metros)\b/.test(q)) ||
    // R5
    (/\bveio\s+(logo\s+)?(depois)\b/.test(q) && !_locationCtx.test(q));

  if (isRelativeRanking) return { detected: true, requestedRank: 2, requestedTopN: null };

  // ── Family E: Soft Alternative Discovery (PATCH 7.6G) ─────────────────────
  // Intenção: explorar alternativas sem especificar posição — "me mostra outras",
  // "tem algo além desse", "que outros você olharia?".
  // Diferente das famílias A-D que pedem posição explícita ou relativa;
  // aqui o usuário abre o espaço de exploração sem critério de ranking.
  // Resolve sem requestedRank nem requestedTopN (sistema decide o conjunto).

  const isSoftAlternative =
    // E1 — "me mostra outras opções/alternativas"
    /\bme\s+mostra\s+(outras|outros)\s*(opcoes|opções|alternativas|modelos|produtos)?\b/.test(q) ||
    // E2 — "tem algo além desse/dessa"
    /\btem\s+(algo|alguma\s+coisa)\s+(alem|além)\s+(desse|dessa|dele|deles|do\s+primeiro)\b/.test(q) ||
    // E3 — "que outros você olharia / eu poderia considerar"
    /\bque\s+(outros|outras)\s+(voce\s+olharia|eu\s+poderia|vale\s+considerar)\b/.test(q) ||
    // E4 — "o que mais você consideraria" / "o que mais faria sentido"
    (/\bo\s+que\s+mais\b/.test(q) &&
      /\b(voce\s+consideraria|faria\s+sentido|você\s+olharia|vale\s+considerar)\b/.test(q));

  if (isSoftAlternative) return { detected: true, requestedRank: null, requestedTopN: null };

  // ── Family F: Top-N Discovery (PATCH 7.6O-A) ──────────────────────────────
  //
  // Intenção: usuário quer visualizar os N produtos mais bem posicionados no
  // ranking da decisão atual. Diferente das famílias A-D que pedem posição
  // específica; aqui o usuário pede o conjunto dos melhores sem ordinal.
  // Requer âncora ativa (garantido no início da função).
  //
  // F1 — Dígito antes da palavra de qualidade: "os 3 melhores", "5 principais"
  // F2 — Número escrito antes da palavra de qualidade: "os três melhores"
  // F3 — Descoberta aberta (sem contagem): "os que ficaram no topo",
  //       "os que fizeram sentido", "os principais", "os mais recomendados"
  //
  // Guards: sem hasActiveAnchor a função retorna NONE acima.

  // F1 — dígito antes da palavra de qualidade
  const _f1Match = q.match(/\b(\d+)\s+(melhores|principais|primeiros|destaques)\b/);
  if (_f1Match) {
    const n = parseInt(_f1Match[1], 10);
    if (!isNaN(n) && n >= 1) return { detected: true, requestedRank: null, requestedTopN: n };
  }

  // F2 — número escrito por extenso antes da palavra de qualidade
  const _WRITTEN_N = {
    dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  };
  const _f2Match = q.match(
    /\b(dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(melhores|principais|primeiros|destaques)\b/
  );
  if (_f2Match) {
    const n = _WRITTEN_N[_f2Match[1]];
    if (n) return { detected: true, requestedRank: null, requestedTopN: n };
  }

  // F3 — descoberta aberta do topo do ranking (sem contagem explícita)
  const _isOpenTopN =
    // R1: "ficaram no topo / melhor colocados / melhor ranqueados / melhor posicionados"
    /\bficaram\s+(no\s+topo|melhor\s+colocados|melhor\s+ranqueados|melhor\s+posicionados)\b/.test(q) ||
    // R2: "os que mais fizeram sentido / se destacaram / se saíram bem"
    (/\bque\s+mais\b/.test(q) &&
      /\b(fizeram\s+sentido|se\s+destacaram|se\s+sairam|se\s+saíram)\b/.test(q)) ||
    // R3: "os principais" / "os destaques" — curtos e contextualizados pela âncora
    (/\b(os|as)\s+(principais|destaques)\b/.test(q) && q.split(" ").length <= 6) ||
    // R4: "os mais recomendados / alinhados / fortes / indicados / bem colocados"
    /\b(os|as)\s+mais\s+(recomendados|alinhados|fortes|indicados|bem\s+colocados)\b/.test(q);

  if (_isOpenTopN) return { detected: true, requestedRank: null, requestedTopN: null };

  return NONE;
}

// ─────────────────────────────────────────────────────────────
// PATCH 7.6C — Hesitation / Uncertainty Context Preservation
// PATCH 7.6F — Hesitation Family Expansion + Purchase Anxiety
// ─────────────────────────────────────────────────────────────

/**
 * Detects hesitation / uncertainty signals after a decision has been anchored.
 *
 * With an active anchor these phrases are NOT a new search — they are the user
 * struggling to articulate doubt about the current recommendation.
 *
 * Nine semantic families (PATCH 7.6C original + PATCH 7.6F expansions):
 *   A — Explicit doubt         "to na dúvida", "continuo em dúvida"
 *   B — Indecision             "to indeciso", "não consigo decidir"
 *   C — Cannot explain         "não sei explicar", "não sei bem"
 *                              [7.6F] + diffuse discomfort: "algo me incomoda"
 *   D — Lack of confidence     "não tô seguro", "não fiquei tranquilo"
 *                              [7.6F] + "sentindo confiança", "confortável"
 *   E — Not convinced          "não me convenceu", "não bateu comigo"
 *   F — Short informal         "hmm", "sei lá", "talvez" (standalone only)
 *   G — Decision paralysis     [7.6F] "perdido", "travado", "não sai do lugar"
 *   H — Purchase anxiety       [7.6F] "fazer besteira", "me arrepender", "receio"
 *
 * All nine families resolve to OBJECTION — no new turn type.
 * Subtype field added for audit tracing; routing contract unchanged.
 *
 * Guards (returns false/NONE):
 *   - No active anchor (user has no decision to doubt)
 *   - Contains new-search intent: "nao sei qual [category] comprar/escolher"
 *   - Contains comparison intent: "em duvida entre [product A] e [product B]"
 *   - Contains buy-category-verb pattern: "nao sei o que comprar/escolher"
 *
 * @param {string} q — normalised query
 * @param {{ hasActiveAnchor: boolean }} opts
 * @returns {{ detected: boolean, subtype: string|null }}
 */
const _CONCERN_DEMO =
  /\b(isso|essa|esse|esta|este|aquilo|aquela|aquele|disso|dessa|desse|desta|deste|nisso|nessa|nesse|nesta|neste)\b/;

function hasConcernDecisionAnchor(q) {
  return (
    _CONCERN_DEMO.test(q) ||
    /\b(com\s+isso|com\s+essa|com\s+esse|nessa\s+(decisao|escolha|compra)|nesse\s+(contexto|ponto))\b/.test(
      q
    )
  );
}

/**
 * PATCH 7.6V-J — Purchase anxiety subfamilies (Family H).
 * Medo de errar, arrependimento, escolha errada, frustração pós-compra, receio ancorado.
 */
function matchesPurchaseAnxietyFamilyH(q) {
  // H1 — Regret prevention
  if (/\bnao\s+quer(ia|o)\s+(fazer|cometer)\s+besteira\b/.test(q)) return true;
  if (
    /\bnao\s+quer(ia|o)\s+errar\b/.test(q) &&
    !/\bnao\s+quer(ia|o)\s+errar\s+(o\s+celular|o\s+notebook|a\s+marca|o\s+modelo)\b/.test(q)
  ) {
    return true;
  }
  if (/\bnao\s+quer(ia|o)\s+me\s+arrepender\b/.test(q)) return true;

  // H2 — Conditional / explicit regret
  if (/\be\s+se\s+(eu\s+)?me\s+arrepender\b/.test(q)) return true;
  if (/\bse\s+(eu\s+)?me\s+arrepender\b/.test(q)) return true;
  if (/\bvai\s+que\s+(eu\s+)?me\s+arrepender\b/.test(q)) return true;
  if (/\be\s+se\s+for\s+besteira\b/.test(q)) return true;

  // H3 — Fear of errar (PATCH 7.6V-J)
  if (/\be\s+se\s+(eu\s+)?errar\b/.test(q)) return true;
  if (/\bse\s+(eu\s+)?errar\b/.test(q)) return true;
  if (/\btenho\s+medo\s+de\s+errar\b/.test(q)) return true;
  if (/\bmedo\s+de\s+errar\b/.test(q) && /\b(compra|escolha|decisao|nessa|nesse|na)\b/.test(q)) {
    return true;
  }
  if (/\bnao\s+quer(ia|o)\s+errar\b/.test(q) && /\b(compra|escolha|nessa|nesse|na)\b/.test(q)) {
    return true;
  }

  // H4 — Bad decision / bad choice
  if (/\bnao\s+quer(ia|o)\s+tomar\s+uma\s+decisao\s+ruim\b/.test(q)) return true;
  if (/\bnao\s+quer(ia|o)\s+fazer\s+uma\s+escolha\s+ruim\b/.test(q)) return true;
  if (/\bnao\s+quer(ia|o)\s+escolher\s+mal\b/.test(q)) return true;
  if (/\bnao\s+quer(ia|o)\s+decidir\s+errado\b/.test(q)) return true;
  if (/\bnao\s+quer(ia|o)\s+ir\s+na\s+opcao\s+errada\b/.test(q)) return true;

  // H5 — Frustration after purchase
  if (/\bnao\s+quer(ia|o)\s+me\s+frustrar\b/.test(q)) return true;
  if (/\btenho\s+medo\s+de\s+me\s+frustrar\b/.test(q)) return true;
  if (/\be\s+se\s+(eu\s+)?me\s+frustrar\b/.test(q)) return true;
  if (/\bnao\s+quer(ia|o)\s+ficar\s+frustrad[oa]\b/.test(q)) return true;
  if (/\bnao\s+quer(ia|o)\s+quebrar\s+a\s+cara\b/.test(q)) return true;

  // H6 — Choose wrong
  if (/\btenho\s+medo\s+de\s+escolher\s+errado\b/.test(q)) return true;
  if (/\bmedo\s+de\s+escolher\s+errado\b/.test(q)) return true;
  if (/\be\s+se\s+(eu\s+)?escolher\s+errado\b/.test(q)) return true;
  if (/\bnao\s+quer(ia|o)\s+escolher\s+errado\b/.test(q)) return true;
  if (/\bnao\s+quer(ia|o)\s+ir\s+no\s+errado\b/.test(q)) return true;

  // H7 — Explicit fear/dread about purchase decision
  if (
    /\btenho\s+(medo|receio)\b/.test(q) &&
    /\b(compra|escolha|decisao|gastar|investir|errar|arrepender|desperdicar|escolher)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\bmedo\s+de\s+(errar|me\s+arrepender|gastar\s+errado|desperdicar|escolher\s+errado)\b/.test(q)
  ) {
    return true;
  }
  if (/\btenho\s+medo\s+de\s+me\s+arrepender\b/.test(q)) return true;

  // H8 — Loss aversion / waste framing
  if (/\bnao\s+quer(ia|o)\s+(jogar|desperdicar|perder)\s+(dinheiro|grana)\b/.test(q)) return true;
  if (/\bnao\s+quer(ia|o)\s+gastar\s+(errado|mal)\b/.test(q)) return true;

  // H9 — Receoso with purchase-error risk (anchored session)
  if (/^estou\s+receos[oa]$/.test(q)) return true;
  if (/\bestou\s+com\s+receio\s+de\s+(errar|escolher\s+errado|me\s+arrepender)\b/.test(q)) {
    return true;
  }
  if (/\bestou\s+receos[oa]\s+de\s+me\s+arrepender\b/.test(q)) return true;

  // H10 — Certainty need before committing
  if (/\bpreciso\s+ter\s+(certeza|mais\s+certeza)\b/.test(q)) return true;
  if (/\bquero\s+ter\s+certeza\s+(antes|primeiro)\b/.test(q)) return true;

  return false;
}

function isPurchaseAnxietyForConcernGuard(q) {
  return matchesPurchaseAnxietyFamilyH(q);
}

/**
 * PATCH 7.6V-F — Concern about the current recommendation.
 * Preocupação / receio / insegurança / desconforto / pé atrás sobre a decisão atual.
 */
function detectsConcernAboutRecommendation(q) {
  if (isPurchaseAnxietyForConcernGuard(q)) return false;

  // External product questions — not emotional concern about current choice.
  if (/^\s*qual\b/.test(q) && /\b(seguro|segura|tranquil|tranquila|garantia)\b/.test(q)) {
    return false;
  }
  if (/\b(seguro|garantia)\s+(da loja|cobre|desse produto|vale a pena)\b/.test(q)) {
    return false;
  }

  // I1 — Preocupação direta
  if (
    /\b(isso|essa|esse|esta|este)\s+me\s+(preocupa|preocupou)\b/.test(q) ||
    /\b(isso|essa|esse|esta|este)\s+me\s+(deixa|deixou)\s+preocupad[oa]\b/.test(q) ||
    /\b(fico|fiquei|to|estou)\s+preocupad[oa]\s+com\s+(isso|essa|esse|esta|este|aquilo|aquela|aquele)\b/.test(
      q
    ) ||
    /\btenho\s+(uma\s+)?preocupacao\s+com\s+(isso|essa|esse|esta|este)\b/.test(q) ||
    (/\bme\s+preocupa\s+um\s+pouco\b/.test(q) && hasConcernDecisionAnchor(q))
  ) {
    return true;
  }

  // I2 — Receio
  if (
    /\b(isso|essa|esse|esta|este)\s+me\s+(deixa|deixou)\s+com\s+receio\b/.test(q) ||
    /\b(isso|essa|esse|esta|este)\s+me\s+(da|deu|deixa|deixou)\s+(um\s+)?receio\b/.test(q) ||
    /\btenho\s+receio\s+(disso|dessa|desse|desta|deste)\b/.test(q) ||
    (/\b(fico|fiquei|to|estou)\s+com\s+receio\b/.test(q) && hasConcernDecisionAnchor(q)) ||
    (/\bme\s+(da|deu|deixa|deixou)\s+receio\b/.test(q) && hasConcernDecisionAnchor(q))
  ) {
    return true;
  }

  // I3 — Insegurança
  if (
    /\b(isso|essa|esse|esta|este)\s+me\s+(deixa|deixou)\s+insegur[oa]\b/.test(q) ||
    /\b(fico|fiquei|to|estou)\s+insegur[oa]\s+com\s+(isso|essa|esse|esta|este)\b/.test(q) ||
    /\bnao\s+(to|estou|fico|fiquei)\s+segur[oa]\s+(disso|dessa|desse|desta|deste|com\s+isso|com\s+essa|com\s+esse)\b/.test(
      q
    )
  ) {
    return true;
  }

  // I4 — Pé atrás (idiom — anchor implied by active session)
  if (
    /\b(fico|fiquei|to|estou)\s+com\s+(um\s+)?pe\s+atras\b/.test(q) ||
    /\btenho\s+(um\s+)?pe\s+atras\s+com\s+(isso|essa|esse|esta|este)\b/.test(q) ||
    /\b(isso|essa|esse|esta|este)\s+me\s+(deixou|deixa)\s+com\s+(um\s+)?pe\s+atras\b/.test(q) ||
    /\bme\s+(deixou|deixa)\s+com\s+(um\s+)?pe\s+atras\b/.test(q)
  ) {
    return true;
  }

  // I5 — Incômodo / desconforto
  if (
    /\b(isso|essa|esse|esta|este)\s+me\s+incomoda\b/.test(q) ||
    /\b(isso|essa|esse|esta|este)\s+me\s+(deixa|deixou)\s+desconfortavel\b/.test(q) ||
    /\b(fico|fiquei|to|estou)\s+desconfortavel\s+com\s+(isso|essa|esse|esta|este)\b/.test(q) ||
    /\b(isso|essa|esse|esta|este)\s+nao\s+me\s+(deixou|deixa)\s+confortavel\b/.test(q) ||
    (/\bnao\s+me\s+(deixou|deixa)\s+confortavel\b/.test(q) && hasConcernDecisionAnchor(q))
  ) {
    return true;
  }

  // I6 — Falta de tranquilidade
  if (
    /\bnao\s+(to|estou|fico|fiquei)\s+(totalmente\s+)?tranquil[oa]\s+com\s+(isso|essa|esse|esta|este)\b/.test(
      q
    ) ||
    /\bnao\s+fico\s+tranquil[oa]\s+com\s+(isso|essa|esse|esta|este)\b/.test(q) ||
    /\b(isso|essa|esse|esta|este)\s+nao\s+me\s+(deixa|deixou)\s+tranquil[oa]\b/.test(q) ||
    /\b(isso|essa|esse|esta|este)\s+nao\s+me\s+(passa|transmite)\s+tranquilidade\b/.test(q) ||
    (/\bnao\s+me\s+(passa|transmite|deixou|deixa)\s+tranquilidade\b/.test(q) &&
      hasConcernDecisionAnchor(q)) ||
    (/\bnao\s+me\s+(deixa|deixou)\s+tranquil[oa]\b/.test(q) && hasConcernDecisionAnchor(q))
  ) {
    return true;
  }

  return false;
}

const _BCH_DEMO =
  /\b(isso|essa|esse|esta|este|aquilo|aquela|aquele|disso|dessa|desse|desta|deste|nisso|nessa|nesse|nesta|neste)\b/;

function isBestChoiceHesitationSearchGuard(q) {
  if (/\bnao sei qual\b.{0,40}\b(comprar|escolher|buscar|pegar|levar)\b/.test(q)) return true;
  if (/\bnao sei o que\s+(comprar|escolher|buscar)\b/.test(q)) return true;
  if (/\bem duvida entre\b/.test(q)) return true;
  if (/\b(qual|quais)\b.{0,50}\b(iphone|samsung|xiaomi|motorola|notebook|celular)\b.{0,30}\b(ou|vs|versus)\b/.test(q)) {
    return true;
  }
  if (/\bcompara\b/.test(q) && /\b(com|e|ou|vs|versus)\b/.test(q)) return true;
  if (/^\s*qual\b/.test(q) && /\b(melhor|pior)\b/.test(q) && /\b(celular|notebook|produto|opcao)\b/.test(q)) {
    return true;
  }
  if (/^\s*qual\b.{0,40}\b(melhor escolha|melhor opcao)\b.{0,20}\bate\s+\d/.test(q)) return true;
  if (/\b(me mostra|mostra|mostre|procura|busca|buscar|achar)\b.{0,30}\b(outras? opcoes|opcoes|outro|alternativ)\b/.test(q)) {
    return true;
  }
  if (/^\s*qual\s+(e|eh)\s+a\s+melhor\s+escolha\s*\??\s*$/.test(q)) return true;
  return false;
}

/**
 * PATCH 7.6V-G — Best choice hesitation about the current recommendation.
 * Dúvida se a escolha/decisão atual é realmente a melhor.
 */
function detectsBestChoiceHesitationAboutRecommendation(q) {
  if (isBestChoiceHesitationSearchGuard(q)) return false;

  // E1 — Melhor escolha / escolha certa
  if (
    /\bnao\s+sei\s+se\s+(essa|esse|esta|este\s+)?(e|eh)\s+a\s+melhor\s+escolha\b/.test(q) ||
    /\bnao\s+sei\s+se\s+(essa|esse)\s+(e|eh)\s+a\s+melhor\s+escolha\b/.test(q) ||
    /\bsera\s+que\s+(essa|esse\s+)?(e|eh)\s+a\s+melhor\s+escolha\b/.test(q) ||
    /\bsera\s+que\s+(essa|esse)\s+(e|eh)\s+a\s+melhor\s+escolha\b/.test(q) ||
    /\bsera\s+que\s+(essa|esse\s+)?(e|eh)\s+a\s+escolha\s+certa\b/.test(q) ||
    /\bnao\s+sei\s+se\s+(essa|esse\s+)?(e|eh)\s+a\s+escolha\s+certa\b/.test(q)
  ) {
    return true;
  }

  // E2 — Faz sentido / decisão boa
  if (
    /\bsera\s+que\s+(essa|esse)\s+escolha\s+faz\s+sentido\b/.test(q) ||
    /\bsera\s+que\s+escolha\s+faz\s+sentido\b/.test(q) ||
    (/\bsera\s+que\s+faz\s+sentido\b/.test(q) &&
      (_BCH_DEMO.test(q) || /\b(escolha|decisao|compra|nisso|nessa)\b/.test(q))) ||
    /\bnao\s+sei\s+se\s+(essa|esse\s+)?decisao\s+(e|eh)\s+boa\b/.test(q) ||
    /\bnao\s+sei\s+se\s+(essa|esse)\s+decisao\s+(e|eh)\s+boa\b/.test(q) ||
    /\bnao\s+sei\s+se\s+(essa|esse\s+)?decisao\s+faz\s+sentido\b/.test(q) ||
    /\b(essa|esse)\s+decisao\s+parece\s+meio\s+duvidosa\b/.test(q) ||
    /\bnao\s+sei\s+se\s+(essa|esse)\s+escolha\s+(e|eh)\s+boa\b/.test(q)
  ) {
    return true;
  }

  // E3 — Convencimento
  if (
    /\bnao\s+estou\s+totalmente\s+convencid[oa]\b/.test(q) ||
    /\bnao\s+fiquei\s+convencid[oa]\b/.test(q) ||
    /\bainda\s+nao\s+me\s+convenceu\b/.test(q) ||
    /\bnao\s+me\s+convenceu\s+totalmente\b/.test(q) ||
    /\bnao\s+estou\s+muito\s+convencid[oa]\b/.test(q)
  ) {
    return true;
  }

  // E4 — Certeza / dúvida sobre escolha atual
  if (
    /\bnao\s+tenho\s+certeza\s+(dessa|desse|desta|deste)\s+escolha\b/.test(q) ||
    (/\bnao\s+tenho\s+certeza\s+disso\b/.test(q) && _BCH_DEMO.test(q)) ||
    /\b(essa|esse)\s+escolha\s+me\s+deixa\s+em\s+duvida\b/.test(q) ||
    /\b(essa|esse)\s+decisao\s+me\s+deixa\s+em\s+duvida\b/.test(q) ||
    /\bestou\s+em\s+duvida\s+com\s+(essa|esse)\s+escolha\b/.test(q)
  ) {
    return true;
  }

  // E5 — Vale mesmo / compensa
  if (
    /\bsera\s+que\s+vale\s+mesmo\b/.test(q) ||
    /\bsera\s+que\s+compensa\s+mesmo\b/.test(q) ||
    /\bvale\s+mesmo\s+a\s+pena\b/.test(q) ||
    /\bnao\s+sei\s+se\s+vale\s+mesmo\b/.test(q) ||
    /\bnao\s+sei\s+se\s+compensa\s+mesmo\b/.test(q)
  ) {
    return true;
  }

  // E6 — Caminho / direção
  if (
    /\bnao\s+sei\s+se\s+iria\s+por\s+esse\s+caminho\b/.test(q) ||
    /\bnao\s+sei\s+se\s+seguiria\s+esse\s+caminho\b/.test(q) ||
    /\bnao\s+sei\s+se\s+esse\s+(e|eh)\s+o\s+caminho\b/.test(q) ||
    /\bnao\s+sei\s+se\s+iria\s+nessa\s+direcao\b/.test(q)
  ) {
    return true;
  }

  return false;
}

function detectsHesitationSignal(q, { hasActiveAnchor }) {
  const NONE = { detected: false, subtype: null };
  if (!hasActiveAnchor) return NONE;

  // ── Guards: new-search and comparison intent must not be treated as hesitation ─
  if (/\bnao sei qual\b.{0,40}\b(comprar|escolher|buscar|pegar|levar)\b/.test(q)) return NONE;
  if (/\bnao sei o que\s+(comprar|escolher|buscar)\b/.test(q)) return NONE;
  if (/\bem duvida entre\b/.test(q)) return NONE;

  // ── Best choice hesitation (PATCH 7.6V-G) ────────────────────────────────────
  // Precedes Family A (generic "me deixa em dúvida") and downstream REACTION/EXPLANATION.
  if (detectsBestChoiceHesitationAboutRecommendation(q)) {
    return { detected: true, subtype: "not_convinced" };
  }

  // ── Family A — Explicit doubt ────────────────────────────────────────────────
  if (
    /(^|\s)(to|ta|estou|fico|continuo|fiquei|ainda)\s+(na|em)\s+duvida\b/.test(q) ||
    /\bme\s+(deixou|deixa|fez|faz\s+ficar)\s+(em|na)\s+duvida\b/.test(q)
  ) return { detected: true, subtype: "hesitation" };

  // ── Family B — Indecision ────────────────────────────────────────────────────
  if (
    /\b(to|estou|fiquei|fico|ainda|ainda\s+to|ainda\s+estou)\s+indeciso\b/.test(q) ||
    /\bnao\s+(consigo|consegui|conseguia)\s+decidir\b/.test(q) ||
    /\bnao\s+decidi\s+(ainda|bem|direito)\b/.test(q) ||
    /\bainda\s+nao\s+(decidi|me\s+decidi)\b/.test(q)
  ) return { detected: true, subtype: "indecision" };

  // ── Family H — Purchase Anxiety (PATCH 7.6F + 7.6U-F + 7.6V-J) ───────────────
  // Precedes concern — purchase_anxiety > concern when explicit error/regret fear.
  if (matchesPurchaseAnxietyFamilyH(q)) {
    return { detected: true, subtype: "purchase_anxiety" };
  }

  // ── Family I — Concern about current recommendation (PATCH 7.6V-F) ───────────
  // Precedes generic lack-of-confidence (Family D) when anchored to this choice.
  if (detectsConcernAboutRecommendation(q)) {
    return { detected: true, subtype: "concern" };
  }

  // ── Family C — Cannot explain / diffuse uncertainty ──────────────────────────
  // Original: "não sei explicar", "não sei o que me incomoda"
  // PATCH 7.6F: diffuse discomfort variants — "algo me incomoda", "alguma coisa
  //   ta me incomodando", "não consigo apontar o problema", "tem algo estranho".
  //   Intenção: desconforto difuso que o usuário não consegue articular.
  if (
    /\bnao\s+sei\s+(explicar|dizer|bem|direito|ao\s+certo)\b/.test(q) ||
    /\bnao\s+sei\s+o\s+que\s+(me\s+incomoda|falta|me\s+faz|eu\s+quero)\b/.test(q) ||
    // PATCH 7.6F — "algo me incomoda" / "alguma coisa ta me incomodando"
    /\b(algo|alguma\s+coisa)\s+(me\s+incomoda|ta\s+me\s+incomodando|esta\s+me\s+incomodando)\b/.test(q) ||
    // PATCH 7.6F — "não consigo apontar / identificar o que é / o problema"
    /\bnao\s+consigo\s+(apontar|identificar)\s+(o\s+que|exatamente)\b/.test(q) ||
    // PATCH 7.6F — "tem algo estranho / que não me cai bem / que não me desce"
    /\btem\s+(algo|alguma\s+coisa)\s+(estranha|estranho|que\s+nao\s+me\s+(cai|desce|encaixa))\b/.test(q)
  ) return { detected: true, subtype: "not_sure" };

  // ── Family D — Lack of confidence ────────────────────────────────────────────
  // Original: "não tô seguro/tranquilo/confiante/convicto"
  // PATCH 7.6F: "sentindo confiança/segurança" as noun form;
  //   "confortável" as comfort-confidence synonym; "sem segurança nessa".
  //   Intenção: ausência de confiança interna — sem rejeição explícita.
  if (
    /\bnao\s+(to|estou|fico|fiquei|me\s+sinto|me\s+senti)\s+(seguro|segura|tranquilo|tranquila|confiante|convicto|confortavel)\b/.test(q) ||
    /\bnao\s+me\s+(passa|transmite|passou|deixou|deu)\s+(seguranca|confianca|tranquilidade)\b/.test(q) ||
    // PATCH 7.6R — past-tense lack of confidence (LACK_OF_CONFIDENCE family)
    (/\bnao\s+me\s+deixou\b/.test(q) &&
      /\b(seguro|segura|tranquilo|tranquila)\b/.test(q)) ||
    /\b(me\s+deixou|me\s+fez|me\s+sinto|me\s+senti|fiquei)\s+(inseguro|insegura|incerto|incerta|hesitante)\b/.test(q) ||
    // PATCH 7.6F — "não tô sentindo confiança/segurança" (noun form)
    /\bnao\s+(to|estou)\s+sentindo\s+(confianca|seguranca|tranquilidade)\b/.test(q) ||
    // PATCH 7.6F — "tô sem segurança nessa decisão/escolha"
    (/\b(to|estou)\s+sem\s+(seguranca|confianca)\b/.test(q) &&
      /\b(decisao|escolha|compra|nisso|nessa|nesse)\b/.test(q)) ||
    // PATCH 7.6F — "não tô confortável" / "não me sinto confortável"
    /\bnao\s+(to|estou|me\s+sinto|me\s+senti|fiquei)\s+confortavel\b/.test(q) ||
    // PATCH 7.6F — "fiquei desconfortável" / "me sinto desconfortável" (negative prefix form)
    /\b(fiquei|estou|me\s+sinto|me\s+senti|to)\s+desconfortavel\b/.test(q)
  ) return { detected: true, subtype: "not_sure" };

  // ── Family E — Not convinced ─────────────────────────────────────────────────
  // Note: "nao gostei" is already handled by detectsObjectionSignal (step 4).
  // PATCH 7.7O — não engolir tail comercial após prefixo de discordância leve.
  if (
    !hasSoftDisagreementCommercialTail(q) &&
    (
    /\bacho\s+que\s+nao\s+gostei\b/.test(q) ||
    /\bnao\s+gostei\s+muito\b/.test(q) ||
    /\bnao\s+me\s+convenceu\b/.test(q) ||
    /\bnao\s+me\s+convenceu\s+ainda\b/.test(q) ||
    // PATCH 7.6R — participle/adjective not convinced (NOT_CONVINCED family)
    /\b(ainda\s+)?nao\s+(to|estou|fiquei|me\s+sinto)\s+(convencido|convencida)\b/.test(q) ||
    /\bnao\s+(to|estou)\s+convencid[oa]\b/.test(q) ||
    /\bnao\s+sei\s+se\s+gostei\b/.test(q) ||
    // PATCH 7.6U-F — resistance to current recommendation (category-agnostic)
    /\bnao\s+sei\s+se\s+iria\s+(nesse|nele|nessa|nela)\b/.test(q) ||
    /\bnao\s+sei\s+se\s+compraria\s+(esse|ele|ela|nesse|nele|nessa|nela)\b/.test(q) ||
    /\bnao\s+sei\s+se\s+confio\s+(nessa|nesse|nele|nela)\s+escolha\b/.test(q) ||
    (/\bnao\s+bateu\b/.test(q) && !/\b(preco|valor|orcamento)\b/.test(q)) ||
    /\bnao\s+senti\s+firmeza\b/.test(q) ||
    /\bnao\s+me\s+ganhou\b/.test(q) ||
    /\bnao\s+curti\s+(muito|tanto|assim)\b/.test(q) ||
    // PATCH 7.6V-C — best-choice hesitation (anchored doubt about current recommendation)
    /\bnao\s+sei\s+se\s+(e|eh)\s+a\s+melhor\s+escolha\b/.test(q) ||
    /\bnao\s+sei\s+se\s+(essa|esse|esta|este)\s+(e|eh)\s+a\s+melhor\s+escolha\b/.test(q) ||
    /\bnao\s+sei\s+se\s+(e|eh)\s+a\s+escolha\s+certa\b/.test(q) ||
    /\bnao\s+sei\s+se\s+(essa|esse)\s+escolha\s+(e|eh)\s+boa\b/.test(q) ||
    /\bsera\s+que\s+(e|eh)\s+a\s+melhor\s+escolha\b/.test(q)
    )
  ) return { detected: true, subtype: "not_convinced" };

  // ── Family F — Short informal hesitation (standalone only, ≤3 words) ─────────
  if (q.split(" ").length <= 3) {
    if (/^hm+$/.test(q)) return { detected: true, subtype: "hesitation" };
    if (/^talvez$/.test(q)) return { detected: true, subtype: "hesitation" };
    if (/^nao\s+sei$/.test(q)) return { detected: true, subtype: "not_sure" };
  }

  // ── Family G — Decision Paralysis (PATCH 7.6F) ───────────────────────────────
  // Intenção: bloqueio de decisão — usuário está paralisado, perdido, travado.
  // Diferente de Family B (não consegue decidir): aqui usa metáforas espaciais
  // de imobilidade ("perdido", "travado", "não sai do lugar").
  //
  // Guard: "perdido" isolado sem contexto de decisão não dispara — exige
  //   co-ocorrência com sinal de decisão ou verbo de estado no contexto da frase.
  if (
    // G1 — Spatial metaphors: perdido/travado no contexto de decisão/escolha
    (/\b(to|estou|fiquei)\s+(meio\s+)?(perdido|perdida)\b/.test(q) &&
      /\b(decisao|escolha|compra|nessa|nisso|aqui)\b/.test(q)) ||
    /\b(to|estou|fiquei)\s+(meio\s+)?(travado|travada)\b/.test(q) ||
    // G2 — "não consigo me decidir" (reflexive variant — not in Family B)
    /\bnao\s+consigo\s+me\s+decidir\b/.test(q) ||
    // G3 — "não sai do lugar" / "não anda essa decisão"
    /\bnao\s+(sai|saiu|saia)\s+do\s+lugar\b/.test(q) ||
    /\b(decisao|escolha)\s+nao\s+(anda|sai|caminha|avanca)\b/.test(q) ||
    // G4 — "continuo parado nessa" / "to parado com isso"
    (/\b(continuo|to|estou)\s+parad[oa]\b/.test(q) &&
      /\b(nessa|nesse|com\s+isso|na\s+decisao|na\s+escolha)\b/.test(q)) ||
    // G5 — "não consigo avançar" / "não sai do lugar"
    /\bnao\s+consigo\s+(avancar|sair\s+do\s+lugar)\b/.test(q)
  ) return { detected: true, subtype: "decision_paralysis" };

  return NONE;
}

/**
 * PATCH 7.6R — Projective Risk family (PROJECTIVE_RISK)
 *
 * O usuário pergunta à MIA qual seria a preocupação/risco da recomendação
 * atual — não está abrindo nova busca nem rejeitando explicitamente.
 *
 * Exemplos: "qual seria seu medo nessa compra?", "o que te preocuparia?",
 * "qual o maior risco?", "o que poderia dar errado?"
 *
 * @param {string} q — query normalizada
 * @param {{ hasActiveAnchor: boolean }} opts
 * @returns {{ detected: boolean, subtype: string|null }}
 */
function isProjectiveRiskSearchOrReviewGuard(q) {
  if (/\b(procura|busca|buscar|mostra|me mostra|achar)\b.{0,35}\b(outro|sem|alternativ)\b/.test(q)) {
    return true;
  }
  if (/\bqual\s+produto\b.{0,30}\b(sem|nao tem)\b/.test(q)) return true;
  if (/\blista\b.{0,25}\b(vantagens|desvantagens)\b/.test(q)) return true;
  if (/\bpontos negativos em geral\b/.test(q)) return true;
  if (/\b(ja me decepcionei|ja fiquei decepcionad[oa])\b/.test(q)) return true;
  if (/^(esse|essa|isso|este|esta)\s+(produto\s+)?(e|eh)\s+ruim\b/.test(q)) return true;
  if (/^(isso|esse|essa)\s+(e|eh)\s+chato demais\b/.test(q)) return true;
  return false;
}

function detectsProjectiveRiskSignal(q, { hasActiveAnchor }) {
  const NONE = { detected: false, subtype: null };
  if (!hasActiveAnchor) return NONE;

  // Medo/receio em 1ª pessoa pertence a hesitation Family H, não a projective risk
  if (
    /\b(tenho|to com|estou com)\s+(medo|receio)\b/.test(q) &&
    !/\b(seu|voce|vc|te|lhe)\b/.test(q)
  ) return NONE;

  // Conditional personal regret/error — purchase_anxiety, not risk probe
  if (
    /\be\s+se\s+(eu\s+)?me\s+arrepender\b/.test(q) ||
    /\bse\s+(eu\s+)?me\s+arrepender\b/.test(q) ||
    /\btenho\s+medo\s+de\s+me\s+arrepender\b/.test(q) ||
    /\be\s+se\s+(eu\s+)?errar\b/.test(q) ||
    /\bse\s+(eu\s+)?errar\b/.test(q) ||
    /\be\s+se\s+(eu\s+)?escolher\s+errado\b/.test(q) ||
    /\btenho\s+medo\s+de\s+errar\b/.test(q) ||
    /\btenho\s+medo\s+de\s+escolher\s+errado\b/.test(q)
  ) {
    return NONE;
  }

  // Guard: discovery / nova busca / review geral / reclamação decidida
  if (/\bnao sei qual\b.{0,40}\b(comprar|escolher|buscar)\b/.test(q)) return NONE;
  if (isProjectiveRiskSearchOrReviewGuard(q)) return NONE;

  const riskProbeSignal =
    // "qual seria seu medo/receio/ponto fraco/contra/risco"
    /\bqual\s+(seria|e|eh)\s+(o\s+)?(seu|o\s+seu)\s+(medo|receio|ponto\s+fraco|contra|risco)\b/.test(q) ||
    // "qual o maior risco"
    /\bqual\s+o\s+maior\s+risco\b/.test(q) ||
    // "o que te/lhe preocuparia"
    /\bo\s+que\s+(te|lhe)\s+preocuparia\b/.test(q) ||
    // "onde você ficaria com receio"
    /\bonde\s+(voce|vc)\s+ficaria\s+com\s+receio\b/.test(q) ||
    // "o que você teria/ficaria com receio"
    /\b(o\s+que|onde)\s+(voce|vc)\s+(ficaria|teria)\s+(com\s+)?receio\b/.test(q) ||
    // "o que poderia dar errado"
    /\bo\s+que\s+poderia\s+dar\s+errado\b/.test(q) ||
    // "qual seria o ponto fraco / o contra"
    /\bqual\s+(seria|e|eh)\s+o\s+(ponto\s+fraco|contra)\b/.test(q) ||
    // "qual o risco de (eu) me arrepender"
    /\bqual\s+o\s+risco\s+de\s+(eu\s+)?(me\s+)?arrepender\b/.test(q) ||
    // "o que você veria/enxergaria de risco/problema"
    /\b(o\s+que|onde)\s+(voce|vc)\s+(veria|enxergaria|tem)\s+(risco|problema|receio)\b/.test(q) ||
    // PATCH 7.6U-F — risk probe / hidden downside (category-agnostic)
    /\bonde\s+(eu\s+)?(posso|pod(ei|ia))\s+me\s+arrepender\b/.test(q) ||
    /\bem\s+que\s+(eu\s+)?(posso|pod(ei|ia))\s+me\s+arrepender\b/.test(q) ||
    /\bqual\s+a\s+chance\s+de\s+(eu\s+)?(me\s+)?arrepender\b/.test(q) ||
    /\bonde\s+costuma\s+dar\s+arrependimento\b/.test(q) ||
    // PATCH 7.6V-H — pegadinha / porém
    /\btem\s+alguma\s+pegadinha\b/.test(q) ||
    /\bqual\s+a\s+pegadinha\b/.test(q) ||
    /\bonde\s+esta\s+a\s+pegadinha\b/.test(q) ||
    /\btem\s+algum\s+porem\b/.test(q) ||
    /\bqual\s+o\s+porem\b/.test(q) ||
    /\bonde\s+esta\s+o\s+porem\b/.test(q) ||
    // PATCH 7.6V-H — algo oculto / não percebido
    /\btem\s+algum\s+detalhe\s+escondido\b/.test(q) ||
    /\btem\s+algo\s+escondido\b/.test(q) ||
    /\btem\s+algum\s+ponto\s+que\s+passa\s+batido\b/.test(q) ||
    /\btem\s+algo\s+que\s+(eu\s+)?deveria\s+saber\b/.test(q) ||
    /\btem\s+algo\s+que\s+(eu\s+)?nao\s+estou\s+vendo\b/.test(q) ||
    // PATCH 7.6V-H — lado ruim / ponto fraco
    /\bqual\s+o\s+lado\s+ruim\b/.test(q) ||
    /\bqual\s+o\s+lado\s+negativo\b/.test(q) ||
    /\bqual\s+o\s+ponto\s+fraco\b/.test(q) ||
    /\bqual\s+o\s+ponto\s+ruim\b/.test(q) ||
    /\bqual\s+a\s+desvantagem\b/.test(q) ||
    /\bqual\s+o\s+risco\s+escondido\b/.test(q) ||
    // PATCH 7.6V-H — incômodo posterior
    /\bo\s+que\s+pode\s+me\s+incomodar\s+depois\b/.test(q) ||
    /\bo\s+que\s+pode\s+incomodar\s+no\s+futuro\b/.test(q) ||
    /\bo\s+que\s+pode\s+irritar\s+depois\b/.test(q) ||
    /\bo\s+que\s+pode\s+ficar\s+chato\s+depois\b/.test(q) ||
    // PATCH 7.6V-H — surpresa ruim
    /\btem\s+alguma\s+surpresa\s+ruim\b/.test(q) ||
    /\btem\s+alguma\s+surpresa\s+negativa\b/.test(q) ||
    /\btem\s+algo\s+que\s+pode\s+surpreender\s+negativamente\b/.test(q) ||
    /\btem\s+algo\s+que\s+pode\s+ser\s+ruim\s+depois\b/.test(q) ||
    // PATCH 7.6V-H — parte chata / decepção
    /\bqual\s+a\s+parte\s+chata\b/.test(q) ||
    /\bqual\s+a\s+parte\s+mais\s+chata\b/.test(q) ||
    /\bo\s+que\s+costuma\s+decepcionar\b/.test(q) ||
    /\bo\s+que\s+pode\s+decepcionar\b/.test(q) ||
    /\bonde\s+costuma\s+decepcionar\b/.test(q);

  if (riskProbeSignal) {
    return { detected: true, subtype: "risk_probe" };
  }

  return NONE;
}

/**
 * PATCH 7.6R — Decision Delegation family (DECISION_DELEGATION)
 *
 * O usuário delega a decisão final à MIA — quer saber o que a MIA faria
 * no lugar dele, sem abrir nova busca nem pedir alternativa de ranking.
 *
 * Exemplos: "o que você faria?", "qual seria sua escolha?", "e se fosse você?"
 *
 * @param {string} q — query normalizada
 * @param {{ hasActiveAnchor: boolean }} opts
 * @returns {{ detected: boolean, subtype: string|null }}
 */
function detectsDelegationSignal(q, { hasActiveAnchor }) {
  const NONE = { detected: false, subtype: null };
  if (!hasActiveAnchor) return NONE;

  // Guard: frames condicionais de alternativa (runner-up), não delegação
  if (/\bse (eu|vc|voce) nao quiser\b/.test(q)) return NONE;
  if (/\bse nao ficar com\b/.test(q)) return NONE;

  const delegationSignal =
    // "o que você faria"
    /\bo\s+que\s+(voce|vc)\s+faria\b/.test(q) ||
    // "qual seria sua escolha"
    /\bqual\s+seria\s+(a\s+)?sua\s+escolha\b/.test(q) ||
    // PATCH 7.6V-N — "qual seria sua decisao" (delegation, not new search)
    /\bqual\s+seria\s+(a\s+)?sua\s+decisao\b/.test(q) ||
    // "você compraria / manteria / trocaria"
    /\b(voce|vc)\s+(compraria|manteria|trocaria)\b/.test(q) ||
    // "e se fosse você"
    /\be\s+se\s+fosse\s+(voce|vc)\b/.test(q) ||
    // "no seu lugar, o que faria / o que você faria"
    /\bno\s+seu\s+lugar[,]?\s+(o\s+que\s+)?(voce|vc\s+)?faria\b/.test(q) ||
    // "qual você escolheria" — delegação pessoal, não pedido de ranking
    (/\bqual\s+(voce|vc)\s+escolheria\b/.test(q) &&
      !/\b(segundo|terceiro|quarto|quinto|opcao|lugar|posicao)\b/.test(q)) ||
    // PATCH 7.6U-F — informal delegation to MIA's pick (category-agnostic)
    /^vai\s+em\s+qual\b/.test(q) ||
    /\b(voce|vc|tu)\s+iria\s+em\s+qual\b/.test(q) ||
    /\bqual\s+(tu|voce|vc)\s+iria\b/.test(q);

  if (delegationSignal) {
    return { detected: true, subtype: "decision_delegation" };
  }

  return NONE;
}

function detectsRefinementSignal(q, { hasActiveAnchor, detectedIntent, contextResolution }) {
  if (contextResolution?.mode === "refinement") return true;
  if (detectedIntent === "refinement" && hasActiveAnchor) return true;

  if (!hasActiveAnchor) return false;

  const refinementPatterns = [
    /mais barato|mais barata/,
    /mais economico|mais econômico/,
    /com mais bateria/,
    /com melhor camera|com melhor câmera/,
    /so samsung|só samsung/,
    /so xiaomi|só xiaomi/,
    /so motorola|só motorola/,
    /so iphone|só iphone/,
    /tem algo (mais|melhor|diferente)/,
    /tem outro (melhor|mais)/,
    /alternativa mais/,
  ];

  if (refinementPatterns.some((re) => re.test(q))) return true;

  // ── PATCH 7.6G — SIMILARITY_DISCOVERY + PROFILE_MATCH ───────────────────────
  //
  // Intenção: o usuário quer algo com perfil/característica similar à
  // recomendação atual — sem rejeitar, sem pedir posição de ranking.
  //
  // Dois grupos semânticos:
  //
  //   S1 — Similarity adjectives: "parecido/semelhante/equivalente/similar"
  //        "algo parecido mas mais barato", "algo semelhante", "equivalente a esse"
  //
  //   S2 — Same-profile patterns: "mesma linha", "mesmo perfil", "mesmo estilo"
  //        "algo na mesma linha", "algo com o mesmo perfil"
  //        Guard: excludes transport lines ("linha de ônibus") and social media.
  //
  // NOTA: "algo parecido com esse?" já é coberto via asksAlternative,
  //       mas "algo na mesma linha?" e "mesmo perfil" são novos gaps.
  //
  // NÃO funciona sem âncora (guard no topo da função).

  // S1 — similarity adjectives co-occurring with product-seeking terms
  const _hasSimilarityAdj =
    /\b(algo|alguma\s+coisa)\s+(parecid[ao]|semelhante|equivalente|similar)\b/.test(q) ||
    /\b(parecid[ao]|semelhante|equivalente|similar)\s+(com|a)\s+(esse|essa|ele|ela|o\s+atual)\b/.test(q) ||
    /\b(outro|outra)\s+(produto|modelo|opcao|opção)\s+(parecid[ao]|semelhante|equivalente|similar)\b/.test(q);

  // S2 — same-profile/style/line patterns (guards social/transport contexts)
  const _socialTransportCtx = /\b(onibus|metro|trem|bus|instagram|facebook|twitter|rede\s+social|linha\s+de\s+producao)\b/;

  const _hasSameProfile =
    (/\bmesm[ao]\s+(linha|perfil|estilo|proposta|ideia|faixa|nivel|categoria)\b/.test(q) &&
      !_socialTransportCtx.test(q)) ||
    /\bnessa\s+(pegada|faixa|proposta)\b/.test(q) ||
    /\b(perfil|caracteristicas)\s+(parecid[ao]|semelhante|similar)\b/.test(q) ||
    /\balgo\s+no\s+mesmo\s+(estilo|nivel|perfil)\b/.test(q) ||
    /\bmesma\s+proposta\b/.test(q);

  if (_hasSimilarityAdj || _hasSameProfile) return true;

  // ── PATCH 6.5 — Alternative Exploration: segunda posição, reserva, outra opção ────
  //
  // Quatro clusters semânticos para pedidos de alternativa estrutural ao winner:
  //
  //   SEGUNDA POSIÇÃO  — "plano B", "quem ficou em segundo?", "quem quase ganhou?"
  //   RESERVA/BACKUP   — "tem um reserva?", "tem um backup?"
  //   OUTRA OPÇÃO      — "qual outro faria sentido?", "qual o concorrente mais forte?"
  //   REJEIÇÃO CONDIC. — "se eu não quiser esse, qual seria?"
  //
  // Requer hasActiveAnchor (garantido pelo guard no início da função).
  // NÃO sobrescreve "alternativa mais barata" (coberta pelos padrões acima).

  // SEGUNDA POSIÇÃO / runner-up do produto atual
  // PATCH 6.7 — adicionado "escolha" e "colocado" para cobrir
  //   "e a segunda escolha?", "e o segundo colocado?"
  const secondPositionSignal =
    /\bplano\s+b\b/.test(q) ||
    /\bquase\s+(ganhou|venceu)\b/.test(q) ||
    (/\b(ficou|fico)\b/.test(q) && /\bem segundo\b/.test(q)) ||
    (/\b(segundo|segunda)\b/.test(q) &&
      /\b(opcao|opção|lugar|posicao|posição|classificado|escolha|colocado)\b/.test(q));

  // RESERVA / BACKUP como alternativa explícita (não "bateria reserva")
  const reserveAlternativeSignal =
    (/\b(reserva|backup)\b/.test(q) && !/\b(bateria|carga|energia)\s+reserva\b/.test(q)) ||
    /tem\s+um\s+(reserva|backup)\b/.test(q);

  // OUTRA OPÇÃO ABERTA — qual outro, o que vem depois, concorrente mais forte
  // PATCH 6.7 — adicionado:
  //   "depois dele/desse"           → "e depois dele?", "e depois desse?"
  //   "o próximo / opção seguinte"  → "e o próximo?", "e o próximo da lista?"
  //   "outro que + verbo"           → "e outro que faça sentido?"
  const openAlternativeSignal =
    (/\b(qual|que)\s+(outro|outra)\b/.test(q) &&
      /\b(faria sentido|viria depois|seria|eu escolheria|voce escolheria)\b/.test(q)) ||
    (/\b(o que|quem|qual)\b/.test(q) &&
      /\b(vem|fica|ficou)\b/.test(q) &&
      /\b(logo|depois|atras|atrás)\b/.test(q)) ||
    /\b(concorrente|rival)\s+(mais\s+forte|direto|principal)\b/.test(q) ||
    (/\bexiste\s+(uma|outra|um)\s+(opcao|opção|alternativa)\b/.test(q) &&
      !/\b(mais barata|mais barato)\b/.test(q)) ||
    // PATCH 6.7 — posicional relativo ao winner
    /\bdepois\s+(dele|desse|deles|dela|dessa)\b/.test(q) ||
    /\b(o\s+proximo|a\s+proxima|opcao\s+seguinte|proxima\s+opcao)\b/.test(q) ||
    (/\boutro\s+que\b/.test(q) &&
      /\b(faca|faria|valha|valeria|faz|funcione|tenha|teria|possa|poderia)\b/.test(q));

  // REJEIÇÃO CONDICIONAL do winner → pede alternativa
  const conditionalRejectionSignal =
    /\bse (eu|vc|voce) nao quiser (esse|essa)\b/.test(q) ||
    /\bse nao ficar com (esse|essa|ele|ela)\b/.test(q);

  return (
    secondPositionSignal       ||
    reserveAlternativeSignal   ||
    openAlternativeSignal      ||
    conditionalRejectionSignal
  );
}

// PATCH 7.9Z.1 — ANCHORED_SHORT_FOLLOW_UP (continuidade cognitiva pós-âncora)
const ANCHORED_SHORT_FOLLOW_UP_CATEGORY_PATTERN =
  /\b(celular|smartphone|iphone|android|notebook|laptop|tv|monitor|fone|headset|cadeira|pc gamer|computador|console|geladeira|fogao|microondas|tablet|mouse|teclado|camera|webcam|impressora|smartwatch|relogio|air fryer|maquina de lavar)\b/;

const ANCHORED_SHORT_FOLLOW_UP_ATTRIBUTE_PATTERN =
  /\b(bateria|autonomia|camera|desempenho|performance|conforto|durabilidade|preco|armazenamento|memoria|tela|peso|qualidade|resistencia|custo beneficio|custo-beneficio|energia|capacidade|velocidade|silencio|ruido|brilho|nitidez|resolucao|refresh|hz|fps|conectividade|wifi|bluetooth|portabilidade|compacto|leveza|estabilidade|fiabilidade|garantia|suporte|material|acabamento|design|estetica|ergonomia|ajuste|regulagem|amortecimento|ventilacao|refrigeracao|consumo|economia|eficiencia|latencia|input lag|resposta)\b/;

const ANCHORED_SHORT_FOLLOW_UP_USE_CASE_PATTERN =
  /\b(jogos?|jogar|gaming|gamer|trabalhar|trabalho|estudar|estudo|foto|fotos|fotografar|video|videos|editar|streaming|uso pesado|fora de casa|escritorio|home office|reuniao|aula|faculdade|facul|viagem|viajar|cozinhar|limpeza|escritorio|escola|academia|musica|podcast|leitura|desenhar|programar|codar|render|modelagem)\b/;

function hasAnchoredShortFollowUpBlockedFamily(message = "") {
  const q = normalize(message);
  if (!q) return true;

  return (
    isConstraintChangeFamilyQuery(q) ||
    isAlternativeExplorationFamilyQuery(q) ||
    isSecondBestDiscoveryFamilyQuery(q) ||
    isAntiRegretFamilyQuery(q) ||
    isConfidenceChallengeFamilyQuery(q) ||
    isSocialValidationFamilyQuery(q) ||
    isSoftDisagreementFamilyQuery(q) ||
    isDecisionConfirmationFamilyQuery(q) ||
    isComprehensionFamilyQuery(q) ||
    isAcknowledgementFamilyQuery(q) ||
    isGreetingFamilyQuery(q) ||
    !!detectsAlternativeRequestSignal(q, { hasActiveAnchor: true })?.detected
  );
}

function hasExplicitAnchoredNewCommercialSearchIntent(message = "") {
  const q = normalize(message);
  if (!q) return false;

  if (
    /\b(esquece|esqueca|muda para|agora quero|outro tipo|comeca do zero|nova busca|comecar do zero|comeca de novo|outro produto|quero outro produto|zera tudo|recomeca|recomecar|limpa tudo|esquece essa busca|esquece essa recomendacao|deixa esse de lado|vamos comecar de novo|vamos falar de outro produto|outro tipo de produto|muda o foco para|troca pra)\b/.test(q)
  ) {
    return true;
  }

  if (/\b(quero|preciso)\s+(comprar|de)\s+(um|uma)\b/.test(q) && ANCHORED_SHORT_FOLLOW_UP_CATEGORY_PATTERN.test(q)) {
    return true;
  }

  if (/\b(procura|procurar|busca|buscar|pesquisa|pesquisar)\s+(um|uma)\b/.test(q) && ANCHORED_SHORT_FOLLOW_UP_CATEGORY_PATTERN.test(q)) {
    return true;
  }

  if (/\bme recomenda\s+(um|uma)\b/.test(q) && ANCHORED_SHORT_FOLLOW_UP_CATEGORY_PATTERN.test(q)) {
    return true;
  }

  if (/\bquero\s+(um|uma)\b/.test(q) && ANCHORED_SHORT_FOLLOW_UP_CATEGORY_PATTERN.test(q)) {
    return true;
  }

  if (/\bate\s*\d+/.test(q) && ANCHORED_SHORT_FOLLOW_UP_CATEGORY_PATTERN.test(q)) {
    return true;
  }

  return false;
}

/**
 * PATCH 7.9Z.2C — value / custo-benefício axis follow-up on active winner (no new search).
 */
function isAnchoredValueAxisFollowUpQuery(q) {
  if (!q) return false;
  if (/\bqual o custo beneficio\b/.test(q) && q.split(/\s+/).length <= 8) return true;
  return (
    /^qual o custo beneficio\??$/.test(q) ||
    /^e o custo beneficio\??$/.test(q) ||
    /^custo beneficio conta\??$/.test(q) ||
    /^pensando no valor\b/.test(q) ||
    /^qual vale mais pelo preco\??$/.test(q) ||
    /^olhando preco e qualidade\b/.test(q) ||
    /^qual equilibra melhor\??$/.test(q) ||
    /^qual entrega mais pelo valor\??$/.test(q) ||
    /^em custo beneficio qual ganha\??$/.test(q) ||
    /^pensando no bolso\b/.test(q) ||
    /^qual vale (mais|cada real)\??$/.test(q) ||
    /^pelo preco qual compensa\??$/.test(q) ||
    /^qual da mais retorno\??$/.test(q) ||
    /^qual e mais equilibrado\??$/.test(q) ||
    /^pensando no orcamento\b/.test(q) ||
    /^custo beneficio importa mais\b/.test(q)
  );
}

/**
 * PATCH 7.9Z.2A — Short "e ..." aspect probe on active winner.
 * Intention: evaluate another attribute/aspect of the current recommendation — not a new search.
 * Structural/semantic gate; reuses taxonomy patterns, not a closed attribute word list.
 */
function isAnchoredAspectFollowUpIntent(q, words) {
  if (!/^e\s+/.test(q)) return false;
  if (words.length > 6) return false;
  if (hasAnchoredShortFollowUpBlockedFamily(q)) return false;

  // Specialized branches elsewhere in isAnchoredShortFollowUpQuery
  if (/^e\s+se\b/.test(q)) return false;
  if (/^e\s+(esse|essa|isso|ele|ela)\b/.test(q)) return false;

  if (
    /\b(outro|outra|alternativas?|novo|nova|busca|procurar|buscar|comparar|versus|\bvs\b|backup|reserva|concorrente|rival|plano b|segundo|opcoes)\b/.test(
      q
    )
  ) {
    return false;
  }
  if (
    /\b(quero|preciso|busco|buscar|comprar|procura|me acha|me indica|me recomenda|me mostra|mostra|mostre|tem outr)\b/.test(
      q
    )
  ) {
    return false;
  }
  if (
    /\b(gastar|pagar|economizar|orcamento|prioriza|prioridade|priorizar|barato|caro|importa mais|virou prioridade)\b/.test(
      q
    )
  ) {
    return false;
  }
  if (/\bate\s*\d+/.test(q)) return false;
  if (/^(e\s+)?(qual|que)\s+(voce|vc|o|a|recomenda|indica|vale|melhor|escolher|ficou|seria)\b/.test(q)) {
    return false;
  }

  const tail = q.replace(/^e\s+/, "").replace(/\?+$/, "").trim();
  if (!tail) return false;

  // Bare category pivot after "e" → new product intent, not aspect of current winner
  if (
    ANCHORED_SHORT_FOLLOW_UP_CATEGORY_PATTERN.test(tail) &&
    !ANCHORED_SHORT_FOLLOW_UP_ATTRIBUTE_PATTERN.test(q) &&
    tail.split(/\s+/).filter(Boolean).length <= 2
  ) {
    return false;
  }

  if (/^e\s+(para|pra)\s+/.test(q)) return true;
  if (ANCHORED_SHORT_FOLLOW_UP_ATTRIBUTE_PATTERN.test(q)) return true;
  if (ANCHORED_SHORT_FOLLOW_UP_USE_CASE_PATTERN.test(q)) return true;

  const tailWords = tail.split(/\s+/).filter(Boolean);
  return tailWords.length >= 1 && tailWords.length <= 4;
}

/** PATCH 7.9Z.2A — exported read-only detector for audits/tests. */
export function isAnchoredAspectFollowUpQuery(message = "", { hasActiveAnchor = false } = {}) {
  if (!hasActiveAnchor) return false;
  const q = normalize(message);
  if (!q || hasExplicitAnchoredNewCommercialSearchIntent(q)) return false;
  const words = q.split(/\s+/).filter(Boolean);
  if (isAnchoredAspectFollowUpIntent(q, words)) return true;
  const stripped = q.replace(/^(oi|ola|bom dia|e ai),?\s+/, "");
  if (stripped !== q) {
    return isAnchoredAspectFollowUpIntent(stripped, stripped.split(/\s+/).filter(Boolean));
  }
  return false;
}

/**
 * PATCH 7.9Z.1 — Short context-dependent follow-up after anchor/winner is active.
 * Generic across categories; blocks explicit new search and dedicated conversational families.
 */
export function isAnchoredShortFollowUpQuery(message = "", { hasActiveAnchor = false } = {}) {
  if (!hasActiveAnchor) return false;

  const q = normalize(message);
  if (!q) return false;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;

  if (hasExplicitAnchoredNewCommercialSearchIntent(q)) return false;

  const shortRecommendationFollowUp =
    /^(qual|que)\s+(voce|vc)\s+(recomenda|indica|iria|escolheria|prefere|sugere)\??$/.test(q) ||
    /^qual\s+(recomenda|indica|vale|e melhor|fica melhor|compensa)\??$/.test(q) ||
    /^me\s+(indica|recomenda|sugere)\??$/.test(q) ||
    /^(qual|que)\s+(vale mais|e melhor|fica melhor|compensa|vale a pena)\??$/.test(q) ||
    /^voce\s+iria\s+(em\s+)?qual\??$/.test(q) ||
    /^melhor\s+ir\s+(nele|ness[ea]|nisso)\??$/.test(q) ||
    /^entre\s+(ess[eo]s?|est[ea]s)\s*,?\s*qual\??$/.test(q) ||
    /^qual\s+(voce|vc)\s+(iria|escolheria)\??$/.test(q) ||
    /^qual\s+(ficou|seria)\s+melhor\??$/.test(q) ||
    /^(qual|que) o melhor\??$/.test(q) ||
    /^me\s+fala\s+qual\??$/.test(q) ||
    /^me\s+recomenda( um)?\??$/.test(q) ||
    /^recomenda\??$/.test(q) ||
    /^indica( um)?\??$/.test(q) ||
    /^qual\??$/.test(q) ||
    /^me ajuda ai\??$/.test(q) ||
    /^me indica o melhor\??$/.test(q) ||
    /^me indica\b.*\b(melhor|recomenda)\b/.test(q) ||
    /^qual escolher\??$/.test(q) ||
    /^qual vale mais agora\??$/.test(q) ||
    /^ainda e ele\??$/.test(q) ||
    /^entre os dois qual fica\??$/.test(q) ||
    /^ainda e a melhor opcao\??$/.test(q) ||
    /^me ajuda\??$/.test(q) ||
    /^qual melhor(\s+(msm|mesmo))?\??$/.test(q) ||
    isAnchoredValueAxisFollowUpQuery(q);

  const shortAttributeFollowUp =
    /^(e\s+)?(a|o|sobre)\s+/.test(q) &&
    ANCHORED_SHORT_FOLLOW_UP_ATTRIBUTE_PATTERN.test(q) &&
    words.length <= 6;

  const shortAspectFollowUp =
    isAnchoredAspectFollowUpIntent(q, words) ||
    (() => {
      const stripped = q.replace(/^(oi|ola|bom dia|e ai),?\s+/, "");
      if (stripped === q) return false;
      return isAnchoredAspectFollowUpIntent(stripped, stripped.split(/\s+/).filter(Boolean));
    })();

  const shortUseCaseFollowUp =
    /^e\s+(para|pra)\s+/.test(q) &&
    ANCHORED_SHORT_FOLLOW_UP_USE_CASE_PATTERN.test(q) &&
    words.length <= 6;

  const shortRefinementFollowUp =
    /^e\s+se\s+(eu\s+)?(quiser|quero|precisar)\b/.test(q) &&
    !isConstraintChangeFamilyQuery(q) &&
    words.length <= 10;

  const shortPriorityShiftFollowUp =
    /^e\s+se\b/.test(q) &&
    (
      /\b(importar|prioridade|priorizar|virar prioridade|pesar mais|fizer mais sentido)\b/.test(q) ||
      (_CC_ATTR.test(q) && /\b(quiser|quero|precisar|importar|mais)\b/.test(q))
    ) &&
    words.length <= 10;

  const shortContextualFollowUp =
    /^vale\s+a\s+pena\??$/.test(q) ||
    /^e\s+(esse|essa|isso|o preco|a preco|preco)\??$/.test(q) ||
    /^qual\s+(desses|destes)\??$/.test(q);

  const positiveMatch =
    shortRecommendationFollowUp ||
    shortAttributeFollowUp ||
    shortAspectFollowUp ||
    shortUseCaseFollowUp ||
    shortRefinementFollowUp ||
    shortPriorityShiftFollowUp ||
    shortContextualFollowUp;

  if (positiveMatch) return true;

  if (hasAnchoredShortFollowUpBlockedFamily(q)) return false;

  return false;
}

function detectsFollowUpSignal(q, { hasActiveAnchor, detectedIntent, contextResolution }) {
  if (!hasActiveAnchor) return false;
  if (contextResolution?.mode === "anchored_reaction") return true;

  // ── PATCH 6.7 — Guard: "e..." com vocabulário de alternativa → cede para REFINEMENT ─
  // ── PATCH 7.6B — Ordinal ranking positions (rank 3+) adicionados ao guard ─────────
  //
  // Queries que começam com "e..." mas contêm sinais de segunda posição/alternativa
  // NÃO devem ser classificadas como FOLLOW_UP genérico — elas pedem uma alternativa.
  //
  // AFETA:   "e a segunda opção?", "e depois dele?", "e o plano B?", "e o próximo?"
  //          "e o terceiro?", "e a quarta?", "qual foi o quinto?" (PATCH 7.6B)
  // NÃO afeta: "e a bateria?", "e a câmera?", "e o desempenho?" (atributos puros)
  //            "estou comprando meu terceiro celular" (frase longa sem contexto de ranking)
  //
  // PATCH 7.6B — Guard de ordinal aplica apenas se a query for curta (≤5 palavras)
  // ou contiver vocabulário explícito de ranking, espelhando a lógica de
  // detectsAlternativeRequestSignal. Evita falsos positivos em frases longas.
  const _hasOrdinalRankVocab =
    /\b(terceiro|terceira|quarto|quarta|quinto|quinta|sexto|sexta|setimo|setima|oitavo|oitava|nono|nona|decimo|decima)\b/.test(q) &&
    (q.split(" ").length <= 5 ||
     /\b(lugar|posicao|opcao|colocado|classificado|produto|modelo|item|qual|quem)\b/.test(q));

  const _hasAltFollowUpVocab =
    /\b(segunda\s+(opcao|escolha|alternativa|posicao))\b/.test(q) ||
    /\b(segundo\s+(colocado|lugar|classificado))\b/.test(q) ||
    /\bplano\s+b\b/.test(q) ||
    /\bdepois\s+(dele|desse|deles|dela|dessa)\b/.test(q) ||
    /\b(o\s+proximo|a\s+proxima|opcao\s+seguinte|proxima\s+opcao)\b/.test(q) ||
    (/\b(reserva|backup)\b/.test(q) && !/\b(bateria|carga|energia)\s+reserva\b/.test(q)) ||
    /\b(concorrente|rival)\b/.test(q) ||
    /\balternativa\b/.test(q) ||
    /\b(quase\s+ganhou|ficou\s+em\s+segundo)\b/.test(q) ||
    /\boutro\s+que\b/.test(q) ||
    /\b(se\s+eu|vc|voce)\s+nao\s+quiser\b/.test(q) ||
    // PATCH 7.6G — relative ranking vocab (prevents FOLLOW_UP from eating these)
    (/\blogo\s+(atras|atrás)\b/.test(q) &&
      !/\b(casa|rua|bairro|trabalho|escola|entrega|loja|cidade)\b/.test(q)) ||
    /\b(ficou|tinha|chegou|estava)\s+(alguem\s+|algum\s+)?colad[ao]\b/.test(q) ||
    /\b(perdeu|ficou)\s+por\s+pouco\b/.test(q) ||
    /\bquase\s+levou\b/.test(q) ||
    (/\b(ficou|chegou)\s+(mais\s+)?(perto|proximo)\b/.test(q) &&
      !/\b(casa|loja|entrega)\b/.test(q)) ||
    _hasOrdinalRankVocab; // PATCH 7.6B

  if (_hasAltFollowUpVocab) return false;

  const followUpPatterns = [
    /^(e|e a|e o|e pra|e para)\s+/,
    /^(esse|essa|ele|ela|o (celular|smartphone|aparelho))\s/,
    /^(e a (bateria|camera|câmera|desempenho|armazenamento|tela))/,
    /^(quanto tempo|quanto dura|quanto aguenta)/,
    /^(como (e|é|fica|funciona))\b/,
    /^(mais|menos)\s+\w+\s*\??$/,
  ];

  if (followUpPatterns.some((re) => re.test(q))) return true;

  return isAnchoredShortFollowUpQuery(q, { hasActiveAnchor });
}

// PATCH 7.7E — ACKNOWLEDGEMENT semantic family (intenção: reconhecer / confirmar entendimento)
function hasAcknowledgementCommercialTail(q) {
  if (!q) return false;

  // ACK é prefixo — intenção dominante comercial/follow-up vem depois.
  if (/\b(quero|busca|procura|recomenda|indica|sugere|mostra|comprar|preciso de|me acha|me indica|compara|compare)\b/.test(q)) {
    return true;
  }
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\b(outro|outra|alternativa|opcoes|opcoes|opcao|opcao|barat)\b/.test(q)) return true;
  if (/\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)) {
    return true;
  }
  if (/\be se eu\b/.test(q)) return true;
  if (/\btem opc/.test(q)) return true;
  if (/,\s*(e |se |quero|me |tem |compara|mostra)/.test(q)) return true;

  return false;
}

// PATCH 7.9X-H — positive comprehension (entendimento assimilado, não pedido de esclarecimento)
function hasNaturalComprehensionBlock(q) {
  if (!q) return false;

  if (/\b(mas|porem)\b/.test(q)) return true;

  if (/\b(voce|vc)\s+(tem certeza|mantem|sustenta|compraria|crava|garante)\b/.test(q)) {
    return true;
  }
  if (/\btem certeza\b/.test(q) && !/\b(nao tenho|nao to|nao estou)\b/.test(q)) {
    return true;
  }
  if (/\b(continua achando|ainda sustenta|ainda recomenda)\b/.test(q)) return true;

  if (/\b(tenho medo|nao quero me arrepender|medo de errar|quero evitar|nao quero errar)\b/.test(q)) {
    return true;
  }
  if (
    /\b(galera|povo|pessoal|quem comprou|quem usa)\b/.test(q) &&
    /\b(recomenda|gostou|falam bem|gosta)\b/.test(q)
  ) {
    return true;
  }
  if (/\b(vou nele|vou nesse|fechou|vou ficar com|acho que vou nele|entao e esse)\b/.test(q)) {
    return true;
  }
  if (/\b(nao me convenceu|nao concordo|pe atras|nao senti firmeza|to meio assim|nao curti)\b/.test(q)) {
    return true;
  }
  if (/\b(tem outro|tem outra|alternativas|ver opcoes|mostra alternativas|plano b|ficou em segundo|backup)\b/.test(q)) {
    return true;
  }
  if (/\b(quero gastar|gastar menos|importa mais|virou prioridade|vou usar mais)\b/.test(q)) {
    return true;
  }
  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\b(compara|compare)\b/.test(q)) return true;

  return false;
}

function detectsNaturalPositiveComprehensionSignal(q) {
  if (!q || hasNaturalComprehensionBlock(q)) return false;

  if (isAcknowledgementContinuityPhrase(q)) return false;

  if (/\b(nao entendi|nao compreendi|nao ficou claro|nao peguei|nao percebi|como assim|explica melhor|explique melhor)\b/.test(q)) {
    return false;
  }

  const directComprehension =
    /^entendi( sim)?$/.test(q) ||
    /^agora entendi$/.test(q) ||
    /^saquei( agora)?$/.test(q) ||
    /^captei$/.test(q) ||
    /^peguei$/.test(q) ||
    /^ta peguei$/.test(q) ||
    /^to peguei$/.test(q);

  const logicComprehension =
    /\bentendi a logica\b/.test(q) ||
    /\bsaquei o raciocinio\b/.test(q) ||
    /\bentendi o ponto\b/.test(q) ||
    /\bpeguei a ideia\b/.test(q) ||
    /\bentendi o motivo\b/.test(q) ||
    /\bagora entendi por que\b/.test(q);

  const clarityComprehension =
    /\bagora ficou claro\b/.test(q) ||
    /\bclareou\b/.test(q) ||
    /\bboa clareou\b/.test(q) ||
    /\bficou mais claro\b/.test(q) ||
    /\bagora ficou mais facil de entender\b/.test(q) ||
    /\bagora fez sentido\b/.test(q) ||
    /^(ficou claro|ficou mais claro|ficou tudo claro)$/.test(q);

  const agreementComprehension =
    /^faz sentido$/.test(q) ||
    /^faz sentido sim$/.test(q) ||
    /\bfaz sentido mesmo\b/.test(q) ||
    /\bagora faz sentido\b/.test(q) ||
    /\bfaz sentido agora\b/.test(q) ||
    /\bagora eu entendi melhor\b/.test(q) ||
    /\bta explicado\b/.test(q) ||
    /\bbem explicado\b/.test(q) ||
    /^entendi melhor$/.test(q) ||
    /^agora saquei$/.test(q) ||
    /^ok agora entendi$/.test(q) ||
    /^entendi agora$/.test(q) ||
    /^saquei a logica$/.test(q) ||
    /^entendi melhor agora$/.test(q) ||
    /\bok entendi\b.*\b(recalibracao|logica|raciocinio)\b/.test(q) ||
    /\b(boa|show|top),?\s+faz sentido\b/.test(q) ||
    /\b(boa|show|top),?\s+entendi\b/.test(q);

  const informalComprehension =
    /\bah+h entendi\b/.test(q) ||
    /\bata entendi\b/.test(q) ||
    /^show entendi$/.test(q) ||
    /\bshow saquei\b/.test(q) ||
    /\bentendi mano\b/.test(q);

  const progressiveComprehension =
    /\bagora caiu a ficha\b/.test(q) ||
    /\bagora eu vi\b/.test(q) ||
    /\bagora consegui entender\b/.test(q) ||
    /\bagora conectei os pontos\b/.test(q) ||
    /\bagora ficou redondo\b/.test(q) ||
    /\bagora entendi o caminho\b/.test(q);

  return (
    directComprehension ||
    logicComprehension ||
    clarityComprehension ||
    agreementComprehension ||
    informalComprehension ||
    progressiveComprehension
  );
}

function detectsAcknowledgementSignal(q) {
  if (!q) return false;
  if (detectsPureAcknowledgementSignal(q)) return true;
  return false;
}

// PATCH 7.9X-J.3 — prefixo positivo + continuidade / então (família, não frases isoladas)
const ACK_POSITIVE_PREFIX_PATTERN =
  "ok|okay|blz|beleza|certo|show|ta|ta bom|otimo|perfeito|top|massa|fechado|fechou|combinado|boa|valeu|tranquilo|demorou";

const ACK_CONTINUITY_VERB_PATTERN =
  "segue|continua|pode seguir|pode continuar|manda|prossiga|vai";

function isAcknowledgementLightConfirmEntaoPhrase(q) {
  if (!q) return false;
  return new RegExp(`^(${ACK_POSITIVE_PREFIX_PATTERN})\\s+entao$`).test(q);
}

function isAcknowledgementPositivePrefixContinuityPhrase(q) {
  if (!q) return false;
  return new RegExp(
    `^(${ACK_POSITIVE_PREFIX_PATTERN}),?\\s+(${ACK_CONTINUITY_VERB_PATTERN})$`
  ).test(q);
}

function isAcknowledgementContinuityPhrase(q) {
  if (!q) return false;
  return (
    /^(pode seguir|continua|segue|manda|manda ver|pode continuar|prossiga|vai)$/.test(q) ||
    isAcknowledgementPositivePrefixContinuityPhrase(q) ||
    /^(entendi|saquei),?\s+(segue|continua|pode seguir|manda|prossiga|pode continuar)$/.test(q) ||
    /^ta,?\s+manda$/.test(q) ||
    /^beleza,?\s+pode seguir$/.test(q)
  );
}

function hasStrongNonAcknowledgementIntent(q) {
  if (!q) return false;

  if (/\b(mas|porem)\b/.test(q)) return true;
  if (/\b(vou nele|vou nesse|vou ficar|vou pegar|acho que vou|entao e esse|entao vou nele)\b/.test(q)) {
    return true;
  }
  if (/\bfechou\b.*\b(vou|pegar|comprar|nele|nesse|esse)\b/.test(q)) return true;
  if (/\b(quero|comprar|preciso|produto|procura|busca|compara|compare|gastar menos|virou prioridade)\b/.test(q)) {
    return true;
  }
  if (/\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)) {
    return true;
  }
  if (/\b(tem outro|alternativas|ver opcoes|mostra alternativas|plano b|ficou em segundo|backup)\b/.test(q)) {
    return true;
  }
  if (/\b(voce tem certeza|continua achando|ainda sustenta|galera recomenda|povo fala bem|tenho medo|nao quero me arrepender)\b/.test(q)) {
    return true;
  }
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (hasCommercialComparisonDisjunction(q)) return true;

  return false;
}

function hasNaturalAcknowledgementBlock(q) {
  if (!q) return false;
  if (/^(ok|ah|blz|certo|agora sim) entendi$/.test(q)) return false;
  if (/^(saquei melhor|beleza,? peguei|ta claro agora|fechou entendi)$/.test(q)) return false;
  if (/^(ta ligado|to ligado|ta ligado ne|to ligado ne)$/.test(q)) return false;
  if (hasStrongNonAcknowledgementIntent(q)) return true;
  if (detectsGreetingSignal(q)) return true;
  if (!isAcknowledgementContinuityPhrase(q) && detectsNaturalPositiveComprehensionSignal(q)) return true;
  return false;
}

function detectsNaturalAcknowledgementSignal(q) {
  if (!q || hasNaturalAcknowledgementBlock(q)) return false;

  const shortAccept =
    /^(ok|okay|certo|beleza|blz|ta|ta bom|ta certo|tudo certo|pode ser|ah sim|justo|claro|verdade)$/.test(q) ||
    /^ok entendi$/.test(q) ||
    /^ah entendi$/.test(q) ||
    /^blz entendi(\s+(valeu|vlw))?$/.test(q) ||
    /^certo entendi$/.test(q) ||
    /^agora sim entendi$/.test(q) ||
    /^beleza entendi(\s+(valeu|vlw|obrigado|obg))?$/.test(q) ||
    /^beleza,? peguei$/.test(q) ||
    /^saquei melhor$/.test(q) ||
    /^agora sim$/.test(q) ||
    /^ta claro$/.test(q) ||
    /^ta claro agora$/.test(q) ||
    /^fez sentido agora$/.test(q) ||
    /^fechou entendi$/.test(q) ||
    /^certo,? continua$/.test(q);

  const continuity = isAcknowledgementContinuityPhrase(q);

  const lightConfirm =
    /^(show|top|perfeito|otimo|boa|massa|fechou|combinado|fechado)$/.test(q) ||
    /^agora sim$/.test(q) ||
    /^parece bom$/.test(q) ||
    isAcknowledgementLightConfirmEntaoPhrase(q);

  const informalBr =
    /^(suave|tranquilo|de boa|demorou|demoro|valeu|valeu mesmo|tmj)$/.test(q) ||
    /^beleza entao$/.test(q) ||
    /^beleza entendi$/.test(q) ||
    /^(to ligado|ta ligado|ta ligado ne|to ligado ne)$/.test(q) ||
    /^(joia|j[oó]ia|maravilha|firmeza|fmz)$/.test(q) ||
    /^suave entao$/.test(q);

  const ackTypoVariant =
    /^(ok+|blz+|certo+|show+|vlw+|fechou+|fechow+)$/.test(q);

  // PATCH 7.9Z.2 — reação positiva curta pós-recomendação (≠ nova busca)
  const shortPositiveReaction =
    /^(gostei|curti)(\s+(dele|dela|desse|dessa|disso|nele|nessa|nesse))?$/ .test(q) ||
    /^gostei (muito|bastante)$/.test(q) ||
    /^curti (muito|bastante)$/.test(q);

  return shortAccept || continuity || lightConfirm || informalBr || shortPositiveReaction || ackTypoVariant;
}

function detectsPureAcknowledgementSignal(q) {
  if (!q || hasAcknowledgementCommercialTail(q)) return false;
  return detectsNaturalAcknowledgementSignal(q);
}

/** PATCH 7.9X-J — acknowledgement opening prefix (composite audits; not dominant intent). */
export function hasAcknowledgementOpeningPrefix(message = "") {
  const q = normalize(message);
  if (!q) return false;
  return /^(ok|okay|blz|beleza|certo|show|top|fechou|fechado|ta|ta bom|suave|tranquilo|de boa|demorou|valeu|massa|perfeito|otimo|combinado|boa)\b/.test(q);
}

function detectsEmotionalReactionSignal(q) {
  const reactionPatterns = [
    /que (legal|bom|otimo|interessante|maneiro|bacana|show)/,
    /\bgostei\b/,
    /\b(curti|curtir)\b/,
    /nao sabia/,
    /\b(nossa|caraca|caramba|eita|vish|rapaz|oxe|uai|pesado|sinistro|loucura|doidera)\b/,
  ];

  return reactionPatterns.some((re) => re.test(q));
}

function detectsReactionSignal(q, { hasActiveAnchor, cso }) {
  if (detectsAcknowledgementSignal(q)) return true;
  if (!hasActiveAnchor) return false;

  if (detectsEmotionalReactionSignal(q)) return true;

  if (/^ok, (entendi|captei|beleza)$/.test(q)) return true;

  return false;
}

// PATCH 8.0A — ABOUT_MIA semantic family (intenção institucional / company knowledge)
function hasAboutMiaRoutingBlock(q, { hasActiveAnchor } = {}) {
  if (!q) return true;

  if (
    hasActiveAnchor &&
    /\b(esse|essa|isso|nele|nela|nesse|nessa|deste|desta|dessa|desse)\b/.test(q) &&
    /\b(recomendacao|escolha|indicacao|produto|opcao|compra|celular|notebook)\b/.test(q)
  ) {
    return true;
  }

  if (
    hasActiveAnchor &&
    /\b(recomendacao|escolha|indicacao|produto)\b/.test(q) &&
    /\b(por que|como chegou|logica|raciocinio|confiar|confia|certeza|mantem|mantém|segur[oa])\b/.test(q)
  ) {
    return true;
  }

  if (
    hasActiveAnchor &&
    /\b(tem certeza|da pra confiar|continua achando|continua recomendando|mantem essa|mantém essa|ainda recomenda)\b/.test(q)
  ) {
    return true;
  }

  if (
    /\b(quero|preciso|busco|me indica|me recomenda|procurar|comprar)\b/.test(q) &&
    /\b(celular|smartphone|iphone|galaxy|notebook|tv|tablet|fone|produto)\b/.test(q) &&
    !/\b(como (voce|vc|a mia|mia) funciona|o que e (a )?(mia|teilor|economia)|quem e (voce|vc|a mia))\b/.test(q)
  ) {
    return true;
  }

  if (hasCommercialComparisonDisjunction(q)) return true;

  return false;
}

function detectsAboutMiaInstitutionalSignal(q, { hasActiveAnchor } = {}) {
  if (!q || hasAboutMiaRoutingBlock(q, { hasActiveAnchor })) return false;
  return classifyAboutMiaSubtopics(q).length > 0;
}

/** PATCH 8.0A — exported for Routing layer (read-only family detector). */
export function isAboutMiaFamilyQuery(message = "", options = {}) {
  const q = normalize(message);
  const hasActiveAnchor = !!options?.hasActiveAnchor;
  return detectsAboutMiaInstitutionalSignal(q, { hasActiveAnchor });
}

// PATCH 7.7B — GREETING semantic family (intenção: cumprimento / abertura social)
function hasStrongNonGreetingIntent(q) {
  if (!q) return false;

  if (
    /,\s*\S/.test(q) &&
    /\b(quero|preciso|me ajuda|vale|decidir|escolher|compar|produto|compra|duvida|opcao|duas opcoes|tô|to)\b/.test(q)
  ) {
    return true;
  }
  if (/\b(quero|busca|procura|recomenda|indica|sugere|mostra|comprar|preciso|me acha|me indica|me ajuda)\b/.test(q)) {
    return true;
  }
  if (/\b(vale a pena|decidir|escolher entre|comparar|compara|compare|procura um|preciso comprar)\b/.test(q)) {
    return true;
  }
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|produto|samsung)\b/.test(q)) {
    return true;
  }
  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\b(tem outro|alternativas|ver opcoes|plano b|ficou em segundo|backup)\b/.test(q)) return true;
  if (/\b(vou nele|fechou|vou ficar|acho que vou|entao e esse)\b/.test(q)) return true;
  if (/\b(tenho medo|nao quero me arrepender|voce tem certeza|galera recomenda|quero gastar|importa mais)\b/.test(q)) {
    return true;
  }
  if (/\b(entendi|saquei|nao entendi|clareou|faz sentido|agora entendi)\b/.test(q)) return true;

  // PATCH 7.9X-I.2 — opening phrase + principal intent must not become pure GREETING
  if (
    /^(posso (tirar uma duvida|perguntar|te perguntar|fazer uma pergunta|mandar uma duvida)|deixa eu (te perguntar|fazer uma pergunta|tirar uma duvida|falar contigo)|queria (te perguntar|tirar uma duvida))\b/.test(q) &&
    /\b(sobre|qual comprar|qual vale|quero|preciso|comprar|produto|comparar|decidir|escolher|me ajuda)\b/.test(q) &&
    !/^(posso tirar uma duvida|posso perguntar uma coisa|posso te perguntar uma coisa|posso fazer uma pergunta|posso tirar uma duvida rapida|posso mandar uma duvida|deixa eu te perguntar uma coisa|deixa eu fazer uma pergunta|deixa eu tirar uma duvida|deixa eu falar contigo|queria te perguntar uma coisa|queria tirar uma duvida)$/.test(q)
  ) {
    return true;
  }
  if (
    /^(voce ta ai|voce esta ai|ta ai|esta ai|tem alguem ai|alguem online|mia)\b/.test(q) &&
    /\b(quero|preciso|comprar|produto|me ajuda|decidir|escolher)\b/.test(q) &&
    !/^(voce ta ai|voce esta ai|ta ai|esta ai|tem alguem ai|alguem online)$/.test(q) &&
    !/^mia[,.]?\s+(voce ta ai|voce esta ai)$/.test(q)
  ) {
    return true;
  }
  if (/\b(me explica|explica a diferenca|explica por que|pode explicar qual)\b/.test(q)) {
    return true;
  }

  return false;
}

function hasNaturalGreetingBlock(q) {
  if (!q) return false;
  if (hasStrongNonGreetingIntent(q)) return true;

  if (/^(ok|blz|beleza|certo|fechado|show|captei|claro|justo|ah sim|verdade|ta bom|ta certo|tudo certo|pode ser|beleza entao|valeu|massa|top|tranquilo|suave|fechou|perfeito|otimo|combinado)$/.test(q)) {
    return true;
  }
  if (/^(entendi|saquei|faz sentido|nao entendi|como assim|agora entendi|clareou)$/.test(q)) {
    return true;
  }
  if (/^(vou nele|acho que fechou|entao e esse)$/.test(q)) return true;
  if (/\b(tem outro|mostra alternativas|voce tem certeza|continua achando|galera recomenda|tenho medo|quero gastar menos)\b/.test(q)) {
    return true;
  }

  return false;
}

function detectsNaturalGreetingSignal(q) {
  if (!q || hasNaturalGreetingBlock(q)) return false;

  const direct =
    /^o+i+$/.test(q) ||
    /^ola$/.test(q) ||
    /^(hey|hi|hello)$/.test(q) ||
    /^alo+$/.test(q);

  const informalBr =
    /^(e ai|eai|eae|e ae)$/.test(q) ||
    /^fala( ai| mia| comigo| mano| tu)?$/.test(q) ||
    /^(salve|opa)$/.test(q) ||
    /^(koe|coe|koé|coé)$/.test(q) ||
    /^(nossa|caraca|caramba|vish|eita|oxe|uai|rapaz)$/.test(q);

  const timeOfDay =
    /^(bom dia|boa tarde|boa noite|boa madrugada)(\s+mia)?$/.test(q);

  const miaCall =
    /^mia$/.test(q) ||
    /^(oi|ola|fala|ei)\s+mia$/.test(q) ||
    /^(cade voce|alguem ai)$/.test(q);

  // PATCH 7.9X-I.2 — presence / call (Grupo D)
  const presenceCall =
    /^(voce ta ai|voce esta ai|ta ai|esta ai)$/.test(q) ||
    /^(tem alguem ai|alguem online)$/.test(q) ||
    /^mia[,.]?\s+(voce ta ai|voce esta ai)$/.test(q);

  // PATCH 7.9X-I.2 — permission to ask (Grupo E)
  const permissionOpening =
    /^posso (tirar uma duvida|te perguntar uma coisa|fazer uma pergunta|tirar uma duvida rapida|mandar uma duvida)$/.test(q);

  // PATCH 7.9X-I.2 — indirect conversational opening (Grupo F)
  const indirectOpening =
    /^deixa eu (te perguntar uma coisa|fazer uma pergunta|tirar uma duvida|falar contigo)$/.test(q) ||
    /^queria (te perguntar uma coisa|tirar uma duvida)$/.test(q);

  const conversational =
    /^(tudo bem|tudo bom|como vai|como voce esta|como vc esta|tudo certo por ai|como voce ta|bora conversar|posso perguntar uma coisa|chega mais)(\s+mia)?$/.test(q) ||
    /^bora$/.test(q) ||
    /^(oi|ola|opa|eae|salve|alo|bom dia|boa tarde|boa noite)\s+(mia|tudo bem|tudo bom)$/.test(q);

  // PATCH 8.1B.8 — saudação composta + pedido formal de ajuda
  const formalHelpOpening =
    /\b(bom dia|boa tarde|boa noite)\b.*\b(poderia|pode|gostaria)\b.*\b(me ajudar|ajudar)\b/.test(q) ||
    /\b(poderia|pode) me ajudar\b.*\b(bom dia|boa tarde|boa noite)\b/.test(q);

  return (
    direct ||
    informalBr ||
    timeOfDay ||
    miaCall ||
    presenceCall ||
    permissionOpening ||
    indirectOpening ||
    conversational ||
    formalHelpOpening
  );
}

function detectsGreetingSignal(q) {
  if (!q) return false;
  return detectsNaturalGreetingSignal(q);
}

/** PATCH 7.9X-I — greeting opening prefix (composite audits; not dominant intent). */
export function hasGreetingOpeningPrefix(message = "") {
  const q = normalize(message);
  if (!q) return false;
  if (
    /^(o+i+|ola|opa|salve|alo+|hey|hi|hello|bom dia|boa tarde|boa noite|boa madrugada|e ai|eai|eae|fala|oi mia|salve mia|bom dia mia|boa tarde mia|ei mia)\b/.test(q)
  ) {
    return true;
  }
  // PATCH 7.9X-I.2 — presence / permission / indirect opening as composite prefix
  if (/^(voce ta ai|voce esta ai|ta ai|esta ai|tem alguem ai|alguem online|mia)\b/.test(q)) {
    return true;
  }
  if (/^posso (tirar uma duvida|perguntar|te perguntar|fazer uma pergunta|mandar uma duvida)\b/.test(q)) {
    return true;
  }
  if (
    /^(deixa eu (te perguntar|fazer uma pergunta|tirar uma duvida|falar contigo)|queria (te perguntar|tirar uma duvida))\b/.test(q)
  ) {
    return true;
  }
  return false;
}

/** PATCH 8.1B.6 — intenção dominante em composto (prefixo fraco + cauda). */
function getCrossFamilyDominantFamily(message = "") {
  return getDominantMasTailIntent(message);
}

function matchesCrossFamilyDominant(message = "", family) {
  const dominant = getCrossFamilyDominantFamily(message);
  if (!dominant) return null;
  return dominant === family;
}

/** PATCH 7.7C — exported for Routing layer (read-only family detector). */
export function isGreetingFamilyQuery(message = "") {
  if (getCrossFamilyDominantFamily(message)) return false;
  return detectsGreetingSignal(normalize(message));
}

/** PATCH 7.7E — exported for Routing layer (read-only family detector). */
export function isAcknowledgementFamilyQuery(message = "") {
  const q = normalize(message);
  if (detectsPureAcknowledgementSignal(q)) return true;
  if (getCrossFamilyDominantFamily(message)) return false;
  return false;
}

/** PATCH 8.1B.2 — comprehension success (assimilou explicação), distinct from ACK. */
export function isComprehensionSuccessFamilyQuery(message = "") {
  const q = normalize(message);
  if (detectsNaturalPositiveComprehensionSignal(q)) return true;
  if (getCrossFamilyDominantFamily(message)) return false;
  return false;
}

/** PATCH 8.3F — reasoning breakdown / contradiction recovery family. */
export function isConversationalConfusionFamilyQuery(message = "", options = {}) {
  return detectsReasoningBreakdownSignal(message, options);
}

/** PATCH 8.3G — explanation breakdown / user confusion recovery family. */
export function isUserConfusionFamilyQuery(message = "", options = {}) {
  return detectsExplanationBreakdownSignal(message, options);
}

// PATCH 7.7K — COMPREHENSION semantic family
// Falha: não entendeu / pedir esclarecimento (7.7K)
// Sucesso: assimilou a explicação (7.9X-H)
function hasComprehensionCommercialTail(q) {
  if (!q) return false;

  // PATCH 8.1B.8 — pedido de clareza ancorado ≠ nova busca comercial
  if (detectsNaturalComprehensionFailureCore(q)) return false;
  if (
    /\b(explica direito|por favor explica|poderia me ajudar a entender|teria como explicar|explica simples|como se eu nao entendesse|fala mais simples|simplifica)\b/.test(
      q
    )
  ) {
    return false;
  }

  // Prefixo de dúvida — intenção dominante comercial/follow-up vem depois.
  if (/,\s*(tem outro|e se eu|compara|compare|mostra|quero|me mostra)/.test(q)) return true;
  if (/\b(compara|compare|versus|\bvs\b)\b/.test(q)) return true;
  if (/\b(quero|busca|procura|recomenda|indica|sugere|mostra|comprar|preciso de)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\b(outro|outra|alternativa)\b/.test(q) && !/\bde outro jeito\b/.test(q)) return true;
  if (/\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)) {
    return true;
  }
  if (/\be se eu\b/.test(q)) return true;
  if (/\btem outro\b/.test(q)) return true;
  if (/\b(explica|detalha|aprofunda|simplifica|fala mais)\b/.test(q) && /\b(ponto|motivo|parte|trecho|aspecto|detalhe)\b/.test(q)) {
    return false;
  }
  if (/\b(esse|essa|este|esta)\s+\w+/.test(q)) return true;
  // "que celular..." é busca — distinto de "que quer dizer..." (falha de compreensão)
  if (/^que\s+\S/.test(q) && !/^que quer dizer\b/.test(q) && !/^que (significa|eh|e)\b/.test(q)) {
    return true;
  }

  return false;
}

function detectsComprehensionFailureSignal(q) {
  if (!q || hasComprehensionCommercialTail(q)) return false;

  // PATCH 8.1B.5 — composto: cauda CF após prefixo fraco vence ACK/SD genéricos
  if (hasComprehensionFailureDominantTail(q)) return true;
  if (/^que quer dizer (isso|essa parte)$/.test(q)) return true;

  // Follow-ups mínimos de confusão
  if (/^(que|ha|hein|hm|hum)$/.test(q)) return true;

  // Falha de compreensão standalone
  if (/^(nao entendi|nao compreendi|nao peguei|nao percebi)$/.test(q)) return true;
  if (/^(nao ficou claro|ficou confuso|nao esta claro|nao ta claro)$/.test(q)) return true;

  // Pedido de reformulação / esclarecimento
  if (/^como assim$/.test(q)) return true;
  if (/^explica (melhor|de outro jeito)$/.test(q)) return true;
  if (/^explique (melhor|de outro jeito)$/.test(q)) return true;
  if (/^pode explicar (melhor|de outro jeito)$/.test(q)) return true;
  if (/^pode explicar$/.test(q)) return true;
  if (/^pode simplificar$/.test(q)) return true;
  if (/^simplifica$/.test(q)) return true;
  if (/^podia simplificar$/.test(q)) return true;
  if (/^pode explicar melhor$/.test(q)) return true;
  if (/^pode explicar de outro jeito$/.test(q)) return true;
  if (/^nao ficou claro$/.test(q)) return true;
  if (/^repete$/.test(q)) return true;
  if (/^repete pf$/.test(q)) return true;
  if (/^repete isso$/.test(q)) return true;
  if (/^boiei$/.test(q)) return true;
  if (/^fiquei perdido$/.test(q)) return true;
  if (/^detalha (melhor|mais)$/.test(q)) return true;
  if (/^detalhe (melhor|mais)$/.test(q)) return true;

  // PATCH 7.9X-H.2 — natural comprehension failure (clareza / confusão / simplificação)
  if (detectsNaturalComprehensionFailureSignal(q)) return true;

  return false;
}

function hasNaturalComprehensionFailureBlock(q) {
  if (!q) return false;

  if (/\b(mas|porem)\b/.test(q)) return true;

  if (detectsNaturalPositiveComprehensionSignal(q)) return true;

  if (/\b(voce|vc)\s+(tem certeza|mantem|sustenta|compraria|crava|garante)\b/.test(q)) {
    return true;
  }
  if (/\btem certeza\b/.test(q) && !/\b(nao tenho|nao to|nao estou)\b/.test(q)) {
    return true;
  }
  if (/\b(continua achando|ainda sustenta|ainda recomenda)\b/.test(q)) return true;

  if (/\b(tenho medo|nao quero me arrepender|medo de errar|quero evitar|nao quero errar)\b/.test(q)) {
    return true;
  }
  if (
    /\b(galera|povo|pessoal|quem comprou|quem usa)\b/.test(q) &&
    /\b(recomenda|gostou|falam bem|gosta)\b/.test(q)
  ) {
    return true;
  }
  if (/\b(vou nele|vou nesse|fechou|vou ficar com|acho que vou nele|entao e esse)\b/.test(q)) {
    return true;
  }
  if (/\b(nao me convenceu|nao concordo|pe atras|nao senti firmeza|to meio assim|nao curti)\b/.test(q)) {
    return true;
  }
  if (/\b(tem outro|tem outra|alternativas|ver opcoes|mostra alternativas|plano b|ficou em segundo|backup)\b/.test(q)) {
    return true;
  }
  if (/\b(quero gastar|gastar menos|importa mais|virou prioridade|vou usar mais)\b/.test(q)) {
    return true;
  }
  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\b(compara|compare|comparando|diferenca entre)\b/.test(q)) return true;

  // Explicação comercial/decisória — não é falha de clareza da explicação atual
  if (/\b(qual comprar|qual devo comprar|qual escolher|me explica qual|explica qual)\b/.test(q)) {
    return true;
  }
  if (/\b(explica esse|explica essa|explica este|explica esta)\b/.test(q)) return true;
  if (/\b(quero|preciso|busco|procurar|recomenda|indica)\b/.test(q) && /\b(produto|modelo|opcao|opcoes)\b/.test(q)) {
    return true;
  }

  return false;
}

function detectsNaturalComprehensionFailureCore(q) {
  if (!q) return false;

  if (detectsEscalatedUserConfusionDiscourse(q)) return true;

  const directFailure =
    /\bnao entendi (direito|bem|totalmente|completamente)?\b/.test(q) ||
    /^nao entendi\b/.test(q) ||
    /\bnao (saquei|peguei|compreendi|percebi)\b/.test(q) ||
    /\bnao consegui (entender|acompanhar|seguir)\b/.test(q) ||
    /\bnao (entendi|acompanhei)\b/.test(q);

  const confusion =
    /\b(fiquei|estou|to) (meio )?confus\w*\b/.test(q) ||
    /\bficou confus\w* (pra mim|para mim)?\b/.test(q) ||
    /\b(me perdi|me perdi um pouco)\b/.test(q) ||
    /\bnao ficou (tao )?claro\b/.test(q) ||
    /\bnao esta claro\b/.test(q) ||
    /\bnao ta claro\b/.test(q);

  const reasoningGap =
    /\bnao acompanhei(\s+a logica)?\b/.test(q) ||
    /\bnao entendi (o )?raciocinio\b/.test(q) ||
    /\bnao consegui entender a logica\b/.test(q) ||
    /\bme perdi no raciocinio\b/.test(q) ||
    /\bnao consegui seguir\b/.test(q);

  const simplification =
    /\bsimplifica (pra mim|para mim)?\b/.test(q) ||
    /\bfala (de )?um jeito mais simples\b/.test(q) ||
    /\bfala mais simples\b/.test(q) ||
    /\bexplica (de )?um jeito mais simples\b/.test(q) ||
    /\bexplique (de )?um jeito mais simples\b/.test(q) ||
    /\bexplica em portugues claro\b/.test(q) ||
    /\bexplica como se eu fosse leig\w*\b/.test(q) ||
    /\bcomo se eu nao entendesse\b/.test(q) ||
    /\bnao entendesse nada\b/.test(q) ||
    /\bnao entendo nada disso\b/.test(q) ||
    /\bexplica simples\b/.test(q) ||
    /\bexplica facil\b/.test(q) ||
    /\bsou leigo\b/.test(q) ||
    /\bnao entendo muito\b/.test(q) ||
    /\bzero conhecimento\b/.test(q);

  const clarityRequest =
    /\bexplica direito\b/.test(q) ||
    /\bpor favor explica\b/.test(q) ||
    /\bexplique direito\b/.test(q) ||
    /\bpoderia me ajudar a entender\b/.test(q) ||
    /\bteria como explicar\b/.test(q) ||
    /\bgostaria de saber como\b/.test(q);

  const reexplain =
    /\bpode explicar de novo\b/.test(q) ||
    /\bexplica de novo\b/.test(q) ||
    /\bpode repetir\b/.test(q) ||
    /^repete$/.test(q) ||
    /\brepete isso\b/.test(q) ||
    /\bexplica melhor\b/.test(q) ||
    /\bexplique melhor\b/.test(q) ||
    /^detalha de novo$/.test(q) ||
    /^explica melhor o porque$/.test(q) ||
    /\bexplica de outro jeito\b/.test(q) ||
    /\bexplique de outro jeito\b/.test(q) ||
    /\bpode explicar (melhor|de outro jeito)\b/.test(q) ||
    /\b(me )?explica melhor (esse|essa|este|esta) (ponto|motivo|parte)\b/.test(q) ||
    /\baprofunda (esse|essa|este|esta) ponto\b/.test(q) ||
    /\bfala mais desse motivo\b/.test(q) ||
    /\bsimplifica (esse|essa|este|esta) ponto\b/.test(q);

  const colloquialConfusion =
    /^boiei$/.test(q) ||
    /^fiquei perdido$/.test(q) ||
    /\b(agora )?fiquei perdido\b/.test(q) ||
    /\bque quer dizer (isso|essa parte)\b/.test(q);

  return (
    directFailure ||
    confusion ||
    reasoningGap ||
    simplification ||
    clarityRequest ||
    reexplain ||
    colloquialConfusion
  );
}

function detectsNaturalComprehensionFailureSignal(q) {
  if (!q || hasNaturalComprehensionFailureBlock(q)) return false;
  return detectsNaturalComprehensionFailureCore(q);
}

function detectsComprehensionSignal(q) {
  if (!q) return false;
  if (detectsComprehensionFailureSignal(q)) return true;
  if (detectsNaturalPositiveComprehensionSignal(q)) return true;
  return false;
}

/** PATCH 7.7K — exported for Routing layer (read-only family detector). */
export function isComprehensionFamilyQuery(message = "") {
  const dominant = getCrossFamilyDominantFamily(message);
  if (dominant) return dominant === "COMPREHENSION_FAILURE";
  return detectsComprehensionFailureSignal(normalize(message));
}

/** PATCH 7.9X-H — full semantic family (success + failure) for audits only. */
export function isComprehensionSemanticFamilyQuery(message = "") {
  return detectsComprehensionSignal(normalize(message));
}

// PATCH 7.7O — SOFT_DISAGREEMENT semantic family (intenção: resistência leve / não totalmente convencido)
function hasSoftDisagreementCommercialTail(q) {
  if (!q) return false;

  // normalize() remove pontuação — tails comerciais aparecem separados por espaço.
  if (/\btem outro\b/.test(q)) return true;
  if (/\btem outra\b/.test(q)) return true;
  if (/\b(compara|compare)\s+(com|o|a|e\s+)/.test(q)) return true;
  if (/\b(quero ver outra|quero outra|me mostra algo|mostra algo mais barato)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\be se eu\b/.test(q)) return true;
  if (/\bqual ficou em segundo\b/.test(q)) return true;
  if (/\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)) {
    if (shouldSuppressCommercialTailForAnchoredReference(q)) return false;
    return true;
  }

  return false;
}

/** PATCH 8.1B.4 — resistência leve ao preço (≠ recalibração explícita de orçamento). */
function hasSoftDisagreementBarePriceResistanceCue(q) {
  if (!q) return false;
  const tail = q.includes(" mas ") ? q.split(/\bmas\b/).pop()?.trim() : q;
  const target = tail || q;
  if (
    /\b(quero|preciso|agora quero|prefiro|posso|baixar|baixei|cortar|corta|economizar|prioriz|prioridade|importa mais|virou prioridade|gastar menos|pagar menos|orcamento menor|baixa o orcamento)\b/.test(
      target
    )
  ) {
    return false;
  }
  return (
    /^(ta puxado|ficou caro|pesou no bolso|passou do que eu queria|muito caro|caro demais)$/.test(target) ||
    /\b(ta|esta)\s+caro\b/.test(target) ||
    /\bcaro demais\b/.test(target) ||
    /\bmuito caro\b/.test(target)
  );
}

function detectsSoftDisagreementSignal(q) {
  if (!q || hasSoftDisagreementCommercialTail(q)) return false;
  // PATCH 7.9X-E.2 — cauda CC após "mas" vence prefixo de discordância leve
  if (hasConfidenceChallengeDominantMasTail(q)) return false;
  // PATCH 7.9X-F.2 — cauda SV após "mas" vence prefixo de discordância leve
  if (hasSocialValidationDominantMasTail(q)) return false;
  // PATCH 7.9X-G.3 — composto: cauda SD após "mas" vence prefixo fraco (DC/COMP/ACK)
  if (hasSoftDisagreementDominantMasTail(q)) return true;

  // F1 — Discordância leve / resistência parcial
  if (/^acho que nao$/.test(q)) return true;
  if (/^nao concordo muito$/.test(q)) return true;
  if (/^nao parece tao bom assim$/.test(q)) return true;
  if (/^nao parece (tao|muito) bom$/.test(q)) return true;

  // F2 — Não convencido (resistência leve, não rejeição forte)
  if (/^nao me convenceu$/.test(q)) return true;
  if (/^nao estou convencido$/.test(q)) return true;
  if (/^nao to convencido$/.test(q)) return true;
  if (/^nao bateu comigo$/.test(q)) return true;

  // F3 — Dúvida epistêmica sobre o ponto/decisão atual
  if (/^nao sei se (e|eh) isso$/.test(q)) return true;
  if (/^tenho minhas duvidas$/.test(q)) return true;
  if (/^hmm nao sei$/.test(q)) return true;
  if (/^hm nao sei$/.test(q)) return true;
  if (/^nao tenho certeza disso$/.test(q)) return true;

  // PATCH 8.1B.4 — resistência leve curta ao preço (≠ pedido de recalibração)
  if (hasSoftDisagreementBarePriceResistanceCue(q)) return true;

  // PATCH 7.9X-G — natural soft disagreement without exact phrase hardcoding
  if (detectsNaturalSoftDisagreementSignal(q)) return true;

  return false;
}

function hasNaturalSoftDisagreementBlock(q) {
  if (!q) return false;

  if (/\b(voce|vc)\s+(tem certeza|mantem|mantém|manteria|sustenta|compraria|crava|garante|bancaria)\b/.test(q)) {
    return true;
  }
  if (/\btem certeza\b/.test(q) && !/\b(nao tenho|nao to|nao estou)\b/.test(q)) {
    return true;
  }
  if (/\b(ainda acha|continua achando|ainda sustenta|ainda recomenda|voce mantem|vc mantem)\b/.test(q)) {
    return true;
  }
  if (/\b(tenho medo|nao quero me arrepender|quero evitar|medo de errar|estou inseguro|nao quero errar)\b/.test(q)) {
    return true;
  }
  if (
    /\b(galera|povo|pessoal|as pessoas|quem comprou|quem usa|a maioria)\b/.test(q) &&
    /\b(recomenda|gostou|falam bem|aprovam|aceitam)\b/.test(q)
  ) {
    return true;
  }
  if (/\b(vou nele|vou nesse|fechou|vou ficar com|entao vou nele|acho que vou nele)\b/.test(q)) {
    return true;
  }
  if (/\b(plano b|segundo colocado|ficou em segundo|backup|reserva|tem outro|tem outra|alternativas|ver opcoes|explorar outras|mostra alternativas|quero ver opcoes)\b/.test(q)) {
    return true;
  }
  if (/\b(quero gastar|gastar menos|prioridade|orcamento|importa mais|vou jogar mais|vou usar mais|virou prioridade)\b/.test(q)) {
    return true;
  }
  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\b(compara|compare|comparando)\b/.test(q)) return true;

  return false;
}

function detectsNaturalSoftDisagreementCore(q) {
  if (!q) return false;

  const directSoft =
    /\bnao concordo (muito|totalmente|tanto)\b/.test(q) ||
    /\bnao sei se concordo\b/.test(q) ||
    /\bnao concordei totalmente\b/.test(q) ||
    /\bnao estou (tao )?convencido\b/.test(q) ||
    /\bnao to convencido\b/.test(q);

  const emotionalResistance =
    /\bpe atras\b/.test(q) ||
    /\b(estou|to|continuo) (meio )?(desconfiad\w*|na duvida|com duvida)\b/.test(q) ||
    /\bnao senti firmeza\b/.test(q) ||
    /\bnao (to|estou) sentindo firmeza\b/.test(q) ||
    /\b(fiquei|continuo) (meio )?na duvida\b/.test(q) ||
    /\bnao me passou (tanta )?confianca\b/.test(q);

  const lowPersuasion =
    /\bnao me convenceu\b/.test(q) ||
    /\bnao me ganhou\b/.test(q) ||
    /\bnao bateu (muito )?comigo\b/.test(q) ||
    /\bnao bateu totalmente\b/.test(q) ||
    /\bnao bateu ainda\b/.test(q) ||
    /\bnao pegou (muito )?(pra mim|comigo)\b/.test(q) ||
    /\bnao comprei (muito )?(essa )?ideia\b/.test(q);

  const mildSkepticism =
    /\bnao achei (isso )?(tao )?(forte|bom|convincente)\b/.test(q) ||
    /\bnao parece (tao )?(isso|bom|forte|tudo isso)\b/.test(q) ||
    /\bachei meio fraco\b/.test(q) ||
    /\besperava algo melhor\b/.test(q) ||
    /\bnao parece tao bom\b/.test(q) ||
    /\bparece meio forcado\b/.test(q) ||
    /^parece estranho$/.test(q) ||
    (/\bparece estranho\b/.test(q) && q.split(/\s+/).length <= 3) ||
    /\bto achando estranho\b/.test(q) ||
    (/\bque saco\b/.test(q) && /\b(complicado|irritando|demais)\b/.test(q)) ||
    /\bisso ta me irritando\b/.test(q) ||
    /\bta puxado demais\b/.test(q);

  const partialRejection =
    /\bfaz sentido mas\b/.test(q) ||
    /\bcurti\b.*\bmas\b/.test(q) ||
    /\bate faz sentido mas\b/.test(q) ||
    /\bate entendi mas\b/.test(q) ||
    /\bentendo mas\b/.test(q) ||
    /\bate que faz sentido mas\b/.test(q) ||
    /^nao sei$/.test(q) ||
    /\bainda nao sei se compro (essa )?ideia\b/.test(q) ||
    /\bnao sei se compro (essa )?ideia\b/.test(q) ||
    /\bnao sei se (e|eh) isso\b/.test(q) ||
    /\btenho minhas duvidas\b/.test(q) ||
    /\bnao tenho certeza disso\b/.test(q) ||
    /^acho que nao$/.test(q) ||
    /^hmm nao sei$/.test(q) ||
    /^hm nao sei$/.test(q);

  const colloquial =
    /\bsei la viu\b/.test(q) ||
    /^sei la\??$/.test(q) ||
    /^nao sei nao\??$/.test(q) ||
    /^meio assim\??$/.test(q) ||
    /\bto meio assim\b/.test(q) ||
    /\b(to|estou|fiquei) meio dividid\w*\b/.test(q) ||
    /\bnao gostei muito\b/.test(q) ||
    /\bnao gostei tanto\b/.test(q) ||
    /^nao curti muito(\s+n)?$/.test(q) ||
    /\bnao curti muito n\b/.test(q) ||
    /^nao curti$/.test(q) ||
    /\bnao to 100 por cento\b/.test(q) ||
    /^nao,?\s*perai$/.test(q) ||
    /^nao,?\s*espera$/.test(q) ||
    /^nao,?\s*pera$/.test(q) ||
    /^(espera|pera|calma)(\s+(ai|la|um pouco))?$/.test(q) ||
    /^calma que nao bateu\b/.test(q) ||
    /\b(espera|pera|calma)\s+(ai|la|um pouco)\b/.test(q) ||
    /\b(isso )?nao me desceu\b/.test(q) ||
    /\bnao (to|estou) comprando (muito )?(essa )?ideia\b/.test(q) ||
    /^meio estranho pra mim\b/.test(q) ||
    /^meio estranho\b/.test(q) ||
    /^nao me pegou\b/.test(q) ||
    /\bnao me desceu (muito )?bem\b/.test(q) ||
    /\bnao desceu bem\b/.test(q) ||
    /\bnao estou comprando (muito )?(essa )?ideia\b/.test(q);

  const priceResistance =
    hasSoftDisagreementBarePriceResistanceCue(q) ||
    (/\b(ta|esta)\s+caro\b/.test(q) && !/\b(quero gastar|gastar menos|orcamento menor)\b/.test(q));

  return (
    directSoft ||
    emotionalResistance ||
    lowPersuasion ||
    mildSkepticism ||
    partialRejection ||
    colloquial ||
    priceResistance
  );
}

function detectsNaturalSoftDisagreementSignal(q) {
  if (!q || hasNaturalSoftDisagreementBlock(q)) return false;
  return detectsNaturalSoftDisagreementCore(q);
}

/** PATCH 7.9X-G.3 — prefixo fraco + "mas" + cauda SD forte → intenção dominante é resistência leve. */
function hasSoftDisagreementDominantMasTail(q) {
  if (!q || !/\bmas\b/.test(q)) return false;

  const tail = q.split(/\bmas\b/).pop()?.trim();
  if (!tail || tail.length < 6) return false;
  if (hasSoftDisagreementCommercialTail(tail)) return false;
  if (detectsAntiRegretSignal(tail)) return false;
  if (detectsSecondBestDiscoverySignal(tail)) return false;
  if (detectsAlternativeExplorationSignal(tail)) return false;
  if (hasSoftDisagreementBarePriceResistanceCue(tail)) return true;
  if (detectsConstraintChangeSignal(tail)) return false;
  if (detectsNaturalConfidenceChallengeCore(tail)) return false;
  if (detectsNaturalSocialValidationCore(tail)) return false;

  return detectsNaturalSoftDisagreementCore(tail);
}

/** PATCH 7.7O — exported for Routing layer (read-only family detector). */
export function isSoftDisagreementFamilyQuery(message = "") {
  const dominant = getCrossFamilyDominantFamily(message);
  if (dominant) return dominant === "SOFT_DISAGREEMENT";
  return detectsSoftDisagreementSignal(normalize(message));
}

// PATCH 7.8B — DECISION_CONFIRMATION semantic family (intenção: confirmação final da decisão atual)
function hasDecisionConfirmationCommercialTail(q) {
  if (!q) return false;

  // normalize() remove pontuação — tails comerciais aparecem separados por espaço.
  if (/\boutr[oa]\b/.test(q) && !/\bvou nesse\b/.test(q)) return true;
  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\btem outro\b/.test(q)) return true;
  if (/\btem outra\b/.test(q)) return true;
  if (/\b(compara|compare)\s+(com|o|a|e\s+)/.test(q)) return true;
  if (/\b(quero ver outra|quero outra|me mostra algo|mostra algo mais barato)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\be se eu\b/.test(q)) return true;
  if (/\bvou nesse mas\b/.test(q)) return true;
  if (/\bmas se eu\b/.test(q)) return true;
  if (/\bmas (se )?(eu )?(gastar|gastasse|pagar|pagasse)\b/.test(q)) return true;
  if (/\bespero promocao\b/.test(q)) return true;
  if (/\b(espero|aguardo)\s+(promocao|promo|black|sale)\b/.test(q)) return true;
  if (/\bqual ficou em segundo\b/.test(q)) return true;
  // Imperativo comercial com categoria — "quero comprar celular", não "posso comprar?"
  if (
    /\b(quero|preciso|busco|buscar|procurar|procurando|me acha|me indica|me recomenda)\b/.test(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\b(quero|preciso)\s+comprar\b/.test(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)
  ) {
    return true;
  }
  // Categoria sem referente deíctico — nova busca, não confirmação da decisão atual
  if (
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q) &&
    !/\b(nesse|nele|nessa|nela|esse|ele|ela|isso|este|esta)\b/.test(q)
  ) {
    return true;
  }

  return false;
}

function detectsDecisionConfirmationSignal(q) {
  if (!q || hasDecisionConfirmationCommercialTail(q)) return false;
  // PATCH 8.1B.4 — prefixo conversacional fraco + cauda de fechamento
  if (/,/.test(q)) {
    const parts = q.split(",");
    const prefix = parts.slice(0, -1).join(",").trim();
    const tail = parts[parts.length - 1]?.trim();
    if (tail && hasWeakConversationalPrefix(prefix)) {
      if (
        /^(fecho nele|fecho nesse|posso comprar|compro esse|entao e esse|bate o martelo|vou nesse|manda ver nesse)$/.test(
          tail
        )
      ) {
        return true;
      }
    }
  }
  if (
    /^(faz sentido|entendi|saquei|blz|show|ok|gostei|parece bom|captei|entendo)\b.*\b(fecho nele|fecho nesse|posso comprar|compro esse|entao e esse|bate o martelo|vou nesse|manda ver nesse)$/.test(
      q
    )
  ) {
    return true;
  }
  // PATCH 7.9X-E.2 — cauda CC após "mas" vence prefixo de confirmação de decisão
  if (hasConfidenceChallengeDominantMasTail(q)) return false;
  // PATCH 7.9X-F.2 — cauda SV após "mas" vence prefixo de confirmação de decisão
  if (hasSocialValidationDominantMasTail(q)) return false;
  // PATCH 7.9X-G.3 — cauda SD após "mas" vence prefixo de confirmação de decisão
  if (hasSoftDisagreementDominantMasTail(q)) return false;
  // PATCH 7.9Y.1 — cauda AR/CC após "mas" vence DC tentativa
  if (hasAntiRegretDominantMasTail(q)) return false;
  if (hasConstraintChangeDominantMasTail(q)) return false;

  // F1 — Confirmar ir/fechar na recomendação atual (referente deíctico)
  if (/^entao vou nesse$/.test(q)) return true;
  if (/^vou nesse mesmo$/.test(q)) return true;
  if (/^(e|eh) pra ir nesse$/.test(q)) return true;
  if (/^(e|eh) pra ir nele$/.test(q)) return true;
  if (/^manda ver nesse$/.test(q)) return true;
  if (/^bate o martelo$/.test(q)) return true;

  // F2 — Fechar no referente atual
  if (/^fecho\??$/.test(q)) return true;
  if (/^fecho nele$/.test(q)) return true;
  if (/^fecho nesse$/.test(q)) return true;
  if (/^fecho nela$/.test(q)) return true;

  // F3 — Confirmação de compra sem objeto novo (referente implícito/explicito curto)
  if (/^posso comprar$/.test(q)) return true;
  if (/^entao compro$/.test(q)) return true;
  if (/^entao fecho$/.test(q)) return true;
  if (/^posso ir com esse$/.test(q)) return true;
  if (/^posso ir nesse$/.test(q)) return true;
  if (/^entao e esse mesmo$/.test(q)) return true;
  if (/^compro agora$/.test(q)) return true;
  if (/^compro esse$/.test(q)) return true;
  if (/^pode ser esse$/.test(q)) return true;
  if (/^pode ser esse mesmo$/.test(q)) return true;
  if (/^posso seguir com esse$/.test(q)) return true;
  if (/^entao e esse$/.test(q)) return true;
  if (/^entao fechou$/.test(q)) return true;

  if (/^decidi por (esse|essa|ele|ela|isso)$/.test(q)) return true;
  if (/^fechado (nele|nesse|nela|nessa)$/.test(q)) return true;

  // F4 — Família generalizada: verbo de fechamento + referente deíctico
  if (/^(vou|posso|devo)\s+(ir|fechar|pegar|levar)\s+(nesse|nele|nessa|nela|esse|ele|ela)$/.test(q)) {
    return true;
  }
  // "é isso?" / "é esse?" curto de confirmação de compra permanece DC apenas com referente deíctico explícito.
  if (/^(e|eh)\s+(esse|ele|ela)$/.test(q)) return true;
  if (/^(e|eh) esse mesmo\??$/.test(q)) return true;
  if (/^manda ver (nesse|nele|nessa|nela)$/.test(q)) return true;

  // PATCH 7.9Z.1A — compound close: fechou + referente / verbo de ação
  if (/^fechou (vou pegar|nele|nesse|nela|com ele|com ela)$/.test(q)) return true;
  if (/^fechou com (esse|essa|ele|ela|nele|nela|nesse|nessa)$/.test(q)) return true;
  if (/^fechou vou levar$/.test(q)) return true;
  if (/^parece ser esse$/.test(q)) return true;
  if (/^parece ser o certo$/.test(q)) return true;
  if (/\bfechou\b/.test(q) && /\b(vou pegar|nele|nesse|nela)\b/.test(q) && q.split(/\s+/).length <= 4) {
    return true;
  }

  // PATCH 7.9X-C — natural decision convergence without audit-closure phrasing
  if (detectsNaturalDecisionConfirmationSignal(q)) return true;

  return false;
}

function hasNaturalDecisionConfirmationBlock(q) {
  if (!q) return false;

  if (/\b(sera que|vou me arrepender|nao quero errar|medo de errar|nao quero fazer besteira|nao quero me arrepender|nao quero escolher mal|nao quero escolher errado)\b/.test(q)) {
    return true;
  }
  if (/\b(to|estou|fiquei)\s+(meio\s+)?(cabreiro|receoso|insegur[oa])\b/.test(q)) return true;
  if (/\b(to|estou|fiquei)\s+com\s+receio\b/.test(q)) return true;
  if (/\b(muito dinheiro|grana alta|pesa no bolso|compra pesa|jogar dinheiro fora|ficou caro|ta puxado|gastar menos|economizar|mais em conta)\b/.test(q)) {
    return true;
  }
  if (/\b(virou prioridade|importa mais|pesa mais|foco mudou|priorizar|meu uso mudou|pensei melhor no orcamento|recalibrar)\b/.test(q)) {
    return true;
  }
  if (/\b(tem certeza|mantem essa recomendacao|voce manteria|revisaria essa|sustenta essa|continua valendo)\b/.test(q)) {
    return true;
  }
  if (/\b(tem outro|ver outras opcoes|explorar outras|quero ver outra|me mostra outra)\b/.test(q)) return true;
  if (/\b(backup|reserva|plano b|logo atras|segundo colocado|substituto|carta na manga|quase ganhou)\b/.test(q)) {
    return true;
  }
  if (/\b(pessoal recomenda|galera gosta|o povo|pessoal gosta|costuma recomendar|a galera)\b/.test(q)) {
    return true;
  }
  if (/\b(nao quero decidir sem ver|quero abrir|tem mais possibilidades)\b/.test(q)) return true;
  if (/\b(compara|compare|comparando|versus|\bvs\b)\b/.test(q)) return true;

  return false;
}

function detectsNaturalDecisionConfirmationSignal(q) {
  if (!q || hasNaturalDecisionConfirmationBlock(q)) return false;

  const hasDecisionAnchor =
    /\b(nesse|nele|nessa|nela|esse|essa|ele|ela|isso|este|esta|escolha|opcao|caminho)\b/.test(q);

  const clusterA =
    /\bacho que vou (nele|nesse|nessa|nela|pegar esse|ficar com esse)\b/.test(q) ||
    /\bacho que (e|eh) esse mesmo\b/.test(q) ||
    /^acho que me decidi$/.test(q) ||
    /^acho que fechou$/.test(q) ||
    /\bacho que encontrei o meu\b/.test(q) ||
    /^acho que essa e a escolha$/.test(q) ||
    /^acho que vou nele entao$/.test(q);

  const clusterB =
    /\bvou seguir nessa (opcao|escolha)\b/.test(q) ||
    /^vou ficar com esse$/.test(q) ||
    /^vou nessa mesmo$/.test(q) ||
    /\bacho que vou pegar esse\b/.test(q) ||
    /\bvou (nele|nesse|nessa|nela)\b/.test(q);

  const clusterC =
    /\b(esse|essa) parece fazer (mais )?sentido\b/.test(q) ||
    /\b(esse|essa) parece ser o ideal\b/.test(q) ||
    /\b(esse|essa) parece o mais equilibrado\b/.test(q) ||
    /\b(esse|essa) encaixa melhor\b/.test(q) ||
    /\b(esse|essa) combina mais comigo\b/.test(q) ||
    /^esse deve ser o escolhido$/.test(q);

  const clusterD =
    /\bestou quase fechando (nesse|nele|nessa|nela|esse|essa)\b/.test(q) ||
    /\bestou inclinado a pegar esse\b/.test(q) ||
    /\bestou pendendo para (esse|nesse|nele|nessa|nela)\b/.test(q) ||
    /\bestou chegando numa decisao\b/.test(q) ||
    /^to inclinado a pegar esse$/.test(q);

  const clusterE =
    /\bacho que vai ser esse mesmo\b/.test(q) ||
    /^to achando que e esse$/.test(q) ||
    /\bfaz sentido ficar com esse\b/.test(q) ||
    /\b(esse|essa) ta ganhando pra mim\b/.test(q) ||
    /^to quase indo nele$/.test(q) ||
    /^parece que e esse mesmo$/.test(q) ||
    /^ok vou confiar$/.test(q) ||
    /^parece que e esse$/.test(q) ||
    /^parece ser esse$/.test(q) ||
    /^parece ser o certo$/.test(q) ||
    /^fechou (vou pegar|vou levar|nele|nesse|nela)$/.test(q) ||
    /^fechou com (esse|essa|ele|ela|nele|nela|nesse|nessa)$/.test(q) ||
    /^entao esse e o caminho$/.test(q);

  const convergenceReveal =
    /\b(acho que|to achando|parece que|entao)\b/.test(q) &&
    /\b(vou|fechou|me decidi|ficar com|pegar|seguir|inclinado|pendendo|quase fechando|quase indo|escolha|caminho)\b/.test(q) &&
    (hasDecisionAnchor || /\b(fechou|me decidi|chegando numa decisao)\b/.test(q)) &&
    !/\b(outro|outra|alternativa|backup|reserva|segundo|compara|certeza|arrepender|errar|galera|pessoal)\b/.test(q);

  // PATCH 8.1B.8 — convergência decisória com urgência de compra
  const rushedPurchaseDecision =
    (/\bpreciso decidir\b/.test(q) || /\bdecidir rapido\b/.test(q) || /\bpreciso decidir rapido\b/.test(q)) &&
    /\b(compro|comprar|qual compro|qual comprar|sem enrolacao)\b/.test(q);

  const formalPurchaseConfirmation =
    /\bpoderia confirmar se compro\b/.test(q) ||
    (/\bpoderia confirmar\b/.test(q) && /\b(compro|comprar)\b/.test(q));

  const rushedConvergence =
    (/\b(rapido|sem enrolacao|direto ao ponto)\b/.test(q) &&
      /\b(posso ir nesse|fecho nele|compro esse|compro|posso comprar)\b/.test(q)) ||
    (/\bresponde rapido\b/.test(q) && /\b(posso ir|compro|fecho)\b/.test(q));

  return (
    clusterA ||
    clusterB ||
    clusterC ||
    clusterD ||
    clusterE ||
    convergenceReveal ||
    rushedPurchaseDecision ||
    formalPurchaseConfirmation ||
    rushedConvergence
  );
}

/** PATCH 7.8B — exported for Routing layer (read-only family detector). */
export function isDecisionConfirmationFamilyQuery(message = "") {
  const dominant = getCrossFamilyDominantFamily(message);
  if (dominant) return dominant === "DECISION_CONFIRMATION";
  return detectsDecisionConfirmationSignal(normalize(message));
}

// PATCH 7.8F — ANTI_REGRET semantic family (intenção: reduzir medo de arrependimento antes da compra)
function hasAntiRegretCommercialTail(q) {
  if (!q) return false;

  // normalize() remove pontuação — tails comerciais aparecem separados por espaço.
  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\boutr[oa]\b/.test(q)) return true;
  if (/\btem outro\b/.test(q)) return true;
  if (/\btem outra\b/.test(q)) return true;
  if (/\b(compara|compare)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\bespero promocao\b/.test(q)) return true;
  if (/\b(espero|aguardo)\s+(promocao|promo|black|sale)\b/.test(q)) return true;
  if (/\bqual ficou em segundo\b/.test(q)) return true;
  // Confidence challenge futuro — não engolir como anti-regret puro
  if (/^tem certeza$/.test(q)) return true;
  if (/^(voce|vc) tem certeza$/.test(q)) return true;
  if (
    hasAffirmativeCommercialSearchVerb(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)
  ) {
    if (shouldSuppressCommercialTailForAnchoredReference(q)) return false;
    return true;
  }

  return false;
}

function detectsAntiRegretSignal(q) {
  if (!q || hasAntiRegretCommercialTail(q)) return false;
  if (hasExplicitNewCommercialSearchFrame(q)) return false;
  // PATCH 7.9Y.1 — prefixo fraco/DC + cauda de medo pessoal
  if (hasAntiRegretDominantMasTail(q)) return true;
  if (detectsAntiRegretPriceFearCompound(q)) return true;
  // Medo pessoal de arrependimento vence confirmação pura em frases compostas (PATCH 7.9X-D.4).
  const personalRegretDominant = hasPersonalAntiRegretDominantFrame(q);
  // DECISION_CONFIRMATION tem precedência explícita — "posso comprar?" ≠ "posso comprar tranquilo?"
  if (!personalRegretDominant && detectsDecisionConfirmationSignal(q)) return false;

  // F1 — Pergunta direta de arrependimento
  if (/^vou me arrepender$/.test(q)) return true;
  if (/^vou me arrepender depois$/.test(q)) return true;
  if (/^nao vou me arrepender depois$/.test(q)) return true;

  // F2 — Segurança emocional / tranquilidade antes da compra
  if (/^posso comprar tranquilo$/.test(q)) return true;
  if (/^posso comprar sem medo$/.test(q)) return true;
  if (/^(e|eh) uma compra segura$/.test(q)) return true;
  if (/^compra segura\??$/.test(q)) return true;
  if (/^da pra comprar sem medo$/.test(q)) return true;
  if (/^(e|eh) uma escolha tranquila$/.test(q)) return true;
  if (/^posso ficar sossegado$/.test(q)) return true;
  if (/^nao tem muito risco$/.test(q)) return true;
  if (/^(e|eh) uma compra confiavel$/.test(q)) return true;
  if (/^(e|eh) dificil se arrepender dessa escolha$/.test(q)) return true;
  if (/^da pra ficar tranquilo$/.test(q)) return true;
  if (/^nao tem risco nessa compra$/.test(q)) return true;

  // PATCH 8.1B.4 — medo/receio pessoal curto sobre a compra atual
  if (/^medo de errar$/.test(q)) return true;
  if (/^me da medo$/.test(q)) return true;
  if (/\bisso me da medo\b/.test(q)) return true;
  if (/\b(me da|me deu|me deixa) medo\b/.test(q)) return true;
  if (/\bsera que vou me ferrar\b/.test(q)) return true;
  if (/\bnao quero cair em fria\b/.test(q)) return true;
  if (/\breceio de comprar\b/.test(q) && !/\b(galera|povo|pessoal|quem comprou|muita gente)\b/.test(q)) {
    return true;
  }

  // F3 — Medo explícito de arrependimento (compatível 7.6V purchase_anxiety)
  if (/\bnao quero me arrepender\b/.test(q)) return true;
  if (/^tenho medo de me arrepender$/.test(q)) return true;
  if (/^nao quero me arrepender$/.test(q)) return true;
  if (/^e se eu me arrepender$/.test(q)) return true;
  if (/^se eu me arrepender$/.test(q)) return true;
  if (/^vai que eu me arrepender$/.test(q)) return true;
  if (/^nao quero fazer besteira$/.test(q)) return true;

  // F4 — Família generalizada: medo/risco/tranquilidade sobre a decisão atual
  if (/^(tenho|estou com)\s+medo\s+de\s+(me\s+)?arrepender$/.test(q)) return true;
  if (/^nao quero\s+(me\s+)?arrepender$/.test(q)) return true;
  if (/^da pra (comprar|ficar) (tranquilo|sem medo|sossegado)$/.test(q)) return true;
  if (/^(e|eh) (seguro|segura|confiavel|tranquilo|tranquila) (comprar|fechar|ir)$/.test(q)) return true;
  if (/^posso (ficar|comprar) (tranquilo|sossegado|sem medo)$/.test(q)) return true;

  // PATCH 7.9Y.1 — segurança emocional pessoal (≠ desafio de firmeza da MIA)
  if (/\b(e|eh) seguro ir nesse\b/.test(q)) return true;
  if (/\b(e|eh) seguro (comprar|fechar|ir)\b/.test(q) && /\b(nesse|nessa|isso|essa escolha)\b/.test(q)) {
    return true;
  }
  if (/\bacha que vou me arrepender\b/.test(q)) return true;
  if (/\b(e|eh) seguro pra mim\b/.test(q)) return true;

  // PATCH 7.9X-D — natural regret-avoidance without direct "vou me arrepender?" framing
  if (detectsNaturalAntiRegretSignal(q)) return true;

  return false;
}

function hasNaturalAntiRegretBlock(q) {
  if (!q) return false;

  // Medo pessoal dominante vence cauda social coletiva em compostos (PATCH 7.9X-D.4).
  if (hasPersonalAntiRegretDominantFrame(q)) return false;

  if (/\b(tem certeza|sustenta essa|mantem essa|continua valendo|ainda acha|revisaria essa)\b/.test(q)) {
    return true;
  }
  if (/^quem compra se arrepende$/.test(q)) return true;
  if (/\b(quem compra|pessoal|galera|o povo|costuma recomendar)\b/.test(q) && /\b(reclama|recomenda|gosta|arrepender)\b/.test(q)) {
    return true;
  }
  if (/^quero algo (mais confiavel|que dure mais|mais equilibrado)$/.test(q)) return true;
  if (/^agora quero algo mais (simples|tranquilo|confiavel)$/.test(q)) return true;
  if (/\b(nao me convenceu|nao concordo|nao sei se e isso|to meio assim|nao curti muito|nao me desceu)\b/.test(q)) {
    return true;
  }
  if (/\b(tem outro|ver outras opcoes|explorar outras|mostra alternativas|quero ver opcoes)\b/.test(q)) {
    return true;
  }
  if (/\b(compara|compare|comparando|versus|\bvs\b)\b/.test(q)) return true;
  if (/\b(quero gastar menos|bateria importa|desempenho virou prioridade|vou usar mais para)\b/.test(q)) {
    return true;
  }
  if (/^(ok|blz|show|entendi|oi|bom dia|salve)$/.test(q)) return true;

  return false;
}

function detectsAntiRegretPriceFearCompound(q) {
  if (!q) return false;
  return (
    (/\b(ficou caro|ta puxado|muito dinheiro|pesou no bolso|grana alta)\b/.test(q) &&
      /\b(nao quero me arrepender|nao quero errar|medo de errar|jogar dinheiro fora|medo de escolher errado)\b/.test(
        q
      )) ||
    /\bquero algo mais barato\b.*\b(nao jogar dinheiro fora|nao quero errar|nao quero me arrepender)\b/.test(q) ||
    /\bquero comprar sem preocupacao\b/.test(q) ||
    /\bquero comprar uma vez so\b/.test(q)
  );
}

function detectsNaturalAntiRegretSignal(q) {
  if (!q || hasNaturalAntiRegretBlock(q)) return false;
  if (
    hasConstraintChangeDominantFrame(q) &&
    !hasPersonalAntiRegretDominantFrame(q) &&
    !detectsAntiRegretPriceFearCompound(q)
  ) {
    return false;
  }
  if (detectsDecisionConfirmationSignal(q) && !hasPersonalAntiRegretDominantFrame(q)) return false;

  const explicitRegretFear =
    /^quero evitar dor de cabeca$/.test(q) ||
    /^nao quero dor de cabeca$/.test(q) ||
    /^nao quero errar$/.test(q) ||
    /^nao quero errar nessa compra$/.test(q) ||
    /^nao quero fazer besteira$/.test(q) ||
    /^nao quero escolher mal$/.test(q) ||
    /^tenho medo de escolher errado$/.test(q) ||
    /^nao quero me frustrar depois$/.test(q) ||
    /\btenho medo de errar\b/.test(q) ||
    /\btenho muito medo de errar\b/.test(q) ||
    /^medo de errar$/.test(q) ||
    /^me da medo$/.test(q) ||
    (/\b(me da|me deu|me deixa) medo\b/.test(q)) ||
    (/\bisso me da medo\b/.test(q)) ||
    (/\bsera que vou me ferrar\b/.test(q)) ||
    (/\bnao quero cair em fria\b/.test(q)) ||
    /\bnao quero escolher errado\b/.test(q) ||
    (/\bmedo de errar\b/.test(q) &&
      (/\b(compra|escolha|decisao|nessa|nesse)\b/.test(q) || q.split(/\s+/).length <= 3)) ||
    (/\breceio de comprar\b/.test(q) && !/\b(galera|povo|pessoal|quem comprou|muita gente)\b/.test(q)) ||
    /\btenho medo de tomar decisao errada\b/.test(q) ||
    /\breceio de comprar errado\b/.test(q) ||
    (/\b(essa|a) (escolha|compra) me preocupa\b/.test(q)) ||
    (/\bestou receos[oa]\s+com\s+(essa|a)\s+compra\b/.test(q));

  const emotionalSafety =
    /^quero uma escolha tranquila$/.test(q) ||
    /^quero algo que nao me incomode depois$/.test(q) ||
    /\bgostaria de uma escolha tranquila\b/.test(q);

  const generalizedRegretAvoidance =
    (/\bnao quero errar\b/.test(q) &&
      (/\b(compra|escolha|decisao|nessa|nesse|na)\b/.test(q) || q.split(/\s+/).length <= 4)) ||
    (/\bnao quero\b/.test(q) && /\b(dor de cabeca|me incomodar|arrependimento)\b/.test(q)) ||
    /\bnao quero (fazer besteira|escolher mal|me frustrar)\b/.test(q) ||
    /\btenho medo de escolher errado\b/.test(q) ||
    (/\bquero evitar\b/.test(q) && /\b(dor de cabeca|problema|problemas|frustracao|arrependimento)\b/.test(q)) ||
    (/\bquero algo que\b/.test(q) && /\bnao me incomode depois\b/.test(q)) ||
    (/\bquero uma escolha tranquila\b/.test(q) && !/\bmais tranquilo\b/.test(q));

  // PATCH 7.9X-D.4 — Group B: medo implícito / pressão financeira percebida
  const implicitFinancialFear =
    (/\b(muito dinheiro|grana alta|uma grana alta|e uma grana)\b/.test(q) &&
      (/\b(pra mim|pro meu bolso|no bolso|peso|alta)\b/.test(q) || q.length < 35)) ||
    (/\b(essa|a) compra pesa\b/.test(q) && !hasConstraintChangeDominantFrame(q)) ||
    /\bnao quero (jogar dinheiro fora|gastar errado|gastar mal)\b/.test(q) ||
    (/\bnao posso errar\b/.test(q) && /\b(compra|escolha|decisao|nessa|nesse)\b/.test(q)) ||
    (/\bse eu errar\b/.test(q) && /\b(vai doer|doer|machuca|prejudica|complica)\b/.test(q)) ||
    (/\bnao quero (jogar|desperdicar|perder)\b/.test(q) && /\b(dinheiro|grana)\b/.test(q)) ||
    /\b(me da|me deu|me deixa)\s+inseguranc[ae]\s+gastar\b/.test(q) ||
    /\bfico pensando se vale o risco\b/.test(q) ||
    /\btenho receio de investir errado\b/.test(q);

  // PATCH 7.9X-D.4 — Group C: linguagem coloquial / receio pessoal
  const colloquialPersonalFear =
    /\b(to|estou|fiquei)\s+(meio\s+)?(cabreiro|receoso|apreensivo)\b/.test(q) ||
    /\b(to|estou|fiquei)\s+com\s+receio\b/.test(q) ||
    /\btenho receio\b/.test(q) ||
    /\b(to|estou|fiquei)\s+(meio\s+)?insegur[oa]\b/.test(q) ||
    (/\bnao sei se (e|eh) seguro\b/.test(q) && /\b(ir nesse|nessa escolha|nessa|nesse|confio)\b/.test(q)) ||
    (/\b(to|estou|fiquei)\s+na duvida se (e|eh) seguro\b/.test(q)) ||
    (/\bnao sei se confio\b/.test(q) && /\b(escolha|decisao|nessa|nesse)\b/.test(q)) ||
    (/\bpe atras\b/.test(q) && /\b(medo de errar|medo de me arrepender|medo de escolher errado)\b/.test(q));
    // PATCH 7.9X-SD.2 — pé atrás sem medo explícito = resistência leve (SOFT_DISAGREEMENT), não ANTI_REGRET

  // PATCH 7.9X-D.4 — Group D: evitar dor / problema futuro
  const futurePainAvoidance =
    (/\bnao quero\b/.test(q) && /\b(dor de cabeca|me incomodar|arrependimento)\b/.test(q) && /\bdepois\b/.test(q)) ||
    (/\bquero evitar\b/.test(q) && /\b(problema|problemas|dor de cabeca|arrependimento|sufoco)\b/.test(q)) ||
    (/\bquero nao passar\b/.test(q) && /\b(sufoco|problema|dor)\b/.test(q)) ||
    (/\bquero ficar tranquilo\b/.test(q) && /\b(depois|depois da compra|apos)\b/.test(q)) ||
    /\bquero comprar e nao me preocupar\b/.test(q) ||
    /\bquero algo que nao me (de|dê) trabalho\b/.test(q);

  // PATCH 7.9X-D.4 — Group E: dúvida emocional pessoal (≠ prova social)
  const personalEmotionalDoubt =
    /\bsera que (eu )?vou me arrepender\b/.test(q) ||
    /^eu vou me arrepender\b/.test(q) ||
    /\bsera que vou fazer besteira\b/.test(q) ||
    /\bsera que (e|eh) seguro pra mim\b/.test(q) ||
    /\bsera que vou me frustrar\b/.test(q) ||
    /\bsera que estou escolhendo errado\b/.test(q);

  // PATCH 7.9X-D.4 — Group F: composto decisão + medo pessoal dominante
  const compoundDecisionFear =
    hasPersonalAntiRegretDominantFrame(q) &&
    /\b(mas|porem|so que|only|though)\b/.test(q) &&
    /\b(vou nele|vou nesse|fechou|gostei|parece ser esse|acho que)\b/.test(q);

  const emotionalRelief =
    /\b(to|estou|fiquei)\s+(mais\s+)?(tranquilo|seguro|calmo|sossegad[oa])\b/.test(q) &&
    !/\b(mas|porem|medo|receio|cabreiro|nao quero)\b/.test(q);

  return (
    explicitRegretFear ||
    emotionalSafety ||
    generalizedRegretAvoidance ||
    implicitFinancialFear ||
    colloquialPersonalFear ||
    futurePainAvoidance ||
    personalEmotionalDoubt ||
    compoundDecisionFear ||
    emotionalRelief
  );
}

/** Personal regret framing beats collective social tail in composite queries. */
function hasPersonalAntiRegretDominantFrame(q) {
  if (!q) return false;
  if (/^quem (compra|comprou|tem|usa)\b/.test(q)) return false;
  if (/\b(para muita gente|para o pessoal|para muito gente|muita gente reclama)\b/.test(q)) {
    return false;
  }
  if (/\b(galera|o povo|o pessoal|quem comprou|muita gente|bastante gente|as pessoas)\b/.test(q) && /\b(reclama|recomenda|gostou|arrepende|problema|teve problema|se arrepende)\b/.test(q)) {
    return false;
  }

  return (
    (/\bquero evitar\b/.test(q) && /\b(dor de cabeca|problema|risco|frustracao|arrependimento|sufoco)\b/.test(q)) ||
    /\b(tenho medo|medo de errar|medo de escolher errado|medo de me arrepender|nao quero me arrepender|nao quero errar|nao quero fazer besteira|nao quero escolher errado|nao quero escolher mal)\b/.test(q) ||
    (/\bsera que\b/.test(q) && !/\b(muita gente|o povo|a galera|o pessoal|as pessoas|quem comprou|quem tem|quem usa|bastante gente)\b/.test(q)) ||
    /^eu vou me arrepender\b/.test(q) ||
    /\b(to|estou|fiquei)\s+(meio\s+)?(cabreiro|receoso|apreensivo|insegur[oa])\b/.test(q) ||
    /\b(to|estou|fiquei)\s+com\s+receio\b/.test(q) ||
    /\btenho receio\b/.test(q) ||
    /\breceio de comprar\b/.test(q) ||
    /\b(me da|me deu|me deixa) medo\b/.test(q) ||
    /\bisso me da medo\b/.test(q) ||
    /\bsera que vou me ferrar\b/.test(q) ||
    /\bnao quero cair em fria\b/.test(q) ||
    (/\b(muito dinheiro|grana alta|pesa no bolso|compra pesa)\b/.test(q) &&
      !/\b(quero gastar|economizar|mais em conta|baixar|ficou caro|ta puxado)\b/.test(q)) ||
    /\bnao quero (jogar dinheiro fora|gastar errado|gastar mal|dor de cabeca|me incomodar|arrependimento)\b/.test(q) ||
    (/\bquero ficar tranquilo\b/.test(q) && /\b(depois|depois da compra)\b/.test(q)) ||
    (/\bpe atras\b/.test(q) && /\b(medo de errar|medo de me arrepender|medo de escolher errado)\b/.test(q)) ||
    /^eu vou me arrepender\b/.test(q)
  );
}

/** PATCH 7.8F — exported for Routing layer (read-only family detector). */
export function isAntiRegretFamilyQuery(message = "") {
  const dominant = getCrossFamilyDominantFamily(message);
  if (dominant) return dominant === "ANTI_REGRET";
  return detectsAntiRegretSignal(normalize(message));
}

// PATCH 7.8J — CONFIDENCE_CHALLENGE semantic family (intenção: desafio à confiança da recomendação atual)
function hasConfidenceChallengeCommercialTail(q) {
  if (!q) return false;

  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\boutr[oa]\b/.test(q)) return true;
  if (/\btem outro\b/.test(q)) return true;
  if (/\btem outra\b/.test(q)) return true;
  if (/\b(compara|compare)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\bnao vai mudar se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\bespero promocao\b/.test(q)) return true;
  if (/\b(espero|aguardo)\s+(promocao|promo|black|sale)\b/.test(q)) return true;
  if (/\bqual ficou em segundo\b/.test(q)) return true;
  if (
    hasAffirmativeCommercialSearchVerb(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)
  ) {
    if (shouldSuppressCommercialTailForAnchoredReference(q)) return false;
    return true;
  }

  return false;
}

function detectsConfidenceChallengeSignal(q) {
  if (!q || hasConfidenceChallengeCommercialTail(q)) return false;
  // PATCH 7.9X-E.2 — composto: cauda CC após "mas" vence famílias do prefixo
  if (hasConfidenceChallengeDominantMasTail(q)) return true;
  // DECISION_CONFIRMATION e ANTI_REGRET têm precedência explícita.
  if (detectsDecisionConfirmationSignal(q)) return false;
  if (detectsAntiRegretSignal(q)) return false;
  // PATCH 8.1B.4 — fechamento do usuário ≠ desafio de confiança
  if (/^bate o martelo$/.test(q)) return false;

  // F1 — Desafio direto de certeza/confiança
  if (/^tem certeza$/.test(q)) return true;
  if (/^(voce|vc) tem certeza$/.test(q)) return true;
  if (/^certeza\??$/.test(q)) return true;

  // F2 — Confirmação retórica da decisão ("é isso mesmo?" ≠ "então é esse?")
  if (/^(e|eh) isso mesmo$/.test(q)) return true;
  if (/^(e|eh) isso$/.test(q)) return true;

  // F3 — Estabilidade da recomendação / medo de mudança de ideia
  if (/^nao vai mudar depois$/.test(q)) return true;
  if (/^nao vai mudar de ideia$/.test(q)) return true;
  if (/^nao vai mudar (depois|de ideia)$/.test(q)) return true;

  // F4 — Garantia / convicção / crava (desafio — não promessa de resposta)
  if (/^(voce|vc) garante$/.test(q)) return true;
  if (/^tem conviccao$/.test(q)) return true;
  if (/^(voce|vc) crava isso$/.test(q)) return true;
  if (/^crava isso\??$/.test(q)) return true;
  if (/^crava mesmo$/.test(q)) return true;
  if (/^mantem essa escolha\??$/.test(q)) return true;
  if (/^mantem essa recomendacao$/.test(q)) return true;
  if (/^tu compraria$/.test(q)) return true;
  if (/^confia mesmo nisso$/.test(q)) return true;
  if (/^confia mesmo$/.test(q)) return true;

  // F5 — Família generalizada: desafio à firmeza da escolha atual
  if (/^(voce|vc|tu) (sustenta|mantem|mantém|banca) (isso|essa|esse|essa escolha|essa recomendacao)$/.test(q)) {
    return true;
  }
  if (/^essa (decisao|recomendacao|escolha) (e|eh) firme$/.test(q)) return true;
  if (/^nao muda (depois|de ideia|sua opiniao|sua recomendacao)$/.test(q)) return true;

  // PATCH 7.9X-E — natural confidence challenge without exact phrase hardcoding
  if (detectsNaturalConfidenceChallengeSignal(q)) return true;

  return false;
}

function hasNaturalConfidenceChallengeBlock(q) {
  if (!q) return false;
  if (
    isAcknowledgementContinuityPhrase(q) ||
    isAcknowledgementLightConfirmEntaoPhrase(q) ||
    detectsPureAcknowledgementSignal(q)
  ) {
    return true;
  }

  if (/\b(tenho medo|nao quero me arrepender|dor de cabeca|escolha tranquila|nao quero errar|nao quero fazer besteira)\b/.test(q)) {
    return true;
  }
  if (
    /\b(galera|povo|pessoal|o pessoal|popular|bem visto|falam bem|costuma recomendar|quem tem costuma)\b/.test(q) &&
    !/\b(voce|vc)\s+(compraria|manteria|recomendaria|iria|bancaria)\b/.test(q)
  ) {
    return true;
  }
  if (/\b(vou nele|vou nesse|fechou|vou ficar com|entao e esse|entao vou nele|acho que vou nele)\b/.test(q)) {
    return true;
  }
  if (/\b(nao me convenceu|nao concordo|nao sei se concordo|meio fraco|nao parece tao bom|nao sei se e isso)\b/.test(q)) {
    return true;
  }
  if (/\b(plano b|segundo colocado|ficou em segundo|qual ficou em segundo|backup|reserva|runner up)\b/.test(q)) {
    return true;
  }
  if (/\b(tem outro|ver outras opcoes|explorar outras|mostra outras|quero ver alternativas)\b/.test(q)) {
    return true;
  }
  if (
    /\b(quero gastar|gastar menos|prioridade|orcamento|vou jogar mais|importa mais)\b/.test(q) &&
    !/^continua valendo\b/.test(q) &&
    !/^ainda vale\b/.test(q)
  ) {
    return true;
  }
  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\b(compara|compare|comparando)\b/.test(q)) return true;
  if (/\bno seu lugar\b/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos|priorizar|prioridade)\b/.test(q)) return true;

  return false;
}

/** PATCH 7.9X-E.2 — núcleo semântico CC reutilizável (cauda "mas" e detector natural). */
function detectsNaturalConfidenceChallengeCore(q) {
  if (!q) return false;

  const directCertainty =
    /\btem certeza\b/.test(q) ||
    /\bcerteza (mesmo|disso|disto|dessa|desse)\b/.test(q) ||
    /\bda pra confiar\b/.test(q) ||
    /\bisso\b.*\bsegur[oa]\b/.test(q) ||
    /\bsegur[oa]\b.*\b(mesmo|isso)\b/.test(q) ||
    /^(serio|realmente|mesmo|crava mesmo)$/.test(q);

  const sustainRecommendation =
    /\b(voce|vc)\s+(mantem|mantém|manteria|sustenta|sustentaria|bancaria|defenderia)\b/.test(q) ||
    /\bcontinua achando\b/.test(q) ||
    /\bcontinua recomendando\b/.test(q) ||
    /\bcontinua (nesse|nele|nessa|nela|esse|essa|isso) (mesmo|ainda)\b/.test(q) ||
    /^continua nesse mesmo\??$/.test(q) ||
    /^continua\??$/.test(q) ||
    /^entao mantem esse\??$/.test(q) ||
    /\bentao mantem (esse|essa|isso|ele|ela|nele|nela|nesse|nessa)\b/.test(q) ||
    /\bcontinua bancando\b/.test(q) ||
    /\bcontinua na mesma (recomendacao|linha|escolha)\b/.test(q) ||
    /\bcontinua indicando\b/.test(q) ||
    /\bsegue recomendando\b/.test(q) ||
    /^segue nesse mesmo\??$/.test(q) ||
    /^segue (nesse|nessa|nele|nela) mesmo\??$/.test(q) ||
    /^mantem esse\??$/.test(q) ||
    /^ainda e esse\??$/.test(q) ||
    /^ainda vale\??$/.test(q) ||
    /^continua valendo\??$/.test(q) ||
    /^ainda recomenda\??$/.test(q) ||
    /^voce ainda iria nele\??$/.test(q) ||
    /^qual seria (a )?sua escolha\??$/.test(q) ||
    /\bqual seria (a )?sua (escolha|decisao|recomendacao)\b/.test(q) ||
    /^sustenta$/.test(q) ||
    /^crava isso$/.test(q) ||
    /^mantem essa escolha$/.test(q) ||
    /^mantem essa recomendacao\??$/.test(q) ||
    /^mantem a recomendacao\??$/.test(q) ||
    /^continua de pe\??$/.test(q) ||
    /^como fica nesse ponto\??$/.test(q) ||
    /^isso continua bom\??$/.test(q) ||
    /^ainda segura\??$/.test(q) ||
    /^segue sendo a melhor\??$/.test(q) ||
    /^continua sendo a escolha\??$/.test(q) ||
    /^ainda segura (essa )?indicacao\??$/.test(q) ||
    /\bnao mudou (sua )?(opiniao|recomendacao|ideia)\b/.test(q) ||
    (/^continua valendo\b/.test(q) && q.split(/\s+/).length <= 12) ||
    /\bcontinua valendo\b.*\b(mesmo se|se eu)\b/.test(q) ||
    /\bainda banca\b/.test(q) ||
    /\b(voce|vc)\s+seguiria nesse\b/.test(q) ||
    /\b(voce|vc)\s+continua\b.*\brecomend/.test(q) ||
    /\bsustenta\b.*\b(escolha|recomendacao|decisao)\b/.test(q) ||
    /\bainda\b.*\b(acha|recomenda|sustenta|mantem|mantém|iria)\b/.test(q) ||
    /\bisso continua valendo\b/.test(q) ||
    /\bcontinua valendo\b/.test(q) ||
    /\bvoce sustenta ou eu erro\b/.test(q) ||
    /\bentao mantem (esse|isso|essa|ele|ela)\b/.test(q) ||
    /\bnao mudou (sua )?(opiniao|recomendacao|ideia)\b/.test(q) ||
    /\b(voce|vc)\s+revisaria\b/.test(q) ||
    /\b(essa )?(decisao|recomendacao|escolha) se mantem\b/.test(q) ||
    (/\bbate(o|ria)? o martelo\b/.test(q) && !/^bate o martelo$/.test(q)) ||
    /\b(voce|vc|tu)\s+(crava|garante)\b/.test(q);

  const firmnessChallenge =
    /\b(nao esta|nao ta|esta)\s+(forcando|forçando|exagerando|empurrando|puxando)\b/.test(q) ||
    /\bpegadinha\b/.test(q) ||
    (/\b(bem )?segur[oa]\b/.test(q) &&
      /\b(recomendacao|escolha|decisao|isso)\b/.test(q) &&
      !/^(e|eh) uma escolha segura\??$/.test(q));

  const personalTrustTest =
    ((/\b(voce|vc|tu)\s+(compraria|iria|optaria|pegaria|seguiria)\b/.test(q) && !/\bse fosse\b/.test(q)) ||
    /^tu compraria$/.test(q) ||
    /^confia mesmo nisso$/.test(q) ||
    /^confia mesmo$/.test(q) ||
    ((/\b(voce|vc)\s+escolheria\b/.test(q) && !/\bqual\b/.test(q))) ||
    /\bse fosse (voce|vc)\b/.test(q) ||
    /\b(seu|o seu)\s+(dinheiro|bolso)\b/.test(q) ||
    /\bcolocaria seu dinheiro\b/.test(q));

  const comparativeTrust =
    /\bainda (e|eh) o melhor\b/.test(q) ||
    /\bainda (e|eh)\b.*\b(mais forte|mais segura|melhor)\b/.test(q) ||
    /\bcontinua sendo\b.*\b(melhor|mais seguro|mais forte|primeira)\b/.test(q) ||
    (/\b(essa )?(escolha|opcao) (mais )?(forte|segura)\b/.test(q) && /\bainda\b/.test(q)) ||
    /\bprimeira opcao\b/.test(q) ||
    /\b(mantem|mantém)\b.*\b(vencedor|como vencedor)\b/.test(q) ||
    /\bcomo vencedor\b/.test(q) ||
    /\b(voce|vc) nao mudaria (a )?(recomendacao|escolha|opiniao)\b/.test(q) ||
    /\bpode ir sem medo\b/.test(q) ||
    /\bnao vai mudar (depois|de ideia|sua opiniao|sua recomendacao)\b/.test(q);

  // PATCH 8.1B.7 — post-normalization validity doubt (informal/abbrev compounds)
  const validityDoubt =
    (/\b(vale|compensa|faz sentido)\b/.test(q) && /\b(mesmo|realmente|de verdade)\b/.test(q)) ||
    /\b(voce|vc)\s+acha\b.*\b(vale|compensa|faz sentido)\b/.test(q) ||
    /\b(voce|vc)\s+recomenda\b.*\b(mesmo|realmente)\b/.test(q) ||
    /\b(sei la|nao sei)\b.*\b(se )?(vale|compensa|faz sentido)\b/.test(q) ||
    /\bgostaria de saber se ainda vale\b/.test(q) ||
    (/\bdireto ao ponto\b/.test(q) && /\bainda vale\b/.test(q)) ||
    /^se compensa\??$/.test(q) ||
    /^por que esse\??$/.test(q) ||
    /^certeza\??$/.test(q) ||
    /^custo beneficio\??$/.test(q) ||
    (/\b(vale|compensa)\??$/.test(q) && q.split(/\s+/).length <= 3);

  // PATCH 8.1B.8 — pergunta técnica ancorada sobre atributo do produto atual
  const anchoredTechnicalSpec =
    /\bqual [oa] \w+\b/.test(q) &&
    /\b(desse|deste|desta|dessa|desse modelo|deste modelo|deste produto|desse produto)\b/.test(q) &&
    /\b(chipset|processador|ram|memoria|bateria|tela|hz|latencia|benchmark|fps|nvme|tdp|desempenho|armazenamento|monitor|notebook|celular|mouse|teclado|tv)\b/.test(q);

  return (
    directCertainty ||
    sustainRecommendation ||
    firmnessChallenge ||
    personalTrustTest ||
    comparativeTrust ||
    validityDoubt ||
    anchoredTechnicalSpec
  );
}

/** PATCH 7.9X-E.2 — prefixo fraco + "mas" + cauda CC forte → intenção dominante é desafio de confiança. */
function hasConfidenceChallengeDominantMasTail(q) {
  if (!q || !/\bmas\b/.test(q)) return false;

  const tail = q.split(/\bmas\b/).pop()?.trim();
  if (!tail || tail.length < 6) return false;
  if (hasNaturalConfidenceChallengeBlock(tail)) return false;
  if (detectsAntiRegretSignal(tail)) return false;
  if (detectsSecondBestDiscoverySignal(tail)) return false;
  if (detectsAlternativeExplorationSignal(tail)) return false;
  if (detectsConstraintChangeSignal(tail)) return false;
  if (
    /\b(galera|povo|pessoal|quem comprou|a maioria)\b/.test(tail) &&
    !/\b(voce|vc)\s+(compraria|manteria|recomendaria|iria|bancaria)\b/.test(tail)
  ) {
    return false;
  }
  if (/\b(nao me convenceu|nao concordo|nao curti|pe atras|nao bateu comigo|nao sei se e isso)\b/.test(tail)) {
    return false;
  }

  return detectsNaturalConfidenceChallengeCore(tail);
}

/** PATCH 7.9Y.1 — prefixo fraco/DC + cauda de medo pessoal → ANTI_REGRET dominante. */
function hasAntiRegretDominantMasTail(q) {
  if (!q || !/\bmas\b/.test(q)) return false;

  const tail = q.split(/\bmas\b/).pop()?.trim();
  if (!tail || tail.length < 6) return false;
  if (detectsNaturalConfidenceChallengeCore(tail) && !hasPersonalAntiRegretDominantFrame(tail)) {
    return false;
  }
  if (detectsNaturalSocialValidationCore(tail) && !hasPersonalAntiRegretDominantFrame(tail)) {
    return false;
  }

  return (
    hasPersonalAntiRegretDominantFrame(tail) ||
    /\b(nao quero|quero evitar)\b.*\b(dor de cabeca|arrependimento|problema|sufoco|incomodar)\b/.test(tail) ||
    /\btenho medo de errar\b/.test(tail) ||
    /\b(me da|me deu|me deixa) medo\b/.test(tail) ||
    /\bisso me da medo\b/.test(tail) ||
    /\b(to|estou|fiquei)\s+(meio\s+)?cabreiro\b/.test(tail) ||
    /\bnao quero dor de cabeca\b/.test(tail)
  );
}

function hasWeakDecisionConfirmationPrefix(prefix = "") {
  if (!prefix) return false;
  return /\b(vou nele|vou nesse|fechou|acho que vou|parece que e esse|gostei dele|parece bom|acho que fechou|parece ser esse|entao vou nele|manda ver nesse)\b/.test(
    prefix
  );
}

/** PATCH 7.9Y.1 — prefixo fraco/DC + cauda de restrição → CONSTRAINT_CHANGE dominante. */
function hasConstraintChangeDominantMasTail(q) {
  if (!q || !/\bmas\b/.test(q)) return false;

  const parts = q.split(/\bmas\b/);
  const prefix = parts.slice(0, -1).join(" mas ").trim();
  const tail = parts[parts.length - 1]?.trim();
  if (!tail || tail.length < 6) return false;
  if (hasPersonalAntiRegretDominantFrame(tail)) return false;
  if (detectsSecondBestDiscoveryCore(tail)) return false;
  if (detectsAlternativeExplorationCore(tail)) return false;
  if (detectsNaturalConfidenceChallengeCore(tail)) return false;
  if (detectsNaturalSocialValidationCore(tail)) return false;
  if (detectsNaturalSoftDisagreementCore(tail)) return false;

  return (
    hasConstraintChangeDominantFrame(tail) ||
    (hasWeakDecisionConfirmationPrefix(prefix) &&
      /\b(queria|quero|preciso|pensei melhor)\b.*\b(gastar|pagar|economizar|orcamento)\b/.test(tail)) ||
    /\bpensei melhor no orcamento\b/.test(tail)
  );
}

function detectsNaturalConfidenceChallengeSignal(q) {
  if (!q || hasNaturalConfidenceChallengeBlock(q)) return false;
  if (detectsDecisionConfirmationSignal(q)) return false;
  if (detectsAntiRegretSignal(q)) return false;
  if (detectsSoftDisagreementSignal(q)) return false;

  return detectsNaturalConfidenceChallengeCore(q);
}

/** PATCH 7.8J — exported for Routing layer (read-only family detector). */
export function isConfidenceChallengeFamilyQuery(message = "") {
  const dominant = getCrossFamilyDominantFamily(message);
  if (dominant) return dominant === "CONFIDENCE_CHALLENGE";
  return detectsConfidenceChallengeSignal(normalize(message));
}

// PATCH 7.8N — SOCIAL_VALIDATION semantic family (intenção: prova social / aceitação coletiva da escolha)
function hasSocialValidationCommercialTail(q) {
  if (!q) return false;

  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\boutr[oa]\b/.test(q)) return true;
  if (/\btem outro\b/.test(q)) return true;
  if (/\btem outra\b/.test(q)) return true;
  if (/\b(compara|compare)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\b(se eu )?gastar menos\b/.test(q)) return true;
  if (/\bespero promocao\b/.test(q)) return true;
  if (/\b(espero|aguardo)\s+(promocao|promo|black|sale)\b/.test(q)) return true;
  if (/\bqual ficou em segundo\b/.test(q)) return true;
  if (
    hasAffirmativeCommercialSearchVerb(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)
  ) {
    if (shouldSuppressCommercialTailForAnchoredReference(q)) return false;
    return true;
  }

  return false;
}

function hasCollectiveSocialValidationSemanticCore(q) {
  if (!q || q.length > 80) return false;

  const collectiveSubject =
    /\b(o pessoal|o povo|as pessoas|a galera|galera|pessoal|povo|a turma|turma|a maioria|muita gente|bastante gente|geral)\b/.test(q);

  const collectiveExperienceVerb =
    /\b(usa|usam|utiliza|utilizam|compra|compram|curte|curtem|gosta|gostam|recomenda|recomendam|aprova|aprovam|aceita|aceitam|agrad[ae]|reclama|reclamam|indica|indicam|elogia|elogiam|passa|passam|mete|fala|falam|aprovo|aprovei|aprovou|gostou|curtiu|reclamou|se arrepende|se arrependeu|se arrependem|arrepende|arrependeu|arrepender|usando|comprando)\b/.test(
      q
    );

  const collectiveAdoptionOrApproval = collectiveSubject && collectiveExperienceVerb;

  const muitaGenteCollective =
    /^muita gente\b/.test(q) &&
    /\b(usa|usam|utiliza|utilizam|compra|compram|usando|se arrepende|se arrependem|reclama|reclamam|aprova|aprovam|gosta|gostam|curte|curtem)\b/.test(
      q
    );

  const collectiveRegret =
    (collectiveSubject || /^muita gente\b/.test(q)) &&
    /\b(se arrepende|se arrependem|arrepender|arrepende|arrependem|arrependeu)\b/.test(q);

  const quemCollectiveExperience =
    /\bquem (comprou|compra|tem|usa|pegou|teve)\b/.test(q) &&
    /\b(gosta|gostou|gostam|recomenda|recomendou|reclama|se arrepende|se arrependeu|curte|curtiu|aprova|aprovou|passa raiva|arrepende|arrependeu)\b/.test(
      q
    );

  const passiveCollectiveAdoption =
    /\b(e|eh) (usad[oa]|popular|bem recomendad[oa]|bem aceit[oa]|bem vist[oa]|uma escolha popular|escolha popular|aceit[oa] no mercado|bem avaliad[oa])\b/.test(q) ||
    /\b(e|eh) usad[oa] por (muita gente|bastante gente|muito gente)\b/.test(q) ||
    /\bvende bastante\b/.test(q) ||
    /\btem (muita gente|bastante gente|muito gente) usando\b/.test(q);

  const impersonalCollectiveTalk =
    /\b(indicam bastante|falam para comprar|falam q e bom|falam bem|falam mal|mete pau)\b/.test(q) ||
    /^falam (para comprar|q e bom|bem|mal)\b/.test(q) ||
    (/\b(indicam|recomendam)\b/.test(q) && q.split(/\s+/).length <= 5);

  const reputationSignals =
    /\b(tem|tem uma) (boa )?(reputacao|fama|avaliacao boa)\b/.test(q) ||
    /\b(bem recomendado|boa reputacao|boa fama|bem avaliado|escolha popular)\b/.test(q) ||
    (/\b(e|eh) popular\b/.test(q) && q.split(/\s+/).length <= 5) ||
    /\b(e|eh) aceito pelos usuarios\b/.test(q);

  const ownerCollectiveHabit =
    /\b(donos?|dono)\b.*\bcostuma (gostar|recomendar|aprovar|elogiar)\b/.test(q) ||
    /^dono costuma\b/.test(q);

  const geralCollectiveUse =
    /\bgeral\b.*\b(usa|usam|recomenda|recomendam|curte|curtem|gosta|gostam|aprova|aprovam)\b/.test(q) ||
    /^geral (usa|recomenda|curte|aprova)\b/.test(q);

  const collectiveComplaint =
    /\b(da|dá) problema (pra|para) (muita gente|o pessoal|bastante gente)\b/.test(q) ||
    /\btem gente (q |que )?reclama\b/.test(q) ||
    /\bquem usa passa raiva\b/.test(q) ||
    (collectiveSubject && /\b(reclama|fala mal|mete pau|passa raiva)\b/.test(q)) ||
    (q.split(/\s+/).length <= 5 && /^da dor de cabeca\b/.test(q));

  const impersonalCollectiveHabit =
    /^costuma (recomendar|agradar|dar problema|ser aceito|ser aprovado|ser bem visto|ser popular|ser bem recomendado|ser recomendado|ser elogiado)\b/.test(
      q
    ) ||
    /^tem (mta|muita) reclamacao\b/.test(q) ||
    /^tem problema (recorrente|comum)\b/.test(q);

  return (
    collectiveAdoptionOrApproval ||
    muitaGenteCollective ||
    collectiveRegret ||
    quemCollectiveExperience ||
    passiveCollectiveAdoption ||
    impersonalCollectiveTalk ||
    reputationSignals ||
    ownerCollectiveHabit ||
    geralCollectiveUse ||
    collectiveComplaint ||
    impersonalCollectiveHabit
  );
}

function detectsSocialValidationSignal(q) {
  if (!q || hasSocialValidationCommercialTail(q)) return false;
  if (hasPersonalAntiRegretDominantFrame(q)) return false;
  // PATCH 7.9X-F.2 — composto: cauda SV após "mas" vence famílias do prefixo
  if (hasSocialValidationDominantMasTail(q)) return true;
  // PATCH 8.1B.5 — validação social por proxy (antes de CC/AR)
  if (/^o que (voce|vc) faria\??$/.test(q)) return true;
  if (/^a maioria escolhe qual\??$/.test(q)) return true;
  if (/^(e|eh) uma escolha segura\??$/.test(q)) return true;
  if (/\bo pessoal costuma gostar\b/.test(q)) return true;
  // Famílias conversacionais fechadas e delegação pessoal têm precedência explícita.
  if (detectsDecisionConfirmationSignal(q)) return false;
  if (detectsAntiRegretSignal(q)) return false;
  if (detectsConfidenceChallengeSignal(q)) return false;
  if (detectsSoftDisagreementSignal(q)) return false;
  if (detectsConstraintChangeSignal(q)) return false;
  if (detectsSecondBestDiscoverySignal(q)) return false;
  if (detectsAlternativeExplorationSignal(q)) return false;

  // DELEGATION — desafio pessoal de compra (CC) ≠ validação social por proxy
  if (
    /\b(voce|vc)\s+(compraria|manteria|trocaria|escolheria|recomendaria)\b/.test(q) &&
    !/\b(para um amigo|pro amigo|pra um amigo)\b/.test(q)
  ) {
    return false;
  }
  if (/\bo que (voce|vc) (compraria|acharia)\b/.test(q)) return false;
  if (/\bqual (seria )?(a )?sua (escolha|decisao|recomendacao)\b/.test(q)) return false;
  if (/\be se fosse (voce|vc)\b/.test(q)) return false;
  if (/\bno seu lugar\b/.test(q)) return false;

  // F1 — Aprovação / gosto coletivo (coloquial com ou sem artigo)
  if (/^(a )?(galera|povo|pessoal|turma)\s+(gosta|gostam|curte|curtem|aprova|aprovam|recomenda|recomendam)$/.test(q)) {
    return true;
  }
  if (/^(o pessoal|as pessoas|a galera|o povo)\s+(gosta|gostam|curte|curtem|aprova|aprovam)$/.test(q)) {
    return true;
  }

  // F2 — Volume de compra / escolha comum no mercado
  if (/^a maioria compra$/.test(q)) return true;
  if (/^muita gente compra (esse|isso|ele|ela)$/.test(q)) return true;
  if (/^(a maioria|muita gente|bastante gente|muito gente)\s+(compra|compram|escolhe|escolhem)(\s+(esse|isso|ele|ela))?$/.test(q)) {
    return true;
  }

  // F3 — Reputação / fama / avaliação percebida (referente deíctico à escolha atual)
  if (/^(ele|ela|esse|essa)\s+(e|eh)\s+bem (falado|falada|avaliado|avaliada|recomendado|recomendada|aceito|aceita)$/.test(q)) {
    return true;
  }
  if (/^tem boa fama$/.test(q)) return true;
  if (/^(e|eh) bem avaliado$/.test(q)) return true;
  if (/^tem aprovacao boa$/.test(q)) return true;

  // F4 — Experiência coletiva de compradores ("quem compra se arrepende?" = social, não ANTI_REGRET)
  if (/^quem (compra|comprou|tem|usa|pegou) (gosta|gostou|recomenda|recomendou|se arrepende|se arrependeu|curte|curtiu|aprova|aprovou|arrepende|arrependeu)$/.test(q)) {
    return true;
  }

  // F5 — Popularidade / aceitação / recomendação coletiva
  if (/^o povo recomenda$/.test(q)) return true;
  if (/^(e|eh) popular(\s+msm)?$/.test(q)) return true;
  if (/^(e|eh) uma escolha comum$/.test(q)) return true;
  if (/^(e|eh) bem aceito$/.test(q)) return true;
  if (/^(e|eh) (bem recomendado|escolha popular|aceito no mercado)$/.test(q)) return true;

  // F6 — Concordância social coletiva (≠ CONFIDENCE_CHALLENGE "tem certeza?")
  if (/^(as pessoas|o pessoal|a galera)\s+(geralmente\s+)?(concordam|concorda|aprovam|aceitam|aceita)(\s+com)?(\s+(essa escolha|essa recomendacao|essa decisao|isso))?$/.test(q)) {
    return true;
  }

  // F7 — Família generalizada: prova social sem vocabulário fixo
  if (hasCollectiveSocialValidationSemanticCore(q)) return true;
  if (
    /\b(o pessoal|as pessoas|a galera|galera|o povo|povo|pessoal|a turma|turma|a maioria|muita gente|bastante gente|geral)\b/.test(q) &&
    /\b(gosta|gostam|curte|curtem|compra|compram|recomenda|recomendam|aprova|aprovam|usa|usam|reclama|reclamam|indica|indicam|fala|falam|mete)\b/.test(q) &&
    q.length < 80
  ) {
    return true;
  }
  if (/\bquem (compra|comprou)\b/.test(q) && /\b(gosta|gostou|recomenda|recomendou|se arrepende|curte|curtiu|arrepende)\b/.test(q)) {
    return true;
  }
  if (
    /\b(bem falado|boa fama|bem avaliado|bem aceito|escolha comum|muito popular|bastante popular|boa reputacao)\b/.test(q) &&
    q.length < 60
  ) {
    return true;
  }

  // PATCH 7.9X-F — natural social validation without exact phrase hardcoding
  if (detectsNaturalSocialValidationSignal(q)) return true;

  return false;
}

function hasNaturalSocialValidationBlock(q) {
  if (!q) return false;

  if (hasPersonalAntiRegretDominantFrame(q)) return true;

  if (/\b(voce|vc)\s+(tem certeza|mantem|manteria|compraria|sustenta|crava|garante|bancaria)\b/.test(q)) {
    return true;
  }
  if (/\btem certeza\b/.test(q) && !/\b(galera|povo|pessoal|pessoas|maioria|geral)\b/.test(q)) {
    return true;
  }
  if (/\b(vou nele|vou nesse|fechou|vou ficar com|entao e esse|entao vou nele)\b/.test(q)) {
    return true;
  }
  if (/\b(plano b|segundo colocado|ficou em segundo|backup|reserva|tem outro|outras opcoes|explorar outras|ver alternativas)\b/.test(q)) {
    return true;
  }
  if (/\b(quero gastar|gastar menos|prioridade|orcamento|importa mais|vou jogar mais)\b/.test(q)) {
    return true;
  }
  if (/\b(nao me convenceu|nao concordo|nao gostei muito|meio fraco|achei fraco|nao parece tao bom)\b/.test(q)) {
    return true;
  }
  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\b(compara|compare|comparando)\b/.test(q)) return true;
  if (/\bqual (seria )?(a )?sua (escolha|decisao|recomendacao)\b/.test(q)) return true;
  if (/\bno seu lugar\b/.test(q)) return true;

  return false;
}

/** PATCH 7.9X-F.2 — núcleo semântico SV reutilizável (cauda "mas" e detector natural). */
function detectsNaturalSocialValidationCore(q) {
  if (!q) return false;

  if (hasCollectiveSocialValidationSemanticCore(q)) return true;

  const collectiveRecommend =
    /\b(a galera|o pessoal|as pessoas|o povo|geral|muita gente|bastante gente)\b.*\b(recomenda|recomendam|indica|indicam|costuma recomendar)\b/.test(q) ||
    /\b(recomenda|recomendam|indica|indicam)\b.*\b(galera|pessoal|povo|geral|gente)\b/.test(q) ||
    /\bescolha bem indicada\b/.test(q) ||
    /\bmuita gente indica\b/.test(q);

  const publicReputation =
    /\b(e|eh) bem visto\b/.test(q) ||
    /\bbem visto\b/.test(q) ||
    /\bboa reputacao\b/.test(q) ||
    /\b(tem|tem uma) boa fama\b/.test(q) ||
    /\b(falam|fala) bem\b/.test(q) ||
    /\bo povo fala bem\b/.test(q) ||
    /\bfama boa\b/.test(q) ||
    /\bconhecido por ser confiavel\b/.test(q);

  const userExperience =
    /\bquem (comprou|compra|tem|usa)\b.*\b(gosta|gostou|gostam|recomenda|recomendou|reclama|se arrepende|curte|curtiu|arrepende)\b/.test(q) ||
    /\b(donos|usuarios|quem tem)\b.*\b(gostam|recomendam|costumam gostar|costuma gostar)\b/.test(q) ||
    /\bquem comprou se arrepende\b/.test(q) ||
    /\bquem tem costuma gostar\b/.test(q) ||
    /\bo pessoal que usa reclama\b/.test(q) ||
    /\bquem usa gosta\b/.test(q) ||
    /\bdonos costumam (gostar|elogiar)\b/.test(q);

  const socialComplaints =
    /\bcostuma dar problema\b/.test(q) ||
    /\b(tem|tem muita) reclamacao\b/.test(q) ||
    /\btem review (ruim|negativ\w*|mau|pessimo)\b/.test(q) ||
    /\breview (ruim|negativ\w*|mau|pessimo)\b/.test(q) ||
    /\btem (avaliacao|avaliacoes) ruim\b/.test(q) ||
    /\breclamam muito\b/.test(q) ||
    /\bdor de cabeca para (muita gente|muito gente|o pessoal)\b/.test(q) ||
    /\bproblema famoso\b/.test(q) ||
    /\b(historico|historia) ruim\b/.test(q) ||
    /\bo pessoal reclama muito\b/.test(q);

  const consensus =
    /\ba maioria aprova\b/.test(q) ||
    /\bno geral (e|eh) aprovado\b/.test(q) ||
    /\bconsenso (e|eh) bom\b/.test(q) ||
    /\bgeral gosta\b/.test(q) ||
    /\b(e|eh) bem aceito\b/.test(q) ||
    /\bbem aceito\b/.test(q) ||
    /\bcostuma agradar\b/.test(q) ||
    /\bas pessoas aprovam\b/.test(q) ||
    /\bas pessoas aceitam\b/.test(q);

  const practicalValidation =
    /\bna pratica\b.*\b(gosta|aprova|falam bem|recomenda|aprovado)\b/.test(q) ||
    /\bfora da ficha tecnica\b/.test(q) ||
    /\bno uso real\b.*\b(falam bem|aprova|gosta)\b/.test(q) ||
    /\bquem usa no dia a dia\b.*\baprova\b/.test(q) ||
    /\bexperiencia real (e|eh) boa\b/.test(q) ||
    /\b(e|eh) confiavel na pratica\b/.test(q) ||
    /\bna pratica o pessoal gosta\b/.test(q) ||
    /\b(e|eh) uma escolha segura\b/.test(q) ||
    /\bcostuma agradar\b/.test(q) ||
    (/\brecomendaria\b/.test(q) && /\b(para um amigo|pro amigo|pra um amigo)\b/.test(q)) ||
    (/\bo que voce faria\b/.test(q) && q.split(/\s+/).length <= 5);

  // PATCH 7.9Y.1 — validação social coletiva (arrependimento/reclamação ≠ medo pessoal)
  const collectiveRegretOrComplaint =
    /\b(o pessoal|a galera|o povo|as pessoas|pessoal)\b.*\b(costuma|costumam)\b.*\b(se arrepende|arrepender|reclama|reclamar)\b/.test(
      q
    ) ||
    /\b(o pessoal|a galera|o povo)\b.*\b(reclama|reclama muito|se arrepende|costuma se arrepender)\b/.test(q) ||
    /\bsera que muita gente se arrepende\b/.test(q) ||
    /\bquem comprou gostou ou se arrependeu\b/.test(q) ||
    /\bo povo fala bem ou da problema\b/.test(q) ||
    /\bquem tem\b.*\b(dor de cabeca|problema|passa)\b/.test(q) ||
    /\bquem usa no dia a dia aprova\b/.test(q) ||
    /\bmuita gente reclama\b/.test(q) ||
    /\btem reclamacao recorrente\b/.test(q);

  const shortProductReputation =
    /\bpresta\b/.test(q) &&
    q.split(/\s+/).length <= 3 &&
    !/\b(voce|vc)\s+(compraria|acha|recomenda|sustenta)\b/.test(q);

  return (
    collectiveRecommend ||
    publicReputation ||
    userExperience ||
    socialComplaints ||
    consensus ||
    practicalValidation ||
    collectiveRegretOrComplaint ||
    shortProductReputation
  );
}

/** PATCH 7.9X-F.2 — prefixo fraco + "mas" + cauda SV forte → intenção dominante é validação social. */
function hasSocialValidationDominantMasTail(q) {
  if (!q || !/\bmas\b/.test(q)) return false;
  if (hasPersonalAntiRegretDominantFrame(q)) return false;

  const tail = q.split(/\bmas\b/).pop()?.trim();
  if (!tail || tail.length < 6) return false;
  if (hasNaturalSocialValidationBlock(tail)) return false;
  if (detectsAntiRegretSignal(tail)) return false;
  if (detectsConfidenceChallengeSignal(tail)) return false;
  if (detectsSecondBestDiscoverySignal(tail)) return false;
  if (detectsAlternativeExplorationSignal(tail)) return false;
  if (detectsConstraintChangeSignal(tail)) return false;
  if (/\b(nao me convenceu|nao concordo|nao curti|pe atras|nao bateu comigo|nao sei se e isso)\b/.test(tail)) {
    return false;
  }

  return detectsNaturalSocialValidationCore(tail);
}

function detectsNaturalSocialValidationSignal(q) {
  if (!q || hasNaturalSocialValidationBlock(q)) return false;
  if (detectsDecisionConfirmationSignal(q)) return false;
  if (detectsAntiRegretSignal(q)) return false;
  if (detectsConfidenceChallengeSignal(q)) return false;
  if (detectsSoftDisagreementSignal(q)) return false;

  return detectsNaturalSocialValidationCore(q);
}

/** PATCH 7.8N — exported for Routing layer (read-only family detector). */
export function isSocialValidationFamilyQuery(message = "") {
  const dominant = getCrossFamilyDominantFamily(message);
  if (dominant) return dominant === "SOCIAL_VALIDATION";
  return detectsSocialValidationSignal(normalize(message));
}

// PATCH 7.9B — SECOND_BEST_DISCOVERY semantic family (intenção: plano B / runner-up sem trocar winner)

/** PATCH 8.1B.5 — contingência sem vocabulário de runner-up = exploração (AE), não SBD. */
function hasAlternativeExplorationContingencyCue(q) {
  if (!q) return false;
  return (
    (/\be se eu nao pegar (esse|essa|ele|ela)\b/.test(q) ||
      (/\b(se eu )?nao pegar (esse|essa|ele|ela)\b/.test(q) && q.split(/\s+/).length <= 6)) &&
    !/\b(quem|qual|plano b|vem depois|veio depois|sobra|depois|logo atras|segundo|backup|reserva|indicaria|recomendaria)\b/.test(
      q
    )
  );
}

/** PATCH 8.1B.3 — runner-up / plano B cues (intenção, não frase isolada no handler). */
function hasSecondBestDiscoveryRunnerUpCue(q) {
  if (!q) return false;

  if (/^(backup|reserva|plano b|segunda|segundo)$/.test(q)) return true;
  if (/^(backup|reserva|plano b)(\s+(ai|ne|mano|kk|slk))*$/.test(q)) return true;

  return (
    /\b(runner up|runner-up)\b/.test(q) ||
    /\bplano\s*b\b/.test(q) ||
    /\b(ficou|fica|fico)\s+(em\s+)?segundo\b/.test(q) ||
    /\b(segundo|segunda)\s+(opcao|lugar|colocado|melhor|escolha|posicao)\b/.test(q) ||
    /\bsegundo\s+(lugar|colocado|melhor)\b/.test(q) ||
    /\bquase\s+(ganhou|venceu|levou|chegou|ficou perto)\b/.test(q) ||
    /\b(quem|qual)\b.*\b(atras|logo atras|logo depois|veio depois|vem depois)\b/.test(q) ||
    (/\b(ficou|fica|veio|vem)\s+(atras|depois)\b/.test(q) && /\b(quem|qual)\b/.test(q)) ||
    (/\blogo (atras|depois)\b/.test(q) && /\b(quem|qual|opcao|alternativa)\b/.test(q)) ||
    /\b(proxima|proximo)\s+melhor\s+opcao\b/.test(q) ||
    /\boutr[oa]\s+melhor\s+(opcao|escolha)\b/.test(q) ||
    /\boutr[oa]\s+(forte|melhor)\b/.test(q) ||
    /\balternativa\s+imediata\b/.test(q) ||
    /\b(opcao|alternativa)\s+logo (atras|depois)\b/.test(q) ||
    /\be o segundo\b/.test(q) ||
    (/\b(se eu|caso eu|se nao|se eu n|e se eu)\s*(nao |n )?(pegar|for|ficar com|desistir)\b/.test(q) &&
      /\b(esse|essa|ele|ela|desse|dessa|nesse|nessa)\b/.test(q) &&
      /\b(quem|qual|plano b|vem depois|veio depois|sobra|depois|logo atras|logo depois|segundo|backup|reserva)\b/.test(
        q
      )) ||
    (/\b(backup|reserva)\b/.test(q) && q.split(/\s+/).length <= 4)
  );
}

/** PATCH 8.1B.3 — exploração aberta de alternativas (AE), não runner-up. */
function hasOpenAlternativeExplorationCue(q) {
  if (!q) return false;

  return (
    /\b(quero|preciso|gostaria)\s+(explorar|ver|olhar|abrir)\s+(outras|mais|outros)?\s*(opcoes|alternativas|possibilidades|modelos|concorrentes)\b/.test(q) ||
    /\b(mostra|mostre)\s+(outras|outros)\s+(opcoes|alternativas|modelos|concorrentes)\b/.test(q) ||
    /\babre mais opcoes\b/.test(q) ||
    /\babre o leque\b/.test(q) ||
    /\bquero ver alternativas\b/.test(q) ||
    /\bquero explorar opcoes\b/.test(q) ||
    /^quero explorar$/.test(q) ||
    /\btem outros modelos\b/.test(q) ||
    /\bme mostra concorrentes\b/.test(q) ||
    /\bmostra concorrentes\b/.test(q) ||
    /\bver outras opcoes\b/.test(q) ||
    /\bo que mais existe\b/.test(q) ||
    /\bme da mais ideias\b/.test(q) ||
    /\bquero outras possibilidades\b/.test(q) ||
    /\bquero comparar mais opcoes\b/.test(q) ||
    /\bquero ver outros caminhos\b/.test(q) ||
    /\bexiste algo parecido\b/.test(q) ||
    /\bquero ver uma lista maior\b/.test(q) ||
    /\bquero outra categoria\b/.test(q) ||
    /\b(procura|procuro|busco|buscar)\s+outro\s+produto\b/.test(q) ||
    /\bmostra outras opcoes\b/.test(q) ||
    /\btem algo diferente\b/.test(q) ||
    /^outra opcao$/.test(q) ||
    /^outro opcao$/.test(q) ||
    hasAlternativeExplorationContingencyCue(q) ||
    (/\bquero gastar menos\b/.test(q) && /\b(alternativas|opcoes)\s+abertas\b/.test(q))
  );
}

function hasSecondBestDiscoveryCommercialTail(q) {
  if (!q) return false;

  if (hasSecondBestDiscoveryRunnerUpCue(q) && !hasOpenAlternativeExplorationCue(q)) {
    return false;
  }

  if (hasCommercialComparisonDisjunction(q)) return true;
  if (hasOpenAlternativeExplorationCue(q)) return true;
  if (/\boutr[oa]\b/.test(q) && !hasSecondBestDiscoveryRunnerUpCue(q)) return true;
  if (/\bprocuro outro\b/.test(q)) return true;
  if (/^tem outro$/.test(q)) return true;
  if (/^tem outra$/.test(q) && !hasSecondBestDiscoveryRunnerUpCue(q)) return true;
  if (/\b(compara|compare|comparando)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\b(se eu )?gastar menos\b/.test(q) && !/\b(segundo|plano b|backup|reserva)\b/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\bmais barato\b/.test(q) && !/\b(plano b|segundo|backup)\b/.test(q)) return true;
  if (/\bpara (jogos|jogar|trabalho|estudar|fotos|foto|camera|bateria)\b/.test(q)) return true;
  if (
    /\b(quero|preciso|busco|buscar|procurar|procurando|me acha|me indica|me recomenda)\b/.test(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung|monitor|mouse|teclado|cadeira|pc)\b/.test(q) &&
    !hasSecondBestDiscoveryRunnerUpCue(q)
  ) {
    return true;
  }

  return false;
}

function detectsSecondBestDiscoverySignal(q) {
  const compound = detectsConstraintAlternativeCompoundDominant(q);
  if (compound === "SECOND_BEST_DISCOVERY") return true;
  if (!q || hasSecondBestDiscoveryCommercialTail(q)) return false;
  if (detectsDecisionConfirmationSignal(q)) return false;

  // ALTERNATIVE_EXPLORATION genérico — "tem outro?" ≠ runner-up / plano B
  if (/^tem outro$/.test(q)) return false;
  if (/^tem outra$/.test(q)) return false;
  if (/^tem algo melhor$/.test(q)) return false;

  // F1 — Frases auditáveis (runner-up / plano B / segunda opção)
  if (/^qual ficou em segundo$/.test(q)) return true;
  if (/^quem ficou em segundo$/.test(q)) return true;
  if (/^segunda opcao$/.test(q)) return true;
  if (/^qual e a segunda opcao$/.test(q)) return true;
  if (/^qual seria o plano b$/.test(q)) return true;
  if (/^tem plano b$/.test(q)) return true;
  if (/^quem quase ganhou$/.test(q)) return true;
  if (/^qual quase ganhou$/.test(q)) return true;
  if (/^e o segundo colocado$/.test(q)) return true;
  if (/^me mostra o segundo melhor$/.test(q)) return true;
  if (/^se esse nao der, qual seria$/.test(q)) return true;
  if (/^qual seria a alternativa reserva$/.test(q)) return true;

  // F2 — Runner-up / plano B generalizado (intenção antes de vocabulário)
  if (/\b(runner up|runner-up)\b/.test(q)) return true;
  if (/\b(ficou|fico|fica)\s+em\s+(segundo|\d+)\b/.test(q)) return true;
  if (/\bplano\s+b\b/.test(q)) return true;
  if (/\bquase\s+(ganhou|venceu|levou|chegou|ficou perto)\b/.test(q)) return true;
  if (/\b(segundo|segunda)\s+(opcao|lugar|colocado|melhor|escolha)\b/.test(q)) return true;
  if (/\bsegundo\s+melhor\b/.test(q)) return true;
  if (/\bme\s+mostra\s+(o\s+)?segundo\b/.test(q)) return true;
  if (/\balternativa\s+reserva\b/.test(q) && !/\bpara\b/.test(q)) return true;
  if (/\bse (esse|essa|ele|ela) nao der\b/.test(q) && /\bqual seria\b/.test(q)) return true;
  if (/\bse nao (ficar|der) (com )?(esse|essa|ele|ela)\b/.test(q)) return true;
  if (/\bdepois\s+(dele|desse|deles|dela|dessa)\b/.test(q)) return true;
  if (
    /\b(o\s+proximo|a\s+proxima|opcao\s+seguinte|proxima\s+opcao)\b/.test(q) &&
    !/\b(passo|etapa|fase)\b/.test(q)
  ) {
    return true;
  }

  // PATCH 7.9X-B — natural runner-up / plano B without "qual ficou em segundo?" framing
  if (detectsNaturalSecondBestDiscoverySignal(q)) return true;

  return false;
}

function detectsNaturalSecondBestDiscoverySignal(q) {
  if (!q) return false;

  // Generic parallel exploration — not runner-up / plano B
  if (/^tem outr[oa]$/.test(q)) return false;
  if (hasOpenAlternativeExplorationCue(q)) return false;
  if (/\b(quero|preciso|gostaria)\s+(explorar|olhar|abrir)\s+(outras )?(opcoes|alternativas|possibilidades)\b/.test(q)) {
    return false;
  }
  if (/\btem mais (possibilidades|alternativas|opcoes)\b/.test(q)) return false;
  if (/\b(da pra|posso) ver mais caminhos\b/.test(q)) return false;
  if (/\bnao quero decidir\b/.test(q) && /\bsem ver (outras )?(opcoes|alternativas)\b/.test(q)) {
    return false;
  }

  const shortRunnerUp =
    /^(backup|reserva|plano b|segunda|segundo)$/.test(q) ||
    /^(backup|reserva|plano b)(\s+(ai|ne|mano|kk|slk))*$/.test(q) ||
    /^e o segundo(\s+(mano|ne|ai|colocado|lugar))*$/.test(q);

  const runnerUpPosition =
    /^quem veio logo atras$/.test(q) ||
    /^quem ta logo atras dele$/.test(q) ||
    /^quem ficou atras$/.test(q) ||
    /^qual ficou atras$/.test(q) ||
    (/\b(quem|qual)\b/.test(q) && /\b(ficou|fica|veio|vem)\s+(atras|depois)\b/.test(q)) ||
    (/\blogo atras\b/.test(q) && /\b(quem|qual)\b/.test(q)) ||
    (/\blogo depois\b/.test(q) && /\b(quem|qual)\b/.test(q));

  const backupReserve =
    /^qual seria o backup$/.test(q) ||
    /^qual seria a reserva$/.test(q) ||
    /^qual seria o reserva imediato$/.test(q) ||
    /^qual seria minha segunda escolha$/.test(q) ||
    (/\bqual seria\b/.test(q) &&
      /\b(o|a|meu|minha|imediato)\b/.test(q) &&
      /\b(backup|reserva|segunda escolha)\b/.test(q));

  const contingency =
    /^e se o primeiro nao der certo$/.test(q) ||
    /\be se o primeiro nao der\b/.test(q) ||
    /^se eu nao pegar esse, qual sobra$/.test(q) ||
    (/\bse eu nao pegar (esse|essa|ele|ela)\b/.test(q) && /\b(qual sobra|quem vem|vem depois|plano b)\b/.test(q)) ||
    (/\be se eu nao pegar (esse|essa|ele|ela)\b/.test(q) &&
      /\b(quem|qual|plano b|vem depois|sobra|depois|logo atras|indicaria|recomendaria)\b/.test(q)) ||
    (/\bse eu nao (for|pegar|ficar com) (nesse|esse|essa|ele|ela)\b/.test(q) &&
      /\b(quem|qual|plano b|vem depois|depois)\b/.test(q)) ||
    (/\bcaso eu desist(a|ir) desse\b/.test(q) && /\b(quem|qual|vem depois|depois)\b/.test(q));

  const immediateAlternative =
    /\boutr[oa]\s+melhor\s+(opcao|escolha)\b/.test(q) ||
    /\b(proxima|proximo)\s+melhor\s+opcao\b/.test(q) ||
    /\balternativa\s+imediata\b/.test(q) ||
    /\b(opcao|alternativa)\s+logo (atras|depois)\b/.test(q) ||
    /\btem outr[oa]\s+(forte|melhor)\b/.test(q);

  const metaphor =
    /^quem fica como carta na manga$/.test(q) ||
    /\bcarta na manga\b/.test(q) ||
    /^quem seria o substituto natural$/.test(q) ||
    (/\bsubstituto natural\b/.test(q) && /\b(quem|qual)\b/.test(q)) ||
    (/\bsubstituto direto\b/.test(q) && /\b(qual|quem)\b/.test(q));

  const narrowMargin =
    (/\b(quem|qual)\b/.test(q) && /\b(perdeu|ficou)\s+por\s+pouco\b/.test(q)) ||
    (/\bse o primeiro sair\b/.test(q) && /\bqual fica\b/.test(q)) ||
    /\bquase\s+(ganhou|venceu|levou|chegou|ficou perto)\b/.test(q);

  const runnerUpReveal =
    hasSecondBestDiscoveryRunnerUpCue(q) &&
    !hasOpenAlternativeExplorationCue(q);

  return (
    shortRunnerUp ||
    runnerUpPosition ||
    backupReserve ||
    contingency ||
    immediateAlternative ||
    metaphor ||
    narrowMargin ||
    runnerUpReveal
  );
}

/** PATCH 7.9B — exported for Routing layer (read-only family detector). */
export function isSecondBestDiscoveryFamilyQuery(message = "") {
  const dominant = getCrossFamilyDominantFamily(message);
  if (dominant) return dominant === "SECOND_BEST_DISCOVERY";
  return detectsSecondBestDiscoverySignal(normalize(message));
}

// PATCH 7.9F — ALTERNATIVE_EXPLORATION semantic family (intenção: explorar outra opção sem trocar winner)
function hasAlternativeExplorationCommercialTail(q) {
  if (!q) return false;
  if (/\bquero comparar mais opcoes\b/.test(q)) return false;

  if (hasCommercialComparisonDisjunction(q)) return true;
  if (/\b(compara|compare|comparando)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\b(se eu )?gastar menos\b/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\bmais barato\b/.test(q)) return true;
  if (/\bpara (jogos|jogar|trabalho|estudar|fotos|foto|camera|bateria)\b/.test(q)) return true;
  if (/\b(quem ficou|ficou em segundo|plano b|quase ganhou|segundo colocado)\b/.test(q)) return true;
  if (/\b(backup|reserva|substituto direto|runner up|runner-up)\b/.test(q)) return true;
  if (/\bcomparando\b/.test(q)) return true;
  if (
    /\b(quero|preciso|busco|buscar|procurar|procurando|me acha|me indica|me recomenda)\b/.test(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung|monitor|mouse|teclado|cadeira|pc)\b/.test(q)
  ) {
    return true;
  }

  return false;
}

function detectsNaturalAlternativeExplorationSignal(q) {
  if (!q) return false;

  const openOptions =
    /^quero abrir um pouco as opcoes$/.test(q) ||
    /^quero abrir as opcoes$/.test(q) ||
    (/\babrir\b/.test(q) && /\b(opcoes|alternativas|possibilidades)\b/.test(q));

  const lineExploration =
    /\bo que mais existe\b/.test(q) &&
    /\b(nessa linha|nesse segmento|nesse recorte|nesse range|por aqui)\b/.test(q);

  const morePossibilities =
    /^tem mais possibilidades$/.test(q) ||
    /\btem mais (possibilidades|alternativas|opcoes)\b/.test(q);

  const lookAlternatives =
    /^quero olhar alternativas$/.test(q) ||
    /\bquero olhar (outras )?(alternativas|opcoes|possibilidades)\b/.test(q);

  const exploreOptions =
    /^quero explorar outras opcoes$/.test(q) ||
    /\bquero explorar (outras )?(opcoes|alternativas|possibilidades)\b/.test(q);

  const morePaths =
    /^da pra ver mais caminhos$/.test(q) ||
    /\b(da pra|posso|quero) ver mais caminhos\b/.test(q);

  const decideWithoutAlternatives =
    /\bnao quero decidir\b/.test(q) &&
    /\bsem ver (outras )?(opcoes|alternativas|possibilidades)\b/.test(q);

  const similarPossibilities =
    /\bme mostra possibilidades parecidas\b/.test(q) ||
    /\b(mostra|mostre) possibilidades parecidas\b/.test(q) ||
    (/\b(mostra|ver|olhar|explorar)\b/.test(q) &&
      /\b(opcoes|possibilidades|alternativas) parecidas\b/.test(q));

  const explorationReveal =
    /\b(quero|preciso|gostaria|da pra|posso)\b/.test(q) &&
    /\b(explorar|olhar|ver|abrir|ampliar)\b/.test(q) &&
    /\b(alternativas|opcoes|possibilidades|caminhos)\b/.test(q) &&
    !/\b(segundo|backup|reserva|plano b|mais barato|gastar|economizar|comparar|compara|versus|\bvs\b)\b/.test(q);

  const imperativeReveal =
    /\b(mostra|mostre)\b/.test(q) &&
    /\b(outra|outro|alternativas|opcoes)\b/.test(q) &&
    !/\bsegundo\b/.test(q);

  const politeAlternativeRequest =
    /\b(poderia|pode|gostaria)\b.*\b(mostrar|mostra|mostre)\b.*\boutr[oa]\b/.test(q) ||
    /\bmostrar outra opcao\b.*\bpor favor\b/.test(q);

  const otherOptionsExist =
    /\btem outras opcoes\b/.test(q) ||
    /\btem (mais )?outras (opcoes|alternativas)\b/.test(q) ||
    (/\btem concorrente\b/.test(q) && q.split(/\s+/).length <= 3);

  const hypotheticalWithoutCurrent = hasAlternativeExplorationContingencyCue(q);

  return (
    openOptions ||
    lineExploration ||
    morePossibilities ||
    lookAlternatives ||
    exploreOptions ||
    morePaths ||
    decideWithoutAlternatives ||
    similarPossibilities ||
    explorationReveal ||
    imperativeReveal ||
    politeAlternativeRequest ||
    otherOptionsExist ||
    hypotheticalWithoutCurrent
  );
}

function detectsAlternativeExplorationSignal(q) {
  const compound = detectsConstraintAlternativeCompoundDominant(q);
  if (compound === "ALTERNATIVE_EXPLORATION") return true;
  if (!q || hasAlternativeExplorationCommercialTail(q)) return false;
  if (hasOpenAlternativeExplorationCue(q)) return true;
  if (detectsSecondBestDiscoverySignal(q)) return false;
  if (detectsDecisionConfirmationSignal(q)) return false;
  if (detectsSoftDisagreementSignal(q)) return false;

  // F1 — Frases auditáveis (explorar alternativa paralela)
  if (/^outra opcao$/.test(q)) return true;
  if (/^outro opcao$/.test(q)) return true;
  if (/^tem outro$/.test(q)) return true;
  if (/^tem outra opcao$/.test(q)) return true;
  if (/^tem alternativa$/.test(q)) return true;
  if (/^me mostra outro$/.test(q)) return true;
  if (/^me mostra outra opcao$/.test(q)) return true;
  if (/^existe outro caminho$/.test(q)) return true;
  if (/^tem algum outro bom$/.test(q)) return true;
  if (/^tem algum parecido$/.test(q)) return true;
  if (/^tem opcao diferente$/.test(q)) return true;
  if (/^quero ver outro$/.test(q)) return true;
  if (/^me da outra alternativa$/.test(q)) return true;
  if (/^tem algo alem desse$/.test(q)) return true;
  if (/^quais outras opcoes$/.test(q)) return true;
  if (/^da pra ver outro$/.test(q)) return true;

  // F2 — Exploração generalizada (intenção antes de vocabulário)
  if (/^tem outr[oa]$/.test(q)) return true;
  if (/\btem\s+(outro|outra|alternativa)\b/.test(q) && q.split(" ").length <= 4 && !hasSecondBestDiscoveryRunnerUpCue(q)) {
    return true;
  }
  if (/\bme\s+mostra\s+(outro|outra)\b/.test(q) && !/\bsegundo\b/.test(q)) return true;
  if (/\bme\s+mostra\s+outra\s+opcao\b/.test(q)) return true;
  if (/\bquero\s+ver\s+outr[oa]\b/.test(q)) return true;
  if (/\b(outro|outra)\s+caminho\b/.test(q)) return true;
  if (/\btem\s+algo\s+alem\b/.test(q)) return true;
  if (/\bquais\s+outras\s+opcoes\b/.test(q)) return true;
  if (/\bda\s+pra\s+ver\s+outr[oa]\b/.test(q)) return true;
  if (/\bme\s+da\s+outra\s+alternativa\b/.test(q)) return true;
  if (/\btem\s+opcao\s+diferente\b/.test(q)) return true;
  if (/\btem\s+algum\s+(outro|parecido)\b/.test(q)) return true;
  if (/\bexiste\s+outro\s+caminho\b/.test(q)) return true;
  if (/\btem\s+algum\s+outro\s+bom\b/.test(q)) return true;
  if (
    /\bme\s+mostra\s+(outras|outros)\s*(opcoes|alternativas|modelos|produtos)?\b/.test(q) &&
    !/\bsegundo\b/.test(q)
  ) {
    return true;
  }
  if (/\b(mostra|mostre)\s+(outra|outro)\b/.test(q) && !/\bsegundo\b/.test(q)) return true;
  if (/\b(mostra|mostre)\s+(alternativas|opcoes)\b/.test(q) && !/\bsegundo\b/.test(q)) return true;
  if (/\btem outras opcoes\b/.test(q)) return true;
  if (/\btem concorrente\b/.test(q) && q.split(/\s+/).length <= 3) return true;
  if (/\be se eu nao pegar (esse|essa|ele|ela)\b/.test(q) && !hasSecondBestDiscoveryRunnerUpCue(q)) return true;
  if (hasAlternativeExplorationContingencyCue(q)) return true;
  if (/\btem\s+(algo|alguma\s+coisa)\s+(alem|além)\s+(desse|dessa|dele|deles|do\s+primeiro)\b/.test(q)) {
    return true;
  }

  // PATCH 7.9X-A — natural alternative exploration without "tem outro?" framing
  if (detectsNaturalAlternativeExplorationSignal(q)) return true;
  if (detectsAlternativeExplorationCore(q)) return true;
  if (
    /\b(se eu nao pegar|nao pegar) (esse|essa|ele|ela)\b/.test(q) &&
    /\b(indicaria|recomendaria|escolheria|sugeria)\b/.test(q)
  ) {
    return true;
  }

  return false;
}

/** PATCH 7.9F — exported for Routing layer (read-only family detector). */
export function isAlternativeExplorationFamilyQuery(message = "") {
  const dominant = getCrossFamilyDominantFamily(message);
  if (dominant) return dominant === "ALTERNATIVE_EXPLORATION";
  return detectsAlternativeExplorationSignal(normalize(message));
}

// PATCH 7.9Y.1 — núcleos sem commercial-tail block (colisão CC × AE/SBD)
function detectsConstraintBudgetSignal(q) {
  if (!q) return false;
  return (
    hasConstraintChangeDominantFrame(q) ||
    /\b(quero|preciso|agora quero|pensei melhor|e se eu quiser)\b.*\b(gastar|pagar|economizar)\b/.test(q) ||
    /\b(se eu )?(gastar|pagar)\s+menos\b/.test(q) ||
    /\b(ficou caro|ta puxado|pesou no bolso|mais barato|mais em conta|baixar o orcamento|economizar um pouco)\b/.test(q) ||
    /\b(se eu baixar|baixar) o orcamento\b/.test(q) ||
    /\be se eu quiser economizar\b/.test(q)
  );
}

function detectsAlternativeExplorationCore(q) {
  if (!q) return false;
  if (/^(explorar|ver) outras opcoes$/.test(q)) return true;
  if (/^(explorar|ver) (outras )?(alternativas|opcoes)$/.test(q)) return true;
  if (/^tem outr[oa]$/.test(q)) return true;
  if (/\btem outr[oa]\b/.test(q)) return true;
  if (/\btem (uma )?alternativa\b/.test(q)) return true;
  if (/\bficou caro\b/.test(q) && /\balternativa\b/.test(q)) return true;
  if (/\btem outr[oa] parecid[oa]\b/.test(q)) return true;
  if (/\btem outr[oa].*mais barato\b/.test(q)) return true;
  if (/\bmostra alternativas\b/.test(q)) return true;
  if (/\b(se eu nao pegar|nao pegar) esse\b/.test(q) && /\bqual\b/.test(q)) return true;
  if (/\bse eu nao pegar esse\b/.test(q) && /\b(indicaria|recomendaria|escolheria)\b/.test(q)) return true;
  if (/\bqual voce indicaria\b/.test(q)) return true;
  if (/\bme mostra outr[oa]\b/.test(q) && !/\bsegundo\b/.test(q)) return true;
  if (/\bquero ver outr[oa]\b/.test(q)) return true;
  if (detectsNaturalAlternativeExplorationSignal(q)) return true;
  return false;
}

function detectsSecondBestDiscoveryCore(q) {
  if (!q) return false;
  if (/^tem outr[oa]$/.test(q)) return false;
  if (hasSecondBestDiscoveryRunnerUpCue(q) && !hasOpenAlternativeExplorationCue(q)) return true;
  if (/\b(runner up|runner-up)\b/.test(q)) return true;
  if (/\b(ficou|fico|fica)\s+em\s+(segundo|\d+)\b/.test(q)) return true;
  if (/\bplano\s+b\b/.test(q)) return true;
  if (/\b(segundo|segunda)\s+(opcao|lugar|colocado|melhor|escolha)\b/.test(q)) return true;
  if (/\bsegunda\s+opcao\b/.test(q) && detectsConstraintBudgetSignal(q)) return true;
  if (/\bsegundo\s+melhor\b/.test(q)) return true;
  if (/\bproxima escolha\b/.test(q) && /\b(em conta|mais barato|barato)\b/.test(q)) return true;
  if (/\bplano b\b/.test(q) && /\b(barato|em conta|mais barato)\b/.test(q)) return true;
  if (/\bbackup\b/.test(q) && /\b(barato|em conta|mais barato)\b/.test(q)) return true;
  if (/\b(se eu baixar|baixar) o orcamento\b/.test(q) && /\b(quem|qual)\b/.test(q)) return true;
  if (detectsNaturalSecondBestDiscoverySignal(q)) return true;
  return false;
}

function detectsConstraintAlternativeCompoundDominant(q) {
  if (!q || !detectsConstraintBudgetSignal(q)) return null;
  if (detectsSecondBestDiscoveryCore(q)) return "SECOND_BEST_DISCOVERY";
  if (detectsAlternativeExplorationCore(q)) return "ALTERNATIVE_EXPLORATION";
  return null;
}

function hasWeakConversationalPrefix(prefix = "") {
  if (!prefix) return false;
  return (
    hasAcknowledgementOpeningPrefix(prefix) ||
    hasGreetingOpeningPrefix(prefix) ||
    /^(entendi|saquei|faz sentido|ate que|captei|entendo|gostei)\b/.test(prefix) ||
    hasWeakDecisionConfirmationPrefix(prefix) ||
    /\b(gostei dele|parece bom|parece ser)\b/.test(prefix) ||
    detectsNaturalSoftDisagreementCore(prefix)
  );
}

function hasExplicitNewCommercialSearchFrame(q) {
  if (!q) return false;
  if (/\b(nesse|nele|nessa|nela|desse|dessa|esse produto|esta recomendacao)\b/.test(q)) {
    return false;
  }
  if (/\b(sem preocupacao|sem medo|tranquilo|arrepender|errar|seguro|receio|cabreiro)\b/.test(q)) {
    return false;
  }
  return (
    /\b(quero|preciso|busco|procuro|procurar|procura|me recomenda|me indica)\b.*\b(comprar (um|uma|outro)|um produto|outro produto|notebook|celular|smartphone|uma tv|um monitor|uma opcao nova)\b/.test(
      q
    ) ||
    /\b(quero|preciso|busco|procuro)\b.*\b(monitor|notebook|tablet|cadeira|placa|video|gpu|ssd|mouse|teclado|fone|tv)\b/.test(q) ||
    /\b(muda para|muda o foco para|troca pra|vamos falar de outro produto|sai de .+ vamos para)\b/.test(q) ||
    /\b(esquece essa busca|zera tudo|recomeca|limpa tudo|comeca de novo|comecar do zero|deixa esse de lado)\b/.test(q) ||
    /\bprocura um\b/.test(q) ||
    /\bquero comparar\b/.test(q)
  );
}

function detectSpaceJoinedCompoundIntent(q) {
  if (!q) return null;

  const weakResistancePrefixes = [
    /^nao me convenceu\b/,
    /^nao gostei muito\b/,
    /^nao curti muito\b/,
    /^nao estou convencido\b/,
    /^nao bateu comigo\b/,
    /^nao me ganhou\b/,
    /^nao desceu bem\b/,
    /^nao me pegou muito\b/,
    /^to com pe atras\b/,
  ];

  for (const prefix of weakResistancePrefixes) {
    if (!prefix.test(q)) continue;
    const tail = q.replace(prefix, "").trim();
    if (detectsNaturalConfidenceChallengeCore(tail) || detectsNaturalConfidenceChallengeCore(q)) {
      return "CONFIDENCE_CHALLENGE";
    }
    if (detectsNaturalSocialValidationCore(tail) || detectsNaturalSocialValidationCore(q)) {
      return "SOCIAL_VALIDATION";
    }
    if (hasPersonalAntiRegretDominantFrame(tail) || hasPersonalAntiRegretDominantFrame(q)) {
      return "ANTI_REGRET";
    }
    if (detectsAlternativeExplorationCore(tail) || detectsAlternativeExplorationCore(q)) {
      return "ALTERNATIVE_EXPLORATION";
    }
  }

  return null;
}

function splitWeakPrefixDominantTail(q) {
  if (!q) return null;
  if (/\bmas\b/.test(q)) {
    const parts = q.split(/\bmas\b/);
    return {
      prefix: parts.slice(0, -1).join(" mas ").trim(),
      tail: parts[parts.length - 1]?.trim(),
    };
  }
  if (/,/.test(q)) {
    const parts = q.split(",");
    if (parts.length >= 2) {
      return {
        prefix: parts.slice(0, -1).join(",").trim(),
        tail: parts[parts.length - 1]?.trim(),
      };
    }
  }
  return null;
}

/** PATCH 8.1B.6 — prefixo fraco (ACK/CS/greeting/tone) + cauda dominante cross-family. */
function hasInformalToneOpeningPrefix(prefix = "") {
  if (!prefix) return false;
  return /^(slk|kkk|kk|vlw|pfv|pf|bora|partiu|aff|pdp|tmj|crl|pqp|carai)\b/.test(prefix);
}

function isWeakCrossFamilyOpeningPrefix(prefix = "") {
  return (
    hasWeakConversationalPrefix(prefix) ||
    hasGreetingOpeningPrefix(prefix) ||
    hasInformalToneOpeningPrefix(prefix)
  );
}

function getWeakPrefixCompoundTail(q) {
  if (!q) return null;

  const split = splitWeakPrefixDominantTail(q);
  if (split?.tail && split.tail.length >= 3 && isWeakCrossFamilyOpeningPrefix(split.prefix)) {
    return { prefix: split.prefix, tail: split.tail.replace(/^mas\s+/, "").trim() };
  }

  const words = q.split(/\s+/);
  if (words.length < 2) return null;
  for (let i = 1; i < words.length; i++) {
    const prefix = words.slice(0, i).join(" ");
    const tail = words.slice(i).join(" ");
    if (tail.length < 3) continue;
    if (isWeakCrossFamilyOpeningPrefix(prefix)) {
      return { prefix, tail };
    }
  }
  return null;
}

function resolveDominantTailFamily(tail = "") {
  if (!tail) return null;
  const t = tail.replace(/^mas\s+/, "").trim();
  if (t.length < 3) return null;

  const checks = [
    ["ANTI_REGRET", detectsAntiRegretSignal],
    ["CONFIDENCE_CHALLENGE", detectsConfidenceChallengeSignal],
    ["SOCIAL_VALIDATION", detectsSocialValidationSignal],
    ["COMPREHENSION_FAILURE", detectsComprehensionFailureSignal],
    ["SOFT_DISAGREEMENT", detectsSoftDisagreementSignal],
    ["CONSTRAINT_CHANGE", detectsConstraintChangeSignal],
    ["SECOND_BEST_DISCOVERY", detectsSecondBestDiscoverySignal],
    ["ALTERNATIVE_EXPLORATION", detectsAlternativeExplorationSignal],
    ["DECISION_CONFIRMATION", detectsDecisionConfirmationSignal],
  ];
  for (const [family, fn] of checks) {
    if (fn(t)) return family;
  }
  return null;
}

function detectWeakPrefixDominantFamilyIntent(q) {
  if (!q || hasExplicitNewCommercialSearchFrame(q)) return null;
  if (
    isAcknowledgementContinuityPhrase(q) ||
    isAcknowledgementLightConfirmEntaoPhrase(q) ||
    detectsPureAcknowledgementSignal(q)
  ) {
    return null;
  }
  if (detectsNaturalPositiveComprehensionSignal(q)) return null;
  const compound = getWeakPrefixCompoundTail(q);
  if (!compound) return null;
  return resolveDominantTailFamily(compound.tail);
}

/** PATCH 8.1B.5 — prefixo fraco + cauda de falha de compreensão (vírgula ou "mas"). */
function getComprehensionFailureTailCore(tail = "") {
  if (!tail) return false;
  const t = tail.replace(/^mas\s+/, "").trim();
  if (!t || detectsNaturalPositiveComprehensionSignal(t)) return false;
  if (/^que quer dizer\b/.test(t)) return true;
  if (/^como assim$/.test(t)) return true;
  if (/^repete$/.test(t)) return true;
  if (/^nao entendi$/.test(t)) return true;
  if (/^nao peguei$/.test(t)) return true;
  if (/^explica melhor$/.test(t)) return true;
  if (/^pode simplificar$/.test(t)) return true;
  return detectsNaturalComprehensionFailureCore(t);
}

function hasComprehensionFailureDominantTail(q) {
  if (!q) return false;
  const compound = getWeakPrefixCompoundTail(q);
  if (!compound) return false;
  return getComprehensionFailureTailCore(compound.tail);
}

/** PATCH 7.9Y.1 — cauda dominante após "mas" (intenção humana, não frase). */
export function getDominantMasTailIntent(message = "") {
  const rawQ = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (rawQ && !hasExplicitNewCommercialSearchFrame(rawQ)) {
    const rawDominant = detectWeakPrefixDominantFamilyIntent(rawQ);
    if (rawDominant) return rawDominant;
  }

  const q = normalize(message);
  if (hasExplicitNewCommercialSearchFrame(q)) return null;

  const spaceCompound = detectSpaceJoinedCompoundIntent(q);
  if (spaceCompound) return spaceCompound;

  const compound = detectsConstraintAlternativeCompoundDominant(q);
  if (compound) return compound;

  return detectWeakPrefixDominantFamilyIntent(q);
}

// PATCH 7.9J — CONSTRAINT_CHANGE semantic family (intenção: mudar restrição da decisão atual)
function hasConstraintChangeCommercialTail(q) {
  if (!q) return false;

  if (/,\s*(tem outro|tem outra|compara|compare|mostra|qual ficou|quem ficou|segundo|plano b)\b/.test(q)) {
    return true;
  }
  if (/\b(compara|compare|comparando)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(quem ficou|ficou em segundo|plano b|segundo colocado|quase ganhou)\b/.test(q)) return true;
  if (/^tem outro\b/.test(q) && /\bmais barato\b/.test(q)) return true;
  if (/^tem outr[oa]\b/.test(q) && !/^e se\b/.test(q)) return true;
  if (/^me mostra outr[oa]\b/.test(q) && /\bmais barato\b/.test(q)) return true;
  if (/^quero ver outr[oa]\b/.test(q)) return true;
  if (
    hasAffirmativeCommercialSearchVerb(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung|monitor|mouse|teclado|cadeira|pc)\b/.test(
      q
    )
  ) {
    if (shouldSuppressCommercialTailForAnchoredReference(q)) return false;
    return true;
  }
  if (/^(celular|notebook|smartphone|pc gamer)\b/.test(q) && /\b(ate|ate)\s+\d/.test(q)) return true;

  return false;
}

function hasNewSearchProductCategoryBlock(q) {
  if (
    /\b(quero|preciso|busco|buscar|procuro|me acha|me indica|me recomenda|procura)\s+(um\s+)?(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung|monitor|mouse|teclado|cadeira|pc)\b/.test(q)
  ) {
    return true;
  }
  if (/^(celular|notebook|smartphone|pc gamer|procura)\b/.test(q)) return true;
  if (/\bquero (um )?produto\b/.test(q) && /\b(ate|ate)\s+\d/.test(q)) return true;
  return false;
}

/** Generic attribute/priority token — not product-specific hardcoding. */
const _CC_ATTR =
  /\b(camera|bateria|desempenho|performance|durabilidade|autonomia|conforto|qualidade|preco|armazenamento|memoria|tela|peso|portabilidade|confiabilidade|resistencia|eficiencia|silencio|ruido|upgrade|acabamento|ergonomia|ventilacao|consumo|latencia|garantia|material|design|estetica|capacidade|velocidade|refresh|conectividade|wifi|bluetooth|compacto|leveza|estabilidade|fiabilidade|amortecimento|refrigeracao|input lag|resposta|custo beneficio)\b/;

const _CC_USE_CASE =
  /\b(trabalho|jogos|estudo|fotos|camera|bateria|desempenho|autonomia|conforto|durabilidade)\b/;

function hasAntiRegretFinancialFearFrame(q) {
  if (!q) return false;
  return (
    /\b(tenho medo|medo de errar|nao quero errar|nao quero me arrepender|nao quero jogar dinheiro fora|nao quero gastar errado|cabreiro|receio|insegur)\b/.test(q) ||
    (/\b(muito dinheiro|grana alta)\b/.test(q) && /\b(pra mim|pro meu bolso)\b/.test(q)) ||
    (/\b(essa|a) compra pesa\b/.test(q) && !/\b(quero gastar|economizar|mais em conta|baixar)\b/.test(q))
  );
}

function hasConstraintChangeDominantFrame(q) {
  if (!q || hasNewSearchProductCategoryBlock(q)) return false;

  const budgetRecalibration =
    /\b(quero|preciso|agora quero|prefiro|posso)\b.*\b(gastar|pagar)\s+menos\b/.test(q) ||
    /\b(quero|preciso|agora quero|pensei melhor)\b.*\b(economizar|economia)\b/.test(q) ||
    (!hasSoftDisagreementBarePriceResistanceCue(q) &&
      /\b(ficou caro|ta puxado|pesou no bolso|passou do que eu queria|orcamento diminuiu|baixar o valor)\b/.test(q)) ||
    /^baixa o orcamento\??$/.test(q) ||
    /\bbaixa o orcamento\b/.test(q) ||
    /^orcamento menor\??$/.test(q) ||
    /\borcamento menor\b/.test(q) ||
    /\b(quero|preciso)\b.*\b(algo )?mais em conta\b/.test(q) ||
    /\bmeu orcamento\b/.test(q) ||
    (/\b(quero|preciso)\s+algo\s+mais\s+barato\b/.test(q) && !/\btem outr/.test(q)) ||
    (/\bvou nesse\b/.test(q) && /\b(se tiver|algo mais em conta|mais em conta)\b/.test(q)) ||
    (/\bpensei melhor\b/.test(q) && /\borcamento\b/.test(q)) ||
    /\b(agora|e agora)\b.*\b(ate|ate)\s*\d+\b/.test(q) ||
    /\bate\s*\d+\s+agora\b/.test(q) ||
    /\b(baixar|baixei|preciso baixar)\b.*\borcamento\b/.test(q) ||
    /^preciso baixar mais$/.test(q) ||
    /\bbaixei o orcamento\b/.test(q);

  if (budgetRecalibration && !/\b(tenho medo|nao quero errar|nao quero me arrepender|cabreiro|receio|insegur|jogar dinheiro fora)\b/.test(q)) {
    return true;
  }

  if (hasAntiRegretFinancialFearFrame(q)) return false;

  const attributePriority =
    _CC_ATTR.test(q) &&
    /\b(virou prioridade|ficou prioridade|importa mais|pesa mais|priorizar|prioridade|foco|focar)\b/.test(q);

  const useDominantShift =
    /\b(vou jogar|vou usar|uso mudou|usar de outro jeito|tipo de uso|caso de uso|considerar outro tipo de uso)\b/.test(q) ||
    (/\bvou usar\b/.test(q) && /\b(para|pra|mais)\b/.test(q)) ||
    /\bmeu uso mudou\b/.test(q) ||
    (_CC_USE_CASE.test(q) && /\b(virou foco|virou prioridade)\b/.test(q)) ||
    /\b(foco|focar)\b/.test(q) && /\b(mudou|outro|diferente)\b/.test(q);

  const deprioritizedAttribute =
    _CC_ATTR.test(q) &&
    /\b(nao importa tanto|nao e tao importante|deixou de ser prioridade|abrir mao|sacrificar|nao ligo tanto|nao e mais o unico criterio|importa menos)\b/.test(q);

  const preferenceRecalibration =
    (/\b(mudei de ideia|pensei melhor|olhando melhor|pensando bem|minha prioridade mudou|meu foco mudou)\b/.test(q) &&
      (/\b(prioridade|foco|orcamento|gastar|economizar|usar|uso|criterio|recalibrar|reavaliar)\b/.test(q) ||
        q.length < 28)) ||
    /\bquero recalibrar\b/.test(q) ||
    /\breavaliar com outro criterio\b/.test(q) ||
    /\bnao ligo tanto\b/.test(q);

  const compoundConstraintTail =
    /\b(mas|porem|so que)\b/.test(q) &&
    (budgetRecalibration ||
      attributePriority ||
      useDominantShift ||
      deprioritizedAttribute ||
      preferenceRecalibration ||
      /\b(ta puxado|ficou caro|pesou no bolso|gastar menos|economizar|virou prioridade|importa mais|foco mudou)\b/.test(q));

  return (
    budgetRecalibration ||
    attributePriority ||
    useDominantShift ||
    deprioritizedAttribute ||
    preferenceRecalibration ||
    compoundConstraintTail
  );
}

function hasNaturalConstraintChangeBlock(q) {
  if (!q) return false;

  if (/\b(tem certeza|sustenta essa|continua achando|voce compraria|revisaria essa)\b/.test(q)) {
    return true;
  }
  if (/\b(galera|povo|pessoal|quem comprou)\b/.test(q) && /\b(recomenda|gostou|falam bem|reclama)\b/.test(q)) {
    return true;
  }
  if (/\b(nao me convenceu|nao concordo|to meio assim|nao curti|nao me desceu|pe atras)\b/.test(q)) {
    return true;
  }
  if (/^(vou nele|vou nesse|entao e esse|fechou|fechou vou pegar)$/.test(q)) return true;
  if (/\b(tem outro|mostra alternativas|quero ver opcoes|plano b|ficou em segundo|backup)\b/.test(q)) {
    return true;
  }
  if (/\b(tenho medo|nao quero me arrepender|medo de errar|to cabreiro|to com receio|nao quero jogar dinheiro fora)\b/.test(q)) {
    return true;
  }
  if (/^(entendi|ok|blz|show|oi|bom dia|salve)$/.test(q)) return true;
  if (hasCommercialComparisonDisjunction(q)) return true;

  return false;
}

function detectsNaturalConstraintChangeSignal(q) {
  if (!q || hasNewSearchProductCategoryBlock(q) || hasNaturalConstraintChangeBlock(q)) return false;

  const budgetDown =
    /^quero gastar menos$/.test(q) ||
    /^prefiro gastar menos$/.test(q) ||
    /^quero economizar$/.test(q) ||
    /^agora quero gastar menos$/.test(q) ||
    /^acho que preciso gastar menos$/.test(q) ||
    /\b(quero|prefiro|preciso|posso|agora quero|acho que preciso|pensei melhor)\b.*\b(gastar|pagar)\s+menos\b/.test(q) ||
    /\b(quero|preciso|agora quero|pensei melhor)\b.*\b(economizar|economia)\b/.test(q) ||
    (!hasSoftDisagreementBarePriceResistanceCue(q) &&
      /\b(ficou caro|ta puxado|pesou no bolso|passou do que eu queria)\b/.test(q)) ||
    /\b(preciso baixar o valor|orcamento diminuiu|meu orcamento diminuiu)\b/.test(q) ||
    /^baixa o orcamento\??$/.test(q) ||
    /\bbaixa o orcamento\b/.test(q) ||
    /^orcamento menor\??$/.test(q) ||
    /\borcamento menor\b/.test(q) ||
    /\b(quero|preciso)\b.*\b(algo )?mais em conta\b/.test(q) ||
    (/\bvou nesse\b/.test(q) && /\b(se tiver|algo mais em conta|mais em conta)\b/.test(q)) ||
    (/\bpensei melhor\b/.test(q) && /\borcamento\b/.test(q)) ||
    /\b(agora|e agora)\b.*\b(ate|ate)\s*\d+\b/.test(q) ||
    /\bate\s*\d+\s+agora\b/.test(q) ||
    /\b(baixar|baixei|preciso baixar)\b.*\borcamento\b/.test(q) ||
    /^preciso baixar mais$/.test(q) ||
    /\bbaixei o orcamento\b/.test(q) ||
    /\bcorta um pouco o orcamento\b/.test(q) ||
    /\bcortar um pouco o orcamento\b/.test(q) ||
    /\b(gastar|pagar)\s+menos\b.*\b(mas|sem perder|sem abrir mao)\b/.test(q);

  const budgetUp =
    /\b(posso|quero)\s+(gastar|pagar)\s+mais\b/.test(q) ||
    /^quero subir o orcamento$/.test(q) ||
    /^posso subir um pouco$/.test(q) ||
    /\btenho mais dinheiro\b/.test(q);

  const pricePreference =
    /^quero algo mais barato$/.test(q) ||
    /^quero uma opcao mais barata$/.test(q) ||
    /^prefiro algo mais barato$/.test(q);

  // PATCH 7.9X-CC — Group B: attribute priority shift (generic attribute tokens)
  const priorityShift =
    /\bagora\b.*\b(importa mais|ficou mais importante|pesa mais)\b/.test(q) ||
    /\b(desempenho|durabilidade|bateria|camera|autonomia|conforto|qualidade|preco|performance|silencio|ruido|upgrade|acabamento)\b.*\b(virou prioridade|ficou prioridade|ficou mais importante|virou mais importante|pesa mais|pesou mais|importa mais)\b/.test(q) ||
    /\b(pesa mais|pesou mais|importa mais)\b.*\b(agora|agora sim)\b/.test(q) ||
    /^agora silencio pesa$/.test(q) ||
    /\b(agora|agora sim)\b.*\b(silencio|ruido)\b.*\bpesa\b/.test(q) ||
    /\b(importa menos|pesou menos|nao importa tanto|deixou de ser prioridade)\b/.test(q) ||
    /\b(posso|pode)\b.*\b(abrir mao|abrir mão|sacrificar)\b/.test(q) ||
    /\bda mais peso (pra|para)\b/.test(q) ||
    /\bmenos foco em\b/.test(q) ||
    /^quero focar (mais )?em\b/.test(q) ||
    _CC_ATTR.test(q) && /\b(virou prioridade|ficou prioridade)\b/.test(q) ||
    /\b(preciso priorizar|quero priorizar|preciso dar prioridade)\b/.test(q) ||
    /^(prioriza|priorizo)\b/.test(q) && _CC_ATTR.test(q) ||
    /^quero camera melhor$/.test(q) ||
    /^quero uma camera melhor$/.test(q) ||
    /^quero bateria melhor$/.test(q) ||
    /^quero mais bateria$/.test(q) ||
    /\bquero\b.*\b(camera|bateria|desempenho|durabilidade|autonomia)\b.*\b(melhor|mais)\b/.test(q) ||
    /^quero focar em durabilidade$/.test(q) ||
    /\bquero focar\b.*\b(durabilidade|custo beneficio|confiavel)\b/.test(q);

  // PATCH 7.9X-CC — Group C: dominant use-case shift
  const useCaseShift =
    /\bvou jogar mais\b/.test(q) ||
    /\bvou usar\b.*\b(para|pra|mais)\b/.test(q) ||
    /\bmeu uso mudou\b/.test(q) ||
    /\b(vou usar de outro jeito|pensei melhor sobre meu uso)\b/.test(q) ||
    /\b(preciso considerar|considerar)\b.*\b(tipo de uso|outro uso|outro tipo de uso)\b/.test(q) ||
    /\b(agora o foco e outro|meu foco mudou|minha prioridade mudou)\b/.test(q) ||
    /^vou querer pra jogos$/.test(q) ||
    /^vou trabalhar bastante nele$/.test(q) ||
    /^agora quero para trabalho$/.test(q) ||
    /^agora quero para jogos$/.test(q) ||
    (_CC_USE_CASE.test(q) && /\b(virou foco|virou prioridade)\b/.test(q));

  // PATCH 7.9X-CC — Group D: deprioritized attribute
  const deprioritizedAttribute =
    _CC_ATTR.test(q) &&
    /\b(nao importa tanto|nao e tao importante|deixou de ser prioridade|abrir mao|sacrificar|nao ligo tanto|perdeu peso|nao e mais o unico criterio|importa menos)\b/.test(q);

  const generalCriteria =
    /\bquero algo mais (equilibrado|confiavel|seguro|simples|tranquilo)\b/.test(q) ||
    /\bquero focar mais em custo beneficio\b/.test(q) ||
    /\bquero algo que dure mais\b/.test(q);

  // PATCH 7.9X-CC — Group E: preference recalibration within same decision
  const preferenceRecalibration =
    (/\b(mudei de ideia|pensei melhor|olhando melhor agora|pensando bem)\b/.test(q) &&
      (/\b(prioridade|foco|orcamento|gastar|economizar|usar|uso|criterio|escolha|decisao)\b/.test(q) ||
        q.length < 28)) ||
    /\b(minha prioridade mudou|meu foco mudou|acho que meu foco mudou)\b/.test(q) ||
    /\b(quero recalibrar|preciso reavaliar)\b/.test(q) ||
    /\breavaliar com outro criterio\b/.test(q) ||
    /\bnao ligo tanto\b/.test(q);

  // PATCH 7.9X-CC — Group F: compound decision + constraint tail
  const compoundDecisionConstraint =
    hasConstraintChangeDominantFrame(q) &&
    /\b(mas|porem|so que)\b/.test(q) &&
    /\b(gostei|parece|acho que|vou nesse|fechou|recomendacao|certo)\b/.test(q);

  const preferenceReveal =
    !/\bnao\s+quer(ia|o)\b/.test(q) &&
    /\b(quero|prefiro|preciso|posso|agora)\b/.test(q) &&
    /\b(gastar|pagar|economizar|orcamento|priorizar|prioridade|focar|foco|usar|utilizar)\b/.test(q) &&
    !/\b(outro|outra|alternativa|segundo|plano b|errado|mal|besteira|arrepender)\b/.test(q);

  return (
    budgetDown ||
    budgetUp ||
    pricePreference ||
    priorityShift ||
    useCaseShift ||
    deprioritizedAttribute ||
    generalCriteria ||
    preferenceRecalibration ||
    compoundDecisionConstraint ||
    preferenceReveal
  );
}

function detectsConstraintChangeSignal(q) {
  if (!q || hasConstraintChangeCommercialTail(q)) return false;
  if (detectsConstraintAlternativeCompoundDominant(q)) return false;
  if (hasConstraintChangeDominantMasTail(q)) return true;
  if (detectsSecondBestDiscoverySignal(q)) return false;
  if (detectsAlternativeExplorationSignal(q)) return false;
  const constraintDominant = hasConstraintChangeDominantFrame(q);
  if (constraintDominant) return true;
  if (detectsAntiRegretSignal(q)) return false;
  if (detectsDecisionConfirmationSignal(q)) return false;
  // PATCH 7.9J-B — purchase anxiety precedes CONSTRAINT_CHANGE at resolve step 4; block here to avoid swallowing OBJECTION.
  if (matchesPurchaseAnxietyFamilyH(q)) return false;

  if (/\be se\b/.test(q)) {
    if (/^e se eu gastar menos$/.test(q)) return true;
    if (/^e se eu gastar mais$/.test(q)) return true;
    if (/^e se eu subir o orcamento$/.test(q)) return true;
    if (/^e se eu baixar o orcamento$/.test(q)) return true;
    if (/^e se for ate 2000$/.test(q)) return true;
    if (/^e se passar um pouco do orcamento$/.test(q)) return true;
    if (/^e se eu quiser algo mais barato$/.test(q)) return true;
    if (/\be se eu quiser economizar\b/.test(q)) return true;
    if (/^e se eu quiser algo melhor$/.test(q)) return true;
    if (/^e se eu priorizar camera$/.test(q)) return true;
    if (/^e se eu priorizar bateria$/.test(q)) return true;
    if (/^e se eu focar em durabilidade$/.test(q)) return true;
    if (/^e se eu usar mais para trabalho$/.test(q)) return true;
    if (/^e se for para jogos$/.test(q)) return true;

    if (/\be se eu\b/.test(q) && /\b(gastar|pagar|investir)\s+(menos|mais)\b/.test(q)) return true;
    if (
      /\be se eu\b/.test(q) &&
      /\b(subir|baixar|aumentar|diminuir)\b/.test(q) &&
      /\b(orcamento|limite|teto)\b/.test(q)
    ) {
      return true;
    }
    if (/\be se eu\b/.test(q) && /\b(priorizar|prioridade|focar|foco)\b/.test(q)) return true;
    if (/\be se eu\b/.test(q) && /\b(quiser|quisesse|precisar|precisasse)\s+algo\b/.test(q)) return true;
    if (/\be se eu\b/.test(q) && /\b(quiser|precisar)\s+algo\s+(mais\s+)?(barato|melhor|caro)\b/.test(q)) return true;
    if (/\be se passar\b/.test(q) && /\b(orcamento|limite|teto)\b/.test(q)) return true;
    if (/\be se for\b/.test(q) && /\b(ate|ate|por|abaixo|menos de)\s+r?\$?\s*\d/.test(q)) return true;
    if (
      /\be se for\b/.test(q) &&
      /\b(para|pra)\s+(jogos|jogar|trabalho|trabalhar|estudo|estudar|fotos|foto|camera|bateria)\b/.test(q)
    ) {
      return true;
    }
    if (/\be se eu quiser mais autonomia\b/.test(q)) return true;
    if (/\be se eu\b/.test(q) && /\b(quiser|quisesse|precisar)\b/.test(q) && _CC_ATTR.test(q)) return true;
    if (/\be se\b/.test(q) && /\b(importar|prioridade|priorizar|focar|foco|autonomia|bateria|camera)\b/.test(q)) return true;
    if (/\be se eu\b/.test(q) && /\b(evitar|quisesse evitar)\b/.test(q) && /\b(dor de cabeca|problema|risco)\b/.test(q)) {
      return true;
    }
    if (
      /\b(orcamento|limite|teto|gastar|pagar|priorizar|prioridade|durabilidade|bateria|camera)\b/.test(q) &&
      !/\b(celular|smartphone|notebook|iphone|galaxy)\b/.test(q)
    ) {
      return true;
    }
  }

  // PATCH 7.9J-B — natural constraint revelation without "e se" framing
  if (detectsNaturalConstraintChangeSignal(q)) return true;

  return false;
}

/** PATCH 7.9J — exported for Routing layer (read-only family detector). */
export function isConstraintChangeFamilyQuery(message = "") {
  const dominant = getCrossFamilyDominantFamily(message);
  if (dominant) return dominant === "CONSTRAINT_CHANGE";
  return detectsConstraintChangeSignal(normalize(message));
}

function detectsConversationalSignal(q, { detectedIntent, contextResolution }) {
  if (detectedIntent === "greeting" || detectedIntent === "casual_chat" || detectedIntent === "general_answer") return true;
  if (contextResolution?.mode === "budget_guide" || contextResolution?.mode === "regret_fear_guide") return true;
  if (detectsGreetingSignal(q)) return true;
  if (detectsAcknowledgementSignal(q)) return true;

  const conversationalPatterns = [
    /^(oi|ola|olá|opa|bom dia|boa tarde|boa noite|tudo bem|tudo bom|eae|e ae|salve|alo|fala mia|fala ai)\b/,
    /^(obrigad|valeu|ok|beleza|show|certo|entendido|captei)\b/,
    /^(quem (e|é) (voce|vc)|o que voce faz|para que serve)\b/,
  ];

  return conversationalPatterns.some((re) => re.test(q));
}

// ─────────────────────────────────────────────────────────────
// Construtor de sinais estruturados (auditável)
// ─────────────────────────────────────────────────────────────

/** PATCH 7.9Y.1 — aplica precedência cognitiva em colisões cross-family. */
function applyCrossFamilyCollisionPrecedence(signals, q) {
  let {
    isSoftDisagreement: softDisagreement,
    isConstraintChange: constraintChange,
    isDecisionConfirmation: decisionConfirmation,
    isAntiRegret: antiRegret,
    isConfidenceChallenge: confidenceChallenge,
    isSocialValidation: socialValidation,
    isSecondBestDiscovery: secondBestDiscovery,
    isAlternativeExploration: alternativeExploration,
    isAcknowledgement,
    isComprehension,
    isComprehensionSuccess,
    isGreeting,
  } = signals;

  const compound = detectsConstraintAlternativeCompoundDominant(q);
  if (compound === "SECOND_BEST_DISCOVERY") {
    secondBestDiscovery = true;
    alternativeExploration = false;
    constraintChange = false;
    decisionConfirmation = false;
  } else if (compound === "ALTERNATIVE_EXPLORATION") {
    alternativeExploration = true;
    secondBestDiscovery = false;
    constraintChange = false;
    decisionConfirmation = false;
  }

  const masTail = getDominantMasTailIntent(q);
  let hesitationReaction = signals.hesitationReaction;
  if (masTail) {
    softDisagreement = masTail === "SOFT_DISAGREEMENT";
    antiRegret = masTail === "ANTI_REGRET";
    confidenceChallenge = masTail === "CONFIDENCE_CHALLENGE";
    socialValidation = masTail === "SOCIAL_VALIDATION";
    constraintChange = masTail === "CONSTRAINT_CHANGE";
    secondBestDiscovery = masTail === "SECOND_BEST_DISCOVERY";
    alternativeExploration = masTail === "ALTERNATIVE_EXPLORATION";
    decisionConfirmation = masTail === "DECISION_CONFIRMATION";
    isComprehension = masTail === "COMPREHENSION_FAILURE";
    isComprehensionSuccess = false;
    isAcknowledgement = false;
    isGreeting = false;
    hesitationReaction = { detected: false, subtype: null };
  }

  if (
    socialValidation &&
    antiRegret &&
    !hasPersonalAntiRegretDominantFrame(q) &&
    detectsNaturalSocialValidationCore(q)
  ) {
    antiRegret = false;
  }

  if (
    confidenceChallenge &&
    antiRegret &&
    hasPersonalAntiRegretDominantFrame(q) &&
    !/\b(voce|vc)\s+(sustenta|manteria|mantem|tem certeza)\b/.test(q) &&
    !/\bsera que vou me arrepender ou voce sustenta\b/.test(q)
  ) {
    confidenceChallenge = false;
  }

  if (
    !confidenceChallenge &&
    /\b(voce|vc)\s+(sustenta|manteria|mantem)\b/.test(q) &&
    /\b(arrepend|medo|cabreiro)\b/.test(q)
  ) {
    confidenceChallenge = true;
    if (hasPersonalAntiRegretDominantFrame(q) && /\btenho medo\b/.test(q)) {
      antiRegret = false;
    }
  }

  if (
    antiRegret &&
    constraintChange &&
    hasPersonalAntiRegretDominantFrame(q) &&
    /\b(tenho medo|medo de errar|nao quero errar|nao quero me arrepender)\b/.test(q)
  ) {
    constraintChange = false;
  }

  // PATCH 8.1B.2 — comprehension success vence ACK (Regra 17 / percepção final)
  if (isComprehensionSuccess) {
    isAcknowledgement = false;
  }

  // PATCH 8.1B.3 — runner-up / plano B vence exploração aberta de alternativas
  if (secondBestDiscovery && alternativeExploration) {
    if (hasSecondBestDiscoveryRunnerUpCue(q) && !hasOpenAlternativeExplorationCue(q)) {
      alternativeExploration = false;
    }
  }
  // PATCH 8.1B.5 — exploração aberta vence runner-up implícito; validação social vence CC em proxy
  if (secondBestDiscovery && hasAlternativeExplorationContingencyCue(q)) {
    secondBestDiscovery = false;
    alternativeExploration = true;
  }
  if (socialValidation && confidenceChallenge && (/^o que (voce|vc) faria\??$/.test(q) || /^(e|eh) uma escolha segura\??$/.test(q))) {
    confidenceChallenge = false;
  }
  if (decisionConfirmation && confidenceChallenge && masTail === "DECISION_CONFIRMATION") {
    confidenceChallenge = false;
  }

  // PATCH 8.1B.4 — fechamento do usuário vence desafio genérico de confiança
  if (decisionConfirmation && confidenceChallenge && /^bate o martelo$/.test(q)) {
    confidenceChallenge = false;
  }

  // PATCH 8.1B.4 — resistência leve ao preço vence recalibração implícita de orçamento
  if (!masTail && hasSoftDisagreementBarePriceResistanceCue(q)) {
    softDisagreement = true;
    constraintChange = false;
  }

  return {
    ...signals,
    hesitationReaction,
    isSoftDisagreement: softDisagreement,
    isConstraintChange: constraintChange,
    isDecisionConfirmation: decisionConfirmation,
    isAntiRegret: antiRegret,
    isConfidenceChallenge: confidenceChallenge,
    isSocialValidation: socialValidation,
    isSecondBestDiscovery: secondBestDiscovery,
    isAlternativeExploration: alternativeExploration,
    isAcknowledgement,
    isComprehension,
    isComprehensionSuccess,
    isGreeting,
  };
}

function buildTurnSignals({
  q,
  rawQuery = "",
  hasActiveAnchor,
  detectedIntent,
  contextResolution,
  comparisonContext,
  cso,
  lastBestProduct,
  sessionContext = {},
}) {
  // URL detection usa rawQuery (normalize remove ":")
  const linkCheck = rawQuery || q;

  // Sinais do CSO — auditáveis, não controlam fluxo aqui
  const csoConversationalIntent = cso?.conversationalIntent || null;
  const csoHasProductContext = !!(cso?.hasProductContext);
  const csoUserFrustrated = !!(cso?.userState?.isFrustrated);
  const csoUserUncertain = !!(cso?.userState?.isUncertain);
  const csoConversationArc = cso?.conversationArc || null;
  const csoConstraintDirection = cso?.constraintDirection || null;

  const softDisagreement = detectsSoftDisagreementSignal(q);
  const constraintChangeRaw =
    !detectsSecondBestDiscoverySignal(q) &&
    !detectsAlternativeExplorationSignal(q) &&
    detectsConstraintChangeSignal(q);
  const constraintDominant = hasConstraintChangeDominantFrame(q);
  const decisionConfirmation =
    constraintChangeRaw && constraintDominant ? false : detectsDecisionConfirmationSignal(q);
  const antiRegret = detectsAntiRegretSignal(q);
  const confidenceChallenge = detectsConfidenceChallengeSignal(q);
  const socialValidation = detectsSocialValidationSignal(q);
  const secondBestDiscovery = detectsSecondBestDiscoverySignal(q);
  const alternativeExploration =
    !secondBestDiscovery && detectsAlternativeExplorationSignal(q);
  const constraintChange = constraintChangeRaw;
  const hesitationRaw = detectsHesitationSignal(q, { hasActiveAnchor });
  const hesitationReaction = hesitationRaw.detected
    ? hesitationRaw
    : softDisagreement && hasActiveAnchor
      ? { detected: true, subtype: "soft_disagreement" }
      : { detected: false, subtype: null };

  return applyCrossFamilyCollisionPrecedence(
    {
    hasActiveAnchor: !!hasActiveAnchor,
    hasBudget: /\b(ate|até|por|abaixo|menos de)\s+r?\$?\s*\d/.test(q),
    mentionsProduct: /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|redmi|poco|a\d{2}|s\d{2}|s24|s25)\b/.test(q),
    mentionsLink: /https?:\/\//.test(linkCheck),
    // PATCH 5.2C — asksWhy expandido: inclui falha de compreensão sobre recomendação
    asksWhy: /por que|qual o motivo|como chegou|logica|raciocinio|nao entendi|nao ficou claro/.test(q),
    asksValue: /vale a pena|compensa|custo beneficio|devo comprar/.test(q),
    asksAlternative:
      /tem outro|tem algo|alternativa|outro opcao|outra opcao|\b(comprar|fecho|fechar|ir)\s+outr[oa]\b|\bposso\s+comprar\s+outr[oa]\b/.test(q),
    // PATCH 5.2C — sinais diagnósticos para auditoria de EXPLANATION_REQUEST
    asksComprehension: /(nao entendi|nao compreendi|nao ficou claro|nao percebi|ficou confuso|nao esta claro)/.test(q),
    hasDecisionReference: /(escolha|decisao|recomendacao|indicacao|opcao)\b/.test(q),
    isComparison: detectsComparisonSignal(q, { contextResolution, detectedIntent, comparisonContext, hasActiveAnchor }),
    isComparisonFollowUp: detectsComparisonFollowUpSignal(q, { comparisonContext, contextResolution, hasActiveAnchor }),
    isPriorityShift: detectsPriorityShiftSignal(q, { hasActiveAnchor, cso }),
    isObjection: detectsObjectionSignal(q, { hasActiveAnchor }),
    hesitationReaction,
    projectiveRisk: detectsProjectiveRiskSignal(q, { hasActiveAnchor }), // PATCH 7.6R
    delegationRequest: detectsDelegationSignal(q, { hasActiveAnchor }), // PATCH 7.6R
    isValueQuestion: detectsValueQuestionSignal(q, { hasActiveAnchor }),
    isExplanationRequest: detectsExplanationRequestSignal(q, { hasActiveAnchor, cso }),
    // PATCH 5.4 — subtipo de intenção pós-decisão (auditável, não controla fluxo diretamente)
    decisionExplanation: detectsPostDecisionExplanationSignal(q, { hasActiveAnchor, cso }),
    isCommercialQuestion: detectsCommercialQuestionSignal(q, { hasActiveAnchor, comparisonContext, rawQuery }),
    isRefinement: detectsRefinementSignal(q, { hasActiveAnchor, detectedIntent, contextResolution }),
    // PATCH 7.5 — structured metadata for deterministic ranking retrieval
    alternativeRequest: detectsAlternativeRequestSignal(q, { hasActiveAnchor }),
    isFollowUp: detectsFollowUpSignal(q, { hasActiveAnchor, detectedIntent, contextResolution }),
    isAnchoredShortFollowUp: isAnchoredShortFollowUpQuery(q, { hasActiveAnchor }),
    isReaction: detectsReactionSignal(q, { hasActiveAnchor, cso }),
    isAcknowledgement: detectsAcknowledgementSignal(q),
    isComprehensionSuccess: detectsNaturalPositiveComprehensionSignal(q),
    isComprehension:
      detectsComprehensionFailureSignal(q) || detectsNaturalPositiveComprehensionSignal(q),
    isSoftDisagreement: softDisagreement,
    isDecisionConfirmation: decisionConfirmation,
    isAntiRegret: antiRegret,
    isConfidenceChallenge: confidenceChallenge,
    isSocialValidation: socialValidation,
    isSecondBestDiscovery: secondBestDiscovery,
    isAlternativeExploration: alternativeExploration,
    isConstraintChange: constraintChange,
    isAboutMia: detectsAboutMiaInstitutionalSignal(q, { hasActiveAnchor }),
    isGreeting: detectsGreetingSignal(q),
    isConversationalConfusion: detectsReasoningBreakdownSignal(q, {
      hasActiveAnchor,
      sessionContext,
    }),
    isConversational: detectsConversationalSignal(q, { detectedIntent, contextResolution }),
    contextResolutionMode: contextResolution?.mode || null,
    detectedIntent: detectedIntent || null,
    hasComparisonContext:
      comparisonContext?.locked === true ||
      (Array.isArray(comparisonContext?.products) && comparisonContext.products.length >= 2),
    hasLastBestProduct: !!(lastBestProduct?.product_name),
    // Sinais do CSO — presentes apenas quando CSO foi passado (chamada com CSO)
    // Auditáveis e inspecionáveis, não controlam classificação diretamente
    cso: cso ? {
      conversationalIntent: csoConversationalIntent,
      hasProductContext: csoHasProductContext,
      userFrustrated: csoUserFrustrated,
      userUncertain: csoUserUncertain,
      conversationArc: csoConversationArc,
      constraintDirection: csoConstraintDirection,
    } : null,
  },
  q
  );
}

// ─────────────────────────────────────────────────────────────
// Classificador — ordem de precedência explícita e governável
// Regra: sinais mais específicos têm prioridade.
// ─────────────────────────────────────────────────────────────

function resolveTurnTypeFromSignals(signals, q, { hasActiveAnchor, contextResolution, detectedIntent }) {
  const reasons = [];
  let turnType = MIA_TURN_TYPES.UNKNOWN;
  let confidence = 0.4;

  // 1. COMPARISON_FOLLOWUP — precede NEW_SEARCH e COMPARISON
  if (signals.isComparisonFollowUp) {
    turnType = MIA_TURN_TYPES.COMPARISON_FOLLOWUP;
    confidence = 0.88;
    reasons.push("comparison_context_active", "follow_up_within_comparison");
    return { turnType, confidence, reasons };
  }

  // 2. COMPARISON — explícita, sem contexto de follow-up
  if (signals.isComparison && !signals.isComparisonFollowUp) {
    turnType = MIA_TURN_TYPES.COMPARISON;
    confidence = 0.85;
    reasons.push("explicit_comparison_detected");
    if (signals.mentionsProduct) reasons.push("product_terms_present");
    return { turnType, confidence, reasons };
  }

  // 1.4 CONVERSATIONAL_CONFUSION — perda de confiança no raciocínio (PATCH 8.3F)
  if (signals.isConversationalConfusion) {
    turnType = MIA_TURN_TYPES.CONVERSATIONAL_CONFUSION;
    confidence = 0.86;
    reasons.push("reasoning_breakdown_detected", "contradiction_recovery_required");
    return { turnType, confidence, reasons };
  }

  // 2.45 ABOUT_MIA — precede GREETING (PATCH 8.0A)
  // Perguntas institucionais sobre identidade, confiança, monetização, etc.
  if (signals.isAboutMia) {
    turnType = MIA_TURN_TYPES.ABOUT_MIA;
    confidence = 0.87;
    reasons.push("about_mia_intent_detected", "institutional_knowledge_request");
    return { turnType, confidence, reasons };
  }

  // 2.5 GREETING — precede NEW_SEARCH (PATCH 7.7B)
  // Cumprimento puro não vira busca só porque não há âncora ativa.
  if (signals.isGreeting) {
    turnType = MIA_TURN_TYPES.CONVERSATIONAL;
    confidence = 0.86;
    reasons.push("greeting_intent_detected", "conversational_intent_detected");
    return { turnType, confidence, reasons };
  }

  // 2.6 COMPREHENSION — precede ACKNOWLEDGEMENT (PATCH 8.1B.2)
  // Sucesso e falha de compreensão vão para comprehension_flow, não acknowledgement_flow.
  if (signals.isComprehension) {
    if (hasActiveAnchor) {
      turnType = signals.isComprehensionSuccess
        ? MIA_TURN_TYPES.REACTION
        : MIA_TURN_TYPES.EXPLANATION_REQUEST;
      confidence = 0.84;
      reasons.push(
        signals.isComprehensionSuccess
          ? "comprehension_success_intent_detected"
          : "comprehension_intent_detected",
        signals.isComprehensionSuccess
          ? "anchored_comprehension_success"
          : "anchored_reexplanation_request"
      );
    } else {
      turnType = MIA_TURN_TYPES.CONVERSATIONAL;
      confidence = 0.84;
      reasons.push(
        signals.isComprehensionSuccess
          ? "comprehension_success_intent_detected"
          : "comprehension_intent_detected",
        signals.isComprehensionSuccess
          ? "cold_comprehension_success"
          : "cold_clarification_request"
      );
    }
    return { turnType, confidence, reasons };
  }

  // 2.7 ACKNOWLEDGEMENT — precede NEW_SEARCH (PATCH 7.7E)
  // Reconhecimento puro não vira busca só porque não há âncora ativa.
  if (signals.isAcknowledgement) {
    turnType = MIA_TURN_TYPES.REACTION;
    confidence = 0.85;
    reasons.push("acknowledgement_intent_detected", "reaction_detected");
    return { turnType, confidence, reasons };
  }

  // 2.8 SOFT_DISAGREEMENT — precede NEW_SEARCH (PATCH 7.7O)
  // Resistência leve / não totalmente convencido não vira busca cold-start.
  if (signals.isSoftDisagreement) {
    if (hasActiveAnchor) {
      turnType = MIA_TURN_TYPES.OBJECTION;
      confidence = 0.84;
      reasons.push("soft_disagreement_intent_detected", "anchored_light_resistance");
    } else {
      turnType = MIA_TURN_TYPES.CONVERSATIONAL;
      confidence = 0.84;
      reasons.push("soft_disagreement_intent_detected", "cold_light_resistance");
    }
    return { turnType, confidence, reasons };
  }

  // 2.9 DECISION_CONFIRMATION — precede NEW_SEARCH (PATCH 7.8B)
  // Confirmação final da decisão atual não vira busca cold-start nem UNKNOWN ancorado.
  if (signals.isDecisionConfirmation) {
    if (hasActiveAnchor) {
      turnType = MIA_TURN_TYPES.FOLLOW_UP;
      confidence = 0.84;
      reasons.push("decision_confirmation_intent_detected", "anchored_final_confirmation");
    } else {
      turnType = MIA_TURN_TYPES.CONVERSATIONAL;
      confidence = 0.84;
      reasons.push("decision_confirmation_intent_detected", "cold_confirmation_without_anchor");
    }
    return { turnType, confidence, reasons };
  }

  // 2.10 ANTI_REGRET — precede NEW_SEARCH (PATCH 7.8F)
  // Medo final de arrependimento / tranquilidade da escolha não vira busca cold-start nem UNKNOWN ancorado.
  if (signals.isAntiRegret) {
    if (hasActiveAnchor) {
      turnType = MIA_TURN_TYPES.OBJECTION;
      confidence = 0.84;
      reasons.push("anti_regret_intent_detected", "anchored_regret_fear");
    } else {
      turnType = MIA_TURN_TYPES.CONVERSATIONAL;
      confidence = 0.84;
      reasons.push("anti_regret_intent_detected", "cold_regret_fear_without_anchor");
    }
    return { turnType, confidence, reasons };
  }

  // 2.105 HESITATION_REACTION — precede CONFIDENCE_CHALLENGE (PATCH 8.0B.1)
  // Dúvida sobre a escolha atual vence desafio genérico de confiança no mesmo turno.
  if (hasActiveAnchor && signals.hesitationReaction?.detected) {
    turnType = MIA_TURN_TYPES.OBJECTION;
    confidence = 0.84;
    reasons.push(
      "hesitation_reaction_intent_detected",
      "anchored_hesitation_precedes_trust_challenge",
      `hesitation_subtype:${signals.hesitationReaction.subtype}`
    );
    return { turnType, confidence, reasons };
  }

  // 2.106 PROJECTIVE_RISK — precede CONFIDENCE_CHALLENGE (PATCH 8.0B.1)
  // Sonda de risco/pegadinha vence cluster genérico de confiança no mesmo turno.
  if (hasActiveAnchor && signals.projectiveRisk?.detected) {
    turnType = MIA_TURN_TYPES.OBJECTION;
    confidence = 0.84;
    reasons.push(
      "projective_risk_intent_detected",
      "anchored_risk_probe_precedes_trust_challenge",
      `projective_risk_subtype:${signals.projectiveRisk.subtype}`
    );
    return { turnType, confidence, reasons };
  }

  // 2.11 CONFIDENCE_CHALLENGE — precede NEW_SEARCH (PATCH 7.8J)
  // Desafio à confiança/estabilidade da recomendação não vira busca cold-start nem UNKNOWN ancorado.
  if (signals.isConfidenceChallenge) {
    if (hasActiveAnchor) {
      turnType = MIA_TURN_TYPES.EXPLANATION_REQUEST;
      confidence = 0.84;
      reasons.push("confidence_challenge_intent_detected", "anchored_trust_challenge");
      if (signals.decisionExplanation?.active) {
        reasons.push(`decision_explanation_subtype:${signals.decisionExplanation.subtype || "detected"}`);
      }
    } else {
      turnType = MIA_TURN_TYPES.CONVERSATIONAL;
      confidence = 0.84;
      reasons.push("confidence_challenge_intent_detected", "cold_trust_challenge_without_anchor");
    }
    return { turnType, confidence, reasons };
  }

  // 2.12 SOCIAL_VALIDATION — precede NEW_SEARCH (PATCH 7.8N)
  // Prova social / aceitação coletiva não vira busca cold-start nem UNKNOWN ancorado.
  if (signals.isSocialValidation) {
    if (hasActiveAnchor) {
      turnType = MIA_TURN_TYPES.EXPLANATION_REQUEST;
      confidence = 0.84;
      reasons.push("social_validation_intent_detected", "anchored_social_proof_request");
    } else {
      turnType = MIA_TURN_TYPES.CONVERSATIONAL;
      confidence = 0.84;
      reasons.push("social_validation_intent_detected", "cold_social_proof_without_anchor");
    }
    return { turnType, confidence, reasons };
  }

  // 2.13 SECOND_BEST_DISCOVERY — precede NEW_SEARCH (PATCH 7.9B)
  // Plano B / runner-up não vira busca cold-start nem UNKNOWN ancorado.
  if (signals.isSecondBestDiscovery) {
    if (hasActiveAnchor) {
      turnType = MIA_TURN_TYPES.ALTERNATIVE_REQUEST;
      confidence = 0.84;
      reasons.push("second_best_discovery_intent_detected", "anchored_runner_up_request", "requested_rank:2");
    } else {
      turnType = MIA_TURN_TYPES.CONVERSATIONAL;
      confidence = 0.84;
      reasons.push("second_best_discovery_intent_detected", "cold_runner_up_without_anchor");
    }
    return { turnType, confidence, reasons };
  }

  // 2.14 ALTERNATIVE_EXPLORATION — precede NEW_SEARCH (PATCH 7.9F)
  // Explorar outra opção não vira busca cold-start, OBJECTION nem UNKNOWN ancorado.
  if (signals.isAlternativeExploration) {
    if (hasActiveAnchor) {
      turnType = MIA_TURN_TYPES.ALTERNATIVE_REQUEST;
      confidence = 0.84;
      reasons.push("alternative_exploration_intent_detected", "anchored_parallel_alternative_request");
    } else {
      turnType = MIA_TURN_TYPES.CONVERSATIONAL;
      confidence = 0.84;
      reasons.push("alternative_exploration_intent_detected", "cold_alternative_without_anchor");
    }
    return { turnType, confidence, reasons };
  }

  // 2.15 CONSTRAINT_CHANGE — precede NEW_SEARCH (PATCH 7.9J)
  // Mudança hipotética de restrição não vira busca cold-start nem FOLLOW_UP ancorado genérico.
  if (signals.isConstraintChange) {
    if (hasActiveAnchor) {
      turnType = MIA_TURN_TYPES.PRIORITY_SHIFT;
      confidence = 0.84;
      reasons.push("constraint_change_intent_detected", "anchored_constraint_hypothetical");
    } else {
      turnType = MIA_TURN_TYPES.CONVERSATIONAL;
      confidence = 0.84;
      reasons.push("constraint_change_intent_detected", "cold_constraint_without_anchor");
    }
    return { turnType, confidence, reasons };
  }

  // 3. NEW_SEARCH — nova busca, âncora indiferente
  if (detectsNewSearchSignal(q, { hasActiveAnchor, detectedIntent, contextResolution })) {
    // Só confirma NEW_SEARCH se NÃO há sinal forte de follow-up com âncora
    if (!hasActiveAnchor || (!signals.isFollowUp && !signals.isPriorityShift && !signals.isRefinement)) {
      turnType = MIA_TURN_TYPES.NEW_SEARCH;
      confidence = 0.82;
      reasons.push("new_search_intent_detected");
      if (signals.hasBudget) reasons.push("budget_present");
      if (signals.mentionsProduct) reasons.push("product_category_present");
      if (!hasActiveAnchor) reasons.push("no_active_anchor");
      return { turnType, confidence, reasons };
    }
  }

  // 3b. COMMERCIAL_QUESTION com link — precede follow-up e refinement
  // URL ou referência direta de marketplace override outros sinais
  if (signals.isCommercialQuestion && (signals.mentionsLink || !hasActiveAnchor)) {
    turnType = MIA_TURN_TYPES.COMMERCIAL_QUESTION;
    confidence = 0.78;
    reasons.push("commercial_reference_detected");
    if (signals.mentionsLink) reasons.push("url_detected");
    if (!hasActiveAnchor) reasons.push("no_anchor");
    return { turnType, confidence, reasons };
  }

  // Com âncora ativa — sinais específicos de turno contextual
  if (hasActiveAnchor) {

    // 4. OBJECTION — antes de EXPLANATION e VALUE
    if (signals.isObjection) {
      turnType = MIA_TURN_TYPES.OBJECTION;
      confidence = 0.84;
      reasons.push("objection_detected", "anchor_active");
      return { turnType, confidence, reasons };
    }

    // 4.5 HESITATION_REACTION — PATCH 7.6C
    // Hesitation / uncertainty about the current decision.
    // Resolved as OBJECTION so PATCH 6.2's interceptor (handler) routes it
    // to the contextual path — no handler change needed.
    // "to na dúvida", "não sei explicar", "não me convenceu" etc.
    if (signals.hesitationReaction?.detected) {
      turnType = MIA_TURN_TYPES.OBJECTION;
      confidence = 0.80;
      reasons.push(
        "hesitation_reaction_detected",
        "anchor_active",
        `hesitation_subtype:${signals.hesitationReaction.subtype}`
      );
      return { turnType, confidence, reasons };
    }

    // 4.6 PROJECTIVE_RISK — PATCH 7.6R
    // Usuário pergunta à MIA qual seria o risco/preocupação da recomendação atual.
    if (signals.projectiveRisk?.detected) {
      turnType = MIA_TURN_TYPES.OBJECTION;
      confidence = 0.80;
      reasons.push(
        "projective_risk_detected",
        "anchor_active",
        `projective_risk_subtype:${signals.projectiveRisk.subtype}`
      );
      return { turnType, confidence, reasons };
    }

    // 5. EXPLANATION_REQUEST (inclui clusters pós-decisão do PATCH 5.4)
    if (signals.isExplanationRequest) {
      turnType = MIA_TURN_TYPES.EXPLANATION_REQUEST;
      confidence = 0.83;
      reasons.push("explanation_pattern_detected", "anchor_active");
      // PATCH 5.4 — anotar subtipo para auditoria e downstream
      if (signals.decisionExplanation?.active) {
        reasons.push(`decision_explanation_subtype:${signals.decisionExplanation.subtype}`);
      }
      return { turnType, confidence, reasons };
    }

    // 5.5 DECISION_DELEGATION — PATCH 7.6R
    // Usuário delega a decisão final à MIA ("o que você faria?", "e se fosse você?").
    if (signals.delegationRequest?.detected) {
      turnType = MIA_TURN_TYPES.EXPLANATION_REQUEST;
      confidence = 0.83;
      reasons.push(
        "decision_delegation_detected",
        "anchor_active",
        `delegation_subtype:${signals.delegationRequest.subtype}`
      );
      return { turnType, confidence, reasons };
    }

    // 6. VALUE_QUESTION
    if (signals.isValueQuestion) {
      turnType = MIA_TURN_TYPES.VALUE_QUESTION;
      confidence = 0.83;
      reasons.push("value_question_detected", "anchor_active");
      return { turnType, confidence, reasons };
    }

    // 7. PRIORITY_SHIFT
    if (signals.isPriorityShift) {
      turnType = MIA_TURN_TYPES.PRIORITY_SHIFT;
      confidence = 0.80;
      reasons.push("priority_shift_detected", "anchor_active");
      return { turnType, confidence, reasons };
    }

    // 8. FOLLOW_UP — padrão de query "e a/o X?" tem precedência sobre REFINEMENT
    // Queries como "e a bateria?" são semanticamente follow-up, mesmo se
    // o detectedIntent do pipeline existente classificou como "refinement".
    if (signals.isFollowUp) {
      turnType = MIA_TURN_TYPES.FOLLOW_UP;
      confidence = 0.75;
      reasons.push("follow_up_pattern_detected", "anchor_active");
      return { turnType, confidence, reasons };
    }

    // 8.5 ALTERNATIVE_REQUEST — PATCH 7.5
    // Specialization of REFINEMENT: user requests a specific ranking position
    // or top-N list. Same routing behavior (anchor preserved, no new search).
    // Adds formal retrieval metadata for deterministic snapshot resolution.
    if (signals.alternativeRequest?.detected) {
      turnType = MIA_TURN_TYPES.ALTERNATIVE_REQUEST;
      confidence = 0.84;
      reasons.push("alternative_request_detected", "anchor_active");
      if (signals.alternativeRequest.requestedRank != null) {
        reasons.push(`requested_rank:${signals.alternativeRequest.requestedRank}`);
      }
      if (signals.alternativeRequest.requestedTopN != null) {
        reasons.push(`requested_top_n:${signals.alternativeRequest.requestedTopN}`);
      }
      return { turnType, confidence, reasons };
    }

    // 9. REFINEMENT
    if (signals.isRefinement || (signals.asksAlternative && !signals.isComparison)) {
      turnType = MIA_TURN_TYPES.REFINEMENT;
      confidence = 0.78;
      reasons.push("refinement_signal_detected", "anchor_active");
      if (signals.asksAlternative) reasons.push("alternative_request");
      return { turnType, confidence, reasons };
    }

    // 10. COMMERCIAL_QUESTION — link ou produto específico
    if (signals.isCommercialQuestion) {
      turnType = MIA_TURN_TYPES.COMMERCIAL_QUESTION;
      confidence = 0.76;
      reasons.push("commercial_reference_detected");
      if (signals.mentionsLink) reasons.push("url_detected");
      return { turnType, confidence, reasons };
    }

    // 11. REACTION
    if (signals.isReaction) {
      turnType = MIA_TURN_TYPES.REACTION;
      confidence = 0.70;
      reasons.push("reaction_detected", "anchor_active");
      return { turnType, confidence, reasons };
    }
  }

  // (commercial sem âncora já foi tratado acima)

  // 12. CONVERSATIONAL
  if (signals.isConversational) {
    turnType = MIA_TURN_TYPES.CONVERSATIONAL;
    confidence = 0.80;
    reasons.push("conversational_intent_detected");
    return { turnType, confidence, reasons };
  }

  // 13. UNKNOWN — não há sinal suficiente
  reasons.push("insufficient_signals");
  if (hasActiveAnchor) reasons.push("anchor_active_but_ambiguous");
  return { turnType: MIA_TURN_TYPES.UNKNOWN, confidence: 0.35, reasons };
}

// ─────────────────────────────────────────────────────────────
// Função principal — export
// ─────────────────────────────────────────────────────────────

/**
 * Classifica o tipo cognitivo do turno do usuário.
 *
 * Todos os campos do input são opcionais para facilitar evolução futura.
 * A função NUNCA retorna null. Em dúvida, retorna UNKNOWN.
 *
 * @param {object} input
 * @param {string}  input.query             - query enriquecida/resolvida (sinal auxiliar)
 * @param {string}  [input.originalQuery]   - texto literal do usuário (AUTORIDADE PRINCIPAL)
 * @param {string}  [input.resolvedQuery]   - alias explícito para query enriquecida
 * @param {Array}   [input.messages]        - histórico da conversa
 * @param {object}  [input.sessionContext]
 * @param {object}  [input.contextResolution]  - resultado de resolveContextQuery
 * @param {string}  [input.detectedIntent]     - resultado de detectIntent
 * @param {string}  [input.contextAction]      - resultado de detectContextAction
 * @param {boolean} [input.hasActiveAnchor]
 * @param {object}  [input.lastBestProduct]
 * @param {object}  [input.comparisonContext]
 * @param {object}  [input.cso]               - sinais do CSO real (quando disponível)
 * @returns {{ turnType, confidence, reasons, signals, shadowOnly }}
 */
export function classifyMiaTurn(input = {}) {
  const {
    query = "",
    originalQuery = "",
    resolvedQuery: _resolvedQueryAlias = "",
    sessionContext = {},
    contextResolution = {},
    detectedIntent = "",
    contextAction = "",
    hasActiveAnchor = false,
    lastBestProduct = null,
    comparisonContext = null,
    cso = null,
  } = input;

  // Autoridade principal: texto literal do usuário.
  // Regra: originalQuery tem precedência sobre query enriquecida
  // para garantir que o pipeline não contamine a classificação cognitiva.
  const classifyQuery = normalize(originalQuery || query);

  if (!classifyQuery) {
    return {
      turnType: MIA_TURN_TYPES.UNKNOWN,
      confidence: 0,
      reasons: ["empty_query"],
      signals: {},
      shadowOnly: true,
    };
  }

  // Derivar hasActiveAnchor a partir de múltiplas fontes
  const anchorActive =
    hasActiveAnchor ||
    !!(lastBestProduct?.product_name) ||
    !!(sessionContext?.lastBestProduct?.product_name);

  // Derivar comparisonContext a partir de sessionContext se não for fornecido
  const resolvedComparisonContext = comparisonContext ?? {
    locked: !!(sessionContext?.comparisonContextLocked),
    products: sessionContext?.lastComparisonProducts ?? [],
  };

  // Construir sinais estruturados
  const signals = buildTurnSignals({
    q: classifyQuery,
    rawQuery: originalQuery || query, // preservar para detecção de URL
    hasActiveAnchor: anchorActive,
    detectedIntent,
    contextResolution,
    comparisonContext: resolvedComparisonContext,
    cso,
    lastBestProduct: lastBestProduct ?? sessionContext?.lastBestProduct ?? null,
    sessionContext,
  });

  // Classificar com base nos sinais
  const { turnType, confidence, reasons } = resolveTurnTypeFromSignals(
    signals,
    classifyQuery,
    { hasActiveAnchor: anchorActive, contextResolution, detectedIntent }
  );

  // Enriquecer reasons com contexto do CSO quando disponível
  // (apenas informativo — não altera turnType nem confidence)
  if (cso) {
    if (cso.conversationalIntent) {
      reasons.push(`cso_intent:${cso.conversationalIntent}`);
    }
    if (cso.userState?.isFrustrated) {
      reasons.push("cso_user_frustrated");
    }
    if (cso.userState?.isUncertain) {
      reasons.push("cso_user_uncertain");
    }
    if (cso.conversationArc) {
      reasons.push(`cso_arc:${cso.conversationArc}`);
    }
    if (cso.constraintDirection) {
      reasons.push(`cso_constraint:${cso.constraintDirection}`);
    }
  }

  return {
    turnType,
    confidence,
    reasons,
    signals,
    shadowOnly: true, // sempre true neste patch — não controla fluxo
  };
}
