/**
 * PATCH Comercial 3C-E — Commercial Micro-Consequence Enrichment Layer
 *
 * Enriquece consequências já governadas com micro-impactos práticos curtos.
 * Não inventa specs; não usa LLM; nasce das consequências existentes.
 */

export const COMMERCIAL_MICRO_CONSEQUENCE_LAYER_VERSION = "3C-E.1";

export const MAX_MICRO_CONSEQUENCE_LENGTH = 180;

export const INVENTED_MICRO_CLAIM_PATTERNS = Object.freeze([
  /\b\d+\s*mah\b/i,
  /\b\d+\s*h(?: de bateria)?\b/i,
  /\bcancelamento de ru[ií]do\b/i,
  /\banc\b/i,
  /\baptx\b/i,
  /\bldac\b/i,
  /\bbenchmark\b/i,
  /\bfps\b/i,
  /\b\d+\s*fps\b/i,
  /\b\d+\s*mp\b/i,
  /\bbluetooth\s*[45](?:\.\d)?\b/i,
  /\b(?:snapdragon|mediatek|dimensity|exynos)\b/i,
]);

export const TOKEN_MICRO_CONSEQUENCES = Object.freeze({
  desempenho_forte:
    "isso costuma ser percebido principalmente quando várias tarefas ficam abertas ao mesmo tempo",
  performance_forte:
    "isso costuma ser percebido principalmente quando várias tarefas ficam abertas ao mesmo tempo",
  camera_consistente:
    "especialmente em situações rápidas onde não existe segunda chance",
  video_forte: "principalmente quando o registro precisa sair bem de primeira",
  bluetooth:
    "algo que costuma ser percebido principalmente em deslocamentos, trabalho e uso fora de casa",
  wireless:
    "algo que costuma ser percebido principalmente em deslocamentos, trabalho e uso fora de casa",
  sem_fio:
    "algo que costuma ser percebido principalmente em deslocamentos, trabalho e uso fora de casa",
  ram_16gb:
    "o benefício costuma aparecer quando navegador, reuniões e aplicativos ficam abertos juntos",
  ram_generica:
    "o benefício costuma aparecer quando navegador, reuniões e aplicativos ficam abertos juntos",
  ssd: "principalmente na abertura de programas e arquivos do dia a dia",
  cpu_i7: "principalmente em planilhas, reuniões e navegador com várias abas abertas",
  notebook_gamer:
    "principalmente quando o uso mistura trabalho pesado e sessões mais longas na frente da tela",
  tv_4k: "principalmente em filmes, séries e conteúdo visual mais detalhado",
  monitor_refresh:
    "principalmente em navegação, conteúdo compatível e uso mais dinâmico na tela",
  cadeira_gamer:
    "principalmente em sessões longas na mesa, quando o conforto ao sentar pesa mais",
  estabilidade_longevidade:
    "quando o aparelho permanece vários anos como dispositivo principal sem gerar sensação constante de troca necessária",
  previsibilidade_diaria:
    "quando o aparelho permanece vários anos como dispositivo principal sem gerar sensação constante de troca necessária",
  fluidez_tela:
    "principalmente na rolagem, nas transições e nas interações rápidas do dia a dia",
  bateria_consistente:
    "principalmente em dias longos fora de casa, quando a recarga não pode aparecer no meio da rotina",
});

const CONSEQUENCE_MICRO_RULES = Object.freeze([
  {
    id: "desempenho_forte",
    pattern:
      /menos sensação.*limite|desempenho acima|multitarefa|navegador pesado|uso fica mais pesado|várias tarefas/i,
  },
  {
    id: "camera_consistente",
    pattern: /registrar bons momentos|repetir a foto|câmera consistente|camera consistente/i,
  },
  {
    id: "video_forte",
    pattern: /gravar vídeos|video forte|registro precisa|resultado consistente no dia a dia/i,
  },
  {
    id: "bluetooth",
    pattern: /sem fio|conveniência diária|uso sem fio|bluetooth/i,
  },
  {
    id: "ram_16gb",
    pattern: /16gb de ram|\b16gb\b.*multitarefa|margem para multitarefa/i,
  },
  {
    id: "ssd",
    pattern: /\bssd\b|armazenamento rápido|ssd de/i,
  },
  {
    id: "cpu_i7",
    pattern: /\bi7\b|core i7|desempenho acima de notebooks básicos/i,
  },
  {
    id: "notebook_gamer",
    pattern: /linha gamer|trabalho pesado, multitarefa e uso intenso|perfil gamer/i,
  },
  {
    id: "tv_4k",
    pattern: /\b4k\b|imagem mais detalhada|filmes, conteúdo e uso visual/i,
  },
  {
    id: "monitor_refresh",
    pattern: /144hz|165hz|240hz|fluidez maior na navegação|fluidez na tela/i,
  },
  {
    id: "cadeira_gamer",
    pattern: /cadeira|sessões longas|horas sentado|uso intenso e sessões/i,
  },
  {
    id: "estabilidade_longevidade",
    pattern: /previsibilidade|previs[ií]vel|estabilidade|longevidade|permanecer vários anos|ecossistema/i,
  },
  {
    id: "fluidez_tela",
    pattern: /fluidez na navegação|tela fluida|interações do dia a dia/i,
  },
  {
    id: "bateria_consistente",
    pattern: /ansiedade com recarga|bateria consistente|dia de uso/i,
  },
]);

