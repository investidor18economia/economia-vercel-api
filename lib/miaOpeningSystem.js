export const MIA_OPENING_TYPING_MS = 1200;
export const MIA_OPENING_TYPING_REDUCED_MS = 400;
export const MIA_OPENING_RECENT_KEY = "mia_opening_recent_base_phrases";
export const MIA_SESSION_OPENING_KEY = "mia_session_opening";
export const MIA_SESSION_ID_KEY = "mia_session_id";
export const MIA_OPENING_RECENT_LIMIT = 10;

export const miaOpeningBasePhrases = [
  "Me conta o que você está pensando em comprar.",
  "Qual compra você está tentando decidir?",
  "Me conta o que você procura e eu te ajudo a filtrar as opções.",
  "Me conta o cenário e eu te ajudo a organizar as opções.",
  "Tem alguma compra que você quer acertar de primeira?",
  "O que você procura e o que mais importa nessa escolha?",
  "Me conta o que você procura e eu te mostro os caminhos.",
  "Me diz o que você quer comprar. O resto a gente resolve.",
  "O que você quer comprar e o que mais importa para você?",
  "Me conta o que você quer comprar e vamos começar.",
  "Me conta o que você está tentando resolver.",
  "O que você quer comprar sem ficar na dúvida depois?",
  "Tem alguma compra ocupando sua cabeça ultimamente?",
  "O que você quer encontrar e ainda não conseguiu decidir?",
  "Me fala o que você procura e eu te ajudo a enxergar as opções.",
  "Qual é a compra que trouxe você até aqui?",
  "O que você está tentando descobrir antes de comprar?",
  "Me conta o que você quer levar e eu te ajudo a analisar.",
  "O que você quer comprar sem precisar mergulhar em dezenas de reviews?",
  "Tem alguma escolha que você quer fazer com mais confiança?",
  "Me fala o que você procura e a gente desenrola isso juntos.",
  "Qual produto você está pesquisando ultimamente?",
  "O que você quer comprar sem perder tanto tempo comparando?",
  "Me conta o que está procurando e vamos simplificar essa decisão.",
  "Tem alguma compra que você quer acertar de primeira?",
  "O que você está tentando entender melhor?",
  "Me fala o que você procura e eu ajudo a organizar as ideias.",
  "O que você quer levar para casa sem ficar se perguntando se escolheu certo?",
  "Tem alguma compra que está mais difícil do que deveria?",
  "O que você está procurando hoje?",
  "Me conta qual é a dúvida da vez.",
  "O que você quer comprar e ainda não bateu o martelo?",
  "Tem alguma decisão que você quer tomar com mais tranquilidade?",
  "Me fala o que você procura e eu te ajudo a separar o que importa.",
  "O que você está tentando comparar?",
  "Qual compra você quer resolver hoje sem complicação?",
  "Tem alguma opção te deixando indeciso?",
  "O que você está considerando comprar neste momento?",
  "Me conta o que chamou sua atenção recentemente.",
  "O que você quer analisar antes de investir seu dinheiro?",
  "Qual compra você gostaria de resolver hoje?",
  "Me fala o que você procura e vamos chegar numa boa resposta.",
  "Tem algo que você quer comprar mas ainda não está convencido?",
  "O que você está pesquisando sem chegar numa conclusão?",
  "Me conta o que você procura e eu ajudo a reduzir o caminho.",
  "Qual produto está te fazendo pesquisar mais do que gostaria?",
  "O que você quer comprar sem precisar abrir vinte abas?",
  "Tem alguma compra que você quer fazer com mais segurança?",
  "O que você está tentando decidir agora?",
  "Me fala o que você quer encontrar e a gente começa por aí.",
  "O que você está procurando que realmente valha a pena?",
  "Me conta qual compra está no radar.",
  "O que você quer comprar e ainda está avaliando?",
  "Tem alguma escolha que você quer fazer sem arrependimento?",
  "Me fala o que você procura e eu te ajudo a chegar numa conclusão.",
  "O que você está tentando resolver antes de clicar em comprar?",
  "Qual é a decisão de compra do dia?",
  "Me conta o que você está procurando e vamos analisar juntos.",
  "O que você quer comprar e ainda sente que falta alguma informação?",
  "Me fala o que está procurando e vamos descobrir a melhor direção."
];

