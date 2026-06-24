/**
 * PATCH 1 — MIA Price Drop Email (Resend)
 *
 * Camada de envio fina sobre template + safety.
 * Envio real permanece desabilitado por padrão (MIA_PRICE_DROP_EMAIL_SEND_ENABLED).
 */

import { Resend } from "resend";
import {
  MIA_EMAIL_FROM,
  MIA_PRICE_DROP_EMAIL_SUBJECT,
  buildMiaPriceDropEmailContent,
  isMiaPriceDropEmailSendEnabled,
  logMiaEmailSafetyBlock,
  logMiaEmailSendSkipped,
} from "./miaPriceDropEmailTemplate.js";

export {
  MIA_EMAIL_FROM,
  MIA_PRICE_DROP_EMAIL_SUBJECT,
  MIA_EMAIL_CTA_LABEL,
  MIA_EMAIL_COLORS,
  MIA_PRICE_DROP_EMAIL_VERSION,
  buildMiaPriceDropEmailHtml,
  buildMiaPriceDropEmailContent,
  validatePriceDropEmailPayload,
  formatMiaEmailPrice,
  resolveMiaEmailLogoUrl,
  miaEmailLogoFileExists,
  isMiaPriceDropEmailSendEnabled,
} from "./miaPriceDropEmailTemplate.js";

function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

/**
 * Envia e-mail de queda de preço via Resend.
 * Não lança exception fatal — retorna resultado controlado.
 *
 * @returns {Promise<{ ok: boolean, skipped?: boolean, code?: string, error?: string, id?: string }>}
 */
export async function sendPriceDropEmail(to, productName, oldPrice, newPrice, link) {
  const content = buildMiaPriceDropEmailContent({
    to,
    productName,
    oldPrice,
    newPrice,
    link,
  });

  if (!content.ok) {
    logMiaEmailSafetyBlock(content.code, content.error, { productName });
    return {
      ok: false,
      code: content.code,
      error: content.error,
    };
  }

  if (!isMiaPriceDropEmailSendEnabled()) {
    logMiaEmailSendSkipped("send_disabled", { to: content.to });
    return {
      ok: false,
      skipped: true,
      code: "send_disabled",
      error: "Envio desabilitado (MIA_PRICE_DROP_EMAIL_SEND_ENABLED)",
    };
  }

  const resend = getResendClient();
  if (!resend) {
    console.warn("[MIA Email] RESEND_API_KEY ausente — envio não realizado");
    return {
      ok: false,
      code: "missing_api_key",
      error: "RESEND_API_KEY não configurada",
    };
  }

  try {
    const result = await resend.emails.send({
      from: MIA_EMAIL_FROM,
      to: [content.to],
      subject: MIA_PRICE_DROP_EMAIL_SUBJECT,
      html: content.html,
    });

    console.log("[MIA Email] Enviado com sucesso:", {
      id: result?.data?.id || null,
      to: content.to.replace(/(.{2}).+(@.+)/, "$1***$2"),
    });

    return {
      ok: true,
      id: result?.data?.id || null,
    };
  } catch (error) {
    console.error("[MIA Email] Erro Resend:", {
      message: error?.message || "unknown_error",
    });
    return {
      ok: false,
      code: "resend_error",
      error: String(error?.message || "Erro ao enviar e-mail"),
    };
  }
}
