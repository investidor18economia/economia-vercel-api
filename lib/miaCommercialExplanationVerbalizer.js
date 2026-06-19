/**
 * PATCH Comercial 3B/3C-A/3C-D — Commercial Explanation Verbalizer
 *
 * Transforma StructuredExplanationFacts em texto humano.
 * Não altera facts, winner, ranking, score ou recommendation.
 */

export const COMMERCIAL_EXPLANATION_VERBALIZER_VERSION = "3C-E.1";

export const BANNED_ARCHITECTURE_PHRASES = Object.freeze([
  "data layer",
  "provider",
  "adapter",
  "ranking",
  "winner",
  "router",
  "contracts",
  "decision engine",
  "pipeline interno",
  "product_specs",
  "google shopping",
  "mercadolivre",
  "ficha da mia",
  "análise registrada no data layer",
  "analise registrada no data layer",
  "a oferta veio via",
  "a oferta veio do",
  "encontrei oferta em ",
]);

export const BANNED_REDUNDANT_PRICE_PHRASES = Object.freeze([
  "encontrei oferta por",
  "encontrei oferta em",
  "oferta encontrada por",
  "valor encontrado",
  "preço localizado",
  "preco localizado",
]);

export const BANNED_MECHANISM_PHRASES = Object.freeze([
  "pelo nome da oferta",
  "pelo titulo do anuncio",
  "pelo título do anúncio",
  "o anúncio indica",
  "o anuncio indica",
  "o título sugere",
  "o titulo sugere",
  "o nome do produto mostra",
  "pelo que o anúncio deixa explícito",
  "pelo que o anuncio deixa explicito",
  "o título já indica",
  "o titulo ja indica",
  "o título indica",
  "o titulo indica",
  "a placa gráfica citada no título",
  "a placa grafica citada no titulo",
  "o anúncio aponta",
  "o anuncio aponta",
  "no título",
  "no titulo",
  "citada no título",
  "citada no titulo",
  "explícita no anúncio",
  "explicita no anuncio",
  "o título deixa",
  "o titulo deixa",
  "com base no nome e na categoria",
  "leitura prudente",
  "sem assumir detalhes que não aparecem no título",
]);

export const REPETITION_AUDIT_TERMS = Object.freeze([
  "bluetooth",
  "gamer",
  "notebook",
  "monitor",
  "tv",
  "console",
]);

const MECHANISM_INLINE_REPLACEMENTS = Object.freeze([
  [/com taxa de atualização explícita no anúncio/gi, "com foco em fluidez na tela"],
  [/com taxa de atualizacao explicita no anuncio/gi, "com foco em fluidez na tela"],
  [
    /a referência 4k\/uhd\/qled\/oled no título indica foco em/gi,
    "A proposta aqui é",
  ],
  [
    /a referencia 4k\/uhd\/qled\/oled no titulo indica foco em/gi,
    "A proposta aqui é",
  ],
  [/a taxa de (\d+)hz citada no título sugere/gi, "A taxa de $1Hz abre"],
  [/a taxa de (\d+)hz citada no titulo sugere/gi, "A taxa de $1Hz abre"],
  [
    /o título deixa claro que se trata de console, o que ajuda a/gi,
    "Trata-se de console, o que ajuda a",
  ],
  [
    /o titulo deixa claro que se trata de console, o que ajuda a/gi,
    "Trata-se de console, o que ajuda a",
  ],
  [
    /o título deixa explícito o tipo de eletrodoméstico, o que ajuda a/gi,
    "O tipo de eletrodoméstico fica claro, o que ajuda a",
  ],
  [/o perfil gamer explícito no título sugere/gi, "O perfil aqui sugere"],
  [/o perfil gamer explicito no titulo sugere/gi, "O perfil aqui sugere"],
  [/o título indica perfil gamer, o que sugere/gi, "O perfil gamer aqui sugere"],
  [
    /o anúncio aponta para uso visual regular, sem extrapolar qualidade de painel além do que o título deixa claro/gi,
    "A proposta aqui é uso visual regular, sem extrapolar qualidade de painel",
  ],
  [
    /o anúncio aponta para uso prolongado, o que tende a ajudar/gi,
    "A proposta aqui é uso prolongado, o que tende a ajudar",
  ],
  [
    /o anúncio aponta para um notebook com perfil mais voltado a/gi,
    "A proposta aqui é um notebook com perfil mais voltado a",
  ],
  [
    /o perfil aparente é de fone acessível, com valor mais em praticidade e preço do que em áudio premium/gi,
    "O principal valor está em praticidade e preço, não em áudio premium",
  ],
]);

