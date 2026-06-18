/**
 * PATCH 8.0C — Abbreviation Normalization Layer
 *
 * Expande abreviações, internetês e escrita reduzida antes do Router.
 * Não decide intenção — apenas melhora legibilidade semântica da entrada.
 */

function baseNormalize(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Frases multi-palavra — ordem importa (mais longas primeiro). */
const PHRASE_REPLACEMENTS = [
  [/(\b|^)vc acha q(\b|$)/g, "voce acha que", "phrase:vc_acha_q"],
  [/(\b|^)ce acha q(\b|$)/g, "voce acha que", "phrase:ce_acha_q"],
  [/(\b|^)vcs acham q(\b|$)/g, "voces acham que", "phrase:vcs_acham_q"],
  [/(\b|^)voce acha q(\b|$)/g, "voce acha que", "phrase:voce_acha_q"],
  [/(\b|^)pq q(\b|$)/g, "por que que", "phrase:pq_q"],
  [/(\b|^)onde q(\b|$)/g, "onde que", "phrase:onde_q"],
  [/(\b|^)como q(\b|$)/g, "como que", "phrase:como_q"],
  [/(\b|^)td mundo(\b|$)/g, "todo mundo", "phrase:td_mundo"],
  [/(\b|^)p mim(\b|$)/g, "para mim", "phrase:p_mim"],
  [/(\b|^)p vc(\b|$)/g, "para voce", "phrase:p_vc"],
  [/(\b|^)p vcs(\b|$)/g, "para voces", "phrase:p_vcs"],
  [/(\b|^)p jogar(\b|$)/g, "para jogar", "phrase:p_jogar"],
  [/(\b|^)p notebook(\b|$)/g, "para notebook", "phrase:p_notebook"],
  [/(\b|^)p trabalho(\b|$)/g, "para trabalho", "phrase:p_trabalho"],
  [/(\b|^)dor d cabeca(\b|$)/g, "dor de cabeca", "phrase:dor_d_cabeca"],
  [/(\b|^)c esse(\b|$)/g, "com esse", "phrase:c_esse"],
  [/(\b|^)p gamer(\b|$)/g, "para gamer", "phrase:p_gamer"],
  [/(\b|^)q ([a-z]{3,})( e melhor| e boa| compensa| presta| vale)(\b|$)/g, "qual $2$3$4", "phrase:q_qual"],
  [/(\b|^)p estudo(\b|$)/g, "para estudo", "phrase:p_estudo"],
  [/(\b|^)p estudar(\b|$)/g, "para estudar", "phrase:p_estudar"],
  [/(\b|^)p bateria(\b|$)/g, "para bateria", "phrase:p_bateria"],
  [/(\b|^)qual cel(\b|$)/g, "qual celular", "phrase:qual_cel"],
  [/(\b|^)mas e bateria(\b|$)/g, "mas e de bateria", "phrase:mas_e_bateria"],
  [/(\b|^)mas e camera(\b|$)/g, "mas e de camera", "phrase:mas_e_camera"],
  [/(\b|^)mas e preco(\b|$)/g, "mas e de preco", "phrase:mas_e_preco"],
  [/(\b|^)qnd eu(\b|$)/g, "quando eu", "phrase:qnd_eu"],
  [/(\b|^)vc ganha qnd(\b|$)/g, "voce ganha quando", "phrase:vc_ganha_qnd"],
  [/(\b|^)vcs ganham(\b|$)/g, "voces ganham", "phrase:vcs_ganham"],
  [/(\b|^)p mim parece(\b|$)/g, "para mim parece", "phrase:p_mim_parece"],
  [/(\b|^)d bateria(\b|$)/g, "de bateria", "phrase:d_bateria"],
  [/(\b|^)d camera(\b|$)/g, "de camera", "phrase:d_camera"],
  [/(\b|^)d preco(\b|$)/g, "de preco", "phrase:d_preco"],
  [/(\b|^)d valor(\b|$)/g, "de valor", "phrase:d_valor"],
  [/(\b|^)d boa(\b|$)/g, "de boa", "phrase:d_boa"],
  [/(\b|^)antes d(\b|$)/g, "antes de", "phrase:antes_d"],
  [/(\b|^)dps d(\b|$)/g, "depois de", "phrase:dps_d"],
  [/(?<!\bnao )(\b|^)n quero(\b|$)/g, "nao quero", "phrase:n_quero"],
  [/(?<!\bnao )(\b|^)n sei n(\b|$)/g, "nao sei nao", "phrase:n_sei_n"],
  [/(?<!\bnao )(\b|^)n sei(\b|$)/g, "nao sei", "phrase:n_sei"],
  [/(?<!\bnao )(\b|^)n curti(\b|$)/g, "nao curti", "phrase:n_curti"],
  [/(?<!\bnao )(\b|^)n gostei(\b|$)/g, "nao gostei", "phrase:n_gostei"],
  [/(?<!\bnao )(\b|^)n entendi(\b|$)/g, "nao entendi", "phrase:n_entendi"],
  [/(\b|^)qro gastar menos(\b|$)/g, "quero gastar menos", "phrase:qro_gastar_menos"],
  [/(\b|^)qro gastar(\b|$)/g, "quero gastar", "phrase:qro_gastar"],
  [/(\b|^)tem ctza msm(\b|$)/g, "tem certeza mesmo", "phrase:tem_ctza_msm"],
  [/(\b|^)n curti mt(\b|$)/g, "nao curti muito", "phrase:n_curti_mt"],
  [/(\b|^)n bateu cmg(\b|$)/g, "nao bateu comigo", "phrase:n_bateu_cmg"],
  [/(\b|^)n me convenceu(\b|$)/g, "nao me convenceu", "phrase:n_me_convenceu"],
  [/(\b|^)n me desceu(\b|$)/g, "nao me desceu", "phrase:n_me_desceu"],
  [/(\b|^)n peguei(\b|$)/g, "nao peguei", "phrase:n_peguei"],
  [/(\b|^)vc recomenda msm(\b|$)/g, "voce recomenda mesmo", "phrase:vc_recomenda_msm"],
  [/(\b|^)pq esse(\b|$)/g, "por que esse", "phrase:pq_esse"],
  [/(\b|^)vale msm(\b|$)/g, "vale mesmo", "phrase:vale_msm"],
  [/(\b|^)compensa msm(\b|$)/g, "compensa mesmo", "phrase:compensa_msm"],
  [/(\b|^)agr msm(\b|$)/g, "agora mesmo", "phrase:agr_msm"],
  [/(\b|^)qnt ta(\b|$)/g, "quanto ta", "phrase:qnt_ta"],
  [/(\b|^)qto ta(\b|$)/g, "quanto ta", "phrase:qto_ta"],
  [/(\b|^)q celular(\b|$)/g, "qual celular", "phrase:q_celular"],
  [/(\b|^)q fita(\b|$)/g, "e ai", "phrase:q_fita"],
  [/(\b|^)q boa(\b|$)/g, "e ai", "phrase:q_boa"],
  [/(\b|^)q notebook(\b|$)/g, "qual notebook", "phrase:q_notebook"],
  [/(\b|^)q monitor(\b|$)/g, "qual monitor", "phrase:q_monitor"],
  [/(\b|^)q tv(\b|$)/g, "qual tv", "phrase:q_tv"],
  [/(\b|^)q fone(\b|$)/g, "qual fone", "phrase:q_fone"],
  [/(\b|^)custo beneficio(\b|$)/g, "custo beneficio", "phrase:custo_beneficio"],
  [/(\b|^)cxb(\b|$)/g, "custo beneficio", "phrase:cxb"],
  [/(\b|^)mó bom(\b|$)/g, "muito bom", "phrase:mo_bom"],
  [/(\b|^)mo bom(\b|$)/g, "muito bom", "phrase:mo_bom"],
  [/(\b|^)mó caro(\b|$)/g, "muito caro", "phrase:mo_caro"],
  [/(\b|^)mo caro(\b|$)/g, "muito caro", "phrase:mo_caro"],
  [/(\b|^)note gamer(\b|$)/g, "notebook gamer", "phrase:note_gamer"],
  [/(\b|^)ce loko(\b|$)/g, "nossa", "phrase:ce_loko"],
  [/(\b|^)c loko(\b|$)/g, "nossa", "phrase:c_loko"],
  [/(\b|^)seloko(\b|$)/g, "nossa", "phrase:seloko"],
  [/(\b|^)sla se(\b|$)/g, "sei la se", "phrase:sla_se"],
  [/(\b|^)sei la se(\b|$)/g, "sei la se", "phrase:sei_la_se"],
  [/(\b|^)sei la se(\b|$)/g, "sei la se", "phrase:sei_la_se"],
];

/** Tokens seguros — só palavra inteira. */
const TOKEN_REPLACEMENTS = Object.freeze({
  vc: "voce",
  vcs: "voces",
  ces: "voces",
  vce: "voce",
  vcc: "voce",
  voce: "voce",
  cmg: "comigo",
  ctg: "contigo",
  ngm: "ninguem",
  tbm: "tambem",
  tb: "tambem",
  tbmm: "tambem",
  pq: "por que",
  pk: "por que",
  pqe: "porque",
  qnd: "quando",
  qd: "quando",
  qdo: "quando",
  hj: "hoje",
  agr: "agora",
  ag: "agora",
  dps: "depois",
  dp: "depois",
  nn: "nao",
  naum: "nao",
  sla: "sei la",
  slá: "sei la",
  sll: "sei la",
  mt: "muito",
  mto: "muito",
  mta: "muita",
  mts: "muitos",
  mtas: "muitas",
  dms: "demais",
  dmss: "demais",
  msm: "mesmo",
  memo: "mesmo",
  msmo: "mesmo",
  qto: "quanto",
  qnt: "quanto",
  qt: "quanto",
  qro: "quero",
  vlw: "valeu",
  obg: "obrigado",
  obgd: "obrigado",
  obrig: "obrigado",
  flw: "falou",
  fechow: "fechou",
  fmz: "firmeza",
  suav: "suave",
  bllz: "beleza",
  blz: "beleza",
  cel: "celular",
  cell: "celular",
  gpu: "placa de video",
  vga: "placa de video",
  vlr: "valor",
  agor: "agora",
  pqê: "porque",
  td: "todo",
  tds: "todos",
  tdo: "todo",
  proc: "processador",
});

/** Tokens ambíguos — só expandir em contexto explícito (não no mapa global). */
const SKIP_STANDALONE = new Set(["p", "d", "n", "q", "cb", "not", "pc", "tv", "ssd"]);

/** Risadas — prefixo/sufixo removido para expor núcleo semântico. */
const LAUGHTER_PREFIX = /^(?:(?:k{2,})|(?:(?:rs)+)|(?:(?:ha)+)|(?:(?:he)+)|(?:(?:hue)+))(?:\s+|$)/i;
const LAUGHTER_SUFFIX = /(?:\s+)(?:(?:k{2,})|(?:(?:rs)+)|(?:(?:ha)+)|(?:(?:he)+))$/i;

function stripLaughter(text, appliedNormalizations) {
  let out = text;
  let changed = true;
  while (changed) {
    changed = false;
    const pre = out.replace(LAUGHTER_PREFIX, "");
    if (pre !== out) {
      out = pre.trim();
      appliedNormalizations.push("laughter:prefix");
      changed = true;
    }
    const suf = out.replace(LAUGHTER_SUFFIX, "");
    if (suf !== out) {
      out = suf.trim();
      appliedNormalizations.push("laughter:suffix");
      changed = true;
    }
  }
  return out;
}

function expandStandaloneQ(text, appliedNormalizations) {
  if (!/\bq\b/.test(text)) return text;
  let out = text.replace(/^q ([a-z]{3,})\b/i, (match, word) => {
    appliedNormalizations.push("token:q_qual");
    return `qual ${word}`;
  });
  out = out.replace(/\bq\b/g, "que");
  if (out !== text) appliedNormalizations.push("token:q");
  return out;
}

function applyTokenMap(text, appliedNormalizations) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return text;

  const mapped = tokens.map((token) => {
    if (SKIP_STANDALONE.has(token)) return token;
    const replacement = TOKEN_REPLACEMENTS[token];
    if (replacement && replacement !== token) {
      appliedNormalizations.push(`token:${token}`);
      return replacement;
    }
    return token;
  });

  return mapped.join(" ");
}

