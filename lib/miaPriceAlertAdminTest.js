/**
 * PATCH 6 — Protected Admin Test Endpoint
 *
 * Validação de config, mock em memória e envio controlado de teste.
 * Não altera price_alerts reais. Não chama providers comerciais.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { sendPriceDropEmail } from "./email.js";
import {
  PRICE_DROP_EMAIL_ANALYTICS_EVENTS,
  PRICE_DROP_EMAIL_TEST_ANALYTICS_EVENTS,
  buildPriceAlertEmailAnalyticsPayload,
  emitPriceAlertEmailTestAnalytics,
} from "./miaPriceAlertEmailAnalytics.js";
import {
  evaluatePriceAlertEligibility,
  isValidAlertUserEmail,
  isValidTrustedOfferUrl,
  validateMiaAdminApiKey,
} from "./miaPriceAlertDryRun.js";
import {
  evaluateAntiSpamRules,
  hasResendApiKey,
  isSendEnvEnabled,
  parseBooleanSendFlag,
} from "./miaPriceAlertSendGate.js";
import {
  MIA_EMAIL_CTA_LABEL,
  MIA_PRICE_DROP_EMAIL_SUBJECT,
  buildMiaPriceDropEmailContent,
  miaEmailLogoFileExists,
} from "./miaPriceDropEmailTemplate.js";
import {
  PRICE_ALERT_DELIVERY_EVENTS,
  emitPriceAlertDeliveryLog,
  resolveDeliverySeverity,
} from "./miaPriceAlertDeliveryLogs.js";

export const MIA_PRICE_ALERT_ADMIN_TEST_VERSION = "6.0.0";
export const MIA_CONTROLLED_TEST_PRODUCT_NAME = "Teste interno MIA — Alerta de preço";
export const MIA_CONTROLLED_TEST_OLD_PRICE = 2000;
export const MIA_CONTROLLED_TEST_NEW_PRICE = 1899;
export const MIA_CONTROLLED_TEST_STORE = "Loja de teste MIA";
export const MIA_CONTROLLED_TEST_DEFAULT_URL = "https://teilor.com.br";
export const MIA_CONTROLLED_TEST_LOGO_PATH = "/branding/mia-logo.png";

const ADMIN_ENDPOINTS = Object.freeze({
  dryRun: "pages/api/admin/price-alerts-dry-run.js",
  send: "pages/api/admin/price-alerts-send.js",
  test: "pages/api/admin/price-alerts-test.js",
});

export function maskEmailForAdminResponse(email = "") {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const match = normalized.match(/^(.{2}).*(@.+)$/);
  if (!match) return null;
  return `${match[1]}***${match[2]}`;
}

export function resolveControlledTestUrl(testUrl = "") {
  const raw = String(testUrl || "").trim();
  if (raw && isValidTrustedOfferUrl(raw)) return raw;
  return MIA_CONTROLLED_TEST_DEFAULT_URL;
}

export function adminEndpointFileExists(relativePath = "") {
  try {
    return existsSync(join(process.cwd(), relativePath));
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function buildControlledTestOffer(overrides = {}) {
  const link = resolveControlledTestUrl(overrides.test_url ?? overrides.testUrl);
  return {
    best_found_product_name: MIA_CONTROLLED_TEST_PRODUCT_NAME,
    best_found_price: MIA_CONTROLLED_TEST_NEW_PRICE,
    best_found_source: MIA_CONTROLLED_TEST_STORE,
    best_found_url: link,
    ...overrides,
  };
}

/**
 * @param {Record<string, unknown>} overrides
 */
export function buildControlledTestAlert(overrides = {}) {
  return {
    id: "controlled-test-mock-alert",
    user_id: null,
    user_email: "controlled-test@mia.internal",
    product_name: MIA_CONTROLLED_TEST_PRODUCT_NAME,
    normalized_product_key: "teste interno mia alerta de preco",
    target_price: MIA_CONTROLLED_TEST_OLD_PRICE,
    current_price: MIA_CONTROLLED_TEST_OLD_PRICE,
    last_checked_price: MIA_CONTROLLED_TEST_OLD_PRICE,
    is_active: true,
    email_send_count: 0,
    check_count: 0,
    ...overrides,
  };
}

