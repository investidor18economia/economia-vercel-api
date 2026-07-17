/**
 * PATCH 8.0A — Company Knowledge Layer
 *
 * Camada institucional oficial da MIA / Teilor.
 * Não decide compra, ranking, winner ou anchor — apenas fornece fatos
 * estruturados para verbalização controlada.
 */

export const ABOUT_MIA_SUBTOPICS = Object.freeze({
  IDENTITY: "IDENTITY",
  PURPOSE: "PURPOSE",
  HOW_IT_WORKS: "HOW_IT_WORKS",
  TRUST: "TRUST",
  COMMISSION: "COMMISSION",
  MONETIZATION: "MONETIZATION",
  PRIVACY: "PRIVACY",
  LIMITATIONS: "LIMITATIONS",
  DIFFERENTIATOR: "DIFFERENTIATOR",
  COMPANY: "COMPANY",
  CREATOR: "CREATOR",
});

/** PATCH 11A.5F — official naming for social/identity verbalization */
export const MIA_OFFICIAL_BRAND = Object.freeze({
  assistantName: "MIA",
  companyName: "Teilor",
});

const STALE_BRAND_PATTERN = /\b(economia|economia-ai|app economia|app economia)\b/i;

function normalizeIdentityQuery(query = "") {
  return String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function isSimpleBriefIdentityQuery(query = "") {
  const q = normalizeIdentityQuery(query);
  return (
    /\b(quem e voce|quem e vc|quem e a mia|o que e a mia|voce e quem|vc e quem)\b/.test(q) ||
    /\b(voce e uma pessoa|vc e uma pessoa|voce e humana|e da teilor|da teilor)\b/.test(q) ||
    /\b(conversar normalmente|so fala de compras|so sabe falar|trocar ideia)\b/.test(q)
  );
}

export function buildBriefOfficialIdentityVerbalizationContext() {
  return [
    "IDENTIDADE OFICIAL (obrigatório — verbalize com naturalidade):",
    `- Nome: ${MIA_OFFICIAL_BRAND.assistantName}`,
    `- Empresa: ${MIA_OFFICIAL_BRAND.companyName}`,
    "- Especialidade principal: ajudar pessoas a comprar melhor",
    "- Também mantém conversas casuais de forma natural",
    "- Não é humana; não fingir experiências humanas",
    "- Não mencionar EconomIA, economia-ai ou app EconomIA",
    "- Resposta breve: 1-2 frases; sem pitch; sem lista de capacidades; sem pergunta automática",
  ].join("\n");
}

export function buildBriefOfficialIdentityReply(query = "") {
  const q = normalizeIdentityQuery(query);

  if (/\b(uma pessoa|humana|gente real|ser humano)\b/.test(q)) {
    return "Não — sou a MIA, inteligência de compras da Teilor, não uma pessoa.";
  }
  if (/\b(conversar normalmente|so fala de compras|so sabe falar|sabe falar de compras|trocar ideia|posso conversar)\b/.test(q)) {
    return "Sim — sou a MIA, da Teilor. Especialidade em compras, mas dá pra conversar normalmente também.";
  }
  if (/\b(da teilor|e da teilor)\b/.test(q)) {
    return "Sim — sou a MIA, da Teilor.";
  }
  if (/\b(o que e a mia|o que e mia)\b/.test(q)) {
    return "Sou a MIA, da Teilor — inteligência de compras para ajudar você a decidir melhor.";
  }

  return "Sou a MIA, da Teilor — especialista em compras quando você precisa, e consigo conversar normalmente também.";
}

export function containsStaleBrandReference(text = "") {
  return STALE_BRAND_PATTERN.test(
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );
}

const OFFICIAL_FACTS = Object.freeze({
  [ABOUT_MIA_SUBTOPICS.IDENTITY]: [
    "A MIΛ é a assistente inteligente da Teilor, focada em decisões de compra online.",
    "A MIΛ não é um catálogo genérico: interpreta contexto, prioridades e trade-offs antes de sugerir.",
    "A Teilor constrói a MIΛ como IA vertical para compras — não como chat genérico.",
  ],
  [ABOUT_MIA_SUBTOPICS.PURPOSE]: [
    "O objetivo da MIΛ é ajudar você a comprar melhor, com clareza e confiança — não apenas achar o menor preço.",
    "A MIΛ organiza informação e consequências para que sua decisão fique mais segura.",
    "A MIΛ não substitui seu julgamento: ela estrutura a decisão para você decidir melhor.",
  ],
  [ABOUT_MIA_SUBTOPICS.HOW_IT_WORKS]: [
    "Você explica o que precisa; a MIΛ entende contexto, orçamento, uso e prioridades.",
    "Ela compara opções reais, explica diferenças, limitações e o motivo de cada sugestão.",
    "Quando faz sentido, a MIΛ pode acompanhar favoritos e alertas — mas a decisão final é sua.",
  ],
  [ABOUT_MIA_SUBTOPICS.TRUST]: [
    "A MIΛ foi desenhada para explicar o porquê das recomendações, com transparência.",
    "Recomendações não mudam porque alguém pagou mais para aparecer.",
    "Se algo não ficou claro, você pode questionar a lógica — a MIΛ responde com honestidade.",
  ],
  [ABOUT_MIA_SUBTOPICS.COMMISSION]: [
    "A MIΛ não ganha comissão por indicação.",
    "Recomendações não são influenciadas por pagamento de lojas ou marcas.",
    "O interesse priorizado é o do usuário, não o de quem paga mais para aparecer.",
  ],
  [ABOUT_MIA_SUBTOPICS.MONETIZATION]: [
    "A Teilor constrói produto e tecnologia de decisão de compra — não monetiza via comissão por indicação.",
    "O modelo busca sustentar uma experiência confiável de compra assistida, não empurrar produto.",
    "Transparência sobre monetização faz parte da proposta de confiança da plataforma.",
  ],
  [ABOUT_MIA_SUBTOPICS.PRIVACY]: [
    "A MIΛ usa o contexto da conversa para ajudar na decisão atual — não vende seus dados.",
    "Informações da sessão servem para continuidade e personalização da experiência, não para revenda.",
    "Se quiser detalhes específicos de privacidade, o canal oficial é contato@teilor.com.br.",
  ],
  [ABOUT_MIA_SUBTOPICS.LIMITATIONS]: [
    "A MIΛ pode errar ou ficar desatualizada em preço/disponibilidade — preços mudam e lojas variam.",
    "Ela não substitui pesquisa humana em casos muito específicos ou urgentes.",
    "Quando falta contexto, a MIΛ pede esclarecimento em vez de inventar conclusão.",
  ],
  [ABOUT_MIA_SUBTOPICS.DIFFERENTIATOR]: [
    "Diferente de IA genérica, a MIΛ é vertical para compras: contexto, trade-offs e decisão.",
    "Ela não responde tudo sobre tudo — aprofunda o tipo de problema que compras online exigem.",
    "O foco é clareza na decisão, não volume de respostas genéricas.",
  ],
  [ABOUT_MIA_SUBTOPICS.COMPANY]: [
    "A Teilor é a empresa por trás da MIΛ, focada em inteligência para decisões de compra.",
    "A missão é ajudar pessoas a comprarem melhor, com mais clareza, contexto e confiança.",
    "EconomIA / app MIΛ é a experiência de compra assistida construída pela Teilor.",
  ],
  [ABOUT_MIA_SUBTOPICS.CREATOR]: [
    "A MIΛ é um produto construído pela Teilor, com arquitetura própria de decisão de compra.",
    "O time prioriza transparência, independência de recomendação e utilidade real na decisão.",
    "Para contato institucional: contato@teilor.com.br.",
  ],
});

const SUBTOPIC_DETECTORS = [
  {
    id: ABOUT_MIA_SUBTOPICS.IDENTITY,
    weight: 10,
    test: (q) =>
      /\b(quem e (voce|vc|a mia|mia)|voce e quem|vc e quem|o que e (a )?(mia|economia)|oq e (a )?(mia|economia))\b/.test(q) ||
      /\b(voce e uma ia|vc e uma ia|voce e um (site|app|bot|robo)|vc e um (site|app|bot|robo))\b/.test(q) ||
      /\b(quem sao voces|quem sao vcs|quem vcs sao|quem voces sao)\b/.test(q),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.COMPANY,
    weight: 9,
    test: (q) =>
      /\b(o que e a teilor|oq e a teilor|o que a teilor faz|pra que serve a teilor|teilor faz o que)\b/.test(q) ||
      /\b(o que e a economia|oq e a economia|o que a economia faz|pra que serve a economia|economia faz o que)\b/.test(q) ||
      /\b(qual a de voces|qual a de vcs|qual e a empresa|qual e a plataforma)\b/.test(q),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.PURPOSE,
    weight: 8,
    test: (q) =>
      /\b(o que voce faz|o que vc faz|oq voce faz|oq vc faz|qual sua funcao|qual seu proposito|para que voce serve|pra que voce serve)\b/.test(q) ||
      /\b(como voce pode me ajudar|como vc pode me ajudar|como voce ajuda|como vc ajuda)\b/.test(q),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.COMMISSION,
    weight: 10,
    test: (q) =>
      /\b(recebe(m)? comissao|ganha(m)? comissao|comissao por indica|pagam por indicacao|pagam pra indicar)\b/.test(q) ||
      /\b(ganham quando eu compro|ganha quando compro|ganham se eu comprar|ganha se eu comprar)\b/.test(q) ||
      /\b(voces ganham quando compro|vcs ganham quando compro|voce ganha quando compro|vc ganha quando compro)\b/.test(q) ||
      /\b(lojas pagam voces|marcas pagam voces|loja paga voces|pagam mais pra aparecer)\b/.test(q) ||
      /\b(c[eê]s ganham quando compro|ce ganha quando compro)\b/.test(q),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.TRUST,
    weight: 9,
    test: (q) =>
      (
        /\b(posso confiar|da pra confiar|posso trustar|confio em voce|confio em vc)\b/.test(q) &&
        !/\b(nessa|nesse|essa|esse|isso|recomendacao|escolha|produto|opcao|indicacao)\b/.test(q)
      ) ||
      /\b(voce e imparcial|vc e imparcial|e imparcial|sao imparciais|favorece(m)? alguma|favorece loja|puxa(m)? sardinha|puxar sardinha)\b/.test(q) ||
      /\b(recomenda quem paga|empurra produto|empurra compra|e propaganda|isso e propaganda|marketing disfarçado)\b/.test(q) ||
      /\b(pq confiar|por que confiar|porque confiar)\b/.test(q),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.HOW_IT_WORKS,
    weight: 8,
    test: (q) =>
      (
        /\b(como (voce|vc|a mia|mia) (funciona|trabalha|escolhe|decide|recomenda|chega|analisa))\b/.test(q) ||
        /\b(como funciona isso|como isso funciona|como voces funcionam|como vcs funcionam)\b/.test(q)
      ) &&
      !/\b(esse|essa|isso|nele|nela|nesse|nessa|deste|desta|recomendacao|escolha)\b/.test(q),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.PRIVACY,
    weight: 9,
    test: (q) =>
      /\b(vendem meus dados|vende(m)? meus dados|vendem dados|compartilham dados|compartilha(m)? dados)\b/.test(q) ||
      /\b(guardam (minhas )?informac\w*|armazenam (minhas )?informac\w*|usam meus dados|guardam dados)\b/.test(q) ||
      (
        /\b(privacidade|lgpd|meus dados)\b/.test(q) &&
        /\b(voces|vcs|mia|teilor|economia|app)\b/.test(q)
      ),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.LIMITATIONS,
    weight: 8,
    test: (q) =>
      /\b(voce pode errar|vc pode errar|pode errar|tem limitac|quais (suas )?limitac|limitac\w*)\b/.test(q) ||
      /\b(o que voce nao consegue|o que vc nao consegue|nao consegue fazer)\b/.test(q) ||
      /\b(substitui pesquisa|substitui google|substitui minha pesquisa)\b/.test(q),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.DIFFERENTIATOR,
    weight: 8,
    test: (q) =>
      /\b(melhor que (o )?chatgpt|melhor que chat gpt|diferencial da mia|diferencial do app|por que usar a mia|por que usar voce)\b/.test(q) ||
      /\b(o que te diferencia|qual o diferencial|diferenca pra chatgpt|diferente do chatgpt)\b/.test(q),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.MONETIZATION,
    weight: 7,
    test: (q) =>
      /\b(como voces ganham|como vcs ganham|como ganham dinheiro|como voces monetiz|modelo de negocio|como se sustenta)\b/.test(q) &&
      !/\b(comissao)\b/.test(q),
  },
  {
    id: ABOUT_MIA_SUBTOPICS.CREATOR,
    weight: 7,
    test: (q) =>
      /\b(quem criou|quem fez|quem ta por tras|quem ta por trás|quem desenvolveu|quem esta por tras|quem está por trás|quem ta atras disso)\b/.test(q),
  },
];

function normalizeInstitutionalQuery(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyAboutMiaSubtopics(query = "") {
  const q = normalizeInstitutionalQuery(query);
  if (!q) return [];

  const hits = SUBTOPIC_DETECTORS
    .filter((detector) => {
      try {
        return detector.test(q);
      } catch {
        return false;
      }
    })
    .map((detector) => ({ id: detector.id, weight: detector.weight }))
    .sort((a, b) => b.weight - a.weight);

  const seen = new Set();
  return hits.filter((hit) => {
    if (seen.has(hit.id)) return false;
    seen.add(hit.id);
    return true;
  });
}

export function resolvePrimaryAboutMiaSubtopic(query = "") {
  const ranked = classifyAboutMiaSubtopics(query);
  return ranked[0]?.id || ABOUT_MIA_SUBTOPICS.IDENTITY;
}

export function getAboutMiaOfficialFacts(subtopic = ABOUT_MIA_SUBTOPICS.IDENTITY) {
  return OFFICIAL_FACTS[subtopic] || OFFICIAL_FACTS[ABOUT_MIA_SUBTOPICS.IDENTITY];
}

export function buildAboutMiaKnowledgePacket(query = "") {
  const subtopics = classifyAboutMiaSubtopics(query);
  const primary = subtopics[0]?.id || resolvePrimaryAboutMiaSubtopic(query);
  const secondary = subtopics.slice(1, 3).map((item) => item.id);
  const factIds = [primary, ...secondary.filter((id) => id !== primary)];
  const uniqueFactIds = [...new Set(factIds)];

  const facts = uniqueFactIds.flatMap((id) => getAboutMiaOfficialFacts(id).slice(0, 2));

  return {
    primarySubtopic: primary,
    secondarySubtopics: secondary,
    subtopics: uniqueFactIds,
    facts: [...new Set(facts)],
  };
}

export function buildAboutMiaVerbalizationContext(query = "") {
  const packet = buildAboutMiaKnowledgePacket(query);
  const lines = [
    "CONTEXTO INSTITUCIONAL OFICIAL (fonte de verdade — verbalize com naturalidade):",
    `Tema principal: ${packet.primarySubtopic}`,
  ];

  if (packet.secondarySubtopics.length > 0) {
    lines.push(`Temas complementares: ${packet.secondarySubtopics.join(", ")}`);
  }

  lines.push("Fatos oficiais:");
  packet.facts.forEach((fact) => lines.push(`- ${fact}`));
  lines.push(
    "Regras: responda só com base nesses fatos; não invente política comercial; não abra busca de produto; preserve anchor se existir; 2-4 frases."
  );

  return lines.join("\n");
}

export function buildAboutMiaDeterministicFallback(query = "") {
  const packet = buildAboutMiaKnowledgePacket(query);
  return packet.facts.slice(0, 3).join("\n\n");
}

export function isGenericInstitutionalFallbackReply(text = "") {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("posso te ajudar com compras") ||
    t.includes("me fala o produto que voce quer analisar") ||
    t.includes("me fala o produto que você quer analisar")
  );
}