/**
 * @param {string} message
 * @returns {{
 *   originalMessage: string,
 *   normalizedMessage: string,
 *   appliedNormalizations: string[],
 *   hasAbbreviationNormalization: boolean
 * }}
 */
export function applyAbbreviationNormalization(message = "") {
  const originalMessage = String(message || "");
  const appliedNormalizations = [];

  if (!originalMessage.trim()) {
    return {
      originalMessage,
      normalizedMessage: "",
      appliedNormalizations,
      hasAbbreviationNormalization: false,
    };
  }

  if (/https?:\/\//i.test(originalMessage)) {
    return {
      originalMessage,
      normalizedMessage: originalMessage.trim(),
      appliedNormalizations,
      hasAbbreviationNormalization: false,
    };
  }

  const baseline = baseNormalize(originalMessage);
  let text = baseline;

  text = stripLaughter(text, appliedNormalizations);

  for (const [pattern, replacement, tag] of PHRASE_REPLACEMENTS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement).replace(/\s+/g, " ").trim();
      appliedNormalizations.push(tag);
      pattern.lastIndex = 0;
    }
  }

  text = expandStandaloneQ(text, appliedNormalizations);
  text = applyTokenMap(text, appliedNormalizations);

  text = text.replace(/\s+/g, " ").trim();

  return {
    originalMessage,
    normalizedMessage: text,
    appliedNormalizations: [...new Set(appliedNormalizations)],
    hasAbbreviationNormalization: text !== baseline,
  };
}

export function normalizeWithAbbreviationLayer(message = "") {
  return applyAbbreviationNormalization(message).normalizedMessage;
}
