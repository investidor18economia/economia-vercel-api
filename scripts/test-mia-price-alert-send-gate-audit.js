/**
 * PATCH 4 — Price Alert Send Gate Audit
 *
 * Usage:
 *   node scripts/test-mia-price-alert-send-gate-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MIA_PRICE_ALERT_SEND_GATE_VERSION,
  MIA_PRICE_ALERT_MAX_EMAIL_SEND_COUNT,
  MIA_PRICE_ALERT_SEND_COOLDOWN_MS,
  buildSendFailureUpdate,
  buildSendSuccessUpdate,
  evaluateAntiSpamRules,
  extractSendRequestFlags,
  hasResendApiKey,
  isBlockedPlaceholderUrl,
  isSendEnvEnabled,
  resolveSendEmailOldPrice,
  runPriceAlertsSend,
  validateSendAuthorization,
} from "../lib/miaPriceAlertSendGate.js";
import { evaluatePriceAlertEligibility } from "../lib/miaPriceAlertDryRun.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ORIGINAL_ADMIN_KEY = process.env.MIA_ADMIN_API_KEY;
const ORIGINAL_SEND_ENABLED = process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED;
const ORIGINAL_RESEND_KEY = process.env.RESEND_API_KEY;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withEnv(overrides, fn) {
  const keys = ["MIA_ADMIN_API_KEY", "MIA_PRICE_DROP_EMAIL_SEND_ENABLED", "RESEND_API_KEY"];
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

function withAdminKey(value, fn) {
  return withEnv({ MIA_ADMIN_API_KEY: value }, fn);
}

function baseAlert(overrides = {}) {
  return {
    id: "alert-1",
    user_id: "user-1",
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

function baseOffer(price = 900) {
  return {
    best_found_product_name: "Monitor Gamer 27 165Hz",
    best_found_price: price,
    best_found_source: "google_shopping",
    best_found_url: "https://loja.example.com/monitor",
  };
}

function baseEvaluation(overrides = {}) {
  return evaluatePriceAlertEligibility(baseAlert(), {
    bestFound: baseOffer(900),
    dryRun: false,
    ...overrides,
  });
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
  let lastUpdatePatch = null;
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => ({
      data: [alert],
      error: null,
    }),
    update: (patch) => {
      lastUpdatePatch = patch;
      return {
        eq: async () => {
          if (hooks.onUpdate) hooks.onUpdate(patch);
          return { error: null };
        },
      };
    },
  };
  return {
    supabase: {
      from() {
        return chain;
      },
    },
    getLastUpdatePatch: () => lastUpdatePatch,
  };
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("envio bloqueado sem admin key configurada", () => {
  withEnv(
    {
      MIA_ADMIN_API_KEY: undefined,
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateSendAuthorization({
        headers: { "x-mia-admin-key": "any" },
        query: { send: "true", confirm_send: "true" },
      });
      assert(auth.ok === false && auth.code === "admin_key_not_configured", "no admin key");
    }
  );
});

test("envio bloqueado sem send=true", () => {
  withEnv(
    {
      MIA_ADMIN_API_KEY: "secret-key",
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateSendAuthorization({
        headers: { "x-mia-admin-key": "secret-key" },
        query: { confirm_send: "true" },
      });
      assert(auth.ok === false && auth.code === "send_not_requested", "no send");
    }
  );
});

test("envio bloqueado sem confirm_send=true", () => {
  withEnv(
    {
      MIA_ADMIN_API_KEY: "secret-key",
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateSendAuthorization({
        headers: { "x-mia-admin-key": "secret-key" },
        query: { send: "true" },
      });
      assert(auth.ok === false && auth.code === "confirm_send_not_requested", "no confirm");
    }
  );
});

test("envio bloqueado sem MIA_PRICE_DROP_EMAIL_SEND_ENABLED=true", () => {
  withEnv(
    {
      MIA_ADMIN_API_KEY: "secret-key",
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "false",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateSendAuthorization({
        headers: { "x-mia-admin-key": "secret-key" },
        query: { send: "true", confirm_send: "true" },
      });
      assert(auth.ok === false && auth.code === "send_disabled", "send disabled");
      assert(isSendEnvEnabled() === false, "env flag false");
    }
  );
});

test("envio bloqueado sem RESEND_API_KEY", () => {
  withEnv(
    {
      MIA_ADMIN_API_KEY: "secret-key",
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: undefined,
    },
    () => {
      const auth = validateSendAuthorization({
        headers: { "x-mia-admin-key": "secret-key" },
        query: { send: "true", confirm_send: "true" },
      });
      assert(auth.ok === false && auth.code === "missing_resend_api_key", "no resend");
      assert(hasResendApiKey() === false, "hasResend false");
    }
  );
});

test("envio autorizado com todas as travas satisfeitas", () => {
  withEnv(
    {
      MIA_ADMIN_API_KEY: "secret-key",
      MIA_PRICE_DROP_EMAIL_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_test",
    },
    () => {
      const auth = validateSendAuthorization({
        headers: { "x-mia-admin-key": "secret-key" },
        query: { send: "true", confirm_send: "true" },
      });
      assert(auth.ok === true, "authorized");
    }
  );
});

test("anti-spam bloqueia email inválido", () => {
  const evaluation = evaluatePriceAlertEligibility(
    baseAlert({ user_email: "invalid" }),
    { bestFound: baseOffer(900), dryRun: false }
  );
  const anti = evaluateAntiSpamRules(baseAlert({ user_email: "invalid" }), evaluation);
  assert(anti.ok === false, "blocked");
  assert(
    anti.reason === "missing_or_invalid_user_email" || evaluation.reason === "missing_or_invalid_user_email",
    "invalid email reason"
  );
});

test("anti-spam bloqueia link inválido", () => {
  const evaluation = evaluatePriceAlertEligibility(baseAlert(), {
    bestFound: { ...baseOffer(900), best_found_url: "not-a-url" },
    dryRun: false,
  });
  const anti = evaluateAntiSpamRules(baseAlert(), evaluation);
  assert(anti.ok === false, "blocked");
  assert(anti.reason === "invalid_best_url" || evaluation.reason === "invalid_best_url", "bad url");
});

test("anti-spam bloqueia https://example.com", () => {
  assert(isBlockedPlaceholderUrl("https://example.com") === true, "blocked host");
  const evaluation = evaluatePriceAlertEligibility(baseAlert(), {
    bestFound: { ...baseOffer(900), best_found_url: "https://example.com/item" },
    dryRun: false,
  });
  const anti = evaluateAntiSpamRules(baseAlert(), evaluation);
  assert(anti.ok === false && anti.reason === "blocked_placeholder_url", "placeholder blocked");
});

test("anti-spam bloqueia preço acima do alvo", () => {
  const evaluation = evaluatePriceAlertEligibility(baseAlert(), {
    bestFound: baseOffer(1200),
    dryRun: false,
  });
  const anti = evaluateAntiSpamRules(baseAlert(), evaluation);
  assert(anti.ok === false && evaluation.reason === "price_above_target", "above target");
});

test("anti-spam permite preço igual ao alvo", () => {
  const evaluation = evaluatePriceAlertEligibility(baseAlert(), {
    bestFound: baseOffer(1000),
    dryRun: false,
  });
  const anti = evaluateAntiSpamRules(baseAlert(), evaluation);
  assert(anti.ok === true, "at target allowed");
});

test("anti-spam permite preço abaixo do alvo", () => {
  const evaluation = evaluatePriceAlertEligibility(baseAlert(), {
    bestFound: baseOffer(900),
    dryRun: false,
  });
  const anti = evaluateAntiSpamRules(baseAlert(), evaluation);
  assert(anti.ok === true, "below target allowed");
});

test("anti-spam bloqueia envio nas últimas 24h", () => {
  const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const evaluation = baseEvaluation();
  const anti = evaluateAntiSpamRules(
    baseAlert({ last_alert_sent_at: recent }),
    evaluation
  );
  assert(anti.ok === false && anti.reason === "recent_email_sent", "recent");
});

test("anti-spam bloqueia se preço não é melhor que último enviado", () => {
  const evaluation = baseEvaluation();
  const anti = evaluateAntiSpamRules(
    baseAlert({ last_alert_sent_price: 900 }),
    evaluation
  );
  assert(anti.ok === false && anti.reason === "not_better_than_last_sent", "not better");
});

test("anti-spam bloqueia se email_send_count >= 3", () => {
  const evaluation = baseEvaluation();
  const anti = evaluateAntiSpamRules(
    baseAlert({ email_send_count: MIA_PRICE_ALERT_MAX_EMAIL_SEND_COUNT }),
    evaluation
  );
  assert(anti.ok === false && anti.reason === "send_limit_reached", "limit");
});

test("buildSendSuccessUpdate incrementa campos corretos", () => {
  const evaluation = baseEvaluation();
  const patch = buildSendSuccessUpdate(baseAlert({ email_send_count: 1, check_count: 2 }), evaluation);
  assert(patch.last_alert_status === "sent", "status sent");
  assert(patch.last_alert_error === null, "no error");
  assert(patch.email_send_count === 2, "increment send count");
  assert(patch.last_alert_sent_at, "sent at");
  assert(patch.last_alert_sent_price === 900, "sent price");
  assert(patch.last_alert_sent_url === "https://loja.example.com/monitor", "sent url");
  assert(patch.check_count === 3, "check count");
  assert(patch.last_found_price === 900, "found price");
});

test("buildSendFailureUpdate não incrementa email_send_count", () => {
  const patch = buildSendFailureUpdate({ code: "resend_error" });
  assert(patch.last_alert_status === "send_failed", "failed status");
  assert(patch.last_alert_error === "resend_error", "error");
  assert(patch.email_send_count === undefined, "no send count");
  assert(patch.last_alert_sent_at === undefined, "no sent at");
});

test("não altera campos de envio quando bloqueado por anti-spam", async () => {
  const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const alert = baseAlert({ last_alert_sent_at: recent });
  const { supabase, getLastUpdatePatch } = createMockSupabase(alert);

  const report = await runPriceAlertsSend({
    supabase,
    fetchPipeline: mockPipeline,
    sendEmail: async () => ({ ok: true, id: "should-not-send" }),
    updateOnSkip: true,
  });

  assert(report.summary.sent_count === 0, "not sent");
  assert(report.results[0].skipped === true, "skipped");
  const patch = getLastUpdatePatch();
  assert(patch, "audit updated");
  assert(patch.email_send_count === undefined, "no send count on skip");
  assert(patch.last_alert_sent_at === undefined, "no sent at on skip");
});

test("atualiza campos corretos quando envio bem-sucedido", async () => {
  const alert = baseAlert();
  const { supabase, getLastUpdatePatch } = createMockSupabase(alert);

  const report = await runPriceAlertsSend({
    supabase,
    fetchPipeline: mockPipeline,
    sendEmail: async () => ({ ok: true, id: "resend-abc" }),
  });

  assert(report.summary.sent_count === 1, "sent");
  assert(report.results[0].email_sent === true, "email_sent");
  assert(report.results[0].resend_result_id === "resend-abc", "resend id");
  const patch = getLastUpdatePatch();
  assert(patch.last_alert_status === "sent", "status");
  assert(patch.email_send_count === 1, "count");
  assert(patch.last_alert_sent_price === 900, "price");
});

test("resolveSendEmailOldPrice usa referência segura", () => {
  const evaluation = baseEvaluation();
  assert(resolveSendEmailOldPrice(baseAlert(), evaluation) === 1100, "last checked");
  assert(
    resolveSendEmailOldPrice(baseAlert({ last_checked_price: null }), evaluation) === 1100,
    "current"
  );
  assert(
    resolveSendEmailOldPrice(
      baseAlert({ last_checked_price: null, current_price: null }),
      evaluation
    ) === 1000,
    "target"
  );
});

test("relatório contém dry_run false e send_mode true", async () => {
  const { supabase } = createMockSupabase(baseAlert());
  const report = await runPriceAlertsSend({
    supabase,
    fetchPipeline: mockPipeline,
    sendEmail: async () => ({ ok: false, code: "send_disabled" }),
  });
  assert(report.dry_run === false, "not dry run");
  assert(report.send_mode === true, "send mode");
  assert(report.summary.dry_run === false, "summary dry_run");
  assert(report.summary.send_mode === true, "summary send_mode");
});

test("dry run endpoint não foi alterado para envio", () => {
  const dryRun = readFileSync(join(ROOT, "pages/api/admin/price-alerts-dry-run.js"), "utf8");
  assert(!dryRun.includes("price-alerts-send"), "dry run isolated");
  assert(!dryRun.includes("runPriceAlertsSend"), "no send in dry run");
});

test("não há cron no endpoint de envio", () => {
  const source = readFileSync(join(ROOT, "pages/api/admin/price-alerts-send.js"), "utf8");
  assert(!source.toLowerCase().includes("cron"), "no cron");
});

test("não há uso de LLM no send gate", () => {
  const source = readFileSync(join(ROOT, "lib/miaPriceAlertSendGate.js"), "utf8");
  assert(!source.includes("openai"), "no openai");
  assert(!source.includes("callOpenAI"), "no callOpenAI");
  assert(!source.includes("claude"), "no claude");
});

test("sem hardcode de produto no send gate", () => {
  const source = readFileSync(join(ROOT, "lib/miaPriceAlertSendGate.js"), "utf8");
  assert(!/if\s*\([^)]*includes\s*\(\s*["']iphone/i.test(source), "no iphone");
  assert(!/if\s*\([^)]*includes\s*\(\s*["']lenovo/i.test(source), "no lenovo");
});

test("extractSendRequestFlags lê send e confirm_send", () => {
  const flags = extractSendRequestFlags({
    method: "GET",
    query: { send: "true", confirm_send: "1" },
  });
  assert(flags.send === true && flags.confirmSend === true, "flags");
});

test("cooldown de 24h está configurado", () => {
  assert(MIA_PRICE_ALERT_SEND_COOLDOWN_MS === 24 * 60 * 60 * 1000, "24h");
});

console.log(
  `\nPATCH 4 — Price Alert Send Gate Audit (${MIA_PRICE_ALERT_SEND_GATE_VERSION})\n`
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
    ? "A) PRICE ALERT SEND GATE ROBUST"
    : "B) PRICE ALERT SEND GATE GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