const MECHANISM_PREFIX_PATTERNS = [
  /^pelo nome da oferta,?\s*/i,
  /^pelo título do anúncio,?\s*/i,
  /^pelo titulo do anuncio,?\s*/i,
  /^o anúncio indica que?\s*/i,
  /^o anuncio indica que?\s*/i,
  /^o título sugere que?\s*/i,
  /^o titulo sugere que?\s*/i,
  /^o nome do produto mostra que?\s*/i,
  /^pelo que o anúncio deixa explícito no nome,?\s*/i,
  /^pelo que o anuncio deixa explicito no nome,?\s*/i,
  /^o título já indica\s*/i,
  /^o titulo ja indica\s*/i,
  /^o título indica\s*/i,
  /^o titulo indica\s*/i,
  /^a placa gráfica citada no título\s*/i,
  /^a placa grafica citada no titulo\s*/i,
  /^o anúncio aponta para\s*/i,
  /^o anuncio aponta para\s*/i,
  /^o perfil aparente é\s*/i,
  /^o perfil aparente e\s*/i,
  /^o foco parece estar em\s*/i,
  /^o foco parece estar\s*/i,
];

const TRADEOFF_REWRITES = Object.freeze([
  {
    pattern:
      /não tratar esse tipo de fone como escolha para quem exige isolamento forte, microfone avançado ou áudio premium — aqui, o valor tende a estar mais na praticidade e no preço/i,
    replacement:
      "Quem procura isolamento forte, microfone avançado ou áudio premium provavelmente vai querer olhar opções de categorias superiores — aqui, o valor está mais na praticidade e no preço",
  },
  {
    pattern:
      /por ser uma linha gamer, pode não ser a melhor escolha se sua prioridade for leveza, bateria ou portabilidade/i,
    replacement:
      "Se leveza, bateria ou portabilidade pesam mais, uma linha gamer pode não ser a melhor aposta",
  },
  {
    pattern: /vale confirmar ergonomia, dimensões e garantia antes de fechar/i,
    replacement:
      "Vale confirmar ergonomia, dimensões e garantia antes de fechar",
  },
  {
    pattern: /vale confirmar peso, autonomia e portabilidade se você precisa transportar o equipamento com frequência/i,
    replacement:
      "Se você precisa transportar o equipamento com frequência, vale confirmar peso, autonomia e portabilidade",
  },
]);

function normalizeForScan(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanList(value, max = 3) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .slice(0, max);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()].slice(0, max);
  }
  return [];
}

