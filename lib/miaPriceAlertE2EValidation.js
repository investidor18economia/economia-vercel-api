/**
 * PATCH 7 — Manual End-to-End Test Flow
 *
 * Validação operacional ponta a ponta antes de automação diária.
 * Não altera price_alerts. Não chama providers comerciais.
 */

import {
  PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS,
  MIA_PRICE_ALERT_E2E_ANALYTICS_CATEGORY,
  buildPriceAlertEmailE2eAnalyticsPayload,
  emitPriceAlertEmailE2eAnalytics,
} from "./miaPriceAlertEmailAnalytics.js";
import {
  adminEndpointFileExists,
  maskEmailForAdminResponse,
  validateControlledSendRequest,
} from "./miaPriceAlertAdminTest.js";
import { sendPriceDropEmail } from "./email.js";
import { validateMiaAdminApiKey } from "./miaPriceAlertDryRun.js";
import { hasResendApiKey, isSendEnvEnabled } from "./miaPriceAlertSendGate.js";
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

export const MIA_PRICE_ALERT_E2E_VALIDATION_VERSION = "7.0.0";
export const MIA_OFFICIAL_E2E_TEST_EMAIL = "lofibrasil546@gmail.com";
export const MIA_E2E_TEST_PRODUCT_NAME = "Teste interno MIA — Fluxo End-to-End";
export const MIA_E2E_TEST_OLD_PRICE = 2000;
export const MIA_E2E_TEST_NEW_PRICE = 1899;
export const MIA_E2E_TEST_STORE = "Loja de teste MIA";
export const MIA_E2E_TEST_LINK = "https://teilor.com.br";

const ADMIN_ENDPOINTS = Object.freeze({
  dryRun: "pages/api/admin/price-alerts-dry-run.js",
  send: "pages/api/admin/price-alerts-send.js",
  test: "pages/api/admin/price-alerts-test.js",
  e2e: "pages/api/admin/price-alerts-e2e.js",
});

async function logE2eDelivery(options = {}, event = {}) {
  if (options.deliveryLogs === false || !options.supabase) return;
  await emitPriceAlertDeliveryLog(
    options.supabase,
    {
      mode: "e2e",
      source: "e2e",
      severity: resolveDeliverySeverity(event.eventType),
      productName: MIA_E2E_TEST_PRODUCT_NAME,
      ...event,
    },
    { recordFn: options.recordDeliveryLog, enabled: options.deliveryLogs !== false }
  );
}

const CORE_LIBS = Object.freeze({
  dryRun: "lib/miaPriceAlertDryRun.js",
  sendGate: "lib/miaPriceAlertSendGate.js",
  analytics: "lib/miaPriceAlertEmailAnalytics.js",
  adminTest: "lib/miaPriceAlertAdminTest.js",
  e2e: "lib/miaPriceAlertE2EValidation.js",
  emailTemplate: "lib/miaPriceDropEmailTemplate.js",
});

/**
 * @param {Record<string, unknown>} source
 */
export function resolveE2eTestEmail(source = {}) {
  const explicit = String(source.test_email ?? source.testEmail ?? "").trim();
  return explicit || MIA_OFFICIAL_E2E_TEST_EMAIL;
}

export function checkE2eTemplateReady() {
  const content = buildMiaPriceDropEmailContent({
    to: MIA_OFFICIAL_E2E_TEST_EMAIL,
    productName: MIA_E2E_TEST_PRODUCT_NAME,
    oldPrice: MIA_E2E_TEST_OLD_PRICE,
    newPrice: MIA_E2E_TEST_NEW_PRICE,
    link: MIA_E2E_TEST_LINK,
  });
  return {
    ok: content.ok === true,
    logoIncluded: content.logoIncluded === true,
    subject: MIA_PRICE_DROP_EMAIL_SUBJECT,
    ctaLabel: MIA_EMAIL_CTA_LABEL,
    error: content.ok ? null : content.error || content.code,
  };
}

export function checkE2eAnalyticsReady() {
  try {
    const payload = buildPriceAlertEmailE2eAnalyticsPayload({
      eventName: PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS.SENT,
      context: {
        mode: "controlled-e2e",
        productName: MIA_E2E_TEST_PRODUCT_NAME,
        offerStore: MIA_E2E_TEST_STORE,
        offerPrice: MIA_E2E_TEST_NEW_PRICE,
        offerUrl: MIA_E2E_TEST_LINK,
        templateRendered: true,
      },
    });
    return {
      ok:
        payload.event_name === PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS.SENT &&
        payload.category === MIA_PRICE_ALERT_E2E_ANALYTICS_CATEGORY &&
        payload.metadata.controlled_test === true,
      category: payload.category,
      event_name: payload.event_name,
    };
  } catch {
    return { ok: false };
  }
}

