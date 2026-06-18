/**
 * PATCH Comercial 3C-A — MIA Consequence Translation Layer
 *
 * Transforma tokens/fatos do Data Layer em consequências humanas.
 * Categoria-agnóstico; sem dependência de LLM; sem hardcode por produto.
 */

export const CONSEQUENCE_TRANSLATION_LAYER_VERSION = "3C-A.1";

export const BANNED_CONSEQUENCE_GENERIC_PHRASES = Object.freeze([
  "ótima opção",
  "otima opcao",
  "excelente escolha",
  "melhor desempenho",
  "experiência superior",
  "experiencia superior",
  "produto ideal",
  "entrega performance",
  "boa opção",
  "otimo produto",
]);

const QUALITY_WORDS = Object.freeze({
  forte: "strong",
  fraca: "weak",
  fraco: "weak",
  consistente: "consistent",
  fluida: "fluid",
  fluido: "fluid",
  limitado: "limited",
  limitada: "limited",
  generosa: "generous",
  generoso: "generous",
  maduro: "mature",
  basico: "basic",
  básico: "basic",
  premium: "premium",
  equilibrado: "balanced",
  equilibrada: "balanced",
  responsivo: "responsive",
  responsiva: "responsive",
  eficiente: "efficient",
  silencioso: "quiet",
  silenciosa: "quiet",
  compacto: "compact",
  compacta: "compact",
  amplo: "spacious",
  ampla: "spacious",
});

const AXIS_ALIASES = Object.freeze({
  camera: "camera",
  foto: "camera",
  fotos: "camera",
  video: "video",
  videos: "video",
  desempenho: "performance",
  performance: "performance",
  processamento: "performance",
  tela: "screen",
  screen: "screen",
  display: "screen",
  painel: "screen",
  bateria: "battery",
  battery: "battery",
  autonomia: "battery",
  ecossistema: "ecosystem",
  ios: "ecosystem",
  android: "ecosystem",
  software: "longevity",
  longevidade: "longevity",
  atualizacao: "longevity",
  atualizacao_software: "longevity",
  estabilidade: "stability",
  preco: "value",
  preço: "value",
  price: "value",
  valor: "value",
  custo: "value",
  armazenamento: "storage",
  storage: "storage",
  memoria: "storage",
  memória: "storage",
  som: "audio",
  audio: "audio",
  áudio: "audio",
  conforto: "comfort",
  ergonomia: "comfort",
  portabilidade: "portability",
  peso: "portability",
  refrigeracao: "cooling",
  refrigeração: "cooling",
  capacidade: "capacity",
  eficiencia: "efficiency",
  eficiência: "efficiency",
  conectividade: "connectivity",
  wifi: "connectivity",
  refresh: "screen",
  hz: "screen",
  resolucao: "screen",
  resolução: "screen",
  multitarefa: "performance",
  produtividade: "performance",
  trabalho: "productivity",
  jogos: "gaming",
  gaming: "gaming",
  gamer: "gaming",
  silencio: "noise",
  ruído: "noise",
  ruido: "noise",
  garantia: "support",
  suporte: "support",
});

