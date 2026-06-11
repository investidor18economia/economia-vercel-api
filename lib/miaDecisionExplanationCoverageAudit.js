// Categoria unificada — deve espelhar POST_DECISION_EXPLANATION_CATEGORY de miaCognitiveRouter.js
const POST_DECISION_EXPLANATION_CATEGORY = "POST_DECISION_EXPLANATION"; // PATCH 5.5C

/**
 * miaDecisionExplanationCoverageAudit.js
 *
 * PATCH 5.4A — Decision Explanation Coverage Audit
 *
 * Módulo EXCLUSIVAMENTE diagnóstico. Zero alterações de comportamento.
 *
 * Objetivo: identificar por que queries pós-decisão NÃO ativam a camada
 * criada no PATCH 5.4 (detectsPostDecisionExplanationSignal), expondo
 * lacunas de cobertura sem alterar nenhuma lógica de classificação.
 *
 * Princípio: MIA owns the intelligence. Cognição deve ser inspecionável.
 *
 * Como usar:
 *   const audit = buildDecisionExplanationCoverageAudit({
 *     query,         // texto original do usuário
 *     hasAnchor,     // boolean
 *     signals,       // objeto signals de classifyMiaTurn (opcional)
 *     decisionExplanation, // signals.decisionExplanation (opcional)
 *     actualTurnType,       // turnType observado (opcional)
 *   });
 *
 * @module miaDecisionExplanationCoverageAudit
 */

// ─────────────────────────────────────────────────────────────
// Normalização local (espelho do cognitive router — sem importar)
// ─────────────────────────────────────────────────────────────