export async function runE2EValidateMode(options = {}) {
  const template = checkE2eTemplateReady();
  const analytics = checkE2eAnalyticsReady();

  const report = {
    ok: true,
    mode: "validate",
    controlled_test: true,
    version: MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
    checks: {
      admin_key_ok: !!String(process.env.MIA_ADMIN_API_KEY || "").trim(),
      resend_key_ok: hasResendApiKey(),
      send_enabled: isSendEnvEnabled(),
      template_ok: template.ok === true,
      analytics_ok: analytics.ok === true,
      dry_run_ok:
        adminEndpointFileExists(ADMIN_ENDPOINTS.dryRun) &&
        adminEndpointFileExists(CORE_LIBS.dryRun),
      send_endpoint_ok: adminEndpointFileExists(ADMIN_ENDPOINTS.send),
      test_endpoint_ok: adminEndpointFileExists(ADMIN_ENDPOINTS.test),
      e2e_endpoint_ok: adminEndpointFileExists(ADMIN_ENDPOINTS.e2e),
      logo_file_exists: miaEmailLogoFileExists(),
      official_test_email_configured: !!MIA_OFFICIAL_E2E_TEST_EMAIL,
    },
    details: {
      template,
      analytics,
      endpoints: ADMIN_ENDPOINTS,
      official_test_email: maskEmailForAdminResponse(MIA_OFFICIAL_E2E_TEST_EMAIL),
    },
  };

  await logE2eDelivery(options, {
    eventType: PRICE_ALERT_DELIVERY_EVENTS.E2E_VALIDATE_RUN,
    metadata: { template_ok: template.ok, analytics_ok: analytics.ok },
  });

  return report;
}

/**
 * @param {Record<string, unknown>} source
 */
export function validateControlledE2eRequest(source = {}) {
  const testEmail = resolveE2eTestEmail(source);
  const auth = validateControlledSendRequest({
    ...source,
    test_email: testEmail,
  });

  if (!auth.ok) {
    return {
      ...auth,
      code:
        auth.code === "controlled_send_not_authorized"
          ? "controlled_e2e_not_authorized"
          : auth.code,
      testEmail,
    };
  }

  return { ...auth, testEmail };
}

/**
 * @param {{
 *   source?: Record<string, unknown>,
 *   supabase?: import("@supabase/supabase-js").SupabaseClient,
 *   sendEmail?: Function,
 *   trackE2eAnalytics?: Function,
 *   analytics?: boolean,
 * }} options
 */