const TOKEN_CONSEQUENCE_OVERRIDES = Object.freeze({
  camera_consistente: {
    strength:
      "menos preocupação em registrar bons momentos sem precisar repetir a foto várias vezes",
  },
  video_forte: {
    strength:
      "mais confiança para gravar vídeos com resultado consistente no dia a dia",
  },
  desempenho_forte: {
    strength:
      "menos sensação do aparelho chegar ao limite quando o uso fica mais pesado",
  },
  performance_forte: {
    strength:
      "menos sensação do equipamento chegar ao limite quando o uso fica mais pesado",
  },
  ios_ecossistema: {
    strength:
      "mais previsibilidade no uso diário dentro de um ecossistema já consolidado",
  },
  ecossistema_maduro: {
    strength:
      "mais previsibilidade no uso diário dentro de um ecossistema já consolidado",
  },
  tela_60hz: {
    weakness:
      "a navegação pode parecer menos fluida para quem já se acostumou com telas mais rápidas",
  },
  tela_60_hz: {
    weakness:
      "a navegação pode parecer menos fluida para quem já se acostumou com telas mais rápidas",
  },
  bateria_consistente: {
    strength:
      "menos ansiedade com recarga ao longo de um dia de uso moderado a intenso",
  },
  tela_fluida: {
    strength:
      "mais sensação de fluidez na navegação e nas interações do dia a dia",
  },
  preco_acima_media: {
    weakness: "o custo tende a pesar mais na comparação com rivais parecidos",
    risk: "pode não ser a opção mais barata dentro do segmento",
  },
  preco_acima_da_media: {
    weakness: "o custo tende a pesar mais na comparação com rivais parecidos",
    risk: "pode não ser a opção mais barata dentro do segmento",
  },
  carregador_ausente: {
    risk:
      "pode ser necessário comprar ou reutilizar carregador separadamente",
  },
  estabilidade_software: {
    ideal_for: "valoriza estabilidade e previsibilidade no uso ao longo do tempo",
  },
  uso_video_frequente: {
    ideal_for: "grava vídeos com frequência",
  },
  longevidade_uso: {
    ideal_for: "pretende permanecer vários anos com o equipamento",
  },
  uso_diario_equilibrado: {
    ideal_for: "busca equilíbrio no uso diário sem extremos",
  },
  trabalho_multitarefa: {
    ideal_for: "precisa de apoio para trabalho e multitarefa",
  },
  multitarefa_equilibrada: {
    strength:
      "uso cotidiano mais previsível mesmo quando abre várias tarefas ao mesmo tempo",
  },
  portabilidade_limitada: {
    weakness:
      "pode pesar na decisão se você precisa transportar com frequência",
  },
  camera_limitada: {
    weakness:
      "pode exigir mais atenção para obter bons resultados em situações difíceis",
  },
  eficiencia_forte: {
    strength: "menos preocupação com consumo ou desperdício no uso regular",
  },
  ruido_limitado: {
    weakness: "pode incomodar mais em ambientes silenciosos ou em uso contínuo",
  },
  ecossistema_apple: {
    ideal_for: "já vive no ecossistema Apple",
  },
  ecossistema_xbox: {
    ideal_for: "quer entrar no ecossistema Xbox",
  },
  custo_entrada: {
    strength: "menos barreira inicial para começar sem estourar o orçamento",
  },
  bom_custo_entrada: {
    strength: "menos barreira inicial para começar sem estourar o orçamento",
  },
  ecossistema_maduro: {
    strength:
      "mais previsibilidade no uso diário dentro de um ecossistema já consolidado",
  },
  nao_topo_camera_categoria: {
    weakness:
      "pode não ser a melhor escolha quando a câmera é o critério principal da compra",
  },
  preco_varia_bastante: {
    risk: "vale comparar preço entre lojas antes de fechar",
  },
  painel_responsivo: {
    strength:
      "respostas mais rápidas na interação, com menos sensação de atraso visual",
  },
  uso_misto: {
    note: "funciona bem tanto para tarefas leves quanto para uso um pouco mais exigente",
  },
  nao_mais_barato_segmento: {
    risk: "pode não ser a opção mais barata dentro do segmento",
  },
});

