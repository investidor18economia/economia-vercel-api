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

// ─────────────────────────────────────────────────────────────
// Constantes de tipo de turno
// ─────────────────────────────────────────────────────────────

export const MIA_TURN_TYPES = Object.freeze({
  NEW_SEARCH: "NEW_SEARCH",
  FOLLOW_UP: "FOLLOW_UP",
  REFINEMENT: "REFINEMENT",
  COMPARISON: "COMPARISON",
  COMPARISON_FOLLOWUP: "COMPARISON_FOLLOWUP",
  PRIORITY_SHIFT: "PRIORITY_SHIFT",
  REACTION: "REACTION",
  OBJECTION: "OBJECTION",
  EXPLANATION_REQUEST: "EXPLANATION_REQUEST",
  VALUE_QUESTION: "VALUE_QUESTION",
  COMMERCIAL_QUESTION: "COMMERCIAL_QUESTION",
  CONVERSATIONAL: "CONVERSATIONAL",
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
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/[?!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function detectsComparisonSignal(q, { contextResolution, detectedIntent, comparisonContext }) {
  if (detectedIntent === "comparison") return true;
  if (contextResolution?.mode === "comparison_early_explicit") return true;

  const hasOr = /\bou\b/.test(q);
  const hasVs = /\bvs\b|\bversus\b/.test(q);
  // "diferença" só é sinal de comparação quando usada em contexto comparativo
  // (entre dois itens, ou "qual a diferença"). "faz diferença" é sinal de consequência.
  const hasDiff =
    /\b(comparar|compare)\b/.test(q) ||
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
  const isDecisionQuestion = /qual.*eu|eu fico|fico com|me decide|veredito|melhor dos dois|qual e melhor/.test(q);

  return shortQuery && (isAxisQuestion || isDecisionQuestion);
}

function detectsPriorityShiftSignal(q, { hasActiveAnchor, cso }) {
  if (!hasActiveAnchor) return false;
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

  return false;
}

function detectsObjectionSignal(q, { hasActiveAnchor }) {
  if (!hasActiveAnchor) return false;

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

  return false;
}

function detectsValueQuestionSignal(q, { hasActiveAnchor }) {
  if (!hasActiveAnchor) return false;

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

function detectsFollowUpSignal(q, { hasActiveAnchor, detectedIntent, contextResolution }) {
  if (!hasActiveAnchor) return false;
  if (contextResolution?.mode === "anchored_reaction") return true;

  // ── PATCH 6.7 — Guard: "e..." com vocabulário de alternativa → cede para REFINEMENT ─
  //
  // Queries que começam com "e..." mas contêm sinais de segunda posição/alternativa
  // NÃO devem ser classificadas como FOLLOW_UP genérico — elas pedem uma alternativa.
  //
  // AFETA:   "e a segunda opção?", "e depois dele?", "e o plano B?", "e o próximo?"
  // NÃO afeta: "e a bateria?", "e a câmera?", "e o desempenho?" (atributos puros)
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
    /\b(se\s+eu|vc|voce)\s+nao\s+quiser\b/.test(q);

  if (_hasAltFollowUpVocab) return false;

  const followUpPatterns = [
    /^(e|e a|e o|e pra|e para)\s+/,
    /^(esse|essa|ele|ela|o (celular|smartphone|aparelho))\s/,
    /^(e a (bateria|camera|câmera|desempenho|armazenamento|tela))/,
    /^(quanto tempo|quanto dura|quanto aguenta)/,
    /^(como (e|é|fica|funciona))\b/,
    /^(mais|menos)\s+\w+\s*\??$/,
  ];

  return followUpPatterns.some((re) => re.test(q));
}

function detectsReactionSignal(q, { hasActiveAnchor, cso }) {
  if (!hasActiveAnchor) return false;

  const reactionPatterns = [
    /que (legal|bom|otimo|ótimo|interessante|maneiro|bacana|show)/,
    /gostei/,
    /curtir/,
    /nao sabia|não sabia/,
    /verdade/,
    /faz sentido/,
    /entendi/,
    /ok, (entendi|captei|beleza)/,
  ];

  if (reactionPatterns.some((re) => re.test(q))) return true;

  // ── PATCH 5.8C — Standalone acknowledgements ────────────────────────────
  // Com âncora ativa, palavras de confirmação/aceite curtas são REACTION,
  // não CONVERSATIONAL — não devem causar nova busca nem perder âncora.
  // Captura antes de detectsConversationalSignal (step 12 vs step 11).
  if (/^(ok|certo|beleza|show|perfeito|otimo|combinado|captei|claro)$/.test(q)) return true;

  // ── PATCH 6.6 — Acknowledgement expandido: informais + compreensão + aceitação ─
  //
  // Cluster 1 — ACK CURTO INFORMAL (standalone — query deve ser exatamente a palavra):
  //   "boa", "fechado", "blz", "valeu", "massa", "top", "tranquilo", "suave",
  //   "saquei", "entendido", "fechou", "tudo certo"
  //   Proteção: standalone evita "boa câmera", "top de linha", "fechado até 2000".
  //
  // Cluster 2 — ACK DE COMPREENSÃO (multi-word):
  //   "agora ficou claro", "ficou claro", "entendi melhor", "agora entendi"
  //
  // Cluster 3 — ACK DE ACEITAÇÃO (standalone):
  //   "pode ser", "ta certo", "tudo certo", "beleza entao"

  const _standaloneAck =
    /^(boa|fechado|blz|valeu|massa|top|tranquilo|suave|fechou|saquei|entendido|tudo certo|pode ser|ta certo|beleza entao)$/.test(q);

  const _comprehensionAck =
    /\b(ficou claro|agora ficou claro|ficou mais claro|ficou tudo claro)\b/.test(q) ||
    /\bentendi melhor\b/.test(q) ||
    /\bagora entendi\b/.test(q);

  return _standaloneAck || _comprehensionAck;
}

function detectsConversationalSignal(q, { detectedIntent, contextResolution }) {
  if (detectedIntent === "greeting" || detectedIntent === "casual_chat" || detectedIntent === "general_answer") return true;
  if (contextResolution?.mode === "budget_guide" || contextResolution?.mode === "regret_fear_guide") return true;

  const conversationalPatterns = [
    /^(oi|ola|olá|opa|bom dia|boa tarde|boa noite|tudo bem|tudo bom)\b/,
    /^(obrigad|valeu|ok|beleza|show|certo|entendido|captei)\b/,
    /^(quem (e|é) (voce|vc)|o que voce faz|para que serve)\b/,
  ];

  return conversationalPatterns.some((re) => re.test(q));
}

// ─────────────────────────────────────────────────────────────
// Construtor de sinais estruturados (auditável)
// ─────────────────────────────────────────────────────────────

function buildTurnSignals({
  q,
  rawQuery = "",
  hasActiveAnchor,
  detectedIntent,
  contextResolution,
  comparisonContext,
  cso,
  lastBestProduct,
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

  return {
    hasActiveAnchor: !!hasActiveAnchor,
    hasBudget: /\b(ate|até|por|abaixo|menos de)\s+r?\$?\s*\d/.test(q),
    mentionsProduct: /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|redmi|poco|a\d{2}|s\d{2}|s24|s25)\b/.test(q),
    mentionsLink: /https?:\/\//.test(linkCheck),
    // PATCH 5.2C — asksWhy expandido: inclui falha de compreensão sobre recomendação
    asksWhy: /por que|qual o motivo|como chegou|logica|raciocinio|nao entendi|nao ficou claro/.test(q),
    asksValue: /vale a pena|compensa|custo beneficio|devo comprar/.test(q),
    asksAlternative: /tem outro|tem algo|alternativa|outro opcao|outra opcao/.test(q),
    // PATCH 5.2C — sinais diagnósticos para auditoria de EXPLANATION_REQUEST
    asksComprehension: /(nao entendi|nao compreendi|nao ficou claro|nao percebi|ficou confuso|nao esta claro)/.test(q),
    hasDecisionReference: /(escolha|decisao|recomendacao|indicacao|opcao)\b/.test(q),
    isComparison: detectsComparisonSignal(q, { contextResolution, detectedIntent, comparisonContext }),
    isComparisonFollowUp: detectsComparisonFollowUpSignal(q, { comparisonContext, contextResolution, hasActiveAnchor }),
    isPriorityShift: detectsPriorityShiftSignal(q, { hasActiveAnchor, cso }),
    isObjection: detectsObjectionSignal(q, { hasActiveAnchor }),
    isValueQuestion: detectsValueQuestionSignal(q, { hasActiveAnchor }),
    isExplanationRequest: detectsExplanationRequestSignal(q, { hasActiveAnchor, cso }),
    // PATCH 5.4 — subtipo de intenção pós-decisão (auditável, não controla fluxo diretamente)
    decisionExplanation: detectsPostDecisionExplanationSignal(q, { hasActiveAnchor, cso }),
    isCommercialQuestion: detectsCommercialQuestionSignal(q, { hasActiveAnchor, comparisonContext, rawQuery }),
    isRefinement: detectsRefinementSignal(q, { hasActiveAnchor, detectedIntent, contextResolution }),
    isFollowUp: detectsFollowUpSignal(q, { hasActiveAnchor, detectedIntent, contextResolution }),
    isReaction: detectsReactionSignal(q, { hasActiveAnchor, cso }),
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
  };
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