function _normalize(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────
// ESPELHOS DOS PADRÕES ATUAIS DO PATCH 5.4
// Reproduzidos aqui para diagnóstico transparente.
// NÃO alterar sem sincronizar com detectsPostDecisionExplanationSignal.
// ─────────────────────────────────────────────────────────────

/**
 * Espelho do guard _hasAlternativeOrRefinementSignal.
 * Retorna true se a query deveria ser bloqueada (pedido de alternativa).
 */
function _mirrorGuard(q) {
  if (/\b(tem outro|tem algo|alternativa|outro opcao|outra opcao|mais barato|mais barata|mais economico|outro modelo|outra marca)\b/.test(q)) return true;
  if (/\b(troca|trocar|mudaria|mudar de|prefiro outro|quero outro|diferente)\b/.test(q)) return true;
  if (/\b(nao quero esse|nao quero essa)\b/.test(q)) return true;
  if (/\bcomparado (com|ao|a)\b/.test(q) || /\bvs\b|\bversus\b/.test(q)) return true;
  return false;
}

/**
 * Espelho do Cluster 4 (consequência prática).
 * Retorna os padrões que dispararam, ou array vazio.
 * PATCH 5.4B — atualizado com cobertura morfológica expandida.
 */
function _mirrorConsequenceCluster(q) {
  const fired = [];
  if (/\b(na pratica|na prática|no dia a dia|no cotidiano|no uso real)\b/.test(q)) fired.push("practical_context_reference");
  if (/\b(o que (muda|altera|afeta|impacta))\b/.test(q)) fired.push("consequence_verb_present_tense");
  if (/\b(consequencia|consequência|consequencias)\b/.test(q)) fired.push("consequence_noun_any_form");  // + plural
  if (/\bfaz diferenca\b|\bfaz diferença\b/.test(q)) fired.push("faz_diferenca_phrase");
  if (/\bimpacto\b/.test(q)) fired.push("impacto_standalone");  // PATCH 5.4B: standalone
  if (/\b(diferenca (pratica|prática|real|concreta)|diferença (pratica|prática|real|concreta))\b/.test(q)) fired.push("diferenca_with_qualifier");
  if (/\bafet\w+\b/.test(q)) fired.push("afet_stem_any_form");          // PATCH 5.4B: afetar família
  if (/\b(efeito|efeitos)\b/.test(q)) fired.push("efeito_noun");         // PATCH 5.4B: efeito(s)
  return fired;
}

/**
 * Espelho do Cluster 5 (ganho / benefício).
 * Retorna os padrões que dispararam, ou array vazio.
 * PATCH 5.4B — atualizado com cobertura morfológica expandida.
 */
function _mirrorBenefitCluster(q) {
  const fired = [];
  if (/\bo que (eu |)(ganho|ganh\w+)\b/.test(q)) fired.push("ganh_stem_any_form");  // PATCH 5.4B: família ganh-
  if (/\bqual (a |o |e a |e o |seria a |seria o |seria |)(vantagem|beneficio|benefício|diferencial|ponto forte)\b/.test(q)) fired.push("benefit_noun_with_qual_or_modal");  // + seria
  if (/\b(vantagens|beneficios|benefícios)\b/.test(q)) fired.push("benefit_noun_plural");  // PATCH 5.4B: plurais
  if (/\bem que (ele|ela|isso) (se destaca|e melhor|é melhor|fica melhor|e superior|é superior)\b/.test(q)) fired.push("highlight_comparison_phrase");
  if (/\bo que (ele|ela) (tem de bom|tem de melhor|tem de especial)\b/.test(q)) fired.push("product_quality_phrase");
  return fired;
}

/**
 * Espelho do Cluster 8 (desafio de confiança/estabilidade — PATCH 5.5B).
 * Retorna os padrões que dispararam, ou array vazio.
 * NÃO sincronizar sem atualizar detectsPostDecisionExplanationSignal.
 */
function _mirrorConfidenceChallengeCluster(q) {
  const fired = [];

  // PRE-GUARD: "mudaria" + referência de opinião/decisão
  if (
    /\bmudaria\b/.test(q) &&
    /\b(de (ideia|opiniao)|sua (opiniao|recomendacao|escolha|decisao))\b/.test(q)
  ) fired.push("mudaria_opiniao_pre_guard");

  // Sinal A — "por que não" + verbo de não-mudança
  if (
    /\bpor que\b/.test(q) &&
    /\bnao\b/.test(q) &&
    /\b(mudou|trocou|alterou|manteve|continuou|persistiu)\b/.test(q)
  ) fired.push("por_que_nao_nao_mudou");

  // Sinal B — "ainda" + verbo de comprometimento
  if (
    /\bainda\b/.test(q) &&
    /\b(manteria|escolheria|recomendaria|indicaria|optaria|sustentaria|confiaria)\b/.test(q)
  ) fired.push("ainda_verbo_comprometimento");

  // Sinal C — "o que faria" + reconsiderar
  if (
    /\bo que (faria|te faria|lhe faria|faz)\b/.test(q) &&
    /\b(mudar|repensar|reconsiderar|rever|revisar)\b/.test(q)
  ) fired.push("o_que_faria_reconsiderar");

  // Sinal D — desafio de confiança direto
  if (/\btem certeza\b/.test(q) || /\b(voce |vc )?(confia|confiaria)\b/.test(q)) fired.push("confianca_direta");

  // Sinal E — estabilidade da recomendação
  if (
    /\b(sustenta|sustentaria|resiste|resistiria)\b/.test(q) &&
    /\b(escolha|recomendacao|decisao|indicacao|essa opiniao)\b/.test(q)
  ) fired.push("estabilidade_recomendacao");

  return fired;
}

/**
 * Espelho do Cluster 7 (defesa da decisão — PATCH 5.5A).
 * Retorna os padrões que dispararam, ou array vazio.
 * NÃO sincronizar sem atualizar detectsPostDecisionExplanationSignal.
 */
function _mirrorDefenseCluster(q) {
  const fired = [];
  // Sinal A — continuidade temporal + validade
  if (
    /\bainda\b/.test(q) &&
    /\b(vale|compensa|e (bom|boa|certo|certa|valido|valida|o melhor|a melhor)|faz sentido|recomendado|recomendada|indicado|indicada)\b/.test(q)
  ) fired.push("continuidade_temporal_validade");

  // Sinal B — "por que" + âncora semântica de validade da decisão
  if (
    /\bpor que\b/.test(q) &&
    (/\bainda\b/.test(q) || /\ba pena\b/.test(q) || /\bcompensa\b/.test(q) || /\bfaz sentido\b/.test(q))
  ) fired.push("por_que_justificacao_validade");

  // Sinal C — dúvida existencial ("mesmo"/"realmente") + validade
  if (
    /\b(vale|compensa|faz sentido)\b/.test(q) &&
    /\b(mesmo|realmente|de verdade)\b/.test(q)
  ) fired.push("duvida_existencial_validade");

  // Sinal D — "continua" + estado de validade contínuo
  if (
    /\bcontinua\b/.test(q) &&
    /\b(valendo|compensando|fazendo sentido|sendo (bom|boa|certo|certa|valido|valida|o melhor|a melhor|recomendado|recomendada))\b/.test(q)
  ) fired.push("continuacao_estado_validade");

  // Sinal E — formulações diretas de defesa/continuidade
  if (
    /\bainda (faz sentido|e (boa|bom|o melhor|a melhor|valido|valida|certo|certa))\b/.test(q) ||
    /\bcontinua fazendo sentido\b/.test(q) ||
    /\bfaz sentido manter\b/.test(q)
  ) fired.push("defesa_direta_formulacao");

  return fired;
}

/**
 * Espelho do Cluster 6 (perda / tradeoff).
 * Retorna os padrões que dispararam, ou array vazio.
 * PATCH 5.4B — atualizado com cobertura morfológica expandida.
 */
function _mirrorLossCluster(q) {
  const fired = [];
  if (/\bo que (eu |)(perco|perd\w+)\b/.test(q)) fired.push("perd_stem_any_form");  // PATCH 5.4B: família perd-
  if (/\b(perda|perdas)\b/.test(q)) fired.push("perda_noun_any_form");               // PATCH 5.4B: substantivos
  if (/\b(abro mao|abro mão|abrir mao|abrir mão)\b/.test(q)) fired.push("abrir_mao_phrase");
  if (/\bqual (o |a |)(tradeoff|sacrificio|sacrifício|desvantagem|limitacao|limitação|ponto fraco)\b/.test(q)) fired.push("loss_noun_with_qual");
  if (/\b(perde (em|no|na|com))\b/.test(q)) fired.push("perde_with_preposition");
  return fired;
}

// ─────────────────────────────────────────────────────────────
// SONDAS SEMÂNTICAS (probes) — mais amplas que os clusters atuais
//
// Objetivo: detectar a INTENÇÃO SEMÂNTICA presente na query,
// independentemente da forma verbal/morfológica usada.
//
// Se a sonda dispara mas o cluster não: há uma lacuna de cobertura.
// Se a sonda não dispara: a query genuinamente não contém essa intenção.
//
// As sondas usam RAÍZES/STEMS para cobrir todas as conjugações.
// Elas NÃO controlam classificação — apenas medem cobertura.
// ─────────────────────────────────────────────────────────────

/**
 * Sonda de intenção de PERDA/SACRIFÍCIO (qualquer forma verbal/nominal).
 *
 * Cobre:
 *   Formas do verbo "perder": perco, perde, perder, perderia, perderei,
 *   perdendo, perda, perdas, perdemos, perderiam, etc.
 *   Formas de renúncia/sacrifício: sacrificar, renunciar, abrir mão.
 *
 * @param {string} q — query normalizada
 * @returns {{ active: boolean, detectedSignals: string[] }}
 */
function _probeLossSemantic(q) {
  const signals = [];

  // Raiz "perco" (forma irregular do presente de "perder")
  if (/\bperco\b/.test(q)) signals.push("perco_present");

  // Raiz "perd-" cobre: perde, perderia, perderei, perder, perdendo,
  // perda, perdas, perdemos, perderam, perderiam, perdesse, etc.
  if (/\bperd\w*/.test(q)) signals.push("perd_stem_any_form");

  // Formas de "abrir mão" em qualquer conjugação
  if (/\b(abro|abrir|abriria|abrirei|abrindo)\b.*\bmao\b/.test(q)) signals.push("abrir_mao_any_form");

  // Raiz "sacrific-": sacrifício, sacrificar, sacrificaria, etc.
  if (/\bsacrific\w*/.test(q)) signals.push("sacrific_stem");

  // Raiz "renunci-": renuncio, renunciar, renunciaria, etc.
  if (/\brenunci\w*/.test(q)) signals.push("renunci_stem");

  // Substantivos de perda no plural: perdas, renúncias
  if (/\b(perdas|renuncias|renúncias)\b/.test(q)) signals.push("loss_noun_plural");

  return { active: signals.length > 0, detectedSignals: signals };
}

/**
 * Sonda de intenção de GANHO/BENEFÍCIO (qualquer forma verbal/nominal).
 *
 * Cobre:
 *   Formas do verbo "ganhar": ganho, ganha, ganhar, ganharia, ganharei,
 *   ganhando, ganhos, ganhariam, etc.
 *   Substantivos plurais: vantagens, benefícios, ganhos.
 *
 * @param {string} q — query normalizada
 * @returns {{ active: boolean, detectedSignals: string[] }}
 */
function _probeBenefitSemantic(q) {
  const signals = [];

  // Raiz "ganh-": ganho, ganha, ganhar, ganharia, ganharei, ganhando, ganhos
  if (/\bganh\w*/.test(q)) signals.push("ganh_stem_any_form");

  // Substantivos de benefício no SINGULAR — detecta quando o cluster
  // não dispara por variação sintática (ex: "qual seria a vantagem")
  if (/\b(vantagem|beneficio|diferencial)\b/.test(q)) signals.push("benefit_noun_singular");

  // Plurais de substantivos de benefício: vantagens, benefícios, diferenciais
  if (/\b(vantagens|beneficios|benefícios|diferenciais)\b/.test(q)) signals.push("benefit_noun_plural");

  // "quais (são|sao) (os|as) benefícios/vantagens"
  if (/\bquais (sao|são)\b.*\b(beneficio|benefício|vantagem|ganho)\b/.test(q)) signals.push("benefit_plural_question");

  // Formas de "aproveitar": aproveito, aproveitar, aproveitaria
  if (/\baproveit\w*/.test(q)) signals.push("aproveit_stem");

  return { active: signals.length > 0, detectedSignals: signals };
}

/**
 * Sonda de intenção de DESAFIO DE CONFIANÇA/ESTABILIDADE (PATCH 5.5B).
 *
 * Cobre a intenção semântica de questionar a ESTABILIDADE da decisão:
 *   - Por que não mudou a recomendação?
 *   - Você ainda sustentaria/escolheria/recomendaria?
 *   - O que faria você reconsiderar?
 *   - Você tem certeza?
 *   - A recomendação resiste ao questionamento?
 *
 * @param {string} q — query normalizada
 * @returns {{ active: boolean, detectedSignals: string[] }}
 */
function _probeConfidenceChallengeSemantic(q) {
  const signals = [];

  // Verbos de não-mudança (passado): mudou, trocou, manteve, persistiu
  if (/\b(mudou|trocou|alterou|manteve)\b/.test(q)) signals.push("verbo_nao_mudanca_passado");

  // Verbos de comprometimento condicional: manteria, escolheria, recomendaria
  if (/\b(manteria|escolheria|recomendaria|indicaria|optaria|sustentaria|confiaria)\b/.test(q)) signals.push("verbo_comprometimento_condicional");

  // Verbos de reconsideração: repensar, reconsiderar, rever
  if (/\b(repensar|reconsiderar|rever|revisar)\b/.test(q)) signals.push("verbo_reconsideracao");

  // Certeza/confiança
  if (/\b(certeza|confia|confiaria)\b/.test(q)) signals.push("certeza_confianca");

  // Estabilidade da recomendação
  if (/\b(sustenta|sustentaria|resiste|resistiria|estabilidade)\b/.test(q)) signals.push("estabilidade");

  // "por que não" interrogativo
  if (/\bpor que\b/.test(q) && /\bnao\b/.test(q)) signals.push("interrogativo_nao");

  // "o que faria" — hipotético de mudança
  if (/\bo que (faria|te faria|lhe faria)\b/.test(q)) signals.push("hipotetico_mudanca");

  // "mudaria" (em contexto de opinião) — pré-guard
  if (/\bmudaria\b/.test(q)) signals.push("mudaria_presente");

  return { active: signals.length >= 2, detectedSignals: signals };
}

/**
 * Sonda de intenção de DEFESA DA DECISÃO (PATCH 5.5A).
 *
 * Cobre a intenção semântica de questionar a VALIDADE CONTÍNUA da decisão:
 *   - Marcadores de continuidade: ainda, continua, segue, mantém
 *   - Marcadores de validade: vale, compensa, faz sentido, é bom
 *   - Marcadores de justificação: por que + validade
 *   - Marcadores de dúvida: mesmo, realmente + validade
 *
 * @param {string} q — query normalizada
 * @returns {{ active: boolean, detectedSignals: string[] }}
 */
function _probeDefenseSemantic(q) {
  const signals = [];

  // Marcadores de continuidade temporal
  if (/\bainda\b/.test(q)) signals.push("continuidade_ainda");
  if (/\bcontinua\b/.test(q)) signals.push("continuidade_continua");
  if (/\bsegue\b/.test(q)) signals.push("continuidade_segue");

  // Marcadores de validade/compensação
  if (/\b(vale|valendo)\b/.test(q)) signals.push("validade_vale");
  if (/\bcompensa\b/.test(q)) signals.push("validade_compensa");
  if (/\bfaz sentido\b/.test(q)) signals.push("validade_faz_sentido");

  // Dúvida existencial
  if (/\b(mesmo|realmente|de verdade)\b/.test(q)) signals.push("duvida_existencial");

  // "por que" (pedindo justificação)
  if (/\bpor que\b/.test(q)) signals.push("justificacao_por_que");

  return { active: signals.length >= 2, detectedSignals: signals };
}

/**
 * Sonda de intenção de CONSEQUÊNCIA/IMPACTO (qualquer forma verbal/nominal).
 *
 * Cobre:
 *   Formas de "impactar": impacta, impactaria, impactar, impactos.
 *   Formas de "afetar": afeta, afetaria, afetar, afetando.
 *   Formas de "mudar": muda, mudaria, mudar, mudanças.
 *   "consequências" (plural), "efeito(s)", "resultado(s)".
 *   "qual seria o impacto" — impacto sem qualificador.
 *
 * @param {string} q — query normalizada
 * @returns {{ active: boolean, detectedSignals: string[] }}
 */
function _probeConsequenceSemantic(q) {
  const signals = [];

  // Raiz "impact-": impacta, impactaria, impactar, impacto, impactos
  if (/\bimpact\w*/.test(q)) signals.push("impact_stem_any_form");

  // Raiz "afet-": afeta, afetaria, afetar, afetando
  if (/\bafet\w*/.test(q)) signals.push("afet_stem_any_form");

  // Raiz "mud-": muda, mudaria, mudar, mudança, mudanças
  if (/\bmud\w*/.test(q)) signals.push("mud_stem_any_form");

  // Plural de consequência: "consequências"
  if (/\bconsequencias\b/.test(q)) signals.push("consequence_noun_plural");

  // "efeito(s)" — resultado prático de uma escolha
  if (/\b(efeito|efeitos)\b/.test(q)) signals.push("efeito_noun");

  // "resultado(s)" em contexto de escolha
  if (/\b(resultado|resultados)\b/.test(q)) signals.push("resultado_noun");

  return { active: signals.length > 0, detectedSignals: signals };
}

// ─────────────────────────────────────────────────────────────
// CLASSIFICAÇÃO DE LACUNA
// Determina o TIPO de cobertura ausente quando a sonda é positiva
// mas o cluster não disparou.
// ─────────────────────────────────────────────────────────────

/**
 * Categorias de lacuna de cobertura.
 */
export const COVERAGE_GAP_CATEGORIES = Object.freeze({
  ALREADY_COVERED:           "ALREADY_COVERED",            // cluster já cobria
  VERB_CONJUGATION_GAP:      "VERB_CONJUGATION_GAP",       // forma verbal diferente
  MORPHOLOGICAL_VARIATION:   "MORPHOLOGICAL_VARIATION",    // plural, derivado, etc.
  SYNTACTIC_VARIATION:       "SYNTACTIC_VARIATION",        // palavras adicionais na estrutura
  SEMANTIC_BREADTH_GAP:      "SEMANTIC_BREADTH_GAP",       // conceito relacionado não coberto
  GUARD_BLOCKED:             "GUARD_BLOCKED",              // guard de alternativa bloqueou
  NO_ACTIVE_ANCHOR:          "NO_ACTIVE_ANCHOR",           // sem âncora
  NO_SEMANTIC_INTENT:        "NO_SEMANTIC_INTENT",         // intenção genuinamente ausente
  // PATCH 5.5A
  VALUE_QUESTION_MISCLASSIFIED: "VALUE_QUESTION_MISCLASSIFIED", // defense capturado como VALUE_QUESTION
  // PATCH 5.5B
  CONVERSATIONAL_MISCLASSIFIED: "CONVERSATIONAL_MISCLASSIFIED", // confidence_challenge caiu como CONVERSATIONAL
});

/**
 * Verifica se a query usa formas verbais que não são presente do indicativo.
 * Condicional, futuro e infinitivo com auxiliar indicam VERB_CONJUGATION_GAP.
 */
function _hasNonPresentVerbForm(q) {
  // Condicional: terminações -eria, -aria, -iria (ganharia, perderia, mudaria)
  if (/\w+(eria|aria|iria)\b/.test(q)) return true;
  // Futuro: terminações -erei, -arei, -irei, -arao, -erao, -irao
  if (/\w+(erei|arei|irei|arao|erao|irao)\b/.test(q)) return true;
  // Auxiliares de futuro/possibilidade com infinitivo
  if (/\b(vou|vai|vamos|vao|ia|iria|irei|posso|poderia)\b.*\b\w+r\b/.test(q)) return true;
  // Gerúndio + auxiliar: "estaria perdendo", "estaria ganhando"
  if (/\b(estaria|estou|estava)\b.*\b\w+ndo\b/.test(q)) return true;
  return false;
}

/**
 * Verifica se a query usa plural de substantivos de resultado/consequência/ganho.
 */
function _hasNounPluralForm(q) {
  return (
    /\b(consequencias|vantagens|beneficios|ganhos|perdas|impactos|efeitos|resultados|limitacoes|desvantagens)\b/.test(q)
  );
}

/**
 * Verifica se há palavras adicionais entre elementos estruturais que poderiam
 * impedir o match (ex: "qual seria o impacto" — "seria" entre "qual" e "o impacto").
 */
function _hasStructuralInterference(q) {
  // "qual [algo] o/a [substantivo]" — palavra extra entre "qual" e o artigo
  return /\bqual\b\s+\w+\s+(o|a|os|as)\b/.test(q);
}

/**
 * Classifica o tipo de lacuna dado que o cluster não disparou mas a sonda sim.
 */
function _classifyGap(q, clusterName) {
  if (_hasNonPresentVerbForm(q)) {
    return {
      category: COVERAGE_GAP_CATEGORIES.VERB_CONJUGATION_GAP,
      diagnosis: `Cluster '${clusterName}' cobre apenas formas do presente do indicativo. ` +
        `A query usa condicional, futuro ou auxiliar+infinitivo (ex: "perderia", "ganharia", "vai perder"). ` +
        `O mesmo sinal semântico existe, mas em forma verbal não coberta.`,
    };
  }

  if (_hasNounPluralForm(q)) {
    return {
      category: COVERAGE_GAP_CATEGORIES.MORPHOLOGICAL_VARIATION,
      diagnosis: `Cluster '${clusterName}' cobre substantivos no singular. ` +
        `A query usa forma plural (ex: "consequências", "benefícios", "vantagens"). ` +
        `Derivação morfológica não coberta.`,
    };
  }

  if (_hasStructuralInterference(q)) {
    return {
      category: COVERAGE_GAP_CATEGORIES.SYNTACTIC_VARIATION,
      diagnosis: `Cluster '${clusterName}' assume estrutura sintática específica (ex: "qual o X", "qual a X"). ` +
        `A query tem elementos adicionais entre os termos estruturais ` +
        `(ex: "qual seria o impacto", "qual seria a vantagem"). ` +
        `A mesma intenção existe, mas com variação sintática não coberta.`,
    };
  }

  return {
    category: COVERAGE_GAP_CATEGORIES.SEMANTIC_BREADTH_GAP,
    diagnosis: `Cluster '${clusterName}' não cobre este vocabulário semântico específico. ` +
      `A sonda detectou intenção relacionada, mas o cluster não tem padrão para este termo. ` +
      `Exemplo: "efeito", "resultado", "aproveitaria", "renunciaria".`,
  };
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL — export
// ─────────────────────────────────────────────────────────────

/**
 * Constrói um diagnóstico detalhado de cobertura para intenções pós-decisão.
 *
 * Identifica por que uma query não ativou a camada PATCH 5.4,
 * classificando o tipo de lacuna de cobertura.
 *
 * SOMENTE diagnóstico — nunca altera classificação.
 *
 * @param {object} input
 * @param {string}  input.query              — texto original do usuário
 * @param {boolean} [input.hasAnchor]        — se âncora estava ativa
 * @param {object}  [input.signals]          — signals de classifyMiaTurn (opcional)
 * @param {object}  [input.decisionExplanation] — signals.decisionExplanation (opcional)
 * @param {string}  [input.actualTurnType]   — turnType observado (opcional)
 * @returns {object} diagnóstico de cobertura
 */
export function buildDecisionExplanationCoverageAudit(input = {}) {
  const {
    query = "",
    hasAnchor = false,
    signals = null,
    decisionExplanation = null,
    actualTurnType = null,
    cso = null,
    // PATCH 5.5D — contexto de sessão para auditar presença da decision memory
    sessionContext = null,
  } = input;

  // ── Presença da decision memory (PATCH 5.5D) ───────────────
  // Reflete os campos que o rich explanation path teria disponíveis
  // para o subtype atual. Não inventa dados — apenas reporta cobertura.
  const _sc = sessionContext || {};
  const _lastWinnerAdv = Array.isArray(_sc.lastWinnerAdvantages) ? _sc.lastWinnerAdvantages : [];
  const _lastWinnerSac = Array.isArray(_sc.lastWinnerSacrifices) ? _sc.lastWinnerSacrifices : [];
  const decisionMemoryPresence = {
    hasLastAxis:             !!((_sc.lastAxis) || (_sc.lastPriority)),
    hasLastMainConsequence:  !!(_sc.lastMainConsequence),
    hasLastTradeoff:         !!(_sc.lastTradeoff),
    hasLastDecisionReason:   !!(_sc.lastDecisionReason),
    winnerAdvantagesCount:   _lastWinnerAdv.length,
    winnerSacrificesCount:   _lastWinnerSac.length,
    // richContextAvailable: true quando os 3 campos base estão presentes
    richContextAvailable:    !!(
      ((_sc.lastAxis) || (_sc.lastPriority)) &&
      _sc.lastMainConsequence &&
      _sc.lastTradeoff
    ),
    sessionContextProvided: (sessionContext !== null),
  };

  const q = _normalize(query);
  const decisionActive = !!(decisionExplanation?.active || signals?.decisionExplanation?.active);
  // PATCH 5.5C — categoria unificada extraída do sinal ou inferida quando active
  const postDecisionCategory =
    decisionExplanation?.category ||
    signals?.decisionExplanation?.category ||
    (decisionActive ? POST_DECISION_EXPLANATION_CATEGORY : null);

  // ── Pré-condições ──────────────────────────────────────────
  if (!q) {
    return {
      auditVersion: "5.5D",
      query: "",
      normalizedQuery: "",
      hasAnchor: false,
      decisionExplanationActive: false,
      actualTurnType,
      guardBlocked: false,
      clusterMirrors: { consequence: [], benefit: [], loss: [], defense: [], confidence_challenge: [] },
      semanticProbes: {
        consequence: { active: false, detectedSignals: [] },
        benefit: { active: false, detectedSignals: [] },
        loss: { active: false, detectedSignals: [] },
        defense: { active: false, detectedSignals: [] },
        confidence_challenge: { active: false, detectedSignals: [] },
      },
      gaps: [],
      likelyCoverageGap: false,
      expectedCluster: null,
      missingSignals: [],
      failedGuards: [],
      suggestedFix: "EMPTY_QUERY",
      valueQuestionMisclassified: false,
      conversationalMisclassified: false,
      postDecisionCategory: null,
      decisionMemoryPresence,
    };
  }

  if (!hasAnchor) {
    return {
      auditVersion: "5.5D",
      query,
      normalizedQuery: q,
      hasAnchor: false,
      decisionExplanationActive: false,
      actualTurnType,
      guardBlocked: false,
      clusterMirrors: { consequence: [], benefit: [], loss: [], defense: [], confidence_challenge: [] },
      semanticProbes: {
        consequence: { active: false, detectedSignals: [] },
        benefit: { active: false, detectedSignals: [] },
        loss: { active: false, detectedSignals: [] },
        defense: { active: false, detectedSignals: [] },
        confidence_challenge: { active: false, detectedSignals: [] },
      },
      gaps: [],
      likelyCoverageGap: false,
      expectedCluster: null,
      missingSignals: ["active_anchor_required"],
      failedGuards: [],
      suggestedFix: "NO_ACTIVE_ANCHOR — clusters only activate with an active recommendation anchor.",
      valueQuestionMisclassified: false,
      conversationalMisclassified: false,
      postDecisionCategory: null,
      decisionMemoryPresence,
    };
  }

  // ── Guard ──────────────────────────────────────────────────
  const guardBlocked = _mirrorGuard(q);

  // ── Mirrors dos clusters atuais ────────────────────────────
  const consequenceMatches = _mirrorConsequenceCluster(q);
  const benefitMatches = _mirrorBenefitCluster(q);
  const lossMatches = _mirrorLossCluster(q);
  const defenseMatches = _mirrorDefenseCluster(q);              // PATCH 5.5A
  const confidenceChallengeMatches = _mirrorConfidenceChallengeCluster(q); // PATCH 5.5B

  const clusterMirrors = {
    consequence: consequenceMatches,
    benefit: benefitMatches,
    loss: lossMatches,
    defense: defenseMatches,                                    // PATCH 5.5A
    confidence_challenge: confidenceChallengeMatches,           // PATCH 5.5B
  };

  // ── Sondas semânticas ──────────────────────────────────────
  const consequenceProbe = _probeConsequenceSemantic(q);
  const benefitProbe = _probeBenefitSemantic(q);
  const lossProbe = _probeLossSemantic(q);
  const defenseProbe = _probeDefenseSemantic(q);               // PATCH 5.5A
  const confidenceChallengeProbe = _probeConfidenceChallengeSemantic(q); // PATCH 5.5B

  const semanticProbes = {
    consequence: consequenceProbe,
    benefit: benefitProbe,
    loss: lossProbe,
    defense: defenseProbe,                                      // PATCH 5.5A
    confidence_challenge: confidenceChallengeProbe,             // PATCH 5.5B
  };

  // ── Análise de lacunas por cluster ─────────────────────────
  const gaps = [];

  for (const [clusterName, mirrorMatches, probe] of [
    ["consequence", consequenceMatches, consequenceProbe],
    ["benefit", benefitMatches, benefitProbe],
    ["loss", lossMatches, lossProbe],
    ["defense", defenseMatches, defenseProbe],                  // PATCH 5.5A
    ["confidence_challenge", confidenceChallengeMatches, confidenceChallengeProbe], // PATCH 5.5B
  ]) {
    const clusterMatched = mirrorMatches.length > 0;
    const probeActive = probe.active;

    if (guardBlocked) {
      gaps.push({
        cluster: clusterName,
        probeActive,
        clusterMatched,
        gapCategory: COVERAGE_GAP_CATEGORIES.GUARD_BLOCKED,
        diagnosis: "Guard de alternativa/refinamento bloqueou a detecção pós-decisão.",
      });
    } else if (clusterMatched) {
      gaps.push({
        cluster: clusterName,
        probeActive,
        clusterMatched,
        gapCategory: COVERAGE_GAP_CATEGORIES.ALREADY_COVERED,
        diagnosis: `Cluster '${clusterName}' cobriu corretamente. Padrões disparados: ${mirrorMatches.join(", ")}.`,
      });
    } else if (probeActive && !clusterMatched) {
      // Sonda detectou intenção mas cluster não disparou → LACUNA
      const { category, diagnosis } = _classifyGap(q, clusterName);
      gaps.push({
        cluster: clusterName,
        probeActive: true,
        clusterMatched: false,
        gapCategory: category,
        probedSignals: probe.detectedSignals,
        diagnosis,
      });
    } else {
      // Sonda e cluster ambos negativos → sem intenção semântica detectada
      gaps.push({
        cluster: clusterName,
        probeActive: false,
        clusterMatched: false,
        gapCategory: COVERAGE_GAP_CATEGORIES.NO_SEMANTIC_INTENT,
        diagnosis: `Nenhuma intenção semântica de '${clusterName}' detectada na query.`,
      });
    }
  }

  // ── Sumarização ────────────────────────────────────────────
  const coverageGaps = gaps.filter((g) =>
    g.gapCategory !== COVERAGE_GAP_CATEGORIES.ALREADY_COVERED &&
    g.gapCategory !== COVERAGE_GAP_CATEGORIES.NO_SEMANTIC_INTENT &&
    g.gapCategory !== COVERAGE_GAP_CATEGORIES.GUARD_BLOCKED
  );

  const likelyCoverageGap = coverageGaps.length > 0 && !decisionActive;

  const expectedCluster = coverageGaps.length > 0
    ? coverageGaps[0].cluster
    : (gaps.find((g) => g.clusterMatched)?.cluster ?? null);

  const missingSignals = coverageGaps.flatMap((g) => g.probedSignals || []);

  const failedGuards = guardBlocked
    ? ["_hasAlternativeOrRefinementSignal"]
    : [];

  // PATCH 5.5A — detectar misclassificação VALUE_QUESTION → decision_defense
  const valueQuestionMisclassified =
    actualTurnType === "VALUE_QUESTION" &&
    defenseMatches.length > 0 &&
    !guardBlocked;

  // PATCH 5.5B — detectar misclassificação CONVERSATIONAL → confidence_challenge
  // Ativado quando: turnType é CONVERSATIONAL, mas mirrors ou CSO indicam
  // que deveria ser confidence_challenge.
  const csoTrustChallengeSeen = cso?.conversationalIntent === "trust_challenge";
  const conversationalMisclassified =
    actualTurnType === "CONVERSATIONAL" &&
    (confidenceChallengeMatches.length > 0 || csoTrustChallengeSeen) &&
    !guardBlocked;

  // Recomendação cirúrgica
  let suggestedFix = "NONE_NEEDED";
  if (guardBlocked) {
    suggestedFix = "GUARD_REVIEW — avaliar se o sinal de substituição é genuíno ou está bloqueando intenção pós-decisão válida.";
  } else if (conversationalMisclassified) {
    suggestedFix = "PATCH_5.5B_CONFIDENCE_CHALLENGE — query tem sinais de desafio de confiança/estabilidade mas foi classificada como CONVERSATIONAL. " +
      "Verificar se Cluster 8 (confidence_challenge) foi ativado no router. " +
      (csoTrustChallengeSeen ? "CSO trust_challenge detectado — confirmar se cso está sendo passado para detectsPostDecisionExplanationSignal." : "");
  } else if (valueQuestionMisclassified) {
    suggestedFix = "PATCH_5.5A_DEFENSE — query tem sinais de defesa da decisão (continuidade/validade) mas foi classificada como VALUE_QUESTION. " +
      "Verificar se Cluster 7 (decision_defense) foi ativado no router.";
  } else if (coverageGaps.some((g) => g.gapCategory === COVERAGE_GAP_CATEGORIES.VERB_CONJUGATION_GAP)) {
    suggestedFix = "PATCH_5.4B_VERB_CONJUGATION — expandir clusters para cobrir condicional/futuro/infinitivo+auxiliar " +
      "usando raízes de verbo (perco|perd, ganh) em vez de formas fixas.";
  } else if (coverageGaps.some((g) => g.gapCategory === COVERAGE_GAP_CATEGORIES.MORPHOLOGICAL_VARIATION)) {
    suggestedFix = "PATCH_5.4B_MORPHOLOGY — expandir clusters para cobrir formas plurais de substantivos.";
  } else if (coverageGaps.some((g) => g.gapCategory === COVERAGE_GAP_CATEGORIES.SYNTACTIC_VARIATION)) {
    suggestedFix = "PATCH_5.4B_SYNTAX — flexibilizar estruturas sintáticas dos clusters " +
      "(ex: 'qual (seria|é) o impacto' em vez de 'qual o impacto').";
  } else if (coverageGaps.some((g) => g.gapCategory === COVERAGE_GAP_CATEGORIES.SEMANTIC_BREADTH_GAP)) {
    suggestedFix = "PATCH_5.4B_SEMANTICS — adicionar vocabulário semântico relacionado aos clusters (efeito, resultado, aproveitaria).";
  }

  return {
    auditVersion: "5.5D",
    query,
    normalizedQuery: q,
    hasAnchor,
    decisionExplanationActive: decisionActive,
    actualTurnType,

    // Diagnóstico do guard
    guardBlocked,

    // Espelhos: o que os clusters ATUAIS detectaram
    clusterMirrors,

    // Sondas: o que DEVERIA ser detectado (cobertura semântica ampla)
    semanticProbes,

    // Análise por cluster
    gaps,

    // Resumo
    likelyCoverageGap,
    expectedCluster,
    missingSignals,
    failedGuards,
    suggestedFix,
    // PATCH 5.5A — diagnóstico de misclassificação VALUE_QUESTION
    valueQuestionMisclassified,
    // PATCH 5.5B — diagnóstico de misclassificação CONVERSATIONAL
    conversationalMisclassified,
    // PATCH 5.5C — categoria unificada pós-decisão
    postDecisionCategory,
    // PATCH 5.5D — presença de campos da decision memory para o subtype ativo
    decisionMemoryPresence,
  };
}
