/**
 * PATCH 2 — Price Alerts Safety Fields Audit
 *
 * Usage:
 *   node scripts/test-mia-price-alerts-safety-fields-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MIA_PRICE_ALERTS_SAFETY_VERSION,
  MIA_PRICE_ALERT_CREATED_REASON,
  MIA_PRICE_ALERT_MONITORING_SCOPE,
  buildPriceAlertInsertRow,
  isSameActivePriceAlert,
  normalizePriceAlertProductKey,
  resolvePriceAlertTargetPrice,
} from "../lib/miaPriceAlertsSafety.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("normalizePriceAlertProductKey remove acentos e casing", () => {
  assert(
    normalizePriceAlertProductKey("iPhone 13 128GB") === "iphone 13 128gb",
    "iphone key"
  );
  assert(
    normalizePriceAlertProductKey("Cadeira Gamer") === "cadeira gamer",
    "cadeira key"
  );
});

test("target_price 5% abaixo quando ausente", () => {
  const target = resolvePriceAlertTargetPrice({
    currentPrice: 1000,
    targetPrice: null,
  });
  assert(target === 950, `expected 950 got ${target}`);
});

test("target_price 5% abaixo no Monitorar do card (link + target = current)", () => {
  const target = resolvePriceAlertTargetPrice({
    currentPrice: 2000,
    targetPrice: 2000,
    productUrl: "https://loja.example.com/produto",
  });
  assert(target === 1900, `expected 1900 got ${target}`);
});

test("target_price explícito do formulário preservado", () => {
  const target = resolvePriceAlertTargetPrice({
    currentPrice: 1500,
    targetPrice: 1200,
    productUrl: "",
  });
  assert(target === 1200, "explicit form target");
});

test("form com target = seen sem link não força 5%", () => {
  const target = resolvePriceAlertTargetPrice({
    currentPrice: 800,
    targetPrice: 800,
    productUrl: "",
  });
  assert(target === 800, "seen-only form target preserved");
});

test("buildPriceAlertInsertRow preenche campos de segurança", () => {
  const row = buildPriceAlertInsertRow({
    user_id: "user-1",
    user_email: "a@b.com",
    product_name: "Notebook Lenovo",
    product_url: "https://loja.example.com/notebook",
    source: "Mercado Livre",
    current_price: 3299,
    target_price: 3299,
  });

  assert(row.normalized_product_key === "notebook lenovo", "normalized key");
  assert(row.monitoring_scope === MIA_PRICE_ALERT_MONITORING_SCOPE, "scope");
  assert(row.original_product_url === "https://loja.example.com/notebook", "original url");
  assert(row.original_source === "Mercado Livre", "original source");
  assert(row.last_checked_price === 3299, "last checked");
  assert(row.last_found_price === 3299, "last found price");
  assert(row.last_found_url === row.original_product_url, "last found url");
  assert(row.created_reason === MIA_PRICE_ALERT_CREATED_REASON, "reason");
  assert(row.target_price === 3134.05, `target 5% got ${row.target_price}`);
});

test("isSameActivePriceAlert detecta duplicado lógico", () => {
  const existing = {
    is_active: true,
    normalized_product_key: "iphone 13 128gb",
    product_name: "iPhone 13 128GB",
  };
  const incoming = { product_name: "iphone 13 128gb" };
  assert(isSameActivePriceAlert(existing, incoming), "duplicate by normalized key");
});

test("SQL contém add column if not exists", () => {
  const sql = readFileSync(
    join(ROOT, "docs/alerts/price-alerts-safety-fields.sql"),
    "utf8"
  );
  assert(sql.includes("add column if not exists"), "add column if not exists");
  assert(sql.includes("normalized_product_key"), "normalized_product_key");
  assert(sql.includes("create index if not exists"), "indexes");
});

test("SQL não contém operações destrutivas", () => {
  const sql = readFileSync(
    join(ROOT, "docs/alerts/price-alerts-safety-fields.sql"),
    "utf8"
  ).toLowerCase();
  assert(!sql.includes("drop table"), "no drop table");
  assert(!sql.includes("delete from"), "no delete from");
});

test("SQL não aplica unique constraint automaticamente", () => {
  const sql = readFileSync(
    join(ROOT, "docs/alerts/price-alerts-safety-fields.sql"),
    "utf8"
  );
  const executableUnique = sql
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.startsWith("create unique index") &&
        !trimmed.startsWith("--")
      );
    });
  assert(executableUnique.length === 0, "no active unique index");
});

test("create-price-alert não dispara email", () => {
  const source = readFileSync(join(ROOT, "pages/api/create-price-alert.js"), "utf8");
  assert(!source.includes("sendPriceDropEmail"), "no email send");
  assert(!source.includes("resend"), "no resend");
  assert(!source.includes("lib/email"), "no email import");
});

test("create-price-alert não cria cron", () => {
  const source = readFileSync(join(ROOT, "pages/api/create-price-alert.js"), "utf8");
  assert(!source.includes("cron"), "no cron");
  assert(!source.includes("check-prices"), "no price check");
});

test("create-price-alert preserva resposta compatível", () => {
  const source = readFileSync(join(ROOT, "pages/api/create-price-alert.js"), "utf8");
  assert(source.includes("success: true"), "success field");
  assert(source.includes("data"), "data field");
  assert(source.includes("already_exists"), "already_exists extension");
});

test("create-price-alert usa safety layer", () => {
  const source = readFileSync(join(ROOT, "pages/api/create-price-alert.js"), "utf8");
  assert(source.includes("miaPriceAlertsSafety"), "safety import");
  assert(source.includes("normalized_product_key"), "dedup key");
});

test("lib/email.js não foi alterado neste patch", () => {
  const email = readFileSync(join(ROOT, "lib/email.js"), "utf8");
  assert(email.includes("miaPriceDropEmailTemplate"), "patch1 email layer intact");
});

console.log(
  `\nPATCH 2 — Price Alerts Safety Fields Audit (${MIA_PRICE_ALERTS_SAFETY_VERSION})\n`
);

let pass = 0;
let fail = 0;

for (const spec of CASES) {
  try {
    spec.fn();
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
    ? "A) PRICE ALERTS SAFETY FIELDS ROBUST"
    : "B) PRICE ALERTS SAFETY FIELDS GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
