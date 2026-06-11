/**
 * MVP — economia estimada (percepção de valor, não economia real).
 * Desacoplado: no futuro o backend pode fornecer o valor; a UI permanece igual.
 */

const SESSION_SHOWN_KEY = "mia_premium_savings_shown";

const FORBIDDEN_ROUND_AMOUNTS = new Set([
  20, 30, 50, 100, 150, 200, 250, 300
]);

const MIN_SAVINGS = 15;
const MAX_SAVINGS = 300;

export function getPremiumSavingsSessionKey() {
  return SESSION_SHOWN_KEY;
}

export function hasPremiumSavingsBeenShown() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
}

export function markPremiumSavingsShown() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
}

/**
 * @param {string|number|null|undefined} raw
 * @returns {number|null}
 */
export function parseProductPriceValue(raw) {
  if (raw == null || raw === "") return null;

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }

  let s = String(raw).trim().toLowerCase().replace(/r\$\s*/g, "");
  if (!s) return null;

  s = s.replace(/\s+/g, "");

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return parseInt(s.replace(/\./g, ""), 10);
  }

  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    const [whole, dec] = s.split(",");
    return parseInt(whole.replace(/\./g, ""), 10);
  }

  if (/^\d+,\d{1,2}$/.test(s)) {
    return parseFloat(s.replace(",", "."));
  }

  const normalized = s.replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Prioridade: lastBestProduct → primeiro card → menor preço válido na lista.
 * @param {object} data — resposta da API
 * @param {Array} productsRaw — produtos já extraídos
 * @returns {number|null}
 */
export function pickPrincipalProductPrice(data = {}, productsRaw = []) {
  const fromBest = parseProductPriceValue(data?.session_context?.lastBestProduct?.price);
  if (fromBest) return fromBest;

  const first = Array.isArray(productsRaw) ? productsRaw[0] : null;
  const fromFirst = parseProductPriceValue(first?.price);
  if (fromFirst) return fromFirst;

  const list = Array.isArray(productsRaw) ? productsRaw : [];
  let lowest = null;

  for (const item of list) {
    const p = parseProductPriceValue(item?.price);
    if (!p) continue;
    if (lowest == null || p < lowest) lowest = p;
  }

  return lowest;
}

function hashSeed(n) {
  const x = Math.abs(Math.floor(n)) % 2147483647;
  return ((x * 1103515245 + 12345) >>> 0) % 1000;
}

/**
 * Percentual entre 4% e 6% (determinístico por preço do produto).
 */
export function pickSavingsPercent(productPrice) {
  const seed = hashSeed(productPrice);
  const pct = 0.04 + (seed % 21) / 1000;
  return Math.min(0.06, Math.max(0.04, pct));
}

export function isForbiddenRoundAmount(value) {
  const n = Math.round(value);
  return FORBIDDEN_ROUND_AMOUNTS.has(n) || n % 10 === 0;
}

/**
 * Ajusta para inteiro não redondo entre 15 e 300.
 */
export function toNonRoundSavingsAmount(rawValue) {
  let v = Math.round(rawValue);
  if (v < MIN_SAVINGS) v = MIN_SAVINGS;
  if (v > MAX_SAVINGS) v = MAX_SAVINGS;

  if (!isForbiddenRoundAmount(v)) return v;

  const offsets = [1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 7, -7, 9, -9];
  for (const offset of offsets) {
    const candidate = v + offset;
    if (
      candidate >= MIN_SAVINGS &&
      candidate <= MAX_SAVINGS &&
      !isForbiddenRoundAmount(candidate)
    ) {
      return candidate;
    }
  }

  return 23;
}

export function computeEstimatedSavingsAmount(productPrice) {
  if (!productPrice || productPrice <= 0) return null;
  const pct = pickSavingsPercent(productPrice);
  const raw = productPrice * pct;
  return toNonRoundSavingsAmount(raw);
}

/**
 * @returns {string|null} mensagem completa ou null se não exibir
 */
export function buildEstimatedSavingsMessage(data = {}, productsRaw = []) {
  const principal = pickPrincipalProductPrice(data, productsRaw);
  if (!principal) return null;

  const amount = computeEstimatedSavingsAmount(principal);
  if (!amount) return null;

  return `💰 Você pode ter economizado até R$ ${amount} analisando antes de comprar.`;
}

/**
 * @param {number} searchCount — buscas concluídas na sessão
 */
export function shouldShowPremiumSavingsOnSearch(searchCount) {
  return searchCount === 1 && !hasPremiumSavingsBeenShown();
}
