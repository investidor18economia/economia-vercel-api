/**
 * PATCH 3 — Price Alert Dry Run Audit
 *
 * Usage:
 *   node scripts/test-mia-price-alert-dry-run-audit.js
 *   node scripts/test-mia-price-alert-dry-run-audit.js --http
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MIA_PRICE_ALERT_DRY_RUN_VERSION,
  assertSafePriceAlertAuditPatch,
  buildSafePriceAlertAuditUpdate,
  evaluatePriceAlertEligibility,
  normalizeTrustedOfferResult,
  runPriceAlertsDryRun,
  validateMiaAdminApiKey,
} from "../lib/miaPriceAlertDryRun.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ORIGINAL_ADMIN_KEY = process.env.MIA_ADMIN_API_KEY;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withAdminKey(value, fn) {
  if (value == null) {
    delete process.env.MIA_ADMIN_API_KEY;
  } else {
    process.env.MIA_ADMIN_API_KEY = value;
  }
  try {
    return fn();
  } finally {
    if (ORIGINAL_ADMIN_KEY == null) {
      delete process.env.MIA_ADMIN_API_KEY;
    } else {
      process.env.MIA_ADMIN_API_KEY = ORIGINAL_ADMIN_KEY;
    }
  }
}

function baseAlert(overrides = {}) {
  return {
    id: "alert-1",
    user_id: "user-1",
    user_email: "usuario@example.com",
    product_name: "Monitor Gamer 27",
    normalized_product_key: "monitor gamer 27",
    target_price: 1000,
    is_active: true,
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

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("endpoint exige admin key configurada", () => {
  withAdminKey(undefined, () => {
    const auth = validateMiaAdminApiKey({ headers: {}, query: {} });
    assert(auth.ok === false && auth.code === "admin_key_not_configured", "not configured");
  });
});

test("endpoint rejeita chave inválida", () => {
  withAdminKey("secret-key", () => {
    const auth = validateMiaAdminApiKey({
      headers: { "x-mia-admin-key": "wrong" },
      query: {},
    });
    assert(auth.ok === false && auth.code === "invalid_admin_key", "invalid");
  });
});

test("endpoint aceita chave válida", () => {
  withAdminKey("secret-key", () => {
    const auth = validateMiaAdminApiKey({
      headers: { "x-mia-admin-key": "secret-key" },
      query: {},
    });
    assert(auth.ok === true, "valid");
  });
});

test("elegibilidade aceita preço abaixo do alvo", () => {
  const result = evaluatePriceAlertEligibility(baseAlert(), { bestFound: baseOffer(900) });
  assert(result.eligible_for_email === true, "eligible");
  assert(result.reason === "eligible_below_target", "below target");
  assert(result.would_send_email === true, "would send");
});

test("elegibilidade aceita preço igual ao alvo", () => {
  const result = evaluatePriceAlertEligibility(baseAlert(), { bestFound: baseOffer(1000) });
  assert(result.eligible_for_email === true, "eligible");
  assert(result.reason === "eligible_at_target", "at target");
});

test("elegibilidade rejeita preço acima do alvo", () => {
  const result = evaluatePriceAlertEligibility(baseAlert(), { bestFound: baseOffer(1200) });
  assert(result.eligible_for_email === false, "not eligible");
  assert(result.reason === "price_above_target", "above target");
});

test("elegibilidade rejeita link inválido", () => {
  const result = evaluatePriceAlertEligibility(baseAlert(), {
    bestFound: {
      ...baseOffer(900),
      best_found_url: "not-a-url",
    },
  });
  assert(result.reason === "invalid_best_url", "invalid url");
});

test("elegibilidade rejeita email ausente", () => {
  const result = evaluatePriceAlertEligibility(baseAlert({ user_email: "" }), {
    bestFound: baseOffer(900),
  });
  assert(result.reason === "missing_or_invalid_user_email", "no email");
});

test("dry run não envia email", () => {
  const endpoint = readFileSync(
    join(ROOT, "pages/api/admin/price-alerts-dry-run.js"),
    "utf8"
  );
  const dryRunLib = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  assert(!endpoint.includes("sendPriceDropEmail"), "endpoint no email");
  assert(!dryRunLib.includes("sendPriceDropEmail"), "lib no email");
});

test("dry run não chama Resend", () => {
  const endpoint = readFileSync(
    join(ROOT, "pages/api/admin/price-alerts-dry-run.js"),
    "utf8"
  );
  const dryRunLib = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  assert(!endpoint.includes('from "resend"'), "endpoint no resend import");
  assert(!dryRunLib.includes('from "resend"'), "lib no resend import");
  assert(!endpoint.includes("lib/email"), "no email import");
});

test("update=true só permite campos de auditoria", () => {
  const patch = buildSafePriceAlertAuditUpdate(
    { check_count: 2 },
    evaluatePriceAlertEligibility(baseAlert(), { bestFound: baseOffer(900) })
  );
  const safe = assertSafePriceAlertAuditPatch(patch);
  assert(safe.ok === true, "safe patch");
  assert(patch.last_alert_sent_at === undefined, "no sent_at");
  assert(patch.email_send_count === undefined, "no send count");
});

test("assertSafePriceAlertAuditPatch bloqueia campos de envio", () => {
  const blocked = assertSafePriceAlertAuditPatch({
    last_checked_at: new Date().toISOString(),
    email_send_count: 1,
  });
  assert(blocked.ok === false && blocked.code === "forbidden_send_field", "blocked");
});

test("relatório contém dry_run true", async () => {
  const report = await runPriceAlertsDryRun({
    supabase: {
      from() {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: async () => ({
            data: [baseAlert()],
            error: null,
          }),
          update: async () => ({ error: null }),
        };
        return chain;
      },
    },
    update: false,
    fetchPipeline: async () => ({
      ok: true,
      shadowOffer: {
        title: "Monitor Gamer 27",
        price: 900,
        url: "https://loja.example.com/monitor",
        source: "google_shopping",
      },
      offerCount: 1,
    }),
  });

  assert(report.dry_run === true, "dry_run flag");
  assert(report.summary.dry_run === true, "summary dry_run");
  assert(report.results[0].dry_run === true, "result dry_run");
});

test("update=false não escreve no banco", async () => {
  let updateCalled = false;
  await runPriceAlertsDryRun({
    supabase: {
      from() {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: async () => ({
            data: [baseAlert()],
            error: null,
          }),
          update: async () => {
            updateCalled = true;
            return { error: null };
          },
        };
        return chain;
      },
    },
    update: false,
    fetchPipeline: async () => ({
      ok: true,
      shadowOffer: {
        title: "Monitor Gamer 27",
        price: 900,
        url: "https://loja.example.com/monitor",
        source: "google_shopping",
      },
      offerCount: 1,
    }),
  });
  assert(updateCalled === false, "no update");
});

test("normalizeTrustedOfferResult rejeita oferta incompleta", () => {
  assert(normalizeTrustedOfferResult(null) === null, "null");
  assert(
    normalizeTrustedOfferResult({ title: "X", price: 10, url: "bad", source: "s" }) === null,
    "bad url"
  );
});

test("não há cron no endpoint", () => {
  const source = readFileSync(
    join(ROOT, "pages/api/admin/price-alerts-dry-run.js"),
    "utf8"
  );
  assert(!source.toLowerCase().includes("cron"), "no cron");
});

test("não há uso de LLM", () => {
  const source = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  assert(!source.includes("openai"), "no openai");
  assert(!source.includes("callOpenAI"), "no callOpenAI");
  assert(!source.includes("claude"), "no claude");
});

test("sem hardcode de produto", () => {
  const source = readFileSync(join(ROOT, "lib/miaPriceAlertDryRun.js"), "utf8");
  assert(!/if\s*\([^)]*includes\s*\(\s*["']iphone/i.test(source), "no iphone hardcode");
  assert(!/if\s*\([^)]*includes\s*\(\s*["']lenovo/i.test(source), "no lenovo hardcode");
});

test("lib/email.js não foi alterado", () => {
  const email = readFileSync(join(ROOT, "lib/email.js"), "utf8");
  assert(email.includes("miaPriceDropEmailTemplate"), "email patch1 intact");
  assert(!email.includes("miaPriceAlertDryRun"), "no dry run in email");
});

console.log(
  `\nPATCH 3 — Price Alert Dry Run Audit (${MIA_PRICE_ALERT_DRY_RUN_VERSION})\n`
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

if (process.argv.includes("--http")) {
  console.log("\n── HTTP smoke (requires dev server + MIA_ADMIN_API_KEY) ──");
  try {
    const key = process.env.MIA_ADMIN_API_KEY;
    if (!key) throw new Error("MIA_ADMIN_API_KEY not set for HTTP smoke");
    const resp = await fetch(
      `http://localhost:3000/api/admin/price-alerts-dry-run?limit=1&update=false`,
      { headers: { "x-mia-admin-key": key } }
    );
    const data = await resp.json();
    assert(data.dry_run === true, "dry_run in response");
    pass += 1;
    console.log("✓ HTTP admin dry-run endpoint");
  } catch (err) {
    fail += 1;
    console.log(`✗ HTTP admin dry-run endpoint → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) PRICE ALERT DRY RUN ROBUST"
    : "B) PRICE ALERT DRY RUN GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
