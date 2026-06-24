/**
 * PATCH 5 — Price Drop Email Analytics Audit
 *
 * Usage:
 *   node scripts/test-mia-price-drop-email-analytics-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MIA_PRICE_ALERT_EMAIL_ANALYTICS_VERSION,
  PRICE_DROP_EMAIL_ANALYTICS_EVENTS,
  buildPriceAlertEmailAnalyticsPayload,
  emitPriceAlertEmailAnalytics,
  trackPriceAlertEmailAnalyticsEvent,
} from "../lib/miaPriceAlertEmailAnalytics.js";
import { runPriceAlertsDryRun } from "../lib/miaPriceAlertDryRun.js";
import { runPriceAlertsSend } from "../lib/miaPriceAlertSendGate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function baseAlert(overrides = {}) {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    user_id: "11111111-2222-4333-8444-555555555555",
    user_email: "usuario@example.com",
    product_name: "Monitor Gamer 27",
    normalized_product_key: "monitor gamer 27",
    target_price: 1000,
    current_price: 1100,
    last_checked_price: 1100,
    is_active: true,
    email_send_count: 0,
    check_count: 0,
    ...overrides,
  };
}

function baseEvaluation(overrides = {}) {
  return {
    target_price: 1000,
    best_found_product_name: "Monitor Gamer 27 165Hz",
    best_found_price: 900,
    best_found_source: "google_shopping",
    best_found_url: "https://loja.example.com/monitor",
    search_query: "Monitor Gamer 27",
    reason: "eligible_below_target",
    ...overrides,
  };
}

const mockPipeline = async () => ({
  ok: true,
  shadowOffer: {
    title: "Monitor Gamer 27",
    price: 900,
    url: "https://loja.example.com/monitor",
    source: "google_shopping",
  },
  offerCount: 1,
});

function createMockSupabase(alert, hooks = {}) {
  const analyticsInserts = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => ({
      data: [alert],
      error: null,
    }),
    update: () => ({
      eq: async () => ({ error: null }),
    }),
  };

  return {
    supabase: {
      from(table) {
        if (table === "analytics_events") {
          return {
            insert: async (payload) => {
              analyticsInserts.push(payload);
              if (hooks.analyticsError) {
                return { error: hooks.analyticsError };
              }
              if (hooks.onAnalyticsInsert) hooks.onAnalyticsInsert(payload);
              return { error: null };
            },
          };
        }
        return chain;
      },
    },
    getAnalyticsInserts: () => analyticsInserts,
  };
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("helper cria payload seguro com campos principais", () => {
  const payload = buildPriceAlertEmailAnalyticsPayload({
    eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.ATTEMPTED,
    alert: baseAlert(),
    evaluation: baseEvaluation(),
    context: { reason: "eligible_below_target", sendMode: true },
  });

  assert(payload.event_name === "price_drop_email_attempted", "event name");
  assert(payload.user_id === "11111111-2222-4333-8444-555555555555", "user id");
  assert(payload.category === "price_alert_email", "category");
  assert(payload.product_name === "Monitor Gamer 27 165Hz", "product");
  assert(payload.offer_store === "google_shopping", "store");
  assert(payload.offer_price === 900, "price");
  assert(payload.offer_url === "https://loja.example.com/monitor", "url");
  assert(payload.metadata.alert_id === "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "alert id");
  assert(payload.metadata.target_price === 1000, "target");
  assert(payload.metadata.best_found_price === 900, "best price");
  assert(payload.metadata.dry_run === false, "not dry run");
  assert(payload.metadata.send_mode === true, "send mode");
});

test("event names oficiais estão definidos", () => {
  assert(
    PRICE_DROP_EMAIL_ANALYTICS_EVENTS.ATTEMPTED === "price_drop_email_attempted",
    "attempted"
  );
  assert(PRICE_DROP_EMAIL_ANALYTICS_EVENTS.SENT === "price_drop_email_sent", "sent");
  assert(PRICE_DROP_EMAIL_ANALYTICS_EVENTS.FAILED === "price_drop_email_failed", "failed");
  assert(
    PRICE_DROP_EMAIL_ANALYTICS_EVENTS.SKIPPED === "price_drop_email_skipped",
    "skipped"
  );
});

test("payload não inclui user_email nem secrets", () => {
  const payload = buildPriceAlertEmailAnalyticsPayload({
    eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.SKIPPED,
    alert: baseAlert({ user_email: "secreto@example.com", api_key: "abc" }),
    evaluation: baseEvaluation(),
    context: {
      reason: "recent_email_sent",
      blockedBy: "recent_email_sent",
      resend_api_key: "re_secret",
    },
  });

  const serialized = JSON.stringify(payload);
  assert(!serialized.includes("secreto@example.com"), "no email");
  assert(!serialized.includes("re_secret"), "no resend key");
  assert(payload.metadata.blocked_by === "recent_email_sent", "blocked by");
});

test("analytics não roda em dry run", async () => {
  const { supabase, getAnalyticsInserts } = createMockSupabase(baseAlert());

  await runPriceAlertsDryRun({
    supabase,
    update: false,
    fetchPipeline: mockPipeline,
  });

  assert(getAnalyticsInserts().length === 0, "no analytics in dry run");
});

test("skipped dispara em bloqueio anti-spam", async () => {
  const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { supabase, getAnalyticsInserts } = createMockSupabase(
    baseAlert({ last_alert_sent_at: recent })
  );

  await runPriceAlertsSend({
    supabase,
    fetchPipeline: mockPipeline,
    sendEmail: async () => ({ ok: true, id: "should-not-send" }),
    analytics: true,
  });

  const events = getAnalyticsInserts();
  assert(events.length === 1, "one event");
  assert(events[0].event_name === "price_drop_email_skipped", "skipped");
  assert(events[0].metadata.blocked_by === "recent_email_sent", "reason");
});

test("attempted dispara antes de envio real", async () => {
  const order = [];
  const { supabase, getAnalyticsInserts } = createMockSupabase(baseAlert());

  await runPriceAlertsSend({
    supabase,
    fetchPipeline: mockPipeline,
    sendEmail: async () => {
      order.push("send");
      return { ok: true, id: "resend-1" };
    },
    trackAnalytics: async (_supabase, input) => {
      if (input.eventName === PRICE_DROP_EMAIL_ANALYTICS_EVENTS.ATTEMPTED) {
        order.push("attempted");
      }
      return { ok: true };
    },
  });

  assert(order[0] === "attempted", "attempted first");
  assert(order[1] === "send", "send second");
  assert(
    getAnalyticsInserts().some((e) => e.event_name === "price_drop_email_sent") === false,
    "mock track skips default inserts"
  );
});

test("sent dispara em sucesso de envio", async () => {
  const { supabase, getAnalyticsInserts } = createMockSupabase(baseAlert());

  await runPriceAlertsSend({
    supabase,
    fetchPipeline: mockPipeline,
    sendEmail: async () => ({ ok: true, id: "resend-ok-123" }),
  });

  const events = getAnalyticsInserts();
  const sent = events.find((e) => e.event_name === "price_drop_email_sent");
  assert(sent, "sent event");
  assert(sent.metadata.resend_result_id === "resend-ok-123", "resend id");
});

test("failed dispara em falha real de envio", async () => {
  const { supabase, getAnalyticsInserts } = createMockSupabase(baseAlert());

  await runPriceAlertsSend({
    supabase,
    fetchPipeline: mockPipeline,
    sendEmail: async () => ({ ok: false, code: "resend_error" }),
  });

  const events = getAnalyticsInserts();
  const attempted = events.find((e) => e.event_name === "price_drop_email_attempted");
  const failed = events.find((e) => e.event_name === "price_drop_email_failed");
  assert(attempted, "attempted");
  assert(failed, "failed");
  assert(failed.metadata.error_code === "resend_error", "error code");
});

test("falha de analytics não quebra fluxo principal", async () => {
  const { supabase } = createMockSupabase(baseAlert(), {
    analyticsError: { message: "db down", code: "500" },
  });

  const report = await runPriceAlertsSend({
    supabase,
    fetchPipeline: mockPipeline,
    sendEmail: async () => ({ ok: true, id: "resend-1" }),
  });

  assert(report.summary.sent_count === 1, "send still succeeds");
  assert(report.results[0].email_sent === true, "email sent flag");
});

test("emitPriceAlertEmailAnalytics não lança exception", async () => {
  const result = await emitPriceAlertEmailAnalytics(null, {
    eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.FAILED,
    alert: baseAlert(),
    evaluation: baseEvaluation(),
  });
  assert(result.ok === false, "controlled failure");
});

test("trackPriceAlertEmailAnalyticsEvent retorna erro controlado", async () => {
  const supabase = {
    from() {
      return {
        insert: async () => ({ error: { message: "insert failed", code: "23505" } }),
      };
    },
  };
  const result = await trackPriceAlertEmailAnalyticsEvent(supabase, {
    eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.SKIPPED,
    alert: baseAlert(),
    evaluation: baseEvaluation(),
    context: { reason: "price_above_target", blockedBy: "price_above_target" },
  });
  assert(result.ok === false && result.code === "analytics_insert_failed", "insert failed");
});

test("analytics desligado com analytics=false", async () => {
  const { supabase, getAnalyticsInserts } = createMockSupabase(baseAlert());

  await runPriceAlertsSend({
    supabase,
    fetchPipeline: mockPipeline,
    sendEmail: async () => ({ ok: true, id: "x" }),
    analytics: false,
  });

  assert(getAnalyticsInserts().length === 0, "no events");
});

test("não cria tabela nova", () => {
  const source = readFileSync(join(ROOT, "lib/miaPriceAlertEmailAnalytics.js"), "utf8");
  assert(source.includes('from("analytics_events")'), "uses existing table");
  assert(!source.toLowerCase().includes("create table"), "no create table");
});

test("não altera frontend", () => {
  const sendGate = readFileSync(join(ROOT, "lib/miaPriceAlertSendGate.js"), "utf8");
  assert(!sendGate.includes("components/"), "no frontend");
  assert(!sendGate.includes("MIAChat"), "no chat");
});

test("não cria cron", () => {
  const source = readFileSync(join(ROOT, "lib/miaPriceAlertEmailAnalytics.js"), "utf8");
  assert(!source.toLowerCase().includes("cron"), "no cron");
});

test("não chama Resend em testes unitários do helper", () => {
  const analytics = readFileSync(join(ROOT, "lib/miaPriceAlertEmailAnalytics.js"), "utf8");
  assert(!analytics.includes('from "resend"'), "no resend import");
  assert(!analytics.includes("sendPriceDropEmail"), "no email send");
});

test("lib/email.js não foi alterado", () => {
  const email = readFileSync(join(ROOT, "lib/email.js"), "utf8");
  assert(email.includes("miaPriceDropEmailTemplate"), "email intact");
  assert(!email.includes("miaPriceAlertEmailAnalytics"), "no analytics in email");
});

test("não usa LLM", () => {
  const source = readFileSync(join(ROOT, "lib/miaPriceAlertEmailAnalytics.js"), "utf8");
  assert(!source.includes("openai"), "no openai");
  assert(!source.includes("claude"), "no claude");
});

test("sem hardcode de produto", () => {
  const source = readFileSync(join(ROOT, "lib/miaPriceAlertEmailAnalytics.js"), "utf8");
  assert(!/if\s*\([^)]*includes\s*\(\s*["']iphone/i.test(source), "no iphone");
  assert(!/if\s*\([^)]*includes\s*\(\s*["']lenovo/i.test(source), "no lenovo");
});

test("dry run lib não importa analytics", () => {
  const source = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  assert(!source.includes("miaPriceAlertEmailAnalytics"), "dry run isolated");
});

console.log(
  `\nPATCH 5 — Price Drop Email Analytics Audit (${MIA_PRICE_ALERT_EMAIL_ANALYTICS_VERSION})\n`
);

let pass = 0;
let fail = 0;

for (const spec of CASES) {
  try {
    const maybePromise = spec.fn();
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
    }
    pass += 1;
    console.log(`✓ ${spec.name}`);
  } catch (err) {
    fail += 1;
    console.log(`✗ ${spec.name} → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) PRICE DROP EMAIL ANALYTICS ROBUST"
    : "B) PRICE DROP EMAIL ANALYTICS GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