const EVIDENCE_MICRO_RULES = Object.freeze([
  { id: "bluetooth", pattern: /\b(bluetooth|sem fio|wireless)\b/i },
  { id: "ram_16gb", pattern: /\b16gb\b/i },
  { id: "ssd", pattern: /\bssd\b/i },
  { id: "cpu_i7", pattern: /\b(i7|core i7)\b/i },
  { id: "tv_4k", pattern: /\b(4k|uhd|qled|oled)\b/i },
  { id: "monitor_refresh", pattern: /\b(144hz|165hz|240hz|120hz)\b/i },
  { id: "cadeira_gamer", pattern: /\bcadeira\b.*\bgamer\b|\bgamer\b.*\bcadeira\b/i },
  { id: "notebook_gamer", pattern: /\bnotebook\b.*\bgamer\b|\bgamer\b.*\bnotebook\b/i },
]);

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function resolveTokenMicro(tokenId = "") {
  const key = String(tokenId || "").trim();
  if (!key) return null;
  if (TOKEN_MICRO_CONSEQUENCES[key]) return TOKEN_MICRO_CONSEQUENCES[key];
  const normalized = key.toLowerCase().replace(/\s+/g, "_");
  return TOKEN_MICRO_CONSEQUENCES[normalized] || null;
}

export function containsInventedMicroClaim(text = "", allowedEvidence = "") {
  const body = String(text || "");
  const evidence = normalizeText(allowedEvidence);

  for (const pattern of INVENTED_MICRO_CLAIM_PATTERNS) {
    const match = body.match(pattern);
    if (!match) continue;
    const token = normalizeText(match[0]);
    if (token && evidence.includes(token)) continue;
    return true;
  }

  return false;
}

export function isValidMicroConsequence(text = "", allowedEvidence = "") {
  const body = String(text || "").trim();
  if (!body) return false;
  if (body.length > MAX_MICRO_CONSEQUENCE_LENGTH) return false;
  if (containsInventedMicroClaim(body, allowedEvidence)) return false;
  if (/\b(data layer|provider|ranking|winner|router|pipeline interno)\b/i.test(body)) {
    return false;
  }
  return true;
}

function collectContextText(facts = {}) {
  return [
    ...cleanList(facts.strengthConsequences, 3),
    ...cleanList(facts.idealForConsequences, 2),
    ...cleanList(facts.noteConsequences, 2),
    facts.openingSummary || "",
    facts.allowedEvidence || "",
    facts.productName || "",
    facts.category || "",
  ].join(" ");
}

function matchRules(text = "", rules = CONSEQUENCE_MICRO_RULES) {
  const normalized = normalizeText(text);
  const matches = [];

  for (const rule of rules) {
    if (!rule.pattern.test(normalized) && !rule.pattern.test(text)) continue;
    const micro = resolveTokenMicro(rule.id);
    if (!micro) continue;
    matches.push({ id: rule.id, micro });
  }

  return matches;
}

function pickPrimaryMicro(matches = []) {
  const priority = [
    "bluetooth",
    "sem_fio",
    "wireless",
    "camera_consistente",
    "video_forte",
    "cpu_i7",
    "ram_16gb",
    "ssd",
    "notebook_gamer",
    "monitor_refresh",
    "tv_4k",
    "cadeira_gamer",
    "estabilidade_longevidade",
    "previsibilidade_diaria",
    "fluidez_tela",
    "bateria_consistente",
    "desempenho_forte",
    "performance_forte",
  ];

  const ranked = [...matches].sort((left, right) => {
    const leftIndex = priority.indexOf(left.id);
    const rightIndex = priority.indexOf(right.id);
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
  });

  return ranked[0]?.micro || null;
}

