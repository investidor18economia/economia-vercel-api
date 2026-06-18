/**
 * PATCH 8.0E — Compound Input Normalization Audit
 *
 * Usage: node scripts/test-mia-compound-input-normalization-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAboutMiaFamilyQuery,
  isAcknowledgementFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isAntiRegretFamilyQuery,
  isComprehensionFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isConstraintChangeFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { normalizeCompoundInput } from "../lib/miaCompoundInputNormalizer.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Atual", price: "R$ 999" },
  lastRecommendation: { winner: "Produto Atual" },
  lastProductMentioned: "Produto Atual",
  lastProducts: [{ product_name: "Produto Atual" }],
};

function matches(actual = "", expected = "") {
  const a = String(actual || "").toLowerCase();
  const e = String(expected || "").toLowerCase();
  if (!e) return true;
  if (Array.isArray(expected)) return expected.every((part) => a.includes(part.toLowerCase()));
  return a === e || a.includes(e);
}

function simulatePipeline(message, hasActiveAnchor) {
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: hasActiveAnchor ? SESSION : {},
    hasActiveAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: { mode: "general_answer", shouldSkipProductSearch: false, clearContext: !hasActiveAnchor },
    sessionContext: hasActiveAnchor ? SESSION : {},
    incomingSessionContext: hasActiveAnchor ? SESSION : {},
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
    },
    signals: {
      hasClearNewCommercialSearch: resolveClearNewCommercialSearchForRouting({
        query: message,
        resolvedQuery: message,
        hasAnchor: hasActiveAnchor,
        looksLikeShortPriorityFollowUp: false,
        looksLikeAmbiguousFollowUp: false,
        isExplicitComparison: false,
        explicitProductOnlyQuery: false,
        wantsNew: false,
        detectProductCategory: () => "",
        wantsNewProduct: () => false,
      }),
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  return { cognitiveTurn, routingDecision };
}

function c(id, input, expectContains, opts = {}) {
  return { id, input, expectContains, group: opts.group || id[0], ...opts };
}

const P = true;

const CASES = [
  // A — typo + abbreviation (15)
  c("A1", "vc acha q esse ipone vale?", "voce acha que esse iphone vale", { group: "A", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("A2", "vcs acham q sansung compensa?", "voces acham que samsung compensa", { group: "A" }),
  c("A3", "q xiaome é melhor?", "qual xiaomi", { group: "A" }),
  c("A4", "esse notbook presta msm?", "esse notebook presta mesmo", { group: "A" }),
  c("A5", "p mim esse monito ta caro", "para mim esse monitor ta caro", { group: "A", anchored: P }),
  c("A6", "vc tem serteza desse mause?", "voce tem certeza desse mouse", { group: "A", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("A7", "pq esse tecldo?", "por que esse teclado", { group: "A" }),
  c("A8", "tbm quero notbook", "tambem quero notebook", { group: "A" }),
  c("A9", "agr to na duvida desse ipone", "agora to na duvida desse iphone", { group: "A", anchored: P }),
  c("A10", "hj quero monito", "hoje quero monitor", { group: "A" }),
  c("A11", "q notbook pego?", "qual notebook pego", { group: "A" }),
  c("A12", "vc acha q sansung vale msm?", "voce acha que samsung vale mesmo", { group: "A", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("A13", "n curti esse mause", "nao curti esse mouse", { group: "A", anchored: P, familyQuery: isSoftDisagreementFamilyQuery }),
  c("A14", "p mim parece caro esse ipone", "para mim parece caro esse iphone", { group: "A", anchored: P }),
  c("A15", "sla se pego esse monito", "sei la se pego esse monitor", { group: "A", anchored: P }),

  // B — abbreviation + informal (15)
  c("B1", "tlgd mas e bateria?", "ta ligado mas e de bateria", { group: "B", anchored: P }),
  c("B2", "sla mano q eu faço?", "sei la mano que eu faco", { group: "B" }),
  c("B3", "blz entao, qual pego?", "beleza entao qual pego", { group: "B", anchored: P, familyQuery: isAcknowledgementFamilyQuery }),
  c("B4", "tmj, mas ainda vale?", "valeu mas ainda vale", { group: "B", anchored: P, fullStack: true, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("B5", "slk esse preço ta pesado dms", "nossa esse preco ta pesado demais", { group: "B", anchored: P }),
  c("B6", "tlgd, mas continua valendo?", "ta ligado mas continua valendo", { group: "B", anchored: P, fullStack: true, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("B7", "blz entendi", "beleza entendi", { group: "B", anchored: P, fullStack: true, familyQuery: isAcknowledgementFamilyQuery }),
  c("B8", "sla mano, mas qual o custo beneficio?", "sei la mano mas qual o custo beneficio", { group: "B", anchored: P }),
  c("B9", "vlw mia", "valeu mia", { group: "B", familyQuery: isAcknowledgementFamilyQuery }),
  c("B10", "fechow entao", "fechou entao", { group: "B", anchored: P, familyQuery: isAcknowledgementFamilyQuery }),
  c("B11", "obg mia", "obrigado mia", { group: "B" }),
  c("B12", "suav, mas e camera?", "suave mas e de camera", { group: "B", anchored: P }),
  c("B13", "demoro mano", "demorou mano", { group: "B", anchored: P, familyQuery: isAcknowledgementFamilyQuery }),
  c("B14", "partiu entao", "fechou entao", { group: "B", anchored: P }),
  c("B15", "tlgd ne", "ta ligado ne", { group: "B", anchored: P, familyQuery: isAcknowledgementFamilyQuery }),

  // C — typo + informal (15)
  c("C1", "koe mano, esse ipone presta?", "esse iphone presta", { group: "C" }),
  c("C2", "q fita esse sansung?", "e ai esse samsung", { group: "C" }),
  c("C3", "seloko esse notbook ta caro", "nossa esse notebook ta caro", { group: "C", anchored: P }),
  c("C4", "vish esse monito parece bom", "nossa esse monitor parece bom", { group: "C" }),
  c("C5", "mano poço confiar nesse?", "mano posso confiar nesse", { group: "C", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("C6", "slk esse ipone caro", "nossa esse iphone caro", { group: "C", anchored: P }),
  c("C7", "eita monito pesado", "nossa monitor pesado", { group: "C" }),
  c("C8", "oxe mause caro", "nossa mouse caro", { group: "C" }),
  c("C9", "uai fone caro", "nossa fone caro", { group: "C" }),
  c("C10", "rapaz tecldo caro", "nossa teclado caro", { group: "C" }),
  c("C11", "ce loko esse sansung", "nossa esse samsung", { group: "C" }),
  c("C12", "c loko notbook caro", "nossa notebook caro", { group: "C" }),
  c("C13", "pesado esse cadeeira", "cadeira", { group: "C" }),
  c("C14", "doidera esse monito", "nossa esse monitor", { group: "C" }),
  c("C15", "sinistro esse ipone", "nossa esse iphone", { group: "C" }),

  // D — risada + intenção (12)
  c("D1", "kkkk entendi", "entendi", { group: "D", anchored: P, fullStack: true, familyQuery: isAcknowledgementFamilyQuery }),
  c("D2", "kkkk mas nao curti", "mas nao curti", { group: "D", anchored: P, fullStack: true, familyQuery: isSoftDisagreementFamilyQuery }),
  c("D3", "kkk esse ai vale?", "esse ai vale", { group: "D", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("D4", "rsrs pode explicar?", "pode explicar", { group: "D", anchored: P, fullStack: true, familyQuery: isComprehensionFamilyQuery }),
  c("D5", "hahaha qual ficou em segundo?", "qual ficou em segundo", { group: "D", anchored: P, fullStack: true, familyQuery: isSecondBestDiscoveryFamilyQuery }),
  c("D6", "kkkk vlw", "valeu", { group: "D", anchored: P, fullStack: true, familyQuery: isAcknowledgementFamilyQuery }),
  c("D7", "rsrs blz", "beleza", { group: "D", anchored: P, fullStack: true, familyQuery: isAcknowledgementFamilyQuery }),
  c("D8", "hehe entendii", "entendi", { group: "D", anchored: P, familyQuery: isAcknowledgementFamilyQuery }),
  c("D9", "kkkk show", "show", { group: "D", anchored: P, familyQuery: isAcknowledgementFamilyQuery }),
  c("D10", "rsrs demorou", "demorou", { group: "D", anchored: P, familyQuery: isAcknowledgementFamilyQuery }),
  c("D11", "kkkk esse mause parece bom", "esse mouse parece bom", { group: "D" }),
  c("D12", "hahaha fechow", "fechou", { group: "D", anchored: P, familyQuery: isAcknowledgementFamilyQuery }),

  // E — palavrão + intenção (12)
  c("E1", "crl esse ta caro", "esse ta caro", { group: "E", anchored: P }),
  c("E2", "krl vale mesmo?", "vale mesmo", { group: "E", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("E3", "pqp esse preço ta bom", "esse preco ta bom", { group: "E", anchored: P }),
  c("E4", "carai, sera q presta?", "sera que presta", { group: "E" }),
  c("E5", "crl nao quero me arrepender", "nao quero me arrepender", { group: "E", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("E6", "pqp compensa msm?", "compensa mesmo", { group: "E", anchored: P }),
  c("E7", "krl esse ipone caro", "esse iphone caro", { group: "E", anchored: P }),
  c("E8", "crl sera q presta?", "sera que presta", { group: "E" }),
  c("E9", "carai esse sansung vale?", "esse samsung vale", { group: "E", anchored: P }),
  c("E10", "pqp nao curti", "nao curti", { group: "E", anchored: P, familyQuery: isSoftDisagreementFamilyQuery }),
  c("E11", "crl tenho medo d errar", "tenho medo d errar", { group: "E", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("E12", "krl mostra outra opcao", "mostra outra opcao", { group: "E", anchored: P, familyQuery: isAlternativeExplorationFamilyQuery }),

  // F — mas-tail composto (15)
  c("F1", "kkkk entendi, mas n curti mto", "entendi mas nao curti muito", { group: "F", anchored: P, fullStack: true, familyQuery: isSoftDisagreementFamilyQuery }),
  c("F2", "vc acha q vale, mas tenho medo d errar", "voce acha que vale mas tenho medo d errar", { group: "F", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("F3", "slk gostei, mas sera q o povo recomenda?", "nossa gostei mas sera que o povo recomenda", { group: "F", anchored: P, familyQuery: isSocialValidationFamilyQuery }),
  c("F4", "tlgd, mas continua valendo?", "ta ligado mas continua valendo", { group: "F", anchored: P, fullStack: true, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("F5", "sla mano, mas qual o custo beneficio?", "sei la mano mas qual o custo beneficio", { group: "F", anchored: P }),
  c("F6", "blz entendi, mas n curti mto", "beleza entendi mas nao curti muito", { group: "F", anchored: P, fullStack: true, familyQuery: isSoftDisagreementFamilyQuery }),
  c("F7", "entendi, mas nao curti", "entendi mas nao curti", { group: "F", anchored: P, fullStack: true, familyQuery: isSoftDisagreementFamilyQuery }),
  c("F8", "gostei, mas sera q compensa?", "gostei mas sera que compensa", { group: "F", anchored: P }),
  c("F9", "fechou, mas ainda vale?", "fechou mas ainda vale", { group: "F", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("F10", "show, mas e bateria?", "show mas e de bateria", { group: "F", anchored: P }),
  c("F11", "certo, mas e camera?", "certo mas e de camera", { group: "F", anchored: P }),
  c("F12", "demorou, mas qual ficou em segundo?", "demorou mas qual ficou em segundo", { group: "F", anchored: P, familyQuery: isSecondBestDiscoveryFamilyQuery }),
  c("F13", "valeu, mas mostra outra", "valeu mas mostra outra", { group: "F", anchored: P, familyQuery: isAlternativeExplorationFamilyQuery }),
  c("F14", "entendi, mas quero gastar menos", "entendi mas quero gastar menos", { group: "F", anchored: P, familyQuery: isConstraintChangeFamilyQuery }),
  c("F15", "ok, mas e desempenho?", "ok mas e de desempenho", { group: "F", anchored: P }),

  // G — categoria + typo + abrev (15)
  c("G1", "qual cel bom p bateria?", "qual celular bom para bateria", { group: "G" }),
  c("G2", "notbook p estudar ate 2500", "notebook para estudar ate 2500", { group: "G" }),
  c("G3", "monito gamer barato vale?", "monitor gamer barato vale", { group: "G", anchored: P }),
  c("G4", "mause sem fio bom?", "mouse sem fio bom", { group: "G" }),
  c("G5", "tecldo mecanico custo beneficio?", "teclado mecanico custo beneficio", { group: "G" }),
  c("G6", "foni bluetooth bom?", "fone bluetooth bom", { group: "G" }),
  c("G7", "cadeeira ergonomica vale?", "cadeira ergonomica vale", { group: "G", anchored: P }),
  c("G8", "celulsr barato p jogar?", "celular barato para jogar", { group: "G" }),
  c("G9", "notebbok p trabalho", "notebook para trabalho", { group: "G" }),
  c("G10", "monnitor ips barato", "monitor ips barato", { group: "G" }),
  c("G11", "mouze gamer bom", "mouse gamer bom", { group: "G" }),
  c("G12", "tecaldo rgb barato", "teclado rgb barato", { group: "G" }),
  c("G13", "fonee sem fio bom", "fone sem fio bom", { group: "G" }),
  c("G14", "tablet xiaome barato", "tablet xiaomi barato", { group: "G" }),
  c("G15", "pc gamer barato vale?", "pc gamer barato vale", { group: "G", anchored: P }),

  // H — ABOUT_MIA composto (12)
  c("H1", "cês ganham comissão msm?", "voces ganham comissao mesmo", { group: "H", fullStack: true, familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H2", "vc ganha qnd eu compro?", "voce ganha quando eu compro", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H3", "pq confiar em vcs?", "por que confiar em voces", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H4", "isso é propaganda ou é real?", "isso e propaganda ou e real", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H5", "vcs puxam sardinha p loja?", "voces puxam sardinha p loja", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H6", "vc ganha comissao msm?", "voce ganha comissao mesmo", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H7", "pq devo confiar em vc?", "por que devo confiar em voce", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H8", "sla, vcs ganham com isso?", "sei la voces ganham com isso", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H9", "kkkk vcs sao confiaveis?", "voces sao confiaveis", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H10", "blz, mas vcs ganham comissao?", "beleza mas voces ganham comissao", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H11", "tmj, mas como vcs ganham?", "valeu mas como voces ganham", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),
  c("H12", "obg, mas pq confiar em vcs?", "obrigado mas por que confiar em voces", { group: "H", familyQuery: (q) => isAboutMiaFamilyQuery(q, { hasActiveAnchor: false }) }),

  // I — anti-regret composto (15)
  c("I1", "n quero me ferrar nesse ipone", "nao quero me arrepender nesse iphone", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I2", "nao quero dor d cabeca c esse sansung", "nao quero me arrepender com esse samsung", { group: "I", anchored: P }),
  c("I3", "sla se eu compro, tenho medo d errar", "sei la se eu compro tenho medo d errar", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I4", "poço comprar sem medo?", "posso comprar sem medo", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I5", "vc acha q vou me arrepender?", "voce acha que vou me arrepender", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I6", "tenho medo d errar nesse notbook", "tenho medo d errar nesse notebook", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I7", "n quero me arrepender dps", "nao quero me arrepender depois", { group: "I", anchored: P }),
  c("I8", "sla mano, tenho medo d errar", "sei la mano tenho medo d errar", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I9", "poço confiar nessa recomendassao?", "posso confiar nessa recomendacao", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I10", "crl nao quero me arrepender", "nao quero me arrepender", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I11", "kkkk tenho medo d errar", "tenho medo d errar", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I12", "vc tem certeza q n vou me arrepender?", "voce tem certeza que n vou me arrepender", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I13", "nao quero dor d cabeca", "nao quero me arrepender", { group: "I", anchored: P, fullStack: true, familyQuery: isAntiRegretFamilyQuery }),
  c("I14", "quero evitar problema nesse monito", "quero evitar arrependimento nesse monitor", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("I15", "to com receio desse mause", "to com receio desse mouse", { group: "I", anchored: P, familyQuery: isAntiRegretFamilyQuery }),

  // J — cross-family composto (15)
  c("J1", "blz entendi, mas mostra outra opção", "beleza entendi mas mostra outra opcao", { group: "J", anchored: P, fullStack: true, familyQuery: isAlternativeExplorationFamilyQuery }),
  c("J2", "kkkk gostei, mas quem ficou em segundo?", "gostei mas quem ficou em segundo", { group: "J", anchored: P, fullStack: true, familyQuery: isSecondBestDiscoveryFamilyQuery }),
  c("J3", "q fita, continua recomendando?", "e ai continua recomendando", { group: "J", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("J4", "slk, tem certeza msm?", "nossa tem certeza mesmo", { group: "J", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("J5", "mano, quero gastar menos agr", "mano quero gastar menos agora", { group: "J", anchored: P, familyQuery: isConstraintChangeFamilyQuery }),
  c("J6", "kkkk slk mano esse ipone ta caro dms, mas vale msm?", ["iphone", "vale mesmo"], { group: "J", anchored: P }),
  c("J7", "vc acha q esse sansung vale msm?", "voce acha que esse samsung vale mesmo", { group: "J", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),
  c("J8", "sla poço confiar nesse notbook?", "sei la posso confiar nesse notebook", { group: "J", anchored: P, familyQuery: isAntiRegretFamilyQuery }),
  c("J9", "q fita esse notbook, presta?", "e ai esse notebook presta", { group: "J" }),
  c("J10", "crl esse monito ta barato, sera q é golpe?", ["monitor", "barato"], { group: "J", anchored: P }),
  c("J11", "p mim ta caro dms, tem outro?", "para mim ta caro demais tem outro", { group: "J", anchored: P, familyQuery: isAlternativeExplorationFamilyQuery }),
  c("J12", "n sei se esse mause presta", "nao sei se esse mouse presta", { group: "J", anchored: P }),
  c("J13", "kkkk qual fica em segundo?", "qual fica em segundo", { group: "J", anchored: P, familyQuery: isSecondBestDiscoveryFamilyQuery }),
  c("J14", "tlgd mas n curti mto", "ta ligado mas nao curti muito", { group: "J", anchored: P, fullStack: true, familyQuery: isSoftDisagreementFamilyQuery }),
  c("J15", "vc bancaria essa msm?", "voce bancaria essa mesmo", { group: "J", anchored: P, familyQuery: isConfidenceChallengeFamilyQuery }),

  // K — guards / protegidos (19)
  c("K1", "RTX4060 vale?", "rtx4060", { group: "K", protected: true }),
  c("K2", "ssd nvme bom?", "ssd nvme", { group: "K", protected: true }),
  c("K3", "https://loja.com/ipone", "https://loja.com/ipone", { group: "K", protected: true }),
  c("K4", "S24 ou A55?", "s24", { group: "K", protectedPartial: true, expectContains: ["s24", "a55"] }),
  c("K5", "ce loko", "nossa", { group: "K", skipRouter: true }),
  c("K6", "vc bancaria essa?", "voce bancaria essa", { group: "K", anchored: P, noDoubleVoce: true }),
  c("K7", "nao sei nao", "nao sei nao", { group: "K", anchored: P, familyQuery: isSoftDisagreementFamilyQuery, noDoubleNao: true }),
  c("K8", "voce voce indica?", "voce indica", { group: "K", fixDouble: true }),
  c("K9", "GPU boa p gamer?", "placa de video boa para gamer", { group: "K", protectedPartial: true }),
  c("K10", "4060 ti vale?", "4060", { group: "K", protectedPartial: true }),
  c("K11", "SM-A556E presta?", "sm-a556e", { group: "K", protectedPartial: true }),
  c("K12", "alternativas melhores?", "alternativas", { group: "K", anchored: P, noPluralFix: true }),
  c("K13", "valeu", "valeu", { group: "K", anchored: P, fullStack: true, familyQuery: isAcknowledgementFamilyQuery }),
  c("K14", "costuma recomendar?", "recomendar", { group: "K", anchored: P, fullStack: true, familyQuery: isSocialValidationFamilyQuery, noInfinitiveFix: true }),
  c("K15", "o pessoal compra?", "compra", { group: "K", anchored: P, fullStack: true, familyQuery: isSocialValidationFamilyQuery }),
  c("K16", "mostre alternativas", "alternativas", { group: "K", anchored: P, fullStack: true, familyQuery: isAlternativeExplorationFamilyQuery }),
  c("K17", "p", "p", { group: "K", protected: true, ambiguousSkip: true }),
  c("K18", "not bad", "not bad", { group: "K", protected: true }),
  c("K19", "procuro notebook", "procuro notebook", { group: "K", protected: true }),
];

function classifyFailure(spec, failures) {
  const f = failures.join(" ");
  if (/typo|stage.*typo/i.test(f)) return "A) typo stage miss";
  if (/abbrev/i.test(f)) return "B) abbreviation stage miss";
  if (/informal/i.test(f)) return "C) informal stage miss";
  if (/double|voce voce|nao nao/i.test(f)) return "E) double replace";
  if (/over|protected/i.test(f)) return "F) over-normalization";
  if (/familyQuery/i.test(f)) return "G) router miss after normalization";
  if (/act=|anchor|new_search/i.test(f)) return "H) routing miss";
  if (/norm=/i.test(f)) return "D) order conflict";
  if (spec.ambiguousSkip) return "J) expected ambiguity / skip correto";
  return "I) perception leak";
}

function evaluateCase(spec) {
  const compound = normalizeCompoundInput({ originalMessage: spec.input });
  const failures = [];
  const layers = [];

  if (compound.originalMessage !== spec.input) {
    failures.push("originalMessage_not_preserved");
  }

  if (compound.normalizedMessage.includes("voce voce")) {
    failures.push("double_replace_voce");
    layers.push(classifyFailure(spec, failures));
  }

  if (compound.normalizedMessage.includes("nao nao")) {
    failures.push("double_replace_nao");
    layers.push(classifyFailure(spec, failures));
  }

  if (spec.protected) {
    if (compound.hasCompoundNormalization && !spec.input.includes("http")) {
      failures.push("over_normalization_protected");
    }
  }

  if (spec.ambiguousSkip) {
    if (compound.hasCompoundNormalization) failures.push("over_normalization_ambiguous");
    if (compound.normalizedMessage !== spec.input.toLowerCase().replace(/[?!.,;:…]/g, " ").trim()) {
      if (!matches(compound.normalizedMessage, spec.expectContains)) failures.push(`norm=${compound.normalizedMessage}`);
    }
    return { ok: failures.length === 0, failures, layers, compound };
  }

  if (spec.fixDouble) {
    if (compound.normalizedMessage.includes("voce voce")) failures.push(`norm=${compound.normalizedMessage}`);
    return { ok: failures.length === 0, failures, layers, compound };
  }

  if (!matches(compound.normalizedMessage, spec.expectContains)) {
    failures.push(`norm=${compound.normalizedMessage} expected~${spec.expectContains}`);
    layers.push(classifyFailure(spec, failures));
  }

  if (spec.skipRouter || !spec.fullStack) {
    return { ok: failures.length === 0, failures, layers, compound };
  }

  const hasAnchor = spec.anchored === true;
  const pipeline = simulatePipeline(spec.input, hasAnchor);

  if (spec.familyQuery && !spec.familyQuery(spec.input)) {
    failures.push("familyQuery=false");
    layers.push("G) router miss after normalization");
  }

  if (spec.turnType && pipeline.cognitiveTurn.turnType !== spec.turnType) {
    failures.push(`turnType=${pipeline.cognitiveTurn.turnType}`);
    layers.push("G) router miss after normalization");
  }

  if (spec.act && pipeline.routingDecision.conversationAct !== spec.act) {
    failures.push(`act=${pipeline.routingDecision.conversationAct}`);
    layers.push("H) routing miss");
  }

  if (hasAnchor && spec.familyQuery && pipeline.routingDecision.shouldPreserveAnchor !== true) {
    failures.push("anchor_not_preserved");
    layers.push("H) routing miss");
  }

  if (hasAnchor && spec.familyQuery && pipeline.routingDecision.allowNewSearch) {
    failures.push("new_search_leak");
    layers.push("H) routing miss");
  }

  return { ok: failures.length === 0, failures, layers, compound, pipeline };
}

console.log("PATCH 8.0E — Compound Input Normalization Audit\n");
console.log(`Cenários: ${CASES.length}\n`);

let pass = 0;
let fail = 0;
const failureRecords = [];

for (const spec of CASES) {
  const result = evaluateCase(spec);
  if (result.ok) {
    pass += 1;
    console.log(`✓ [${spec.id}] "${spec.input}" → "${result.compound.normalizedMessage}"`);
  } else {
    fail += 1;
    console.log(`✗ [${spec.id}] "${spec.input}" → ${result.failures.join("; ")} | "${result.compound.normalizedMessage}"`);
    failureRecords.push({ id: spec.id, input: spec.input, failures: result.failures, layers: result.layers, group: spec.group });
  }
}

const total = pass + fail;
const rate = ((pass / total) * 100).toFixed(1);
console.log(`\nResultado: ${pass}/${total} (${rate}%)`);

if (failureRecords.length) {
  console.log("\n── Falhas por classificação ──\n");
  const byLayer = {};
  for (const r of failureRecords) {
    for (const l of r.layers) byLayer[l] = (byLayer[l] || 0) + 1;
  }
  for (const [layer, count] of Object.entries(byLayer)) {
    console.log(`  ${layer}: ${count}`);
  }
}

const verdict = pass / total >= 0.95 ? "A) COMPOUND INPUT NORMALIZATION ROBUST" : "B) COMPOUND INPUT NORMALIZATION POSSUI GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(pass / total >= 0.95 ? 0 : 1);