export async function runControlledE2eMode(options = {}) {
  const source = options.source || {};
  const analyticsEnabled = options.analytics !== false;
  const steps = [];

  const environment = await runE2EValidateMode(options);
  steps.push({
    step: "environment",
    ok: environment.checks.admin_key_ok && environment.checks.template_ok,
  });

  const auth = validateControlledE2eRequest(source);
  if (!auth.ok) {
    if (analyticsEnabled && options.supabase) {
      await emitPriceAlertEmailE2eAnalytics(
        options.supabase,
        {
          eventName: PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS.SKIPPED,
          context: {
            mode: "controlled-e2e",
            productName: MIA_E2E_TEST_PRODUCT_NAME,
            reason: auth.reason,
            blockedBy: auth.reason,
            offerStore: MIA_E2E_TEST_STORE,
            offerPrice: MIA_E2E_TEST_NEW_PRICE,
            offerUrl: MIA_E2E_TEST_LINK,
          },
        },
        options.trackE2eAnalytics
      );
    }

    return {
      ok: false,
      mode: "controlled-e2e",
      controlled_test: true,
      not_market_real: true,
      code: auth.code,
      reason: auth.reason,
      email_sent: false,
      analytics_recorded: false,
      template_rendered: false,
      resend_success: false,
      steps,
      version: MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
    };
  }

  const template = buildMiaPriceDropEmailContent({
    to: auth.testEmail,
    productName: MIA_E2E_TEST_PRODUCT_NAME,
    oldPrice: MIA_E2E_TEST_OLD_PRICE,
    newPrice: MIA_E2E_TEST_NEW_PRICE,
    link: MIA_E2E_TEST_LINK,
  });

  const templateRendered = template.ok === true;
  steps.push({ step: "template", ok: templateRendered });

  if (!templateRendered) {
    if (analyticsEnabled && options.supabase) {
      await emitPriceAlertEmailE2eAnalytics(
        options.supabase,
        {
          eventName: PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS.FAILED,
          context: {
            mode: "controlled-e2e",
            productName: MIA_E2E_TEST_PRODUCT_NAME,
            reason: template.code || "template_render_failed",
            errorCode: template.code || "template_render_failed",
            templateRendered: false,
            offerStore: MIA_E2E_TEST_STORE,
            offerPrice: MIA_E2E_TEST_NEW_PRICE,
            offerUrl: MIA_E2E_TEST_LINK,
          },
        },
        options.trackE2eAnalytics
      );
    }

    return {
      ok: false,
      mode: "controlled-e2e",
      controlled_test: true,
      not_market_real: true,
      email_sent: false,
      analytics_recorded: false,
      template_rendered: false,
      resend_success: false,
      code: template.code || "template_render_failed",
      reason: template.error || template.code,
      steps,
      version: MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
    };
  }

  const sendFn = options.sendEmail || sendPriceDropEmail;
  const sendResult = await sendFn(
    auth.testEmail,
    MIA_E2E_TEST_PRODUCT_NAME,
    MIA_E2E_TEST_OLD_PRICE,
    MIA_E2E_TEST_NEW_PRICE,
    MIA_E2E_TEST_LINK
  );

  const resendSuccess = sendResult?.ok === true;
  steps.push({ step: "resend", ok: resendSuccess });

  let analyticsRecorded = false;
  if (analyticsEnabled && options.supabase) {
    const analyticsResult = await emitPriceAlertEmailE2eAnalytics(
      options.supabase,
      {
        eventName: resendSuccess
          ? PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS.SENT
          : PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS.FAILED,
        context: {
          mode: "controlled-e2e",
          productName: MIA_E2E_TEST_PRODUCT_NAME,
          reason: resendSuccess
            ? "controlled_e2e_sent"
            : sendResult?.code || sendResult?.error || "send_failed",
          errorCode: resendSuccess
            ? null
            : sendResult?.code || sendResult?.error || "send_failed",
          resendResultId: sendResult?.id || null,
          templateRendered: true,
          offerStore: MIA_E2E_TEST_STORE,
          offerPrice: MIA_E2E_TEST_NEW_PRICE,
          offerUrl: MIA_E2E_TEST_LINK,
        },
      },
      options.trackE2eAnalytics
    );
    analyticsRecorded = analyticsResult?.ok === true;
  }

  steps.push({ step: "analytics", ok: analyticsEnabled ? analyticsRecorded : true });

  if (!resendSuccess) {
    await logE2eDelivery(options, {
      eventType: PRICE_ALERT_DELIVERY_EVENTS.E2E_CONTROLLED_SEND_FAILED,
      reason: sendResult?.code || sendResult?.error || "send_failed",
      errorCode: sendResult?.code || sendResult?.error || "send_failed",
      maskedEmail: auth.testEmail,
      foundPrice: MIA_E2E_TEST_NEW_PRICE,
      foundSource: MIA_E2E_TEST_STORE,
      foundUrl: MIA_E2E_TEST_LINK,
    });

    return {
      ok: false,
      mode: "controlled-e2e",
      controlled_test: true,
      not_market_real: true,
      email_sent: false,
      analytics_recorded: analyticsRecorded,
      template_rendered: true,
      resend_success: false,
      code: sendResult?.code || sendResult?.error || "send_failed",
      reason: sendResult?.code || sendResult?.error || "send_failed",
      to: maskEmailForAdminResponse(auth.testEmail),
      steps,
      version: MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
    };
  }

  await logE2eDelivery(options, {
    eventType: PRICE_ALERT_DELIVERY_EVENTS.E2E_CONTROLLED_SEND_SENT,
    emailSent: true,
    resendResultId: sendResult.id || null,
    maskedEmail: auth.testEmail,
    foundPrice: MIA_E2E_TEST_NEW_PRICE,
    foundSource: MIA_E2E_TEST_STORE,
    foundUrl: MIA_E2E_TEST_LINK,
  });

  return {
    ok: true,
    mode: "controlled-e2e",
    controlled_test: true,
    not_market_real: true,
    email_sent: true,
    analytics_recorded: analyticsRecorded,
    template_rendered: true,
    resend_success: true,
    to: maskEmailForAdminResponse(auth.testEmail),
    resend_result_id: sendResult.id || null,
    product_name: MIA_E2E_TEST_PRODUCT_NAME,
    old_price: MIA_E2E_TEST_OLD_PRICE,
    new_price: MIA_E2E_TEST_NEW_PRICE,
    store_name: MIA_E2E_TEST_STORE,
    link: MIA_E2E_TEST_LINK,
    steps,
    flow: ["configuration", "template", "resend", "analytics", "response"],
    version: MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
  };
}

export { validateMiaAdminApiKey };
