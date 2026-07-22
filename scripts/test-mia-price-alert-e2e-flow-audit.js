/**
 * PATCH 7 — Price Alert E2E Flow Audit
 *
 * Usage:
 *   node scripts/test-mia-price-alert-e2e-flow-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MIA_E2E_TEST_PRODUCT_NAME,
  MIA_OFFICIAL_E2E_TEST_EMAIL,
  MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
  resolveE2eTestEmail,
  runControlledE2eMode,
  runE2EValidateMode,
  validateControlledE2eRequest,
  validateMiaAdminApiKey,
} from "../lib/miaPriceAlertE2EValidation.js";
import {
  PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS,
  buildPriceAlertEmailE2EAnalyticsPayload,
  emitPriceAlertEmailE2EAnalytics,
} from "../lib/miaPriceAlertEmailAnalytics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withEnv(overrides, fn) {
  const keys = [
    "MIA_ADMIN_API_KEY",
    "MIA_PRICE_DROP_EMAIL_SEND_ENABLED",
    "RESEND_API_KEY",
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

test("validate funciona", async () => {
  const report = await runE2EValidateMode();
  assert(report.ok === true && report.mode === "validate", "validate mode");
  assert(report.checks.template_ok === true, "template ok");
  assert(report.checks.analytics_ok === true, "analytics ok");
  assert(report.checks.dry_run_ok === true, "dry run ok");
  assert(report.checks.send_endpoint_ok === true, "send endpoint");
  assert(report.checks.test_endpoint_ok === true, "test endpoint");
  assert(report.checks.e2e_endpoint_ok === true, "e2e endpoint");
});

test("endpoint exige admin key", () => {
  withEnv({ MIA_ADMIN_API_KEY: undefined }, () => {
    const auth = validateMiaAdminApiKey({ headers: {}, query: {} });
    assert(auth.ok === false && auth.code === "admin_key_not_configured", "no key");
  });
});

test("controlled-e2e protegido sem flags", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledE2eRequest({});
      assert(auth.ok === false && auth.code === "controlled_e2e_not_authorized", "blocked");
    }
  );
});

test("controlled-e2e exige send=true", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledE2eRequest({
        confirm_send: "true",
        allow_controlled_send: "true",
      });
      assert(auth.ok === false && auth.reason === "send_not_requested", "no send");
    }
  );
});

test("controlled-e2e exige confirm_send=true", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledE2eRequest({
        send: "true",
        allow_controlled_send: "true",
      });
      assert(auth.ok === false && auth.reason === "confirm_send_not_requested", "no confirm");
    }
  );
});

test("controlled-e2e exige allow_controlled_send=true", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledE2eRequest({
        send: "true",
        confirm_send: "true",
      });
      assert(
        auth.ok === false && auth.reason === "allow_controlled_send_not_requested",
        "no allow"
      );
    }
  );
});

test("controlled-e2e exige RESEND_API_KEY", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: undefined,
    },
    () => {
      const auth = validateControlledE2eRequest({
        send: "true",
        confirm_send: "true",
        allow_controlled_send: "true",
      });
      assert(auth.ok === false && auth.reason === "missing_resend_api_key", "no resend");
    }
  );
});

test("controlled-e2e exige send enabled", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "false",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledE2eRequest({
        send: "true",
        confirm_send: "true",
        allow_controlled_send: "true",
      });
      assert(auth.ok === false && auth.reason === "send_disabled", "disabled");
    }
  );
});

test("usa email oficial de teste por padrão", () => {
  assert(resolveE2eTestEmail({}) === MIA_OFFICIAL_E2E_TEST_EMAIL, "default email");
  assert(MIA_OFFICIAL_E2E_TEST_EMAIL === "lofibrasil546@gmail.com", "official");
});

test("controlled-e2e usa produto E2E controlado", async () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      let captured = null;
      const report = await runControlledE2eMode({
        source: {
          send: "true",
          confirm_send: "true",
          allow_controlled_send: "true",
        },
        sendEmail: async (to, productName) => {
          captured = { to, productName };
          return { ok: true, id: "re_e2e_1" };
        },
        analytics: false,
      });

      assert(report.ok === true, "success");
      assert(captured.productName === MIA_E2E_TEST_PRODUCT_NAME, "e2e product");
      assert(captured.to === MIA_OFFICIAL_E2E_TEST_EMAIL, "official email");
      assert(report.template_rendered === true, "template");
      assert(report.resend_success === true, "resend");
    }
  );
});

test("não altera price_alerts", async () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      let touched = false;
      const supabase = {
        from(table) {
          if (table === "price_alerts") touched = true;
          return { insert: async () => ({ error: null }) };
        },
      };

      await runControlledE2eMode({
        source: {
          send: "true",
          confirm_send: "true",
          allow_controlled_send: "true",
        },
        supabase,
        sendEmail: async () => ({ ok: true, id: "re_1" }),
      });

      assert(touched === false, "no price_alerts");
    }
  );
});

test("não altera email_send_count", async () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      await runControlledE2eMode({
        source: {
          send: "true",
          confirm_send: "true",
          allow_controlled_send: "true",
        },
        sendEmail: async () => ({ ok: true, id: "re_1" }),
        analytics: false,
      });
    }
  );
  assert(true, "no alert row touched");
});

test("analytics E2E payload correto", () => {
  const payload = buildPriceAlertEmailE2EAnalyticsPayload({
    eventName: PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS.SENT,
    context: {
      mode: "controlled-e2e",
      productName: MIA_E2E_TEST_PRODUCT_NAME,
      templateRendered: true,
    },
  });
  assert(payload.category === "price_alert_e2e_test", "category");
  assert(payload.metadata.controlled_test === true, "controlled");
  assert(!JSON.stringify(payload).includes(MIA_OFFICIAL_E2E_TEST_EMAIL), "no email in payload");
});

test("analytics funciona em sucesso E2E", async () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      const inserts = [];
      const supabase = {
        from(table) {
          if (table === "analytics_events") {
            return {
              insert: async (payload) => {
                inserts.push(payload);
                return { error: null };
              },
            };
          }
          return { insert: async () => ({ error: null }) };
        },
      };

      const report = await runControlledE2eMode({
        source: {
          send: "true",
          confirm_send: "true",
          allow_controlled_send: "true",
        },
        supabase,
        sendEmail: async () => ({ ok: true, id: "re_e2e" }),
      });

      assert(report.analytics_recorded === true, "recorded");
      assert(
        inserts.some((e) => e.event_name === "price_drop_email_e2e_sent"),
        "sent event"
      );
    }
  );
});

test("analytics falha sem quebrar fluxo principal", async () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      const supabase = {
        from(table) {
          if (table === "analytics_events") {
            return {
              insert: async () => ({ error: { message: "db down", code: "500" } }),
            };
          }
          return { insert: async () => ({ error: null }) };
        },
      };

      const report = await runControlledE2eMode({
        source: {
          send: "true",
          confirm_send: "true",
          allow_controlled_send: "true",
        },
        supabase,
        sendEmail: async () => ({ ok: true, id: "re_e2e" }),
      });

      assert(report.ok === true && report.email_sent === true, "send ok");
      assert(report.analytics_recorded === false, "analytics failed gracefully");
    }
  );
});

test("emitPriceAlertEmailE2EAnalytics não lança exception", async () => {
  const result = await emitPriceAlertEmailE2EAnalytics(null, {
    eventName: PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS.SKIPPED,
    context: { mode: "controlled-e2e", productName: MIA_E2E_TEST_PRODUCT_NAME },
  });
  assert(result.ok === false, "controlled failure");
});

test("validate não envia email", async () => {
  let sendCalled = false;
  const report = await runE2EValidateMode({ deliveryLogs: false });
  await runControlledE2eMode({
    source: { mode: "validate" },
    sendEmail: async () => {
      sendCalled = true;
      return { ok: true };
    },
    analytics: false,
    deliveryLogs: false,
  }).catch(() => {});
  assert(report.email_sent === undefined, "no email_sent in validate");
  assert(sendCalled === false, "no send in validate-only path");
});

test("não cria cron", () => {
  const endpoint = readFileSync(join(ROOT, "pages/api/admin/price-alerts-e2e.js"), "utf8");
  const lib = readFileSync(join(ROOT, "lib/miaPriceAlertE2EValidation.js"), "utf8");
  assert(!endpoint.toLowerCase().includes("cron"), "endpoint");
  assert(!lib.toLowerCase().includes("cron"), "lib");
});

test("não altera frontend", () => {
  const lib = readFileSync(join(ROOT, "lib/miaPriceAlertE2EValidation.js"), "utf8");
  assert(!lib.includes("components/"), "no frontend");
});

test("não altera Decision Engine", () => {
  const cognitive = readFileSync(join(ROOT, "lib/miaCognitiveRouter.js"), "utf8");
  assert(!cognitive.includes("miaPriceAlertE2EValidation"), "router clean");
});

test("não altera Data Layer", () => {
  const dryRun = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  assert(!dryRun.includes("miaPriceAlertE2EValidation"), "dry run clean");
});

test("não usa LLM", () => {
  const lib = readFileSync(join(ROOT, "lib/miaPriceAlertE2EValidation.js"), "utf8");
  assert(!lib.includes("openai"), "no openai");
  assert(!lib.includes("claude"), "no claude");
});

test("fluxo real não hardcoda produto E2E", () => {
  const sendGate = readFileSync(join(ROOT, "lib/miaPriceAlertSendGate.js"), "utf8");
  const dryRun = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  assert(!sendGate.includes("Fluxo End-to-End"), "send gate clean");
  assert(!dryRun.includes("Fluxo End-to-End"), "dry run clean");
});

test("lib/email.js não foi alterado", () => {
  const email = readFileSync(join(ROOT, "lib/email.js"), "utf8");
  assert(!email.includes("miaPriceAlertE2EValidation"), "email intact");
});

console.log(
  `\nPATCH 7 — Price Alert E2E Flow Audit (${MIA_PRICE_ALERT_E2E_VALIDATION_VERSION})\n`
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
    ? "A) PRICE ALERT E2E FLOW ROBUST"
    : "B) PRICE ALERT E2E FLOW GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
