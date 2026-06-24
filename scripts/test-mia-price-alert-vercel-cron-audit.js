/**
 * PATCH 8 — Price Alert Vercel Cron Audit
 *
 * Usage:
 *   node scripts/test-mia-price-alert-vercel-cron-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MIA_PRICE_ALERT_CRON_DEFAULT_LIMIT,
  MIA_PRICE_ALERT_CRON_MAX_LIMIT,
  MIA_PRICE_ALERT_CRON_PATH,
  MIA_PRICE_ALERT_CRON_SCHEDULE_UTC,
  MIA_PRICE_ALERT_CRON_VERSION,
  buildCronSendDisabledResponse,
  clampCronAlertLimit,
  parseCronDebugFlag,
  runPriceAlertsDailyCron,
  validateCronSecret,
} from "../lib/miaPriceAlertCron.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withEnv(overrides, fn) {
  const keys = [
    "MIA_CRON_SECRET",
    "MIA_PRICE_DROP_EMAIL_SEND_ENABLED",
    "RESEND_API_KEY",
    "MIA_PRICE_ALERT_CRON_LIMIT",
  ];
  const snapshot = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (snapshot[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = snapshot[key];
      }
    }
  }
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("endpoint exige MIA_CRON_SECRET configurada", () => {
  withEnv({ MIA_CRON_SECRET: undefined }, () => {
    const auth = validateCronSecret({ headers: {}, query: {} });
    assert(auth.ok === false && auth.code === "cron_secret_not_configured", "503");
  });
});

test("endpoint retorna 503 se secret ausente", () => {
  withEnv({ MIA_CRON_SECRET: undefined }, () => {
    const auth = validateCronSecret({
      headers: { authorization: "Bearer any" },
      query: {},
    });
    assert(auth.status === 503, "status 503");
  });
});

test("endpoint retorna 401 se secret errado", () => {
  withEnv({ MIA_CRON_SECRET: "cron-secret" }, () => {
    const auth = validateCronSecret({
      headers: { authorization: "Bearer wrong" },
      query: {},
    });
    assert(auth.ok === false && auth.code === "invalid_cron_secret" && auth.status === 401, "401");
  });
});

test("endpoint aceita Bearer token válido", () => {
  withEnv({ MIA_CRON_SECRET: "cron-secret" }, () => {
    const auth = validateCronSecret({
      headers: { authorization: "Bearer cron-secret" },
      query: {},
    });
    assert(auth.ok === true, "valid bearer");
  });
});

test("endpoint aceita cron_secret via query", () => {
  withEnv({ MIA_CRON_SECRET: "cron-secret" }, () => {
    const auth = validateCronSecret({
      headers: {},
      query: { cron_secret: "cron-secret" },
    });
    assert(auth.ok === true, "valid query");
  });
});

test("endpoint não cria envio sem MIA_PRICE_DROP_EMAIL_SEND_ENABLED=true", async () => {
  withEnv(
    {
      MIA_CRON_SECRET: "x",
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "false",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      const report = await runPriceAlertsDailyCron({
        supabase: { from: () => ({ select: () => ({}) }) },
      });
      assert(report.ok === false && report.code === "send_disabled", "disabled");
      assert(report.cron === true && report.source === "vercel_cron", "cron meta");
    }
  );
});

test("endpoint usa send gate do PATCH 4", () => {
  const cron = readFileSync(join(ROOT, "lib/miaPriceAlertCron.js"), "utf8");
  const endpoint = readFileSync(
    join(ROOT, "pages/api/cron/price-alerts-daily-check.js"),
    "utf8"
  );
  assert(cron.includes("runPriceAlertsSend"), "uses send gate");
  assert(endpoint.includes("runPriceAlertsDailyCron"), "uses cron runner");
  assert(!endpoint.includes("sendPriceDropEmail"), "no direct email");
});

test("endpoint não bypassa anti-spam", () => {
  const cron = readFileSync(join(ROOT, "lib/miaPriceAlertCron.js"), "utf8");
  assert(!cron.includes("evaluateAntiSpamRules"), "anti-spam stays in send gate");
  assert(cron.includes("runPriceAlertsSend"), "delegates to gate");
});

test("endpoint não chama Resend diretamente", () => {
  const endpoint = readFileSync(
    join(ROOT, "pages/api/cron/price-alerts-daily-check.js"),
    "utf8"
  );
  const cron = readFileSync(join(ROOT, "lib/miaPriceAlertCron.js"), "utf8");
  assert(!endpoint.includes('from "resend"'), "no resend import endpoint");
  assert(!cron.includes('from "resend"'), "no resend import cron");
});

test("endpoint limita alertas default 10", () => {
  withEnv({ MIA_PRICE_ALERT_CRON_LIMIT: undefined }, () => {
    assert(clampCronAlertLimit(undefined) === MIA_PRICE_ALERT_CRON_DEFAULT_LIMIT, "default 10");
  });
});

test("endpoint limita alertas máximo 25", () => {
  withEnv({ MIA_PRICE_ALERT_CRON_LIMIT: "999" }, () => {
    assert(clampCronAlertLimit(undefined) === MIA_PRICE_ALERT_CRON_MAX_LIMIT, "max 25");
  });
});

test("endpoint respeita MIA_PRICE_ALERT_CRON_LIMIT válido", () => {
  withEnv({ MIA_PRICE_ALERT_CRON_LIMIT: "15" }, () => {
    assert(clampCronAlertLimit(undefined) === 15, "env 15");
  });
});

test("vercel.json contém cron correto 0 12 * * *", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const cron = vercel.crons.find((c) => c.path === MIA_PRICE_ALERT_CRON_PATH);
  assert(cron, "cron exists");
  assert(cron.schedule === MIA_PRICE_ALERT_CRON_SCHEDULE_UTC, "schedule utc");
});

test("cron path correto", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert(
    vercel.crons.some((c) => c.path === "/api/cron/price-alerts-daily-check"),
    "path ok"
  );
});

test("vercel.json preserva cron legado check-prices", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert(
    vercel.crons.some((c) => c.path === "/api/check-prices"),
    "legacy cron preserved"
  );
});

test("não há secrets hardcoded", () => {
  const cron = readFileSync(join(ROOT, "lib/miaPriceAlertCron.js"), "utf8");
  const endpoint = readFileSync(
    join(ROOT, "pages/api/cron/price-alerts-daily-check.js"),
    "utf8"
  );
  assert(!/MIA_CRON_SECRET\s*=\s*["'][^"']+["']/.test(cron), "no secret in cron lib");
  assert(!/Bearer\s+[a-zA-Z0-9]{8,}/.test(endpoint), "no bearer hardcoded");
});

test("analytics existente continua preservado", async () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      let analyticsCalled = false;
      await runPriceAlertsDailyCron({
        supabase: {
          from(table) {
            if (table === "analytics_events") analyticsCalled = true;
            const chain = {
              select: () => chain,
              eq: () => chain,
              order: () => chain,
              limit: async () => ({ data: [], error: null }),
              update: () => ({ eq: async () => ({ error: null }) }),
              insert: async () => ({ error: null }),
            };
            return chain;
          },
        },
      });
      assert(analyticsCalled === false, "no alerts so no analytics");
    }
  );

  const sendGate = readFileSync(join(ROOT, "lib/miaPriceAlertSendGate.js"), "utf8");
  assert(sendGate.includes("emitPriceAlertEmailAnalytics"), "analytics in send gate");
});

test("buildCronSendDisabledResponse registra cron_send_disabled", async () => {
  const inserts = [];
  const mockClient = {
    from(table) {
      if (table === "price_alert_delivery_logs") {
        return {
          insert: async (row) => {
            inserts.push(row);
            return { error: null };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  };

  await buildCronSendDisabledResponse({
    deliveryLogClient: mockClient,
  });

  assert(inserts.length === 1, "one log");
  assert(inserts[0].event_type === "cron_send_disabled", "event");
  assert(inserts[0].source === "vercel_cron", "source");
  assert(inserts[0].mode === "cron", "mode");
  assert(inserts[0].severity === "warning", "severity");
  assert(inserts[0].reason === "send_disabled", "reason");
  assert(inserts[0].error_code === "send_disabled", "error code");
});

test("buildCronSendDisabledResponse expõe debug de delivery log", async () => {
  const response = await buildCronSendDisabledResponse({
    debug: true,
    deliveryLogClient: {
      from(table) {
        if (table === "price_alert_delivery_logs") {
          return {
            insert: async () => ({
              error: { code: "42501", message: "permission denied for table price_alert_delivery_logs" },
            }),
          };
        }
        return { insert: async () => ({ error: null }) };
      },
    },
  });

  assert(response.delivery_log_attempted === true, "attempted");
  assert(response.delivery_log_inserted === false, "not inserted");
  assert(response.delivery_log_error, "error text");
  assert(response.debug_delivery_log?.event_type === "cron_send_disabled", "debug event");
  assert(response.debug_delivery_log?.code === "delivery_logs_permission_denied", "debug code");
});

test("parseCronDebugFlag aceita query debug=true", () => {
  assert(parseCronDebugFlag("true") === true, "true");
  assert(parseCronDebugFlag("1") === true, "1");
  assert(parseCronDebugFlag(undefined) === false, "undefined");
});

test("buildCronSendDisabledResponse formato esperado", async () => {
  const response = await buildCronSendDisabledResponse();
  assert(response.ok === false && response.code === "send_disabled", "code");
  assert(response.cron === true && response.summary.sent_count === 0, "summary");
});

test("runPriceAlertsDailyCron inclui limit no relatório", async () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
      MIA_PRICE_ALERT_CRON_LIMIT: "12",
    },
    async () => {
      const report = await runPriceAlertsDailyCron({
        supabase: {
          from() {
            const chain = {
              select: () => chain,
              eq: () => chain,
              order: () => chain,
              limit: async () => ({ data: [], error: null }),
            };
            return chain;
          },
        },
      });
      assert(report.limit === 12, "limit in response");
      assert(report.cron === true, "cron flag");
    }
  );
});

test("não altera frontend", () => {
  const endpoint = readFileSync(
    join(ROOT, "pages/api/cron/price-alerts-daily-check.js"),
    "utf8"
  );
  assert(!endpoint.includes("components/"), "no frontend");
});

test("não altera Decision Engine", () => {
  const router = readFileSync(join(ROOT, "lib/miaCognitiveRouter.js"), "utf8");
  assert(!router.includes("miaPriceAlertCron"), "router clean");
});

test("não altera Data Layer", () => {
  const dryRun = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  assert(!dryRun.includes("miaPriceAlertCron"), "dry run clean");
});

test("não cria provider novo", () => {
  const cron = readFileSync(join(ROOT, "lib/miaPriceAlertCron.js"), "utf8");
  assert(!cron.includes("fetchGoogle"), "no new provider");
  assert(!cron.includes("fetchApify"), "no apify");
});

test("não usa LLM", () => {
  const cron = readFileSync(join(ROOT, "lib/miaPriceAlertCron.js"), "utf8");
  assert(!cron.includes("openai"), "no openai");
  assert(!cron.includes("claude"), "no claude");
});

test("dry run endpoint não foi alterado", () => {
  const dryRun = readFileSync(join(ROOT, "pages/api/admin/price-alerts-dry-run.js"), "utf8");
  assert(!dryRun.includes("miaPriceAlertCron"), "dry run isolated");
});

console.log(`\nPATCH 8 — Price Alert Vercel Cron Audit (${MIA_PRICE_ALERT_CRON_VERSION})\n`);

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
  fail === 0 ? "A) PRICE ALERT VERCEL CRON ROBUST" : "B) PRICE ALERT VERCEL CRON GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