async function logAdminTestDelivery(options = {}, event = {}) {
  if (options.deliveryLogs === false || !options.supabase) return;
  await emitPriceAlertDeliveryLog(
    options.supabase,
    {
      mode: "admin_test",
      source: "admin_test",
      severity: resolveDeliverySeverity(event.eventType),
      productName: MIA_CONTROLLED_TEST_PRODUCT_NAME,
      ...event,
    },
    { recordFn: options.recordDeliveryLog, enabled: options.deliveryLogs !== false }
  );
}

/**
 * @param {{ supabase?: import("@supabase/supabase-js").SupabaseClient, deliveryLogs?: boolean, recordDeliveryLog?: Function }} options
 */
export async function runAdminTestValidateMode(options = {}) {
  const templateSample = buildMiaPriceDropEmailContent({
    to: "teste@example.com",
    productName: MIA_CONTROLLED_TEST_PRODUCT_NAME,
    oldPrice: MIA_CONTROLLED_TEST_OLD_PRICE,
    newPrice: MIA_CONTROLLED_TEST_NEW_PRICE,
    link: MIA_CONTROLLED_TEST_DEFAULT_URL,
  });

  const report = buildAdminTestValidateReport(templateSample);

  await logAdminTestDelivery(options, {
    eventType: PRICE_ALERT_DELIVERY_EVENTS.ADMIN_TEST_VALIDATE_RUN,
    metadata: { checks_ready: templateSample.ok === true },
  });

  return report;
}

