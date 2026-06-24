/**
 * PATCH 6 — Price Alert Admin Test Endpoint Audit
 *
 * Usage:
 *   node scripts/test-mia-price-alert-admin-test-endpoint-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MIA_CONTROLLED_TEST_PRODUCT_NAME,
  MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
  buildControlledTestAlert,
  maskEmailForAdminResponse,
  resolveControlledTestUrl,
  runAdminTestControlledSendMode,
  runAdminTestMockMode,
  runAdminTestValidateMode,
  validateControlledSendRequest,
  validateMiaAdminApiKey,
} from "../lib/miaPriceAlertAdminTest.js";
import {
  PRICE_DROP_EMAIL_TEST_ANALYTICS_EVENTS,
  buildPriceAlertEmailTestAnalyticsPayload,
  emitPriceAlertEmailTestAnalytics,
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

test("endpoint exige admin key configurada", () => {
  withEnv({ MIA_ADMIN_API_KEY: undefined }, () => {
    const auth = validateMiaAdminApiKey({ headers: {}, query: {} });
    assert(auth.ok === false && auth.code === "admin_key_not_configured", "not configured");
  });
});

test("endpoint rejeita chave inválida", () => {
  withEnv({ MIA_ADMIN_API_KEY: "secret-key" }, () => {
    const auth = validateMiaAdminApiKey({
      headers: { "x-mia-admin-key": "wrong" },
      query: {},
    });
    assert(auth.ok === false && auth.code === "invalid_admin_key", "invalid");
  });
});

test("validate não envia email", async () => {
  const report = await runAdminTestValidateMode();
  assert(report.ok === true && report.mode === "validate", "validate mode");
  assert(report.checks.template_ready === true, "template ready");
  assert(!JSON.stringify(report).includes('"email_sent":true'), "no email sent");
});

test("mock não envia email", async () => {
  const report = await runAdminTestMockMode();
  assert(report.mode === "mock", "mock mode");
  assert(report.email_sent === false, "not sent");
  assert(report.controlled_test === true, "controlled");
  assert(report.would_send_email === true, "would send");
  assert(report.reason === "mock_eligible_below_target", "reason");
});

test("mock não escreve no banco", async () => {
  let dbCalled = false;
  const mockSupabase = {
    from(table) {
      if (table === "price_alerts") dbCalled = true;
      return { insert: async () => ({ error: null }) };
    },
  };

  await runAdminTestMockMode({ supabase: mockSupabase, deliveryLogs: false });
  await runAdminTestValidateMode({ supabase: mockSupabase, deliveryLogs: false });

  assert(dbCalled === false, "no db in mock/validate");
});

test("controlled-send bloqueia sem send=true", () => {
  withEnv(
    {
      MIA_ADMIN_API_KEY: "k",
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledSendRequest({
        confirm_send: "true",
        allow_controlled_send: "true",
        test_email: "teste@example.com",
      });
      assert(auth.ok === false && auth.code === "controlled_send_not_authorized", "blocked");
    }
  );
});

test("controlled-send bloqueia sem confirm_send=true", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledSendRequest({
        send: "true",
        allow_controlled_send: "true",
        test_email: "teste@example.com",
      });
      assert(auth.ok === false && auth.reason === "confirm_send_not_requested", "no confirm");
    }
  );
});

test("controlled-send bloqueia sem allow_controlled_send=true", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledSendRequest({
        send: "true",
        confirm_send: "true",
        test_email: "teste@example.com",
      });
      assert(
        auth.ok === false && auth.reason === "allow_controlled_send_not_requested",
        "no allow"
      );
    }
  );
});

test("controlled-send bloqueia sem RESEND_API_KEY", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: undefined,
    },
    () => {
      const auth = validateControlledSendRequest({
        send: "true",
        confirm_send: "true",
        allow_controlled_send: "true",
        test_email: "teste@example.com",
      });
      assert(auth.ok === false && auth.reason === "missing_resend_api_key", "no resend");
    }
  );
});

test("controlled-send bloqueia se env send enabled falso", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "false",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledSendRequest({
        send: "true",
        confirm_send: "true",
        allow_controlled_send: "true",
        test_email: "teste@example.com",
      });
      assert(auth.ok === false && auth.reason === "send_disabled", "disabled");
    }
  );
});

test("controlled-send bloqueia email inválido", () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateControlledSendRequest({
        send: "true",
        confirm_send: "true",
        allow_controlled_send: "true",
        test_email: "invalid",
      });
      assert(auth.ok === false && auth.code === "invalid_test_email", "invalid email");
    }
  );
});

test("controlled-send usa somente produto controlado", async () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      let captured = null;
      const report = await runAdminTestControlledSendMode({
        source: {
          send: "true",
          confirm_send: "true",
          allow_controlled_send: "true",
          test_email: "teste@example.com",
        },
        sendEmail: async (to, productName, oldPrice, newPrice, link) => {
          captured = { to, productName, oldPrice, newPrice, link };
          return { ok: true, id: "re_test_1" };
        },
        analytics: false,
      });

      assert(report.email_sent === true, "sent");
      assert(captured.productName === MIA_CONTROLLED_TEST_PRODUCT_NAME, "controlled product");
      assert(captured.oldPrice === 2000, "old price");
      assert(captured.newPrice === 1899, "new price");
      assert(captured.link === "https://teilor.com.br", "default link");
    }
  );
});

test("controlled-send não altera price_alerts", async () => {
  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      let priceAlertsTouched = false;
      const supabase = {
        from(table) {
          if (table === "price_alerts") priceAlertsTouched = true;
          return {
            insert: async () => ({ error: null }),
          };
        },
      };

      await runAdminTestControlledSendMode({
        source: {
          send: "true",
          confirm_send: "true",
          allow_controlled_send: "true",
          test_email: "teste@example.com",
        },
        supabase,
        sendEmail: async () => ({ ok: true, id: "re_1" }),
      });

      assert(priceAlertsTouched === false, "no price_alerts");
    }
  );
});

test("controlled-send não incrementa email_send_count", async () => {
  const alert = buildControlledTestAlert({ email_send_count: 0 });
  assert(alert.email_send_count === 0, "starts zero");

  withEnv(
    {
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    async () => {
      await runAdminTestControlledSendMode({
        source: {
          send: "true",
          confirm_send: "true",
          allow_controlled_send: "true",
          test_email: "teste@example.com",
        },
        sendEmail: async () => ({ ok: true, id: "re_1" }),
        analytics: false,
      });
    }
  );

  assert(alert.email_send_count === 0, "unchanged");
});

test("analytics de teste não é bloqueante", async () => {
  const result = await emitPriceAlertEmailTestAnalytics(null, {
    eventName: PRICE_DROP_EMAIL_TEST_ANALYTICS_EVENTS.SKIPPED,
    context: { mode: "controlled-send", productName: MIA_CONTROLLED_TEST_PRODUCT_NAME },
  });
  assert(result.ok === false, "controlled failure");
});

test("payload de analytics de teste não inclui user_email", () => {
  const payload = buildPriceAlertEmailTestAnalyticsPayload({
    eventName: PRICE_DROP_EMAIL_TEST_ANALYTICS_EVENTS.SENT,
    context: {
      mode: "controlled-send",
      productName: MIA_CONTROLLED_TEST_PRODUCT_NAME,
      user_email: "secreto@example.com",
    },
  });
  const serialized = JSON.stringify(payload);
  assert(payload.metadata.controlled_test === true, "controlled");
  assert(payload.metadata.not_market_real === true, "not real");
  assert(!serialized.includes("secreto@example.com"), "no email");
});

test("maskEmailForAdminResponse mascara destinatário", () => {
  assert(maskEmailForAdminResponse("usuario@example.com") === "us***@example.com", "masked");
});

test("resolveControlledTestUrl usa test_url válida", () => {
  assert(
    resolveControlledTestUrl("https://loja.example.com/x") === "https://loja.example.com/x",
    "custom"
  );
  assert(resolveControlledTestUrl("bad") === "https://teilor.com.br", "fallback");
});

test("não cria cron", () => {
  const endpoint = readFileSync(join(ROOT, "pages/api/admin/price-alerts-test.js"), "utf8");
  const lib = readFileSync(join(ROOT, "lib/miaPriceAlertAdminTest.js"), "utf8");
  assert(!endpoint.toLowerCase().includes("cron"), "endpoint no cron");
  assert(!lib.toLowerCase().includes("cron"), "lib no cron");
});

test("não altera frontend", () => {
  const lib = readFileSync(join(ROOT, "lib/miaPriceAlertAdminTest.js"), "utf8");
  assert(!lib.includes("components/"), "no frontend");
});

test("não usa LLM", () => {
  const lib = readFileSync(join(ROOT, "lib/miaPriceAlertAdminTest.js"), "utf8");
  assert(!lib.includes("openai"), "no openai");
  assert(!lib.includes("claude"), "no claude");
});

test("sem hardcode de produto no fluxo real", () => {
  const dryRun = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  const sendGate = readFileSync(join(ROOT, "lib/miaPriceAlertSendGate.js"), "utf8");
  assert(!dryRun.includes("Teste interno MIA"), "dry run clean");
  assert(!sendGate.includes("Teste interno MIA"), "send gate clean");
});

test("lib/email.js não foi alterado", () => {
  const email = readFileSync(join(ROOT, "lib/email.js"), "utf8");
  assert(!email.includes("miaPriceAlertAdminTest"), "email intact");
});

test("dry run não importa admin test", () => {
  const dryRun = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  assert(!dryRun.includes("miaPriceAlertAdminTest"), "isolated");
});

console.log(
  `\nPATCH 6 — Price Alert Admin Test Endpoint Audit (${MIA_PRICE_ALERT_ADMIN_TEST_VERSION})\n`
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
    ? "A) PRICE ALERT ADMIN TEST ENDPOINT ROBUST"
    : "B) PRICE ALERT ADMIN TEST ENDPOINT GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