const AXIS_CONSEQUENCE_FRAMES = Object.freeze({
  camera: {
    strength: {
      strong:
        "mais confiança para registrar fotos sem depender de várias tentativas",
      consistent:
        "menos preocupação em registrar bons momentos sem precisar repetir a foto várias vezes",
      default:
        "mais tranquilidade na hora de registrar momentos importantes",
    },
    weakness: {
      limited:
        "pode exigir mais atenção para obter bons resultados em situações difíceis",
      default:
        "pode não ser o ponto mais forte quando a captura de imagens pesa muito na decisão",
    },
  },
  video: {
    strength: {
      strong:
        "mais confiança para gravar vídeos com resultado consistente no dia a dia",
      default:
        "mais segurança quando a gravação de vídeo faz parte da rotina",
    },
    weakness: {
      default:
        "pode deixar a desejar quando a gravação de vídeo é prioridade central",
    },
  },
  performance: {
    strength: {
      strong:
        "menos sensação do equipamento chegar ao limite quando o uso fica mais pesado",
      balanced:
        "uso cotidiano mais previsível mesmo quando abre várias tarefas ao mesmo tempo",
      default:
        "mais margem de tranquilidade quando o uso deixa de ser básico",
    },
    weakness: {
      limited:
        "pode dar sinais de limitação mais cedo quando o uso fica exigente",
      default:
        "pode não acompanhar tarefas mais pesadas com a mesma folga",
    },
  },
  screen: {
    strength: {
      fluid:
        "navegação e interações com sensação mais contínua no dia a dia",
      responsive:
        "menos sensação de atraso ou resposta lenta na interação visual",
      default:
        "visual mais confortável durante o uso prolongado",
    },
    weakness: {
      limited:
        "a navegação pode parecer menos fluida para quem já se acostumou com telas mais rápidas",
      default:
        "pode parecer menos fluida para quem veio de experiências mais rápidas",
    },
  },
  battery: {
    strength: {
      consistent:
        "menos ansiedade com recarga ao longo de um dia de uso moderado a intenso",
      generous:
        "menos interrupções para recarregar durante a rotina",
      default:
        "menos preocupação com autonomia em uso cotidiano",
    },
    weakness: {
      limited:
        "pode exigir recarga mais cedo quando o uso fica intenso",
      default:
        "pode pedir mais atenção à autonomia em dias mais longos",
    },
  },
  ecosystem: {
    strength: {
      mature:
        "mais previsibilidade no uso diário dentro de um ecossistema já consolidado",
      default:
        "menos fricção se você já usa serviços e acessórios compatíveis",
    },
    weakness: {
      default:
        "pode limitar a integração se você depende de outro ecossistema",
    },
  },
  longevity: {
    strength: {
      default:
        "mais tranquilidade para manter o equipamento por mais tempo sem sensação de obsolescência imediata",
    },
    ideal_for: {
      default:
        "pretende permanecer vários anos com o equipamento",
    },
  },
  stability: {
    strength: {
      default:
        "mais previsibilidade no uso diário, com menos surpresas na rotina",
    },
    ideal_for: {
      default:
        "valoriza estabilidade e previsibilidade no uso ao longo do tempo",
    },
  },
  value: {
    strength: {
      default:
        "menos barreira inicial para fechar a compra sem estourar o orçamento",
    },
    weakness: {
      default:
        "o custo tende a pesar mais na comparação com rivais parecidos",
    },
    risk: {
      default: "pode não ser a opção mais barata dentro do segmento",
    },
  },
  storage: {
    strength: {
      default:
        "menos aperto para guardar arquivos, apps ou conteúdos acumulados",
    },
    weakness: {
      limited:
        "pode apertar cedo se você guarda muito conteúdo ou instala muitos apps",
      default:
        "pode exigir mais gestão de espaço ao longo do tempo",
    },
  },
  audio: {
    strength: {
      default:
        "mais imersão e clareza quando o som pesa na experiência",
    },
    weakness: {
      default:
        "pode não satisfazer quem exige som como prioridade principal",
    },
  },
  comfort: {
    strength: {
      default:
        "menos incômodo em sessões mais longas de uso",
    },
    weakness: {
      default:
        "pode cansar mais cedo em uso prolongado",
    },
  },
  portability: {
    strength: {
      compact:
        "menos esforço para transportar no dia a dia",
      default:
        "mais facilidade para levar quando precisa sair com o equipamento",
    },
    weakness: {
      default:
        "pode pesar na decisão se você precisa transportar com frequência",
    },
  },
  capacity: {
    strength: {
      spacious:
        "menos ajuste no dia a dia para acomodar o que você precisa guardar ou usar",
      default:
        "mais folga para o uso previsto sem ficar no limite cedo demais",
    },
    weakness: {
      default:
        "pode ficar apertado se a demanda real for maior do que o esperado",
    },
  },
  efficiency: {
    strength: {
      default:
        "menos preocupação com consumo ou desperdício no uso regular",
    },
    weakness: {
      default:
        "pode pesar mais no custo de operação ao longo do tempo",
    },
  },
  connectivity: {
    strength: {
      default:
        "menos fricção para conectar e manter estabilidade no uso cotidiano",
    },
    weakness: {
      default:
        "pode limitar a experiência se conectividade for requisito central",
    },
  },
  productivity: {
    ideal_for: {
      default:
        "precisa de apoio para trabalho e multitarefa",
    },
  },
  gaming: {
    strength: {
      default:
        "mais folga quando o uso inclui tarefas ou conteúdos mais exigentes",
    },
    ideal_for: {
      default: "prioriza uso voltado a jogos ou tarefas pesadas",
    },
  },
  noise: {
    weakness: {
      default:
        "pode incomodar mais em ambientes silenciosos ou em uso contínuo",
    },
  },
  support: {
    risk: {
      default:
        "vale confirmar cobertura, assistência e condições de suporte antes de fechar",
    },
  },
  generic: {
    strength: {
      default:
        "um ganho prático perceptível no uso cotidiano, sem depender de detalhe técnico isolado",
    },
    weakness: {
      default:
        "um tradeoff perceptível que vale pesar antes de fechar a compra",
    },
    ideal_for: {
      default: "combina com o perfil de uso descrito",
    },
    avoid_if: {
      default: "pode não combinar com o perfil de uso descrito",
    },
    risk: {
      default: "um ponto de atenção que merece confirmação antes da compra",
    },
    note: {
      default: "um detalhe prático que ajuda a calibrar a expectativa",
    },
  },
});