function joinHumanList(items = []) {
  const list = cleanList(items, 5);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`;
}

function cleanProductName(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lowercaseLead(text = "") {
  const body = String(text || "").trim();
  if (!body) return "";
  return body.replace(/^./, (char) => char.toLowerCase());
}

function stripTrailingPeriod(text = "") {
  return String(text || "").replace(/[.!?]+$/, "").trim();
}

function capitalizeLead(text = "") {
  const body = String(text || "").trim();
  if (!body) return "";
  return body.replace(/^./, (char) => char.toUpperCase());
}

function synthesizeConsequenceClause(consequences = [], max = 3) {
  const items = cleanList(consequences, max).map(stripTrailingPeriod);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) {
    return `${items[0]} e ${lowercaseLead(items[1])}`;
  }
  return `${items[0]}, ${lowercaseLead(items[1])} e ${lowercaseLead(items[2])}`;
}

function buildIdealForParagraph(idealForConsequences = []) {
  const items = cleanList(idealForConsequences, 3).map(stripTrailingPeriod);
  if (items.length === 0) return "";

  const normalized = items.map((item) => {
    if (/^(valoriza|busca|grava|pretende|prioriza|precisa|quer|já|ja)/i.test(item)) {
      return item;
    }
    return lowercaseLead(item);
  });

  if (normalized.length === 1) {
    return `Na prática, isso costuma ajudar quem ${normalized[0]}.`;
  }

  return `Na prática, isso costuma ajudar quem ${joinHumanList(normalized)}.`;
}

export function containsArchitectureLeak(text = "") {
  const normalized = normalizeForScan(text);
  return BANNED_ARCHITECTURE_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function containsRedundantPricePhrase(text = "") {
  const normalized = normalizeForScan(text);
  return BANNED_REDUNDANT_PRICE_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function containsMechanismLeak(text = "") {
  const normalized = normalizeForScan(text);
  return BANNED_MECHANISM_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function countTermRepetitions(text = "", term = "") {
  const normalized = normalizeForScan(text);
  const needle = normalizeForScan(term);
  if (!needle) return 0;
  return (normalized.match(new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) || [])
    .length;
}

function stripMechanismLanguage(text = "") {
  let body = String(text || "").trim();
  for (const [pattern, replacement] of MECHANISM_INLINE_REPLACEMENTS) {
    body = body.replace(pattern, replacement);
  }
  for (const pattern of MECHANISM_PREFIX_PATTERNS) {
    body = body.replace(pattern, "");
  }
  body = body
    .replace(/,?\s*então a leitura segura é foco em\b/gi, ", com foco em")
    .replace(/\ba leitura segura é\b/gi, "o foco está")
    .replace(/\bo que sugere foco em\b/gi, "com foco em")
    .replace(/\bsem assumir desempenho em jogos específicos\b/gi, "sem prometer desempenho em jogos específicos")
    .replace(/\ba placa gráfica citada no título indica\b/gi, "A placa gráfica indicada abre")
    .replace(/\ba placa grafica citada no titulo indica\b/gi, "A placa gráfica indicada abre");
  return body.trim();
}

function boostConfidence(text = "") {
  return String(text || "")
    .replace(/\bparece fazer sentido\b/gi, "combina bem")
    .replace(/\bcombina bem para\b/gi, "combina bem com")
    .replace(/\bparece estar em\b/gi, "está em")
    .replace(/\bprovavelmente esteja em\b/gi, "está em")
    .replace(/\btalvez seja\b/gi, "é")
    .replace(/\bo perfil aparente é\b/gi, "O principal valor está em")
    .replace(/\bo foco parece estar em\b/gi, "O foco aqui está em")
    .replace(/\bo foco parece estar\b/gi, "O foco aqui está")
    .replace(/\btende a estar\b/gi, "está")
    .trim();
}

function humanizeTradeoff(text = "") {
  let body = String(text || "").trim();
  for (const { pattern, replacement } of TRADEOFF_REWRITES) {
    body = body.replace(pattern, replacement);
  }
  return body.trim();
}

function extractShortProductLabel(productName = "") {
  const name = cleanProductName(productName);
  if (!name) return "este produto";

  let stripped = name
    .replace(
      /^(fone bluetooth|fone|headphone|headset|earbuds?|notebook gamer|notebook|laptop|monitor gamer|monitor|smart tv|tv|cadeira gamer|cadeira|console)\s+/i,
      ""
    )
    .trim();
  if (!stripped) stripped = name;

  stripped = stripped
    .replace(
      /\b(intel core|amd ryzen|core i[3579]|i[3579]-?\w*|16gb|32gb|8gb|512gb|256gb|1tb|ssd|rtx\s*\d+|gtx\s*\d+|windows\s*\d+)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  const label = stripped.split(" ").slice(0, 4).join(" ").trim();
  return label || name.split(" ").slice(0, 4).join(" ");
}

function humanizeOpeningSummary(summary = "", productName = "") {
  let body = boostConfidence(stripMechanismLanguage(summary));
  if (!body) return "";

  const shortLabel = extractShortProductLabel(productName);

  body = body
    .replace(
      /\b(?:para|com) quem quer um fone(?:\s+bluetooth)?(?:\s+simples)?(?:,\s*acess[ií]vel)?(?:\s+e pr[aá]tico para a rotina)?/i,
      "com quem busca praticidade no dia a dia, sem exigir um fone premium"
    )
    .replace(
      /\b(?:para|com) quem quer um notebook com mais folga para trabalho pesado, multitarefa e uso intenso/i,
      "com quem precisa de mais margem para trabalho pesado, multitarefa e uso intenso"
    )
    .replace(
      /\b(?:para|com) quem quer um notebook com mais margem para tarefas profissionais do que modelos básicos/i,
      "com quem precisa de mais margem para tarefas profissionais do que modelos básicos"
    )
    .replace(
      /\b(?:para|com) quem quer um notebook para uso do dia a dia/i,
      "com quem precisa de um notebook para uso do dia a dia"
    )
    .replace(
      /\bpara quem busca uma cadeira com perfil mais robusto para sessões longas/i,
      "com quem passa muitas horas sentado e precisa de estrutura mais robusta"
    )
    .replace(
      /\bpara quem busca uma cadeira para uso prolongado\b/i,
      "com quem passa muitas horas sentado"
    )
    .replace(
      /\bpara quem busca um monitor com taxa de atualização explícita no anúncio\b/gi,
      "com quem busca um monitor com foco em fluidez na tela"
    )
    .replace(/\bpara quem busca um tv\b/gi, "com quem busca uma TV")
    .replace(/\bpara quem busca um monitor\b/gi, "com quem busca um monitor")
    .replace(/\bpara quem quer entrar ou permanecer no ecossistema de jogos\b/gi, "com quem quer entrar ou permanecer no ecossistema de jogos")
    .replace(/\bbluetooth simples, acess[ií]vel e pr[aá]tico\b/gi, "simples e prático");

  if (shortLabel) {
    body = body.replace(/^o\s+[A-Za-z0-9À-ú\s-]+?(?=\s+combina bem)/i, `O ${shortLabel}`);
  }

  return capitalizeLead(body.replace(/\s+/g, " ").trim());
}

function humanizeStrengthConsequence(text = "", priorContext = "") {
  let body = boostConfidence(stripMechanismLanguage(text));
  if (!body) return "";

  body = body
    .replace(/\bo perfil aparente é de\b/gi, "O principal valor está em")
    .replace(/\bo perfil aparente é\b/gi, "O principal valor está em");

  if (/^i[3579]\b|^ryzen\b|^\d+gb de ram\b/i.test(body)) {
    body = body.replace(/^(.+?),\s*com foco em\b/i, "Com $1, o foco está em");
    return capitalizeLead(body);
  }

  if (/^a placa gráfica indicada\b/i.test(body) || /^a placa grafica indicada\b/i.test(body)) {
    return capitalizeLead(body);
  }

  if (/^o foco está em\b/i.test(body)) {
    return capitalizeLead(body.replace(/^o foco está em\b/i, "O foco aqui está em"));
  }

  if (/^o foco aqui está em\b/i.test(body) || /^o principal valor está em\b/i.test(body)) {
    return capitalizeLead(body);
  }

  if (/^a proposta aqui é/i.test(body)) {
    return capitalizeLead(body);
  }

  if (/^trata-se de\b/i.test(body) || /^a taxa de \d+hz abre/i.test(body)) {
    return capitalizeLead(body);
  }

  return capitalizeLead(`O foco aqui está em ${lowercaseLead(body)}`);
}

function reduceParagraphRepetition(paragraph = "", usedTerms = new Set()) {
  let body = String(paragraph || "");
  for (const term of REPETITION_AUDIT_TERMS) {
    const count = countTermRepetitions(body, term);
    if (count <= 1) {
      if (count === 1) usedTerms.add(term);
      continue;
    }
    if (usedTerms.has(term)) {
      const regex = new RegExp(`\\b${term}\\b`, "gi");
      let replaced = false;
      body = body.replace(regex, (match) => {
        if (replaced) return "";
        replaced = true;
        return match;
      });
    } else {
      usedTerms.add(term);
    }
  }
  return body.replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim();
}

function polishParagraph(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/,\s+e\s+,/gi, " e ")
    .replace(/\.\./g, ".")
    .trim();
}

function buildPracticalParagraph(strengthConsequences = [], priorContext = "") {
  const humanized = cleanList(strengthConsequences, 2).map((item) =>
    humanizeStrengthConsequence(item, priorContext)
  );
  if (humanized.length === 0) return "";
  if (humanized.length === 1) {
    const single = humanized[0];
    return single.endsWith(".") ? single : `${single}.`;
  }
  return humanized.map((item) => (item.endsWith(".") ? item : `${item}.`)).join(" ");
}

function buildCautionParagraph(caution = "") {
  const humanized = humanizeTradeoff(stripMechanismLanguage(caution));
  if (!humanized) return "";
  if (/^quem procura|^se leveza|^se você precisa|^vale confirmar/i.test(humanized)) {
    const text = capitalizeLead(humanized);
    return text.endsWith(".") ? text : `${text}.`;
  }
  return `Ponto de atenção: ${humanized.replace(/^ponto de atenção:\s*/i, "")}.`;
}

function appendMicroImpact(paragraph = "", micro = "") {
  const base = String(paragraph || "").replace(/[.!?]+$/, "").trim();
  const clause = String(micro || "").replace(/^[,.]\s*/, "").trim();
  if (!base || !clause) return paragraph;
  return `${base}, ${lowercaseLead(clause)}.`;
}

/**
 * @typedef {Object} StructuredExplanationFacts
 * @property {"data_layer"|"governed_fallback"|"fallback_cautious"|"fallback"} mode
 * @property {string} productName
 * @property {string} [category]
 * @property {string|null} [price]
 * @property {string} [query]
 * @property {string} [openingSummary]
 * @property {string[]} [strengthConsequences]
 * @property {string[]} [weaknessConsequences]
 * @property {string[]} [idealForConsequences]
 * @property {string[]} [avoidIfConsequences]
 * @property {string[]} [noteConsequences]
 * @property {string[]} [riskConsequences]
 * @property {string[]} [titleSignals]
 * @property {string[]} [microConsequences]
 * @property {string} [primaryMicroConsequence]
 * @property {"standalone"|"append"} [microDelivery]
 */

/**
 * @param {StructuredExplanationFacts} facts
 * @returns {string[]}
 */
export function verbalizeCommercialExplanation(facts = {}) {
  const productName = cleanProductName(facts.productName) || "este produto";
  const paragraphs = [];
  const usedTerms = new Set();

  if (facts.mode === "data_layer") {
    const strengthConsequences = cleanList(facts.strengthConsequences, 3);
    const idealForConsequences = cleanList(facts.idealForConsequences, 3);
    const noteConsequences = cleanList(facts.noteConsequences, 2);
    const weaknessConsequences = cleanList(facts.weaknessConsequences, 2);
    const avoidIfConsequences = cleanList(facts.avoidIfConsequences, 2);
    const riskConsequences = cleanList(facts.riskConsequences, 1);

    const openingClause = synthesizeConsequenceClause(strengthConsequences, 3);
    if (openingClause) {
      paragraphs.push(
        polishParagraph(
          `O ${productName} pesa mais por ${stripMechanismLanguage(openingClause)}.`
        )
      );
    } else if (idealForConsequences.length > 0) {
      paragraphs.push(
        polishParagraph(
          `O ${productName} combina bem com quem ${joinHumanList(idealForConsequences)}.`
        )
      );
    } else if (noteConsequences.length > 0) {
      paragraphs.push(
        polishParagraph(
          `O ${productName} chama atenção porque ${lowercaseLead(stripMechanismLanguage(noteConsequences[0]))}.`
        )
      );
    } else {
      paragraphs.push(
        polishParagraph(
          `O ${productName} aparece como uma opção sólida dentro do que você está buscando${facts.query ? " agora" : ""}.`
        )
      );
    }

    const practicalParagraph = buildIdealForParagraph(idealForConsequences);
    if (facts.primaryMicroConsequence && facts.microDelivery === "standalone") {
      paragraphs.push(polishParagraph(facts.primaryMicroConsequence));
    } else if (practicalParagraph) {
      paragraphs.push(polishParagraph(practicalParagraph));
    } else if (noteConsequences.length > 0) {
      paragraphs.push(
        polishParagraph(`Na prática, ${lowercaseLead(stripMechanismLanguage(noteConsequences[0]))}.`)
      );
    } else if (strengthConsequences.length > 0) {
      paragraphs.push(
        polishParagraph(
          "Na prática, isso se traduz em mais tranquilidade no uso cotidiano, sem depender de suposições soltas."
        )
      );
    }

    const caution =
      weaknessConsequences[0] ||
      avoidIfConsequences[0] ||
      riskConsequences[0] ||
      noteConsequences.find((note) => /atenção|tradeoff|risco|limitação|limitacao/i.test(note)) ||
      "";

    if (caution) {
      paragraphs.push(polishParagraph(buildCautionParagraph(caution)));
    }
  } else if (facts.mode === "governed_fallback") {
    const strengthConsequences = cleanList(facts.strengthConsequences, 3);
    const weaknessConsequences = cleanList(facts.weaknessConsequences, 2);

    const opening = facts.openingSummary
      ? humanizeOpeningSummary(facts.openingSummary, productName)
      : `O ${extractShortProductLabel(productName)} combina bem com quem busca praticidade no dia a dia.`;

    paragraphs.push(polishParagraph(opening.endsWith(".") ? opening : `${opening}.`));

    const priorContext = paragraphs.join(" ");
    const strengthsForPractical = facts.primaryMicroConsequence
      ? cleanList(strengthConsequences, 1)
      : cleanList(strengthConsequences, 2);
    let practical = buildPracticalParagraph(strengthsForPractical, priorContext);
    if (practical && facts.primaryMicroConsequence && facts.microDelivery === "append") {
      practical = appendMicroImpact(practical, facts.primaryMicroConsequence);
    }
    if (practical) {
      paragraphs.push(polishParagraph(practical));
    }

    const caution = weaknessConsequences[0];
    if (caution) {
      paragraphs.push(polishParagraph(buildCautionParagraph(caution)));
    }
  } else if (facts.mode === "fallback_cautious") {
    paragraphs.push(
      "Essa opção funciona bem como referência inicial para comparar preço e disponibilidade."
    );
    paragraphs.push(
      "Antes de decidir, eu olharia com atenção para garantia, prazo de entrega, reputação da loja e características confirmadas no anúncio."
    );
  } else {
    const category = cleanProductName(facts.category);
    const titleSignals = cleanList(facts.titleSignals, 3);

    paragraphs.push(
      polishParagraph(
        `Esse ${extractShortProductLabel(productName)} combina bem para quem está comparando ofertas${category ? ` de ${category}` : ""} neste momento.`
      )
    );

    if (titleSignals.length > 0) {
      paragraphs.push(
        polishParagraph(
          `O foco aqui está em ${lowercaseLead(joinHumanList(titleSignals.map(stripMechanismLanguage)))}.`
        )
      );
    } else if (category) {
      paragraphs.push(
        "A proposta aqui é usar isso como referência comercial: vale comparar condições e o que mais importa para o seu uso."
      );
    } else {
      paragraphs.push(
        "Com as informações disponíveis agora, mantenho uma leitura cautelosa: é uma opção para comparar, não uma recomendação aprofundada sobre o modelo."
      );
    }

    paragraphs.push(
      "O principal ponto de atenção é confirmar o que mais pesa para você — garantia, prazo de entrega ou características confirmadas — antes de fechar."
    );
  }

  const polished = paragraphs
    .map((paragraph) => polishParagraph(reduceParagraphRepetition(paragraph, usedTerms)))
    .filter(Boolean)
    .slice(0, 4);

  return polished;
}
