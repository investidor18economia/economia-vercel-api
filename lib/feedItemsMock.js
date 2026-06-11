/**
 * Mock do Feed Inteligente da MIΛ — substituir por API real na integração futura.
 * Imagens: resolver em lib/feedImageResolver.js (mapa local ou fallback por categoria).
 */
export const feedItemsMock = [
  {
    id: "galaxy-s24",
    name: "Samsung Galaxy S24",
    category: "Smartphones",
    price: 3299,
    priceLabel: "R$ 3.299",
    store: "Amazon",
    link: "https://www.amazon.com.br",
    miaInsight:
      "Para quem procura um celular equilibrado sem gastar em um modelo premium mais caro, esta é uma das opções que mais fazem sentido hoje.",
    highlights: [
      "Tela compacta e confortável para uso diário",
      "Boa câmera para fotos rápidas e redes sociais",
      "Desempenho sólido para apps e multitarefa",
    ],
    watchOuts: [
      "Bateria pode exigir recarga no fim do dia com uso intenso",
      "Armazenamento base pode ser apertado se você grava muito vídeo",
    ],
    bestPrice: {
      priceLabel: "R$ 3.299",
      store: "Amazon",
    },
  },
  {
    id: "iphone-13",
    name: "Apple iPhone 13",
    category: "Smartphones",
    price: 3899,
    priceLabel: "R$ 3.899",
    store: "Magazine Luiza",
    link: "https://www.magazineluiza.com.br",
    miaInsight:
      "Se você prioriza estabilidade, longevidade de software e um ecossistema maduro, o iPhone 13 ainda entrega muito valor sem ir para o topo da linha.",
    highlights: [
      "Experiência fluida e previsível no dia a dia",
      "Bom equilíbrio entre câmera, desempenho e tamanho",
      "Costuma manter valor de revenda acima da média",
    ],
    watchOuts: [
      "Tela de 60 Hz pode parecer menos fluida se você veio de modelos Pro",
      "Carregador não acompanha na caixa",
    ],
    bestPrice: {
      priceLabel: "R$ 3.899",
      store: "Magazine Luiza",
    },
  },
  {
    id: "redmi-note-14",
    name: "Xiaomi Redmi Note 14",
    category: "Smartphones",
    price: 1299,
    priceLabel: "R$ 1.299",
    store: "Mercado Livre",
    link: "https://www.mercadolivre.com.br",
    miaInsight:
      "Para quem quer gastar menos sem abrir mão de tela grande e bateria generosa, este modelo costuma ser uma escolha racional e bem equilibrada.",
    highlights: [
      "Excelente custo-benefício para uso cotidiano",
      "Bateria generosa para quem passa o dia fora de casa",
      "Tela ampla para conteúdo e leitura",
    ],
    watchOuts: [
      "Desempenho em jogos pesados é limitado",
      "Interface pode trazer apps extras de fábrica",
    ],
    bestPrice: {
      priceLabel: "R$ 1.299",
      store: "Mercado Livre",
    },
  },
  {
    id: "notebook-lenovo",
    name: "Notebook Lenovo IdeaPad",
    category: "Notebooks",
    price: 2899,
    priceLabel: "R$ 2.899",
    store: "Lenovo",
    link: "https://www.lenovo.com",
    miaInsight:
      "Se você precisa de um notebook confiável para estudo e trabalho leve, sem pagar por performance que não vai usar, esta configuração tende a ser suficiente.",
    highlights: [
      "Bom para produtividade, navegação e videochamadas",
      "Teclado confortável para longas sessões de digitação",
      "Portabilidade razoável para rotina híbrida",
    ],
    watchOuts: [
      "Não é indicado para edição pesada ou games exigentes",
      "Memória base pode pedir upgrade conforme seu uso",
    ],
    bestPrice: {
      priceLabel: "R$ 2.899",
      store: "Lenovo",
    },
  },
  {
    id: "headphone-sony",
    name: "Headphone Sony WH-CH520",
    category: "Áudio",
    price: 349,
    priceLabel: "R$ 349",
    store: "Casas Bahia",
    link: "https://www.casasbahia.com.br",
    miaInsight:
      "Para quem quer fone confortável para rotina, estudo e deslocamentos sem investir em cancelamento de ruído premium, este é um caminho sensato.",
    highlights: [
      "Leve e confortável para uso prolongado",
      "Boa autonomia para a faixa de preço",
      "Som equilibrado para música e chamadas",
    ],
    watchOuts: [
      "Isolamento passivo é modesto em ambientes barulhentos",
      "Acabamento plástico pode parecer simples",
    ],
    bestPrice: {
      priceLabel: "R$ 349",
      store: "Casas Bahia",
    },
  },
];

export default feedItemsMock;