function cleanToken(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .trim();
}


function resolveQualityProfile(segments = []) {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const quality = QUALITY_WORDS[segments[i]];
    if (quality) return quality;
  }
  return "default";
}

function resolveAxisKey(segments = []) {
  for (const segment of segments) {
    if (AXIS_ALIASES[segment]) return AXIS_ALIASES[segment];
  }
  for (const segment of segments) {
    if (segment.includes("hz")) return "screen";
    if (segment.includes("camera")) return "camera";
    if (segment.includes("video")) return "video";
    if (segment.includes("bateria") || segment.includes("battery")) return "battery";
    if (segment.includes("tela") || segment.includes("screen")) return "screen";
    if (segment.includes("ecosystem") || segment.includes("ecossistema")) return "ecosystem";
  }
  return "generic";
}

function pickFrameConsequence(axisKey, fieldType, qualityProfile) {
  const axisFrames = AXIS_CONSEQUENCE_FRAMES[axisKey] || AXIS_CONSEQUENCE_FRAMES.generic;
  const typeFrames = axisFrames[fieldType] || AXIS_CONSEQUENCE_FRAMES.generic[fieldType];
  if (!typeFrames) {
    return AXIS_CONSEQUENCE_FRAMES.generic[fieldType]?.default || "";
  }
  return typeFrames[qualityProfile] || typeFrames.default || "";
}

function mapFieldTypeToConsequenceType(fieldType = "strength") {
  if (fieldType === "ideal_for") return "ideal_for";
  if (fieldType === "avoid_if") return "avoid_if";
  if (fieldType === "risk_notes" || fieldType === "risk") return "risk";
  if (fieldType === "notes" || fieldType === "note") return "note";
  if (fieldType === "weaknesses" || fieldType === "weakness") return "weakness";
  return "strength";
}

function humanizeProseFallback(value = "", fieldType = "strength") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^ponto de atenção:/i.test(raw)) {
    return raw.replace(/^ponto de atenção:\s*/i, "");
  }

  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  if (
    wordCount >= 5 &&
    /\b(pode|vale|não|nao|se você|se voce|carregador|preço|preco|varia|acompanha)\b/i.test(raw)
  ) {
    return raw;
  }

  const type = mapFieldTypeToConsequenceType(fieldType);

  if (type === "ideal_for") {
    if (/^quem /i.test(raw)) return raw.replace(/^quem /i, "");
    if (/^para /i.test(raw)) return raw.replace(/^para /i, "");
    return raw;
  }

  if (type === "weakness" || type === "risk" || type === "avoid_if") {
    if (/^(o|a|os|as) /i.test(raw)) return raw;
    if (/^(não|nao|pode|vale|carregador)/i.test(raw)) return raw;
    return `pode pesar na decisão: ${raw.replace(/^./, (char) => char.toLowerCase())}`;
  }

  if (/^(mais|menos|pode|vale|funciona|costuma|tende)/i.test(raw)) {
    return raw;
  }

  return `tende a ajudar com ${raw.replace(/^./, (char) => char.toLowerCase())} no uso cotidiano`;
}

