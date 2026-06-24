/**
 * PATCH 1 — MIA Price Drop Email Template + Safety Layer
 *
 * Template institucional HTML + validação de payload.
 * Não altera monitoramento, endpoints ou fluxo de alertas.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export const MIA_PRICE_DROP_EMAIL_VERSION = "10.1.2";

export const MIA_EMAIL_LOGO_PUBLIC_PATH = "/branding/mia-logo.png";

export const MIA_EMAIL_FROM = "MIA da Teilor <mia@teilor.com.br>";
export const MIA_PRICE_DROP_EMAIL_SUBJECT = "💰 Boa notícia: o preço caiu";
export const MIA_EMAIL_CTA_LABEL = "Ver na loja";

export const MIA_EMAIL_COLORS = Object.freeze({
  primary: "#00C6FF",
  secondary: "#7B61FF",
  background: "#050D1F",
  cardDeep: "#04132A",
  text: "#F4FAFF",
  textMuted: "#9BB8D4",
  textSoft: "#C8E4F8",
  card: "#071733",
  priceNew: "#5FD68A",
  priceOld: "#FF6B6B",
  champagne: "#E8D8B5",
  institutional: "#00C6FF",
  signature: "#72D4A8",
  headlineBg: "#061F3A",
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_RELATIVE_PATH = "public/branding/mia-logo.png";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripAccents(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parsePriceValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  let normalized = raw.replace(/[^\d,.-]/g, "");
  if (!normalized) return null;

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function formatMiaEmailPrice(value) {
  const numeric = parsePriceValue(value);
  if (numeric == null) return null;
  return `R$ ${numeric.toFixed(2).replace(".", ",")}`;
}

function isValidHttpUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveProjectRoot() {
  return process.cwd();
}

export function miaEmailLogoFileExists() {
  try {
    return existsSync(join(resolveProjectRoot(), LOGO_RELATIVE_PATH));
  } catch {
    return false;
  }
}

/**
 * Normaliza base URL pública (sem path trailing).
 * @param {string} value
 */
export function normalizeMiaEmailPublicBaseUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * Ordem: MIA_PUBLIC_APP_URL → NEXT_PUBLIC_SITE_URL → VERCEL_URL (https).
 * @param {{ baseUrl?: string }} options
 */
export function resolveMiaEmailPublicBaseUrl(options = {}) {
  if (options.baseUrl) {
    return normalizeMiaEmailPublicBaseUrl(options.baseUrl);
  }

  for (const candidate of [
    process.env.MIA_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]) {
    const normalized = normalizeMiaEmailPublicBaseUrl(candidate);
    if (normalized) return normalized;
  }

  const vercelHost = String(process.env.VERCEL_URL || "").trim();
  if (vercelHost) {
    return normalizeMiaEmailPublicBaseUrl(`https://${vercelHost}`);
  }

  return null;
}

/**
 * Resolve URL absoluta do logo para clientes de e-mail.
 * Nunca retorna caminho relativo. Sem base pública → null (fallback textual).
 * @param {{ logoUrl?: string, baseUrl?: string }} options
 */
export function resolveMiaEmailLogoUrl(options = {}) {
  const explicitLogo = String(options.logoUrl || "").trim();
  if (explicitLogo && isValidHttpUrl(explicitLogo)) {
    return explicitLogo;
  }

  const base = resolveMiaEmailPublicBaseUrl(options);
  if (!base) {
    return null;
  }

  try {
    const absolute = new URL(MIA_EMAIL_LOGO_PUBLIC_PATH, `${base}/`).toString();
    return isValidHttpUrl(absolute) ? absolute : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   to?: string,
 *   productName?: string,
 *   oldPrice?: unknown,
 *   newPrice?: unknown,
 *   link?: string,
 * }} input
 */
export function validatePriceDropEmailPayload(input = {}) {
  const to = normalizeEmail(input.to);
  if (!to) {
    return { ok: false, code: "empty_email", error: "E-mail destinatário vazio" };
  }
  if (!EMAIL_REGEX.test(to)) {
    return { ok: false, code: "invalid_email", error: "E-mail destinatário inválido" };
  }

  const productName = String(input.productName || "").trim();
  if (!productName) {
    return { ok: false, code: "empty_product_name", error: "Nome do produto vazio" };
  }

  const link = String(input.link || "").trim();
  if (!link) {
    return { ok: false, code: "empty_link", error: "Link da oferta vazio" };
  }
  if (!isValidHttpUrl(link)) {
    return { ok: false, code: "invalid_link", error: "Link da oferta inválido" };
  }

  const oldPrice = parsePriceValue(input.oldPrice);
  if (oldPrice == null) {
    return { ok: false, code: "invalid_old_price", error: "Preço anterior inválido" };
  }

  const newPrice = parsePriceValue(input.newPrice);
  if (newPrice == null) {
    return { ok: false, code: "invalid_new_price", error: "Preço atual inválido" };
  }

  const oldPriceLabel = formatMiaEmailPrice(oldPrice);
  const newPriceLabel = formatMiaEmailPrice(newPrice);

  if (!oldPriceLabel || !newPriceLabel) {
    return { ok: false, code: "invalid_price_format", error: "Formato de preço inválido" };
  }

  return {
    ok: true,
    normalized: {
      to,
      productName,
      link,
      oldPrice,
      newPrice,
      oldPriceLabel,
      newPriceLabel,
    },
  };
}

/**
 * @param {{
 *   productName?: string,
 *   oldPriceLabel?: string,
 *   newPriceLabel?: string,
 *   link?: string,
 *   logoUrl?: string|null,
 * }} input
 */