/**
 * @param {{
 *   strengthConsequences?: string[],
 *   idealForConsequences?: string[],
 *   noteConsequences?: string[],
 *   openingSummary?: string,
 *   allowedEvidence?: string,
 *   productName?: string,
 *   category?: string,
 *   mode?: string,
 *   sourceTokens?: string[],
 * }} input
 * @returns {string[]}
 */
export function buildMicroConsequences(input = {}) {
  const rankedMatches = [];
  const seen = new Set();

  const pushMatch = (id, micro) => {
    if (!micro || seen.has(id) || !isValidMicroConsequence(micro, input.allowedEvidence || "")) {
      return;
    }
    seen.add(id);
    rankedMatches.push({ id, micro });
  };

  for (const token of cleanList(input.sourceTokens, 8)) {
    pushMatch(String(token), resolveTokenMicro(token));
  }

  const context = collectContextText(input);
  for (const match of matchRules(context, CONSEQUENCE_MICRO_RULES)) {
    pushMatch(match.id, match.micro);
  }

  for (const match of matchRules(input.allowedEvidence || "", EVIDENCE_MICRO_RULES)) {
    pushMatch(match.id, match.micro);
  }

  const primary = pickPrimaryMicro(rankedMatches);
  return primary ? [primary] : [];
}

function formatStandaloneMicro(text = "") {
  const body = String(text || "").trim();
  if (!body) return "";

  if (/^isso costuma/i.test(body)) {
    const lead = body.charAt(0).toUpperCase() + body.slice(1);
    return lead.endsWith(".") ? lead : `${lead}.`;
  }

  if (/^o benefício costuma/i.test(body)) {
    const lead = body.charAt(0).toUpperCase() + body.slice(1);
    return lead.endsWith(".") ? lead : `${lead}.`;
  }

  if (/^especialmente\b/i.test(body)) {
    const clause = body.charAt(0).toLowerCase() + body.slice(1);
    return `Isso costuma ser notado ${clause}${clause.endsWith(".") ? "" : "."}`;
  }

  if (/^principalmente\b/i.test(body)) {
    const clause = body.charAt(0).toLowerCase() + body.slice(1);
    return `Isso costuma aparecer ${clause}${clause.endsWith(".") ? "" : "."}`;
  }

  if (/^algo que costuma/i.test(body)) {
    const lead = body.charAt(0).toUpperCase() + body.slice(1);
    return lead.endsWith(".") ? lead : `${lead}.`;
  }

  if (/^quando o aparelho|^quando o equipamento/i.test(body)) {
    const clause = body.charAt(0).toLowerCase() + body.slice(1);
    return `Isso costuma aparecer principalmente ${clause}${clause.endsWith(".") ? "" : "."}`;
  }

  const clause = body.charAt(0).toLowerCase() + body.slice(1);
  return `Isso costuma aparecer principalmente ${clause}${clause.endsWith(".") ? "" : "."}`;
}

/**
 * @param {Record<string, unknown>} facts
 * @returns {Record<string, unknown>}
 */
export function enrichConsequencesWithMicroImpacts(facts = {}) {
  if (!facts || typeof facts !== "object") return facts;
  if (facts.mode === "fallback_cautious" || facts.mode === "fallback") {
    return { ...facts, microConsequences: [], primaryMicroConsequence: "" };
  }

  const microConsequences = buildMicroConsequences({
    strengthConsequences: facts.strengthConsequences,
    idealForConsequences: facts.idealForConsequences,
    noteConsequences: facts.noteConsequences,
    openingSummary: facts.openingSummary,
    allowedEvidence: facts.allowedEvidence,
    productName: facts.productName,
    category: facts.category,
    mode: facts.mode,
    sourceTokens: facts.sourceTokens,
  });

  const primaryRaw = microConsequences[0] || "";
  const primaryMicroConsequence =
    facts.mode === "data_layer"
      ? formatStandaloneMicro(primaryRaw)
      : primaryRaw;

  return {
    ...facts,
    microConsequences,
    primaryMicroConsequence,
    microDelivery: facts.mode === "data_layer" ? "standalone" : "append",
  };
}
