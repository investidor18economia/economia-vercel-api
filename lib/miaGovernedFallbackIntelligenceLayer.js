/**
 * PATCH Comercial 3C-C — Governed Fallback Intelligence Layer
 *
 * Extrai sinais explícitos de ofertas sem Data Layer e gera consequências governadas.
 * A MIA decide; o verbalizer apenas transforma facts em linguagem humana.
 */

export const GOVERNED_FALLBACK_INTELLIGENCE_LAYER_VERSION = "3C-C.1";

export const BANNED_FALLBACK_GENERIC_PHRASES = Object.freeze([
  "ótima opção",
  "otima opcao",
  "excelente escolha",
  "melhor custo-benefício",
  "melhor custo beneficio",
  "desempenho superior",
  "produto ideal",
  "equipado com",
  "vale muito a pena",
  "nota ",
  "benchmark",
]);

export const UNSAFE_FALLBACK_CLAIM_PATTERNS = Object.freeze([
  /\bcancelamento de ru[ií]do\b/i,
  /\banc\b/i,
  /\bnoise cancelling\b/i,
  /\baptx\b/i,
  /\bldac\b/i,
  /\b\d+\s*mah\b/i,
  /\b\d+\s*h(?: de bateria)?\b/i,
  /\bbluetooth\s*[45](?:\.\d)?\b/i,
  /\b(?:snapdragon|mediatek|dimensity|exynos)\b/i,
]);

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductName(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shortDisplayName(productName = "") {
  const name = cleanProductName(productName);
  if (!name) return "este produto";
  const parts = name.split(" ");
  if (parts.length <= 5) return name;
  return parts.slice(0, 5).join(" ");
}

function buildEvidenceText(product = {}) {
  const title = normalizeText(product.product_name || "");
  const chunks = [
    product.product_name,
    product.category,
    product.price,
  ]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

  const extras = [];

  const ramMatch = title.match(/\b(8|16|32|64)\s*gb\b/);
  if (ramMatch) {
    extras.push(`${ramMatch[1]}gb`, `${ramMatch[1]}gb de ram`);
  }

  if (/\bcore i7\b|\bi7\b/.test(title)) {
    extras.push("i7", "core i7");
  }
  if (/\bcore i5\b|\bi5\b/.test(title)) {
    extras.push("i5", "core i5");
  }
  if (/\bcore i3\b|\bi3\b/.test(title)) {
    extras.push("i3", "core i3");
  }
  if (/\bryzen\b/.test(title)) {
    extras.push("ryzen");
  }

  if (/\bssd\b/.test(title)) {
    extras.push("ssd");
  }

  const storageMatch = title.match(/\b(256|512|1024|1)\s*(?:gb|tb)\b/);
  if (storageMatch) {
    const storageToken = storageMatch[0].replace(/\s+/g, "").toLowerCase();
    extras.push(storageToken, `ssd de ${storageToken}`);
  }

  if (/\b(144|165|240|120)hz\b/.test(title)) {
    const hzMatch = title.match(/\b(144|165|240|120)hz\b/);
    if (hzMatch) extras.push(`${hzMatch[1]}hz`);
  }

  if (/\b4k\b/.test(title)) extras.push("4k");
  if (/\buhd\b/.test(title)) extras.push("uhd");

  return [...chunks, ...extras].join(" ").toLowerCase();
}

function hasPattern(title, pattern) {
  return pattern.test(title);
}

/**
 * @param {Record<string, unknown>} product
 * @returns {Array<{ id: string, token: string, category: string }>}
 */
export function extractExplicitProductSignals(product = {}) {
  const title = normalizeText(product.product_name || "");
  const signals = [];

  const add = (id, token, category) => {
    signals.push({ id, token, category });
  };

  if (hasPattern(title, /\b(fone|headphone|headset|earbud|earbuds|buds|airpods)\b/)) {
    add("audio_device", "fone", "audio");
  }
  if (hasPattern(title, /\b(bluetooth|sem fio|wireless)\b/)) {
    add("wireless", "bluetooth", "audio");
  }
  if (hasPattern(title, /\b(microfone|mic)\b/)) {
    add("microphone", "microfone", "audio");
  }
  if (hasPattern(title, /\b(redmi buds|xiaomi buds|galaxy buds|jbl tune)\b/)) {
    add("accessible_buds_line", "linha acessível de fones", "audio");
  }

  if (hasPattern(title, /\b(notebook|laptop|macbook|chromebook)\b/)) {
    add("notebook", "notebook", "notebook");
  }
  if (hasPattern(title, /\b(core i[3579]|i[3579]|ryzen\s*[3579]|ryzen)\b/)) {
    add("cpu_tier", "processador de desempenho intermediário ou superior", "notebook");
  }
  if (hasPattern(title, /\b(\d+)\s*gb\b/) && hasPattern(title, /\b(ram|memoria|memória)\b|\b\d+\s*gb\b/)) {
    add("ram_explicit", "memória ram explícita no título", "notebook");
  } else if (hasPattern(title, /\b(8gb|16gb|32gb)\b/)) {
    add("ram_size", "capacidade de memória explícita no título", "notebook");
  }
  if (hasPattern(title, /\bssd\b|\bnvme\b/)) {
    add("ssd", "ssd", "notebook");
  }
  if (hasPattern(title, /\b(256gb|512gb|1tb|1024gb)\b/)) {
    add("storage_size", "capacidade de armazenamento explícita no título", "notebook");
  }
  if (hasPattern(title, /\b(rtx|gtx|radeon|rx\s*\d)\b/)) {
    add("gpu_explicit", "placa gráfica explícita no título", "notebook");
  }
  if (hasPattern(title, /\bgamer\b|\bgaming\b/)) {
    add("gamer_profile", "gamer", "general");
  }

  if (hasPattern(title, /\b(monitor)\b/)) {
    add("monitor", "monitor", "display");
  }
  if (hasPattern(title, /\b(smart tv|\btv\b|televis)/)) {
    add("tv", "tv", "display");
  }
  if (hasPattern(title, /\b(4k|8k|uhd|qled|oled)\b/)) {
    add("display_quality", "qualidade de imagem explícita no título", "display");
  }
  if (hasPattern(title, /\b(144hz|165hz|240hz|120hz)\b/)) {
    add("refresh_rate", "taxa de atualização explícita no título", "display");
  }
  if (hasPattern(title, /\b(\d{2})\s*(pol|polegadas|")\b/)) {
    add("screen_size", "tamanho de tela explícito no título", "display");
  }

  if (hasPattern(title, /\b(cadeira)\b/)) {
    add("chair", "cadeira", "chair");
  }
  if (hasPattern(title, /\b(ergon[oô]mica|escrit[oó]rio|reclin[aá]vel)\b/)) {
    add("chair_use", "uso de cadeira explícito no título", "chair");
  }

  if (hasPattern(title, /\b(xbox|playstation|ps5|ps4|switch|console)\b/)) {
    add("console", "console", "console");
  }

  if (hasPattern(title, /\b(geladeira|frigerador|frost free)\b/)) {
    add("fridge", "geladeira", "appliance");
  }
  if (hasPattern(title, /\b(ar condicionado|ar-condicionado|inverter)\b/)) {
    add("ac", "ar-condicionado", "appliance");
  }
  if (hasPattern(title, /\b(micro-ondas|microondas|lava e seca|lavadora)\b/)) {
    add("appliance", "eletrodoméstico", "appliance");
  }

  if (hasPattern(title, /\b(recondicionado|usado|seminovo)\b/)) {
    add("used_condition", "condição usada ou recondicionada explícita", "general");
  }
  if (hasPattern(title, /\b(kit|combo)\b/)) {
    add("bundle", "kit ou combo", "general");
  }

  return signals;
}

export function detectProductCategoryFromExplicitSignals(product = {}) {
  const signals = extractExplicitProductSignals(product);
  const categories = signals.map((signal) => signal.category);
  if (categories.includes("audio")) return "audio";
  if (categories.includes("notebook")) return "notebook";
  if (categories.includes("display")) return "display";
  if (categories.includes("chair")) return "chair";
  if (categories.includes("console")) return "console";
  if (categories.includes("appliance")) return "appliance";
  return null;
}

function extractRamSize(title = "") {
  const match = title.match(/\b(8|16|32|64)\s*gb\b/);
  return match ? `${match[1]}GB` : null;
}

function extractStorageSize(title = "") {
  const match = title.match(/\b(256|512|1024|1)\s*(?:gb|tb)\b/);
  if (!match) return null;
  return match[0].replace(/\s+/g, "").toUpperCase();
}

function extractCpuHint(title = "") {
  if (/\bcore i7\b|\bi7\b/.test(title)) return "i7";
  if (/\bcore i5\b|\bi5\b/.test(title)) return "i5";
  if (/\bcore i3\b|\bi3\b/.test(title)) return "i3";
  if (/\bryzen\b/.test(title)) return "Ryzen";
  return null;
}

/**
 * @param {Record<string, unknown>} product
 * @param {string} [userQuery]
 */
export function buildFallbackStructuredConsequences(product = {}, userQuery = "") {
  const title = normalizeText(product.product_name || "");
  const signals = extractExplicitProductSignals(product);
  const strengths = [];
  const weaknesses = [];
  let productTypeSummary = "";
  let audienceHint = "";

  const isAudio =
    signals.some((signal) => signal.category === "audio") ||
    /\b(fone|headset|earbud|buds)\b/.test(title);
  const isNotebook = signals.some((signal) => signal.id === "notebook");
  const isChair = signals.some((signal) => signal.id === "chair");
  const isMonitor = signals.some((signal) => signal.id === "monitor");
  const isTv = signals.some((signal) => signal.id === "tv");
  const isConsole = signals.some((signal) => signal.id === "console");
  const isGamer = signals.some((signal) => signal.id === "gamer_profile");
  const hasWireless = signals.some((signal) => signal.id === "wireless");
  const hasAccessibleLine = signals.some((signal) => signal.id === "accessible_buds_line");
  const cpuHint = extractCpuHint(title);
  const ramSize = extractRamSize(title);
  const storageSize = extractStorageSize(title);
  const hasSsd = signals.some((signal) => signal.id === "ssd");
  const hasGpu = signals.some((signal) => signal.id === "gpu_explicit");
  const refreshRate = title.match(/\b(144|165|240|120)hz\b/);
  const has4k = /\b4k\b|\buhd\b|\bqled\b|\boled\b/.test(title);

  if (isAudio) {
    productTypeSummary = `${shortDisplayName(product.product_name)} parece fazer sentido para quem quer um fone`;
    if (hasWireless) {
      productTypeSummary += " Bluetooth simples, acessível e prático para a rotina";
    } else {
      productTypeSummary += " prático para a rotina";
    }
    audienceHint = "quem quer praticidade de áudio no dia a dia";

    if (hasWireless) {
      strengths.push(
        "o foco está em uso sem fio e conveniência diária — ouvir músicas, vídeos, chamadas rápidas e usar no transporte ou no trabalho sem depender de cabo"
      );
    } else {
      strengths.push(
        "o foco parece estar em áudio pessoal para vídeos, chamadas e consumo diário"
      );
    }

    if (hasAccessibleLine || /\bredmi\b|\bxiaomi\b|\bjbl tune\b/.test(title)) {
      strengths.push(
        "o perfil aparente é de fone acessível, com valor mais em praticidade e preço do que em áudio premium"
      );
    }

    weaknesses.push(
      "não tratar esse tipo de fone como escolha para quem exige isolamento forte, microfone avançado ou áudio premium — aqui, o valor tende a estar mais na praticidade e no preço"
    );
  } else if (isNotebook) {
    productTypeSummary = `${shortDisplayName(product.product_name)} parece fazer sentido para quem quer um notebook`;
    if (isGamer) {
      productTypeSummary += " com mais folga para trabalho pesado, multitarefa e uso intenso";
    } else if (cpuHint || ramSize) {
      productTypeSummary += " com mais margem para tarefas profissionais do que modelos básicos";
    } else {
      productTypeSummary += " para uso do dia a dia";
    }
    audienceHint = "quem precisa de notebook com mais margem no dia a dia";

    const specBits = [];
    if (cpuHint) specBits.push(cpuHint.toUpperCase());
    if (ramSize) specBits.push(`${ramSize} de RAM`);
    if (hasSsd && storageSize) specBits.push(`SSD de ${storageSize}`);
    else if (hasSsd) specBits.push("SSD");
    else if (storageSize) specBits.push(`${storageSize} de armazenamento`);

    if (specBits.length > 0) {
      strengths.push(
        `o título já indica ${specBits.join(", ")}, então a leitura segura é foco em desempenho acima de notebooks básicos, com mais margem para navegador pesado, reuniões, estudos, planilhas e programas do dia a dia`
      );
    } else if (cpuHint) {
      strengths.push(
        `o título indica ${cpuHint.toUpperCase()}, o que sugere foco em desempenho acima de modelos básicos para multitarefa e uso profissional`
      );
    } else {
      strengths.push(
        "o anúncio aponta para um notebook com perfil mais voltado a uso regular ou profissional do que a modelos ultra básicos"
      );
    }

    if (hasGpu) {
      strengths.push(
        "a placa gráfica citada no título indica margem extra para tarefas visuais mais exigentes, sem assumir desempenho em jogos específicos"
      );
    }

    if (isGamer) {
      weaknesses.push(
        "por ser uma linha gamer, pode não ser a melhor escolha se sua prioridade for leveza, bateria ou portabilidade"
      );
    } else {
      weaknesses.push(
        "vale confirmar peso, autonomia e portabilidade se você precisa transportar o equipamento com frequência"
      );
    }
  } else if (isChair) {
    productTypeSummary = `${shortDisplayName(product.product_name)} parece fazer sentido para quem busca uma cadeira`;
    if (isGamer) productTypeSummary += " com perfil mais robusto para sessões longas";
    else productTypeSummary += " para uso prolongado";
    audienceHint = "quem passa muitas horas sentado";

    if (isGamer) {
      strengths.push(
        "o perfil gamer explícito no título sugere estrutura pensada para uso intenso e sessões mais longas"
      );
    } else {
      strengths.push(
        "o anúncio aponta para uso prolongado, o que tende a ajudar quem passa muitas horas na mesa"
      );
    }

    weaknesses.push(
      "sem detalhes explícitos de reclinação, material ou ajustes finos no título, vale confirmar ergonomia, garantia e dimensões antes de fechar"
    );
  } else if (isMonitor || isTv) {
    const label = isMonitor ? "monitor" : "TV";
    productTypeSummary = `${shortDisplayName(product.product_name)} parece fazer sentido para quem busca um ${label}`;
    if (has4k) productTypeSummary += " com foco em imagem mais detalhada";
    if (refreshRate) productTypeSummary += " com taxa de atualização explícita no anúncio";
    audienceHint = `quem quer ${label} para uso regular`;

    if (has4k) {
      strengths.push(
        "a referência 4K/UHD/QLED/OLED no título indica foco em imagem mais detalhada para filmes, conteúdo e uso visual"
      );
    }
    if (refreshRate) {
      strengths.push(
        `a taxa de ${refreshRate[1]}Hz citada no título sugere fluidez maior na navegação e no conteúdo compatível`
      );
    }
    if (!has4k && !refreshRate) {
      strengths.push(
        "o anúncio aponta para uso visual regular, sem extrapolar qualidade de painel além do que o título deixa claro"
      );
    }

    weaknesses.push(
      "vale confirmar tamanho exato, entradas disponíveis e garantia, especialmente se você depende de console, notebook ou TV box específicos"
    );
  } else if (isConsole) {
    productTypeSummary = `${shortDisplayName(product.product_name)} parece fazer sentido para quem quer entrar ou permanecer no ecossistema de jogos`;
    audienceHint = "quem busca console para lazer em casa";
    strengths.push(
      "o título deixa claro que se trata de console, o que ajuda a comparar geração, pacote e preço sem misturar com outras categorias"
    );
    weaknesses.push(
      "vale confirmar se acompanha jogos, controle extra ou assinaturas, porque isso muda bastante o custo real"
    );
  } else if (signals.some((signal) => signal.category === "appliance")) {
    productTypeSummary = `${shortDisplayName(product.product_name)} parece fazer sentido para quem compara eletrodomésticos`;
    audienceHint = "quem está trocando ou comprando eletrodoméstico";
    strengths.push(
      "o título deixa explícito o tipo de eletrodoméstico, o que ajuda a comparar capacidade, preço e condições de compra"
    );
    weaknesses.push(
      "sem ficha completa, vale confirmar consumo, dimensões, instalação e garantia antes de fechar"
    );
  } else if (isGamer) {
    productTypeSummary = `${shortDisplayName(product.product_name)} parece voltado a um perfil mais intenso ou robusto`;
    audienceHint = "quem busca uso mais exigente";
    strengths.push(
      "o título indica perfil gamer, o que sugere foco em estrutura ou desempenho acima de opções mais simples"
    );
    weaknesses.push(
      "sem specs completas no título, evite assumir desempenho em jogos ou tarefas específicas — compare garantia, peso e uso real"
    );
  }

  if (signals.some((signal) => signal.id === "used_condition")) {
    weaknesses.push(
      "como a condição usada ou recondicionada aparece no anúncio, vale confirmar garantia, estado estético e política de devolução"
    );
  }

  const hasUsefulSignals =
    strengths.length > 0 &&
    !!productTypeSummary &&
    signals.length >= 1;

  return {
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 2),
    productTypeSummary,
    audienceHint,
    category: detectProductCategoryFromExplicitSignals(product),
    explicitSignals: signals,
    hasUsefulSignals,
    allowedEvidence: buildEvidenceText(product),
  };
}

export function containsUnsafeFallbackClaim(text = "", allowedEvidence = "") {
  const body = String(text || "");
  const evidence = String(allowedEvidence || "").toLowerCase();
  const normalized = body.toLowerCase();

  for (const phrase of BANNED_FALLBACK_GENERIC_PHRASES) {
    if (normalized.includes(phrase)) return true;
  }

  for (const pattern of UNSAFE_FALLBACK_CLAIM_PATTERNS) {
    const match = body.match(pattern);
    if (!match) continue;
    const token = String(match[0] || "").toLowerCase();
    if (!evidence.includes(token)) return true;
  }

  return false;
}

/**
 * @param {Record<string, unknown>} product
 * @param {string} [userQuery]
 */
export function buildGovernedFallbackExplanationFacts(product = {}, userQuery = "") {
  const structured = buildFallbackStructuredConsequences(product, userQuery);
  const productName = cleanProductName(product.product_name) || "este produto";

  if (!structured.hasUsefulSignals) {
    return {
      mode: "fallback_cautious",
      productName,
      category: structured.category,
      price: product.price || null,
      query: cleanProductName(userQuery),
      openingSummary: "",
      strengthConsequences: [],
      weaknessConsequences: [
        "vale comparar preço, garantia, prazo de entrega, reputação da loja e características confirmadas no anúncio antes de decidir",
      ],
      explicitSignals: structured.explicitSignals,
      hasUsefulSignals: false,
      allowedEvidence: structured.allowedEvidence,
    };
  }

  return {
    mode: "governed_fallback",
    productName,
    category: structured.category,
    price: product.price || null,
    query: cleanProductName(userQuery),
    openingSummary: structured.productTypeSummary
      ? `O ${structured.productTypeSummary.replace(/[.!?]$/, "")}.`
      : "",
    strengthConsequences: structured.strengths,
    weaknessConsequences: structured.weaknesses,
    audienceHint: structured.audienceHint,
    explicitSignals: structured.explicitSignals,
    hasUsefulSignals: true,
    allowedEvidence: structured.allowedEvidence,
  };
}

export function buildCautiousFallbackParagraphs(productName = "este produto") {
  return [
    "Essa oferta parece servir como referência inicial para comparar preço e disponibilidade.",
    "Antes de decidir, eu olharia com atenção para garantia, prazo de entrega, reputação da loja e características confirmadas no anúncio.",
  ];
}
