/**
 * PATCH 9 — Price Alert Delivery Logs Audit
 *
 * Usage:
 *   node scripts/test-mia-price-alert-delivery-logs-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MIA_PRICE_ALERT_DELIVERY_LOGS_VERSION,
  PRICE_ALERT_DELIVERY_EVENTS,
  buildPriceAlertDeliveryLogRow,
  emitPriceAlertDeliveryLog,
  recordPriceAlertDeliveryLog,
  resolveDryRunDeliveryEventType,
} from "../lib/miaPriceAlertDeliveryLogs.js";
import { runPriceAlertsDryRun } from "../lib/miaPriceAlertDryRun.js";
import { runPriceAlertsSend } from "../lib/miaPriceAlertSendGate.js";
import { runPriceAlertsDailyCron } from "../lib/miaPriceAlertCron.js";
import { runControlledE2eMode } from "../lib/miaPriceAlertE2EValidation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("SQL usa create table if not exists", () => {
  const sql = readFileSync(join(ROOT, "docs/alerts/price-alert-delivery-logs.sql"), "utf8");
  assert(sql.toLowerCase().includes("create table if not exists"), "create table");
  assert(sql.includes("price_alert_delivery_logs"), "table name");
});

test("SQL não usa drop table", () => {
  const sql = readFileSync(join(ROOT, "docs/alerts/price-alert-delivery-logs.sql"), "utf8");
  assert(!/drop\s+table/i.test(sql), "no drop");
});

test("SQL não usa delete", () => {
  const sql = readFileSync(join(ROOT, "docs/alerts/price-alert-delivery-logs.sql"), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert(!/\bdelete\b/i.test(statements), "no delete");
});

test("helper não propaga exception", async () => {
  const result = await emitPriceAlertDeliveryLog(null, {
    eventType: PRICE_ALERT_DELIVERY_EVENTS.DRY_RUN_STARTED,
  });
  assert(result.ok === false, "controlled failure");
});

test("helper não loga secrets", () => {
  const row = buildPriceAlertDeliveryLogRow({
    eventType: PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_EMAIL_SENT,
    metadata: {
      resend_api_key: "re_secret",
      mia_admin_api_key: "admin_secret",
      cron_secret: "cron_secret",
      user_email: "secreto@example.com",
    },
    maskedEmail: "secreto@example.com",
  });
  const serialized = JSON.stringify(row);
  assert(!serialized.includes("re_secret"), "no resend key");
  assert(!serialized.includes("admin_secret"), "no admin key");
  assert(!serialized.includes("cron_secret"), "no cron secret");
  assert(!serialized.includes("secreto@example.com"), "no raw email");
  assert(row.metadata.masked_email === "se***@example.com", "masked email");
});

test("helper aceita metadata segura", () => {
  const row = buildPriceAlertDeliveryLogRow({
    eventType: PRICE_ALERT_DELIVERY_EVENTS.DRY_RUN_ALERT_CHECKED,
    alertId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    targetPrice: 1000,
    foundPrice: 900,
    metadata: { eligible_for_email: true },
  });
  assert(row.event_type === "dry_run_alert_checked", "event");
  assert(row.target_price === 1000, "target");
  assert(row.found_price === 900, "found");
});

test("resolveDryRunDeliveryEventType mapeia provider e oferta", () => {
  assert(
    resolveDryRunDeliveryEventType({ reason: "provider_error" }) ===
      PRICE_ALERT_DELIVERY_EVENTS.DRY_RUN_PROVIDER_ERROR,
    "provider"
  );
  assert(
    resolveDryRunDeliveryEventType({ reason: "no_trusted_offer_found" }) ===
      PRICE_ALERT_DELIVERY_EVENTS.DRY_RUN_OFFER_NOT_FOUND,
    "offer"
  );
});

test("dry run mantém comportamento se log falhar", async () => {
  const report = await runPriceAlertsDryRun({
    supabase: {
      from(table) {
        if (table === "price_alert_delivery_logs") {
          return { insert: async () => ({ error: { message: "db down" } }) };
        }
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: async () => ({
            data: [
              {
                id: "a1",
                user_id: "u1",
                product_name: "Monitor",
                target_price: 1000,
                is_active: true,
              },
            ],
            error: null,
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
        return chain;
      },
    },
    fetchPipeline: async () => ({
      shadowOffer: {
        title: "Monitor",
        price: 900,
        url: "https://loja.example.com/m",
        source: "google",
      },
      offerCount: 1,
    }),
  });
  assert(report.ok === true && report.dry_run === true, "dry run ok");
});

test("send gate mantém comportamento se log falhar", async () => {
  withEnvSendEnabled(async () => {
    const report = await runPriceAlertsSend({
      supabase: createMockSupabaseWithFailingLogs(),
      fetchPipeline: mockPipeline,
      sendEmail: async () => ({ ok: true, id: "re_1" }),
    });
    assert(report.summary.sent_count === 1, "sent despite log fail");
  });
});

test("cron mantém comportamento se log falhar", async () => {
  withEnvSendEnabled(async () => {
    const report = await runPriceAlertsDailyCron({
      supabase: createMockSupabaseWithFailingLogs(),
      fetchPipeline: mockPipeline,
      sendEmail: async () => ({ ok: true, id: "re_1" }),
    });
    assert(report.cron === true, "cron ok");
  });
});

test("e2e mantém comportamento se log falhar", async () => {
  withEnvSendEnabled(async () => {
    const report = await runControlledE2eMode({
      source: {
        send: "true",
        confirm_send: "true",
        allow_controlled_send: "true",
      },
      supabase: {
        from(table) {
          if (table === "price_alert_delivery_logs" || table === "analytics_events") {
            return { insert: async () => ({ error: { message: "db down" } }) };
          }
          return { insert: async () => ({ error: null }) };
        },
      },
      sendEmail: async () => ({ ok: true, id: "re_e2e" }),
    });
    assert(report.ok === true && report.email_sent === true, "e2e ok");
  });
});

test("analytics continua separado", () => {
  const delivery = readFileSync(join(ROOT, "lib/miaPriceAlertDeliveryLogs.js"), "utf8");
  const analytics = readFileSync(join(ROOT, "lib/miaPriceAlertEmailAnalytics.js"), "utf8");
  assert(!delivery.includes("analytics_events"), "delivery no analytics table");
  assert(analytics.includes("analytics_events"), "analytics preserved");
  assert(!analytics.includes("price_alert_delivery_logs"), "analytics no delivery table");
});

test("não altera frontend", () => {
  const libs = [
    "lib/miaPriceAlertDeliveryLogs.js",
    "lib/miaPriceAlertDryRun.js",
    "lib/miaPriceAlertSendGate.js",
  ];
  for (const file of libs) {
    assert(!readFileSync(join(ROOT, file), "utf8").includes("components/"), file);
  }
});

test("não cria cron novo", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const cronCount = vercel.crons.filter((c) =>
    c.path.includes("price-alerts-daily-check")
  ).length;
  assert(cronCount === 1, "single daily cron");
});

test("não altera cron schedule", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const cron = vercel.crons.find((c) => c.path === "/api/cron/price-alerts-daily-check");
  assert(cron.schedule === "0 12 * * *", "schedule unchanged");
});

test("não altera template", () => {
  const email = readFileSync(join(ROOT, "lib/email.js"), "utf8");
  assert(!email.includes("miaPriceAlertDeliveryLogs"), "email intact");
});

test("não altera anti-spam", () => {
  const sendGate = readFileSync(join(ROOT, "lib/miaPriceAlertSendGate.js"), "utf8");
  assert(sendGate.includes("evaluateAntiSpamRules"), "anti-spam kept");
  assert(!sendGate.includes("MIA_PRICE_ALERT_MAX_EMAIL_SEND_COUNT = 999"), "limit unchanged");
});

test("não usa LLM", () => {
  const lib = readFileSync(join(ROOT, "lib/miaPriceAlertDeliveryLogs.js"), "utf8");
  assert(!lib.includes("openai"), "no openai");
});

test("não hardcoda produto real", () => {
  const lib = readFileSync(join(ROOT, "lib/miaPriceAlertDeliveryLogs.js"), "utf8");
  assert(!/if\s*\([^)]*includes\s*\(\s*["']iphone/i.test(lib), "no iphone");
});

test("recordPriceAlertDeliveryLog retorna erro controlado", async () => {
  const result = await recordPriceAlertDeliveryLog(
    {
      from() {
        return {
          insert: async () => ({ error: { message: "fail", code: "500" } }),
        };
      },
    },
    { eventType: PRICE_ALERT_DELIVERY_EVENTS.CRON_STARTED }
  );
  assert(result.ok === false, "insert failed controlled");
});

test("integrações existem nos módulos principais", () => {
  assert(
    readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8").includes(
      "emitPriceAlertDeliveryLog"
    ),
    "dry run"
  );
  assert(
    readFileSync(join(ROOT, "lib/miaPriceAlertSendGate.js"), "utf8").includes(
      "emitPriceAlertDeliveryLog"
    ),
    "send gate"
  );
  assert(
    readFileSync(join(ROOT, "lib/miaPriceAlertCron.js"), "utf8").includes(
      "emitPriceAlertDeliveryLog"
    ),
    "cron"
  );
});

function withEnvSendEnabled(fn) {
  const snapshot = {
    MIA_PRICE_DROP_EMAIL_SEND_ENABLED: process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
  process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED = "true";
  process.env.RESEND_API_KEY = "re_test";
  try {
    return fn();
  } finally {
    if (snapshot.MIA_PRICE_DROP_EMAIL_SEND_ENABLED == null) {
      delete process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED;
    } else {
      process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED = snapshot.MIA_PRICE_DROP_EMAIL_SEND_ENABLED;
    }
    if (snapshot.RESEND_API_KEY == null) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = snapshot.RESEND_API_KEY;
    }
  }
}

const mockPipeline = async () => ({
  shadowOffer: {
    title: "Monitor Gamer 27",
    price: 900,
    url: "https://loja.example.com/monitor",
    source: "google_shopping",
  },
  offerCount: 1,
});

function createMockSupabaseWithFailingLogs() {
  return {
    from(table) {
      if (table === "price_alert_delivery_logs" || table === "analytics_events") {
        return { insert: async () => ({ error: { message: "db down", code: "500" } }) };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({
          data: [
            {
              id: "alert-1",
              user_id: "user-1",
              user_email: "usuario@example.com",
              product_name: "Monitor Gamer 27",
              target_price: 1000,
              is_active: true,
              email_send_count: 0,
            },
          ],
          error: null,
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      return chain;
    },
  };
}

console.log(
  `\nPATCH 9 — Price Alert Delivery Logs Audit (${MIA_PRICE_ALERT_DELIVERY_LOGS_VERSION})\n`
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
  fail === 0 ? "A) PRICE ALERT DELIVERY LOGS ROBUST" : "B) PRICE ALERT DELIVERY LOGS GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