export function buildMiaPriceDropEmailHtml(input = {}) {
  const productName = escapeHtml(input.productName || "");
  const oldPriceLabel = escapeHtml(input.oldPriceLabel || "");
  const newPriceLabel = escapeHtml(input.newPriceLabel || "");
  const link = escapeHtml(input.link || "#");
  const rawLogoUrl = String(input.logoUrl || "").trim();
  const logoUrl =
    rawLogoUrl && isValidHttpUrl(rawLogoUrl) ? escapeHtml(rawLogoUrl) : null;

  const {
    primary,
    secondary,
    background,
    cardDeep,
    text,
    textMuted,
    textSoft,
    card,
    priceNew,
    priceOld,
    champagne,
    signature,
    headlineBg,
  } = MIA_EMAIL_COLORS;

  const headlineText = escapeHtml(MIA_PRICE_DROP_EMAIL_SUBJECT);

  const logoBlock = logoUrl
    ? `<tr>
        <td align="center" bgcolor="${background}" style="background-color:${background};padding:28px 28px 22px;border-radius:16px 16px 0 0;">
          <img
            src="${logoUrl}"
            alt="MIA"
            width="112"
            height="auto"
            style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;max-width:112px;width:112px;height:auto;"
          />
        </td>
      </tr>`
    : `<tr>
        <td align="center" bgcolor="${background}" style="background-color:${background};padding:28px 28px 22px;border-radius:16px 16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;letter-spacing:0.14em;color:${text};">
          MIA
        </td>
      </tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${headlineText}</title>
</head>
<body style="margin:0;padding:0;background-color:${background};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${background};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:${card};border:1px solid #00C6FF;border-color:rgba(0,198,255,0.18);border-radius:16px;overflow:hidden;">
          ${logoBlock}
          <tr>
            <td bgcolor="${card}" style="padding:28px 28px 24px;font-family:Arial,Helvetica,sans-serif;color:${textSoft};background-color:${card};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td bgcolor="${headlineBg}" style="padding:18px 20px;font-size:26px;line-height:1.3;font-weight:700;color:${primary};background-color:${headlineBg};border:1px solid ${primary};border-radius:10px;">
                    ${headlineText}
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 0 8px 0;font-size:14px;line-height:1.5;color:${textSoft};">
                    O produto abaixo ficou mais barato:
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 22px 0;font-size:20px;line-height:1.35;font-weight:700;color:${text};">
                    ${productName}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${cardDeep}" style="background-color:${cardDeep};border:1px solid rgba(123,97,255,0.22);border-radius:12px;">
                      <tr>
                        <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
                          <div style="font-size:12px;color:${textMuted};margin-bottom:6px;">Antes</div>
                          <div style="font-size:18px;line-height:1.2;font-weight:600;color:${priceOld};text-decoration:line-through;margin-bottom:14px;">${oldPriceLabel}</div>
                          <div style="font-size:12px;color:${textMuted};margin-bottom:6px;">Agora</div>
                          <div style="font-size:32px;line-height:1.1;font-weight:700;color:${priceNew};">${newPriceLabel}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <a
                      href="${link}"
                      style="display:inline-block;padding:14px 28px;background-color:${primary};background:linear-gradient(180deg, ${primary} 0%, ${secondary} 100%);color:${background};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;border:1px solid rgba(0,198,255,0.35);"
                    >
                      ${escapeHtml(MIA_EMAIL_CTA_LABEL)}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);font-size:15px;line-height:1.8;color:${textMuted};">
                    <p style="margin:0 0 10px 0;font-weight:600;color:${champagne};">Não ganhamos nada quando você clica.</p>
                    <p style="margin:0 0 10px 0;font-weight:600;color:${champagne};">Não recebemos comissão.</p>
                    <p style="margin:0 0 20px 0;font-weight:600;color:${champagne};">Não empurramos produto.</p>
                    <p style="margin:0 0 20px 0;font-size:16px;line-height:1.65;font-weight:600;color:${primary};background-image:linear-gradient(180deg, ${primary} 0%, ${secondary} 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">As recomendações são feitas pensando em você e nos seus interesses.</p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:${signature};">— MIA da Teilor</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="padding:22px 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${textMuted};text-align:center;">
              Você recebeu este email porque ativou um alerta de preço na MIA.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildMiaPriceDropEmailContent(input = {}) {
  const validation = validatePriceDropEmailPayload(input);
  if (!validation.ok) {
    return validation;
  }

  const logoUrl = resolveMiaEmailLogoUrl({ logoUrl: input.logoUrl });
  const html = buildMiaPriceDropEmailHtml({
    productName: validation.normalized.productName,
    oldPriceLabel: validation.normalized.oldPriceLabel,
    newPriceLabel: validation.normalized.newPriceLabel,
    link: validation.normalized.link,
    logoUrl,
  });

  return {
    ok: true,
    to: validation.normalized.to,
    subject: MIA_PRICE_DROP_EMAIL_SUBJECT,
    from: MIA_EMAIL_FROM,
    html,
    normalized: validation.normalized,
    logoIncluded: !!logoUrl,
  };
}

export function isMiaPriceDropEmailSendEnabled() {
  const raw = String(process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED || "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1";
}

export function logMiaEmailSafetyBlock(code, message, context = {}) {
  console.warn("[MIA Email] Safety block:", {
    code,
    message,
    product: context.productName ? stripAccents(context.productName).slice(0, 80) : undefined,
  });
}

export function logMiaEmailSendSkipped(reason, context = {}) {
  console.info("[MIA Email] Send skipped:", {
    reason,
    to: context.to ? normalizeEmail(context.to).replace(/(.{2}).+(@.+)/, "$1***$2") : undefined,
  });
}