const MICROTURN_BLOCKS = [
  {
    id: "madrugada",
    start: 0,
    end: 4 * 60,
    phrases: [
      "Resolveu pesquisar isso justamente agora? 😄",
      "Ainda firme por aí?",
      "Madrugada produtiva, hein?",
      "O sono não venceu hoje? 👀",
      "Aproveitando o silêncio da madrugada?",
      "Essa hora costuma render boas pesquisas.",
      "Ainda acordado e resolvendo pendências?",
      "A madrugada tem seus benefícios. 😎",
      "Tem gente dormindo. Tem gente pesquisando. 😄",
      "Nada como uma madrugada tranquila pra resolver umas coisas.",
      "Essa hora costuma ser boa pra pensar com calma.",
      "Ainda por aí?",
      "O mundo desacelerou, mas você não.",
      "Madrugada e curiosidade costumam andar juntas.",
      "Aproveitando que ninguém está te interrompendo? 😆",
      "Tem algo especial que te trouxe aqui essa hora?",
      "A essa hora as pesquisas ficam mais interessantes. 👀",
      "Muita gente dormindo, pouca gente decidindo.",
      "Parece que alguém resolveu adiantar as coisas hoje.",
      "Quem disse que boas decisões só acontecem de dia? 🌙"
    ]
  },
  {
    id: "quase_amanhecendo",
    start: 4 * 60,
    end: 6 * 60,
    phrases: [
      "Rapaz... já já o sol aparece.",
      "Quase amanhecendo e você firme por aqui. 👀",
      "O dia nem começou direito e você já pesquisando.",
      "Daqui a pouco já dá pra chamar de manhã. ☀️",
      "O café ainda nem saiu e você já está resolvendo as coisas.",
      "Já já os passarinhos começam o expediente. 🐦",
      "O relógio está quase virando de turno por aqui.",
      "Nem amanheceu e você já está no modo produtividade.",
      "O dia está chegando... e você já adiantando as decisões.",
      "Quase amanhecendo e a pesquisa continua firme.",
      "Tem gente esperando o despertador tocar. Você já saiu na frente. 😄",
      "O céu já está começando a clarear por aí?",
      "Daqui a pouco a madrugada perde o cargo oficialmente. 😆",
      "Você escolheu um horário tranquilo pra resolver as coisas.",
      "Quase manhã e você já está colocando a vida em ordem.",
      "O dia nem começou e já tem decisão sendo tomada por aqui.",
      "A essa altura já dá pra dizer que você está adiantado.",
      "Nem seis da manhã e você já está pesquisando? Respeito. 😄",
      "O sol está chegando, mas você chegou primeiro. ☀️",
      "Daqui a pouco começa outro dia... bora aproveitar."
    ]
  },
  {
    id: "manha",
    start: 6 * 60,
    end: 10 * 60 + 30,
    phrases: [
      "Café na mão e pesquisa aberta? ☕",
      "Bom horário pra resolver umas compras com calma.",
      "O dia está só começando por aqui.",
      "Nada como começar o dia colocando algumas coisas em ordem. ☀️",
      "Parece que alguém já começou o dia produtivo.",
      "Café e boas decisões costumam combinar. ☕",
      "Bora aproveitar o começo do dia?",
      "O café já entrou em ação por aí? 👀",
      "Começando o dia pesquisando? Gostei. 😄",
      "Tem gente olhando o tempo. Você já está resolvendo as compras.",
      "O dia acabou de começar e você já está por aqui.",
      "Manhã tranquila é ótima pra decidir as coisas com calma.",
      "O relógio mal acordou e você já está pesquisando. 👀",
      "Aproveitando o começo do dia pra adiantar as coisas?",
      "Tem algo satisfatório em resolver pendências logo cedo.",
      "O café da manhã nem esfriou e você já está no modo pesquisa. ☕",
      "Bom ver alguém começando o dia resolvendo as coisas.",
      "Sol aparecendo, café chegando e pesquisa rolando. ☀️",
      "O dia promete... e parece que você já começou bem. 😄",
      "Nada melhor do que começar o dia com uma decisão a menos pra tomar. 😌"
    ]
  },
  {
    id: "fim_manha",
    start: 10 * 60 + 30,
    end: 12 * 60,
    phrases: [
      "O almoço já está começando a aparecer no horizonte. 🍽️",
      "Fim de manhã costuma ser bom pra resolver umas pendências.",
      "O relógio está caminhando pro almoço.",
      "Ainda dando tempo de resolver algumas coisas antes do meio-dia.",
      "Parece que a manhã passou voando por aí também.",
      "Quase hora do almoço e você já está adiantando as coisas.",
      "O dia já engrenou por aí?",
      "Tem algo satisfatório em resolver as coisas antes do almoço.",
      "A manhã está chegando na reta final.",
      "Aproveitando os últimos quilômetros da manhã? 😄",
      "O almoço está chegando, mas ainda dá tempo de pesquisar mais uma coisinha.",
      "Fim de manhã e você firme nas decisões.",
      "Daqui a pouco o dia muda de capítulo. ☀️",
      "Tem gente pensando no almoço. Você já está resolvendo compras.",
      "A manhã ainda não acabou, mas já rendeu bastante.",
      "Parece um bom momento pra colocar algumas decisões em ordem.",
      "O meio-dia está logo ali.",
      "Ainda cabe mais uma boa decisão antes do almoço. 👀",
      "A manhã foi rápida ou foi impressão minha? 😄",
      "Daqui a pouco começa oficialmente a temporada do almoço. 🍽️"
    ]
  },
  {
    id: "almoco",
    start: 12 * 60,
    end: 13 * 60,
    phrases: [
      "Hora do almoço chegando com força por aí. 🍽️",
      "Meio-dia chegou.",
      "Enquanto muita gente está pensando no almoço, você está resolvendo as coisas.",
      "O relógio marcou a hora clássica do almoço.",
      "Meio-dia costuma ser um bom momento pra desacelerar um pouco.",
      "Tem algo tranquilo em resolver as coisas nesse horário.",
      "O almoço está na agenda de muita gente agora. 🍽️",
      "Hora de fazer uma pausa... ou resolver mais uma coisa.",
      "O dia já chegou na metade.",
      "Parece que a manhã passou rápido hoje.",
      "Meio-dia também é horário de boas decisões.",
      "Tem gente almoçando. Tem gente pesquisando. 😄",
      "O almoço chegou, mas a curiosidade continua trabalhando.",
      "Já estamos oficialmente no território do almoço. 🍽️",
      "O dia está andando rápido por aqui.",
      "Um bom horário pra resolver algo sem pressa.",
      "Meio-dia costuma trazer um respiro no ritmo do dia.",
      "Ainda cabe mais uma boa decisão antes da próxima tarefa.",
      "O relógio avisou: chegamos no meio do dia. ☀️",
      "Hora do almoço e você por aqui. Gostei. 😄"
    ]
  },
  {
    id: "pos_almoco",
    start: 13 * 60,
    end: 14 * 60 + 30,
    phrases: [
      "Pós-almoço costuma ser um bom momento pra colocar as coisas em ordem.",
      "De volta ao ritmo? 😄",
      "Hora de retomar as missões do dia.",
      "O almoço passou rápido por aí também?",
      "Parece um bom momento pra resolver algumas pendências.",
      "O dia ainda tem bastante chão pela frente.",
      "Voltando ao modo produtividade?",
      "Tem algo satisfatório em resolver as coisas depois do almoço.",
      "A tarde está só começando.",
      "Hora de colocar algumas decisões em movimento.",
      "O almoço ficou pra trás e o dia continua.",
      "Bora aproveitar o embalo da tarde?",
      "Parece um ótimo horário pra tirar algumas dúvidas.",
      "Tem muita tarde pela frente ainda.",
      "O relógio entrou oficialmente no turno da tarde.",
      "Depois do almoço as ideias costumam voltar mais organizadas. 👀",
      "Hora de seguir com os planos do dia.",
      "O dia ainda guarda algumas boas decisões.",
      "Voltando ao jogo? 😄",
      "A tarde começou e você já está por aqui."
    ]
  },
  {
    id: "tarde",
    start: 14 * 60 + 30,
    end: 16 * 60,
    phrases: [
      "A tarde está seguindo seu ritmo por aí?",
      "Ainda tem bastante dia pela frente.",
      "Parece um bom momento pra resolver algumas coisas.",
      "Como está a tarde por aí?",
      "O dia ainda está longe de acabar.",
      "Hora boa pra colocar algumas decisões em ordem.",
      "A tarde já engrenou por aí?",
      "Tem algo que você quer resolver hoje?",
      "O relógio continua andando e as decisões também.",
      "Ainda dá tempo de adiantar bastante coisa hoje.",
      "Parece que o dia entrou naquele ritmo mais tranquilo.",
      "Uma boa hora pra analisar as coisas com calma.",
      "Tem muita tarde pela frente ainda.",
      "O dia segue acontecendo e você já está por aqui.",
      "Parece um ótimo momento pra tirar algumas dúvidas.",
      "A tarde costuma ser boa pra organizar as ideias. 👀",
      "Ainda tem bastante espaço pra tomar boas decisões hoje.",
      "O dia continua e as opções também. 😄",
      "Hora de seguir riscando itens da lista.",
      "A tarde está só na metade do caminho."
    ]
  },
  {
    id: "cafe_tarde",
    start: 16 * 60,
    end: 18 * 60,
    phrases: [
      "Cheiro de café da tarde no ar. ☕",
      "O fim da tarde já está aparecendo por aqui.",
      "Parece que o dia entrou na reta final.",
      "Café da tarde combina com boas decisões. ☕",
      "O relógio já está apontando para o fim do expediente.",
      "A tarde está chegando nos capítulos finais.",
      "Tem algo tranquilo no ritmo desse horário.",
      "Hora boa pra resolver aquelas coisas que ficaram pendentes.",
      "O dia já andou bastante por aí.",
      "Parece um ótimo momento pra analisar as opções com calma.",
      "O café da tarde está quase pedindo passagem. ☕",
      "O fim do dia começa a aparecer no horizonte.",
      "Ainda dá tempo de resolver bastante coisa hoje.",
      "A tarde já rendeu alguma coisa por aí?",
      "O relógio está começando a flertar com a noite. 😄",
      "O dia desacelerando e você ainda por aqui.",
      "Hora de fechar algumas pendências antes da noite chegar.",
      "Parece que estamos entrando na parte mais tranquila do dia.",
      "O sol já começa a pensar em se despedir. ☀️",
      "Fim de tarde costuma ser um bom horário pra decidir as coisas."
    ]
  },
  {
    id: "inicio_noite",
    start: 18 * 60,
    end: 19 * 60,
    phrases: [
      "O dia já está começando a passar o bastão pra noite.",
      "A noite está chegando devagar por aí.",
      "Parece que o dia resolveu desacelerar um pouco.",
      "O relógio já está entrando no clima da noite.",
      "Hora boa pra resolver algumas coisas com mais calma.",
      "O fim do dia já está batendo na porta.",
      "O céu está mudando de turno. 🌆",
      "Parece que chegamos naquela parte mais tranquila do dia.",
      "A noite está quase assumindo o controle.",
      "O dia foi embora rápido hoje ou foi impressão minha? 😄",
      "Ainda dá tempo de encaixar uma boa decisão hoje.",
      "O ritmo já está mudando por aí também?",
      "A luz do dia está começando a se despedir. ☀️",
      "Parece um bom momento pra colocar algumas ideias em ordem.",
      "O relógio está oficialmente flertando com a noite.",
      "O expediente vai ficando pra trás e a noite vai chegando.",
      "O dia ainda não acabou, mas já mudou de clima.",
      "Tem algo especial nesse horário do dia.",
      "A noite está logo ali. 👀",
      "O dia desacelerando e você ainda resolvendo as coisas."
    ]
  },
  {
    id: "noite",
    start: 19 * 60,
    end: 22 * 60,
    phrases: [
      "Agora sim parece que o dia começou a desacelerar.",
      "Horário clássico de pegar o celular e pesquisar umas coisas. 😄",
      "A noite já está oficialmente em andamento.",
      "Parece que chegamos na parte mais tranquila do dia.",
      "Tem algo especial em pesquisar as coisas com calma à noite.",
      "O dia foi longo por aí também?",
      "Noite combina com decisões sem pressa.",
      "Parece um ótimo horário pra comparar algumas opções.",
      "A correria do dia ficou um pouco mais distante agora.",
      "O sofá e o celular costumam formar uma dupla perigosa. 😆",
      "A noite costuma ser boa conselheira pra algumas decisões.",
      "Tem gente assistindo série. Tem gente pesquisando. 😄",
      "O ritmo mudou, mas você continua resolvendo as coisas.",
      "Parece que a noite chegou de vez.",
      "Nada como analisar as coisas com um pouco mais de calma.",
      "O dia desacelerou, mas a curiosidade continua trabalhando. 👀",
      "A noite costuma ser um bom momento pra colocar ideias em ordem.",
      "Tem algo confortável nesse horário do dia.",
      "O relógio já entrou oficialmente no turno da tranquilidade.",
      "Boa hora pra olhar as opções sem a correria lá de fora."
    ]
  },
  {
    id: "fim_noite",
    start: 22 * 60,
    end: 24 * 60,
    phrases: [
      "O dia já está quase encerrando as atividades por aqui.",
      "Parece que alguém resolveu pesquisar mais uma coisinha antes de dormir. 😄",
      "A noite já está entrando nos minutos finais.",
      "Horário clássico de abrir uma aba e acabar abrindo dez. 😆",
      "O relógio já está caminhando pra meia-noite.",
      "Parece que você resolveu aproveitar os últimos momentos do dia.",
      "O dia está acabando, mas as ideias continuam aparecendo.",
      "Tem algo especial nesse horário mais silencioso.",
      "Quase meia-noite e você ainda por aqui.",
      "Algumas das melhores pesquisas acontecem nessa hora. 👀",
      "O dia desacelerou bastante por aí também?",
      "Parece um ótimo momento pra analisar as coisas sem correria.",
      "O relógio está chegando na última curva do dia.",
      "Tem gente indo dormir. Tem gente pesquisando. 😄",
      "A noite já está ficando com cara de madrugada.",
      "O dia quase acabou, mas ainda cabe mais uma boa decisão.",
      "Parece que você escolheu um horário tranquilo pra resolver as coisas.",
      "A essa hora o mundo costuma ficar um pouco mais silencioso.",
      "Quase virando o dia e você organizando as ideias.",
      "Os últimos minutos do dia costumam ser bons companheiros para uma boa pesquisa."
    ]
  }
];

