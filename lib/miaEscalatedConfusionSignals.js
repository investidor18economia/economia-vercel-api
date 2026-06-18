/**
 * PATCH 8.5C — Escalated User Confusion Signals
 *
 * Intenção: LOSS_OF_DECISION_TRACKING / escalated USER_CONFUSION.
 * Subsumida em EXPLANATION_BREAKDOWN (8.3G) — não é família nova.
 * Distinta de REASONING_BREAKDOWN por acusação de contradição (8.3F).
 */

import { detectsLegitimateSearchResetDiscourse } from "./miaLegitimateSearchResetGuard.js";

export const ESCALATED_CONFUSION_SIGNALS_VERSION = "8.5C.1";

export function normalizeEscalatedConfusionText(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasEscalatedConfusionCommercialBlock(q) {
  if (!q) return false;
  if (detectsLegitimateSearchResetDiscourse(q)) return true;
  if (
    /\b(quero|preciso|busco|buscar|procurar|procura|me acha|me indica|me recomenda)\s+(um\s+)?(celular|smartphone|notebook|tv|monitor|mouse|teclado|cadeira|pc)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (/\b(celular|notebook|smartphone)\s+(ate|até)\s+\d/.test(q)) return true;
  if (/\b(procura|buscar|busca|pesquisar)\s+(um\s+)?(celular|notebook|monitor|tv)\b/.test(q)) {
    return true;
  }
  return false;
}

function hasTrustAccusationDiscourse(q) {
  return (
    /\b(voce|vc) (me )?(confundiu|embaralhou|contradisse|enrolou)\b/.test(q) ||
    /\b(me )?(confundiu|embaralhou)\b/.test(q) ||
    /\b(sua|a) (explicacao|recomendacao|resposta) (ficou )?(inconsistente|confusa|contraditoria)\b/.test(
      q
    ) ||
    /\b(mudou de ideia|trocou de ideia|virou outra coisa|mudou d ideia)\b/.test(q) ||
    /\b(recomendacao atual diverge|diverge da anterior|inconsistente com o que)\b/.test(q) ||
    /\b(mas )?antes (era|falou|disse|era outro|recomendou)\b/.test(q) ||
    /\b(nao era o outro|era o outro|mas nao era)\b/.test(q) ||
    /\b(voce|vc) (falou|disse|recomendou) (outro|diferente)\b/.test(q)
  );
}

/**
 * Perda de acompanhamento da linha decisória — sem acusar contradição.
 */
export function detectsEscalatedUserConfusionDiscourse(message = "") {
  const q = normalizeEscalatedConfusionText(message);
  if (!q || q.length < 2) return false;
  if (hasEscalatedConfusionCommercialBlock(q)) return false;
  if (hasTrustAccusationDiscourse(q)) return false;

  const trackingLoss =
    /\b(agora |eu )?(fiquei|to|estou|me) (mais )?(perdid|perdido|bugad|buguei|embol)\w*\b/.test(
      q
    ) ||
    /\bagora (buguei|bugado|perdi|me perdi)\b/.test(q) ||
    /\b(nao to acompanhando|nao estou acompanhando|nao to entendendo|nao estou entendendo)\b/.test(
      q
    ) ||
    /\b(nao acompanhei( a logica| sua logica)?)\b/.test(q) ||
    /\b(perdi o (raciocinio|fio|linha)|perdi a linha|me perdi)\b/.test(q) ||
    /\b(nao estou acompanhando sua logica)\b/.test(q) ||
    /\b(nao sei mais qual escolher)\b/.test(q) ||
    /\b(to mais confuso|ficou mais confuso|estou mais confuso)\b/.test(q) ||
    /\bto perdid\w*\b/.test(q);

  const simplificationAfterLoss =
    /\b(resume a[ií]|resume ai)\b/.test(q) ||
    /\b(simplifica|pode simplificar|fala mais simples)\b/.test(q);

  const reactivePause =
    q.length <= 16 && /^(calma|opa|pera|pera ai|pera ae|ue)$/.test(q);

  const colloquialOverload = /\bbuguei\b/.test(q) || /\bviajei\b/.test(q);

  return trackingLoss || simplificationAfterLoss || reactivePause || colloquialOverload;
}

export function detectsEscalatedUserConfusionSignal(
  message = "",
  { hasActiveAnchor = false } = {}
) {
  if (!hasActiveAnchor) return false;
  return detectsEscalatedUserConfusionDiscourse(message);
}