function buildAdminTestValidateReport(templateSample) {
  return {
    ok: true,
    mode: "validate",
    controlled_test: true,
    version: MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
    checks: {
      admin_key_configured: !!String(process.env.MIA_ADMIN_API_KEY || "").trim(),
      resend_key_configured: hasResendApiKey(),
      send_enabled: isSendEnvEnabled(),
      template_ready: templateSample.ok === true,
      logo_path: MIA_CONTROLLED_TEST_LOGO_PATH,
      logo_file_exists: miaEmailLogoFileExists(),
      dry_run_endpoint_ready: adminEndpointFileExists(ADMIN_ENDPOINTS.dryRun),
      send_endpoint_ready: adminEndpointFileExists(ADMIN_ENDPOINTS.send),
      test_endpoint_ready: adminEndpointFileExists(ADMIN_ENDPOINTS.test),
      email_subject: MIA_PRICE_DROP_EMAIL_SUBJECT,
      email_cta_label: MIA_EMAIL_CTA_LABEL,
    },
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export async function runAdminTestMockMode(input = {}) {
  const alertOverrides = {};
  if (input.mock_email_send_count != null) {
    alertOverrides.email_send_count = Number.parseInt(String(input.mock_email_send_count), 10) || 0;
  }
  if (input.mock_last_alert_sent_at) {
    alertOverrides.last_alert_sent_at = input.mock_last_alert_sent_at;
  }
  if (input.mock_last_alert_sent_price != null) {
    alertOverrides.last_alert_sent_price = input.mock_last_alert_sent_price;
  }

  const alert = buildControlledTestAlert(alertOverrides);
  const bestFound = buildControlledTestOffer({
    test_url: input.test_url ?? input.testUrl,
  });

  const evaluation = evaluatePriceAlertEligibility(alert, {
    bestFound,
    dryRun: false,
  });

  const antiSpam = evaluateAntiSpamRules(alert, evaluation);
  const wouldSendEmail = evaluation.eligible_for_email === true && antiSpam.ok;

  const reason = wouldSendEmail
    ? evaluation.best_found_price === evaluation.target_price
      ? "mock_eligible_at_target"
      : "mock_eligible_below_target"
    : antiSpam.reason || evaluation.reason || "mock_not_eligible";

  const analyticsPreview = buildPriceAlertEmailAnalyticsPayload({
    eventName: wouldSendEmail
      ? PRICE_DROP_EMAIL_ANALYTICS_EVENTS.ATTEMPTED
      : PRICE_DROP_EMAIL_ANALYTICS_EVENTS.SKIPPED,
    alert,
    evaluation,
    context: {
      reason,
      blockedBy: wouldSendEmail ? null : antiSpam.reason || evaluation.reason,
      sendMode: true,
    },
  });

  const report = {
    ok: true,
    mode: "mock",
    controlled_test: true,
    not_market_real: true,
    would_send_email: wouldSendEmail,
    email_sent: false,
    eligible_for_email: evaluation.eligible_for_email,
    anti_spam_ok: antiSpam.ok,
    reason,
    mock_alert: {
      product_name: alert.product_name,
      target_price: alert.target_price,
      email_send_count: alert.email_send_count,
    },
    mock_offer: {
      best_found_price: bestFound.best_found_price,
      best_found_source: bestFound.best_found_source,
      best_found_url: bestFound.best_found_url,
    },
    analytics_preview: {
      event_name: analyticsPreview.event_name,
      category: analyticsPreview.category,
      metadata: analyticsPreview.metadata,
    },
    version: MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
  };

  await logAdminTestDelivery(input, {
    eventType: PRICE_ALERT_DELIVERY_EVENTS.ADMIN_TEST_MOCK_RUN,
    targetPrice: alert.target_price,
    foundPrice: bestFound.best_found_price,
    foundSource: bestFound.best_found_source,
    foundUrl: bestFound.best_found_url,
    reason,
    metadata: { would_send_email: wouldSendEmail },
  });

  return report;
}

/**
 * @param {Record<string, unknown>} source
 */
export function validateControlledSendRequest(source = {}) {
  if (!parseBooleanSendFlag(source.send, false)) {
    return { ok: false, code: "controlled_send_not_authorized", reason: "send_not_requested" };
  }

  if (!parseBooleanSendFlag(source.confirm_send ?? source.confirmSend, false)) {
    return {
      ok: false,
      code: "controlled_send_not_authorized",
      reason: "confirm_send_not_requested",
    };
  }

  if (!parseBooleanSendFlag(source.allow_controlled_send ?? source.allowControlledSend, false)) {
    return {
      ok: false,
      code: "controlled_send_not_authorized",
      reason: "allow_controlled_send_not_requested",
    };
  }

  if (!isSendEnvEnabled()) {
    return { ok: false, code: "controlled_send_not_authorized", reason: "send_disabled" };
  }

  if (!hasResendApiKey()) {
    return { ok: false, code: "controlled_send_not_authorized", reason: "missing_resend_api_key" };
  }

  const testEmail = String(source.test_email ?? source.testEmail ?? "").trim();
  if (!isValidAlertUserEmail(testEmail)) {
    return { ok: false, code: "invalid_test_email", reason: "invalid_test_email" };
  }

  return { ok: true, testEmail };
}

/**
 * @param {{
 *   source?: Record<string, unknown>,
 *   supabase?: import("@supabase/supabase-js").SupabaseClient,
 *   sendEmail?: Function,
 *   trackTestAnalytics?: Function,
 *   analytics?: boolean,
 * }} options
 */
export async function runAdminTestControlledSendMode(options = {}) {
  const source = options.source || {};
  const analyticsEnabled = options.analytics !== false;

  const auth = validateControlledSendRequest(source);
  if (!auth.ok) {
    const response = {
      ok: false,
      mode: "controlled-send",
      controlled_test: true,
      not_market_real: true,
      code: auth.code,
      reason: auth.reason,
      email_sent: false,
      version: MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
    };

    if (analyticsEnabled && options.supabase) {
      await emitPriceAlertEmailTestAnalytics(
        options.supabase,
        {
          eventName: PRICE_DROP_EMAIL_TEST_ANALYTICS_EVENTS.SKIPPED,
          context: {
            mode: "controlled-send",
            productName: MIA_CONTROLLED_TEST_PRODUCT_NAME,
            reason: auth.reason,
            blockedBy: auth.reason,
            offerStore: MIA_CONTROLLED_TEST_STORE,
            offerPrice: MIA_CONTROLLED_TEST_NEW_PRICE,
            offerUrl: resolveControlledTestUrl(source.test_url ?? source.testUrl),
          },
        },
        options.trackTestAnalytics
      );
    }

    await logAdminTestDelivery(options, {
      eventType: PRICE_ALERT_DELIVERY_EVENTS.ADMIN_TEST_CONTROLLED_SEND_FAILED,
      reason: auth.reason,
      errorCode: auth.code,
      metadata: { blocked: true },
    });

    return response;
  }

  const testUrl = resolveControlledTestUrl(source.test_url ?? source.testUrl);
  const sendFn = options.sendEmail || sendPriceDropEmail;

  const sendResult = await sendFn(
    auth.testEmail,
    MIA_CONTROLLED_TEST_PRODUCT_NAME,
    MIA_CONTROLLED_TEST_OLD_PRICE,
    MIA_CONTROLLED_TEST_NEW_PRICE,
    testUrl
  );

  if (sendResult?.ok === true) {
    if (analyticsEnabled && options.supabase) {
      await emitPriceAlertEmailTestAnalytics(
        options.supabase,
        {
          eventName: PRICE_DROP_EMAIL_TEST_ANALYTICS_EVENTS.SENT,
          context: {
            mode: "controlled-send",
            productName: MIA_CONTROLLED_TEST_PRODUCT_NAME,
            reason: "controlled_test_sent",
            resendResultId: sendResult.id || null,
            offerStore: MIA_CONTROLLED_TEST_STORE,
            offerPrice: MIA_CONTROLLED_TEST_NEW_PRICE,
            offerUrl: testUrl,
            testUrlUsed: testUrl,
          },
        },
        options.trackTestAnalytics
      );
    }

    await logAdminTestDelivery(options, {
      eventType: PRICE_ALERT_DELIVERY_EVENTS.ADMIN_TEST_CONTROLLED_SEND_SENT,
      emailSent: true,
      resendResultId: sendResult.id || null,
      foundPrice: MIA_CONTROLLED_TEST_NEW_PRICE,
      foundSource: MIA_CONTROLLED_TEST_STORE,
      foundUrl: testUrl,
      maskedEmail: auth.testEmail,
    });

    return {
      ok: true,
      mode: "controlled-send",
      controlled_test: true,
      not_market_real: true,
      email_sent: true,
      to: maskEmailForAdminResponse(auth.testEmail),
      resend_result_id: sendResult.id || null,
      product_name: MIA_CONTROLLED_TEST_PRODUCT_NAME,
      old_price: MIA_CONTROLLED_TEST_OLD_PRICE,
      new_price: MIA_CONTROLLED_TEST_NEW_PRICE,
      store_name: MIA_CONTROLLED_TEST_STORE,
      link: testUrl,
      version: MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
    };
  }

  const failureCode = sendResult?.code || sendResult?.error || "send_failed";

  if (analyticsEnabled && options.supabase) {
    await emitPriceAlertEmailTestAnalytics(
      options.supabase,
      {
        eventName: PRICE_DROP_EMAIL_TEST_ANALYTICS_EVENTS.FAILED,
        context: {
          mode: "controlled-send",
          productName: MIA_CONTROLLED_TEST_PRODUCT_NAME,
          reason: failureCode,
          errorCode: failureCode,
          offerStore: MIA_CONTROLLED_TEST_STORE,
          offerPrice: MIA_CONTROLLED_TEST_NEW_PRICE,
          offerUrl: testUrl,
        },
      },
      options.trackTestAnalytics
    );
  }

  await logAdminTestDelivery(options, {
    eventType: PRICE_ALERT_DELIVERY_EVENTS.ADMIN_TEST_CONTROLLED_SEND_FAILED,
    reason: failureCode,
    errorCode: failureCode,
    maskedEmail: auth.testEmail,
  });

  return {
    ok: false,
    mode: "controlled-send",
    controlled_test: true,
    not_market_real: true,
    email_sent: false,
    code: failureCode,
    reason: failureCode,
    to: maskEmailForAdminResponse(auth.testEmail),
    version: MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
  };
}

export { validateMiaAdminApiKey };
