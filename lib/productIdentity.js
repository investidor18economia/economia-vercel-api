export function normalizeProductLink(link = "") {
  const raw = String(link || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw, typeof window !== "undefined" ? window.location.origin : "https://teilor.local");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${path}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export function getStoreLabelFromProduct(prod = {}) {
  const direct = prod.source || prod.store || "";
  if (String(direct).trim()) return String(direct).trim().toLowerCase();

  const link = prod.link || prod.product_url || "";
  if (!link) return "";

  try {
    return new URL(link).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function getProductIdentityKey(prod = {}) {
  const name = String(prod.product_name || prod.title || prod.name || "")
    .trim()
    .toLowerCase();
  const store = getStoreLabelFromProduct(prod);
  const link = normalizeProductLink(prod.link || prod.product_url || "");
  return `${name}||${store}||${link}`;
}

export function findProductByIdentity(items = [], prod = {}) {
  const key = getProductIdentityKey(prod);
  if (!key || key === "||||") return null;
  return items.find((item) => getProductIdentityKey(item) === key) || null;
}