function isFullHumanSentence(value = "") {
  const raw = String(value || "").trim();
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  return (
    wordCount >= 5 &&
    /\b(pode|vale|não|nao|se você|se voce|carregador|preço|preco|varia|acompanha)\b/i.test(raw)
  );
}

/**
 * @param {string} token
 * @param {"strength"|"weakness"|"ideal_for"|"avoid_if"|"risk"|"note"} fieldType
 * @returns {{ type: string, sourceToken: string, consequence: string }}
 */
export function translateTokenToStructuredConsequence(token = "", fieldType = "strength") {
  const raw = String(token || "").trim();
  const type = mapFieldTypeToConsequenceType(fieldType);

  if (!raw) {
    return { type, sourceToken: "", consequence: "" };
  }

  if (type === "ideal_for" && /^quem\s+/i.test(raw)) {
    return {
      type,
      sourceToken: raw,
      consequence: raw.replace(/^quem\s+/i, ""),
    };
  }

  if (isFullHumanSentence(raw)) {
    return {
      type,
      sourceToken: raw,
      consequence: humanizeProseFallback(raw, fieldType),
    };
  }

  const normalized = cleanToken(raw.replace(/\s+/g, "_"));

  const override = TOKEN_CONSEQUENCE_OVERRIDES[normalized];
  if (override?.[type] || override?.[fieldType]) {
    return {
      type,
      sourceToken: normalized,
      consequence: override[type] || override[fieldType],
    };
  }

  if (!normalized.includes("_")) {
    return {
      type,
      sourceToken: raw,
      consequence: humanizeProseFallback(raw, fieldType),
    };
  }

  const segments = normalized.split("_").filter(Boolean);
  const axisKey = resolveAxisKey(segments);
  const qualityProfile = resolveQualityProfile(segments);
  const consequence = pickFrameConsequence(axisKey, type, qualityProfile);

  return {
    type,
    sourceToken: normalized,
    consequence,
  };
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

function translateFieldList(values = [], fieldType = "strength") {
  return cleanList(values, 5)
    .map((entry) => translateTokenToStructuredConsequence(entry, fieldType))
    .filter((item) => item.consequence);
}

/**
 * @param {Record<string, unknown>} trustedSpecs
 * @returns {{
 *   strengths: Array<{type:string,sourceToken:string,consequence:string}>,
 *   weaknesses: Array<{type:string,sourceToken:string,consequence:string}>,
 *   idealFor: Array<{type:string,sourceToken:string,consequence:string}>,
 *   avoidIf: Array<{type:string,sourceToken:string,consequence:string}>,
 *   notes: Array<{type:string,sourceToken:string,consequence:string}>,
 *   riskNotes: Array<{type:string,sourceToken:string,consequence:string}>,
 * }}
 */
export function translateDataLayerFieldsToConsequences(trustedSpecs = {}) {
  const notes = cleanList(
    [
      ...cleanList(trustedSpecs.notes, 2),
      ...cleanList(trustedSpecs.market_notes, 2),
      ...cleanList(trustedSpecs.strategic_notes, 2),
    ],
    3
  );

  return {
    strengths: translateFieldList(trustedSpecs.strengths, "strength"),
    weaknesses: translateFieldList(trustedSpecs.weaknesses, "weakness"),
    idealFor: translateFieldList(trustedSpecs.ideal_for, "ideal_for"),
    avoidIf: translateFieldList(trustedSpecs.avoid_if, "avoid_if"),
    notes: translateFieldList(notes, "note"),
    riskNotes: translateFieldList(trustedSpecs.risk_notes, "risk"),
  };
}

export function containsInternalTokenLeak(text = "") {
  const body = String(text || "");
  if (/\b[a-z0-9]+(?:_[a-z0-9]+)+\b/i.test(body)) return true;
  if (/;\s*[a-z0-9_]+(?:_[a-z0-9_]+)+/i.test(body)) return true;
  return false;
}

export function containsBannedConsequenceGenericPhrase(text = "") {
  const normalized = String(text || "").toLowerCase();
  return BANNED_CONSEQUENCE_GENERIC_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function extractConsequenceTexts(items = [], max = 3) {
  return items
    .map((item) => String(item?.consequence || item || "").trim())
    .filter(Boolean)
    .slice(0, max);
}