function pickRandom(list) {
  if (!Array.isArray(list) || !list.length) return "";
  return list[Math.floor(Math.random() * list.length)];
}

export function getMinutesOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function getMicroturnBlockForDate(date = new Date()) {
  const minutes = getMinutesOfDay(date);
  const block = MICROTURN_BLOCKS.find((item) => minutes >= item.start && minutes < item.end);
  return block || MICROTURN_BLOCKS[0];
}

export function pickMicroturn(date = new Date()) {
  const block = getMicroturnBlockForDate(date);
  return pickRandom(block.phrases);
}

export function getOrCreateMiaSessionId() {
  if (typeof window === "undefined") return "server";
  let sessionId = window.sessionStorage.getItem(MIA_SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = `mia-sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    window.sessionStorage.setItem(MIA_SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

export function loadRecentBasePhrases() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MIA_OPENING_RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function saveRecentBasePhrase(phrase) {
  if (typeof window === "undefined" || !phrase) return;
  const recent = loadRecentBasePhrases().filter((item) => item !== phrase);
  recent.unshift(phrase);
  window.localStorage.setItem(
    MIA_OPENING_RECENT_KEY,
    JSON.stringify(recent.slice(0, MIA_OPENING_RECENT_LIMIT))
  );
}

export function pickBasePhrase() {
  const recent = new Set(loadRecentBasePhrases().slice(0, MIA_OPENING_RECENT_LIMIT));
  const eligible = miaOpeningBasePhrases.filter((phrase) => !recent.has(phrase));
  const pool = eligible.length > 0 ? eligible : miaOpeningBasePhrases;
  return pickRandom(pool);
}

export function formatOpeningMessage(microturn, basePhrase) {
  return `${microturn}\n\n${basePhrase}`;
}

export function loadSessionOpening() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(MIA_SESSION_OPENING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.microturn || !parsed.basePhrase || !parsed.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSessionOpening(opening) {
  if (typeof window === "undefined" || !opening) return;
  window.sessionStorage.setItem(MIA_SESSION_OPENING_KEY, JSON.stringify(opening));
}

export function clearSessionOpeningState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(MIA_SESSION_OPENING_KEY);
  window.sessionStorage.removeItem(MIA_SESSION_ID_KEY);
}

export function getOpeningTypingDelayMs() {
  if (typeof window === "undefined") return MIA_OPENING_TYPING_MS;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduced ? MIA_OPENING_TYPING_REDUCED_MS : MIA_OPENING_TYPING_MS;
}

export function buildMiaOpening(date = new Date()) {
  const sessionId = getOrCreateMiaSessionId();
  const microturn = pickMicroturn(date);
  const basePhrase = pickBasePhrase();
  const timestamp = Date.now();

  saveRecentBasePhrase(basePhrase);

  const opening = {
    sessionId,
    microturn,
    basePhrase,
    timestamp
  };

  saveSessionOpening(opening);

  return opening;
}

export function buildOpeningHistoryEntry(opening) {
  const resposta = formatOpeningMessage(opening.microturn, opening.basePhrase);
  return {
    pergunta: null,
    resposta,
    price: null,
    offerCard: null,
    isMiaOpening: true,
    openingMicroturn: opening.microturn,
    openingBasePhrase: opening.basePhrase
  };
}

export function resolveStoredSessionOpening() {
  const sessionId = getOrCreateMiaSessionId();
  const stored = loadSessionOpening();
  if (!stored || stored.sessionId !== sessionId) return null;
  return stored;
}
