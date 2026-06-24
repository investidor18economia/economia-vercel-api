/**
 * PATCH 1 — MIA Price Drop Email Template + Safety Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-price-drop-email-template-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MIA_EMAIL_COLORS,
  MIA_EMAIL_CTA_LABEL,
  MIA_EMAIL_FROM,
  MIA_EMAIL_LOGO_PUBLIC_PATH,
  MIA_PRICE_DROP_EMAIL_SUBJECT,
  MIA_PRICE_DROP_EMAIL_VERSION,
  buildMiaPriceDropEmailContent,
  buildMiaPriceDropEmailHtml,
  formatMiaEmailPrice,
  isMiaPriceDropEmailSendEnabled,
  miaEmailLogoFileExists,
  normalizeMiaEmailPublicBaseUrl,
  resolveMiaEmailLogoUrl,
  resolveMiaEmailPublicBaseUrl,
  validatePriceDropEmailPayload,
} from "../lib/miaPriceDropEmailTemplate.js";
import { sendPriceDropEmail } from "../lib/email.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ORIGINAL_SEND_FLAG = process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withSendFlag(value, fn) {
  if (value == null) {
    delete process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED;
  } else {
    process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED = value;
  }
  try {
    return fn();
  } finally {
    if (ORIGINAL_SEND_FLAG == null) {
      delete process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED;
    } else {
      process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED = ORIGINAL_SEND_FLAG;
    }
  }
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("remetente institucional MIA da Teilor", () => {
  assert(MIA_EMAIL_FROM.includes("mia@teilor.com.br"), "from address");
  assert(MIA_EMAIL_FROM.includes("MIA da Teilor"), "from label");
});

test("assunto padrão institucional", () => {
  assert(MIA_PRICE_DROP_EMAIL_SUBJECT === "💰 Boa notícia: o preço caiu", "subject");
});

test("CTA Ver na loja", () => {
  assert(MIA_EMAIL_CTA_LABEL === "Ver na loja", "cta");
});

test("cores oficiais MIA", () => {
  assert(MIA_EMAIL_COLORS.primary === "#00C6FF", "primary");
  assert(MIA_EMAIL_COLORS.secondary === "#7B61FF", "secondary");
  assert(MIA_EMAIL_COLORS.background === "#050D1F", "background");
  assert(MIA_EMAIL_COLORS.priceNew === "#5FD68A", "price new");
  assert(MIA_EMAIL_COLORS.priceOld === "#FF6B6B", "price old");
  assert(MIA_EMAIL_COLORS.champagne === "#E8D8B5", "champagne");
  assert(MIA_EMAIL_COLORS.institutional === "#00C6FF", "institutional cta identity");
  assert(MIA_EMAIL_COLORS.signature === "#72D4A8", "signature");
  assert(MIA_EMAIL_COLORS.headlineBg === "#061F3A", "headline bg");
});

test("sem cor externa #0070f3 no módulo de e-mail", () => {
  const emailJs = readFileSync(join(ROOT, "lib/email.js"), "utf8");
  const templateJs = readFileSync(join(ROOT, "lib/miaPriceDropEmailTemplate.js"), "utf8");
  assert(!emailJs.includes("#0070f3"), "email.js");
  assert(!templateJs.includes("#0070f3"), "template.js");
});

test("logo oficial existe localmente", () => {
  assert(miaEmailLogoFileExists() === true, "mia-logo.png");
});

test("payload válido gera HTML institucional", () => {
  const result = buildMiaPriceDropEmailContent({
    to: "usuario@example.com",
    productName: "iPhone 13 128GB",
    oldPrice: 3499,
    newPrice: 2999,
    link: "https://loja.example.com/iphone-13",
    logoUrl: "https://app.example.com/branding/mia-logo.png",
  });

  assert(result.ok === true, "ok");
  assert(result.html.includes("— MIA da Teilor"), "signature");
  assert(result.html.includes("Ver na loja"), "cta");
  assert(result.html.includes("Não ganhamos nada quando você clica."), "trust copy 1");
  assert(result.html.includes("Não recebemos comissão."), "trust copy 2");
  assert(result.html.includes("Não empurramos produto."), "trust copy 3");
  assert(result.html.includes("#E8D8B5"), "champagne trust");
  assert(result.html.includes("As recomendações são feitas pensando em você e nos seus interesses."), "institutional copy");
  assert(result.html.includes("linear-gradient(180deg, #00C6FF 0%, #7B61FF 100%)"), "institutional cta gradient");
  assert(result.html.includes("-webkit-text-fill-color:transparent"), "institutional gradient text");
  assert(result.html.includes("#72D4A8"), "signature color");
  assert(result.html.includes("#061F3A"), "headline block bg");
  assert(result.html.includes('src="https://app.example.com/branding/mia-logo.png"'), "absolute logo src");
  assert(!result.html.includes('src="/branding/mia-logo.png"'), "no relative logo src");
  assert(result.html.includes("#FF6B6B"), "old price color");
  assert(result.html.includes("#5FD68A"), "new price color");
  assert(result.html.includes("💰 Boa notícia: o preço caiu"), "headline with emoji");
  assert(result.html.includes("alerta de preço"), "footer");
  assert(result.html.includes("#050D1F"), "header background");
  assert(result.html.includes("iPhone 13 128GB"), "product");
  assert(result.logoIncluded === true, "logo");
  assert(!result.html.includes(">MIA da Teilor<"), "no repeated header brand");
});

test("fallback seguro sem logo URL", () => {
  const html = buildMiaPriceDropEmailHtml({
    productName: "Notebook Lenovo",
    oldPriceLabel: "R$ 3.299,00",
    newPriceLabel: "R$ 2.899,00",
    link: "https://loja.example.com/notebook",
    logoUrl: null,
  });
  assert(html.includes("letter-spacing:0.14em") && html.includes("MIA"), "text fallback brand");
  assert(!html.includes(">MIA da Teilor<"), "no repeated header brand");
  assert(!html.includes("<img"), "no img without logo");
});

test("safety: e-mail vazio", () => {
  const result = validatePriceDropEmailPayload({
    to: "",
    productName: "Produto",
    oldPrice: 100,
    newPrice: 90,
    link: "https://example.com/p",
  });
  assert(result.ok === false && result.code === "empty_email", "empty email");
});

test("safety: e-mail inválido", () => {
  const result = validatePriceDropEmailPayload({
    to: "invalido",
    productName: "Produto",
    oldPrice: 100,
    newPrice: 90,
    link: "https://example.com/p",
  });
  assert(result.ok === false && result.code === "invalid_email", "invalid email");
});

test("safety: product_name vazio", () => {
  const result = validatePriceDropEmailPayload({
    to: "a@b.com",
    productName: "",
    oldPrice: 100,
    newPrice: 90,
    link: "https://example.com/p",
  });
  assert(result.ok === false && result.code === "empty_product_name", "empty product");
});

test("safety: link vazio", () => {
  const result = validatePriceDropEmailPayload({
    to: "a@b.com",
    productName: "Produto",
    oldPrice: 100,
    newPrice: 90,
    link: "",
  });
  assert(result.ok === false && result.code === "empty_link", "empty link");
});

test("safety: preço inválido", () => {
  const result = validatePriceDropEmailPayload({
    to: "a@b.com",
    productName: "Produto",
    oldPrice: null,
    newPrice: 90,
    link: "https://example.com/p",
  });
  assert(result.ok === false && result.code === "invalid_old_price", "invalid price");
});

test("formatMiaEmailPrice BRL", () => {
  assert(formatMiaEmailPrice(2999.9) === "R$ 2999,90", "format");
});

test("sendPriceDropEmail não envia com flag desligada", async () => {
  await withSendFlag(undefined, async () => {
    assert(isMiaPriceDropEmailSendEnabled() === false, "default off");
    const result = await sendPriceDropEmail(
      "usuario@example.com",
      "Monitor Gamer",
      1199,
      999,
      "https://loja.example.com/monitor"
    );
    assert(result.skipped === true && result.code === "send_disabled", "skipped");
  });
});

test("sendPriceDropEmail retorna erro controlado em payload inválido", async () => {
  const result = await sendPriceDropEmail("", "Produto", 100, 90, "https://x.com");
  assert(result.ok === false && result.code === "empty_email", "controlled error");
});

test("HTML escapa conteúdo malicioso", () => {
  const html = buildMiaPriceDropEmailHtml({
    productName: '<script>alert("x")</script>',
    oldPriceLabel: "R$ 100,00",
    newPriceLabel: "R$ 90,00",
    link: "https://example.com",
    logoUrl: null,
  });
  assert(!html.includes("<script>"), "escaped script");
  assert(html.includes("&lt;script&gt;"), "escaped entity");
});

test("PATCH 10.1B: resolve logo URL absoluta por env", () => {
  const original = {
    MIA_PUBLIC_APP_URL: process.env.MIA_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  delete process.env.MIA_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_URL;

  try {
    process.env.MIA_PUBLIC_APP_URL = "https://teilor.com.br";
    const url = resolveMiaEmailLogoUrl();
    assert(url === "https://teilor.com.br/branding/mia-logo.png", "mia public app url");
    assert(/^https:\/\//.test(url), "https absolute");

    delete process.env.MIA_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://economia-ai.vercel.app";
    const siteUrl = resolveMiaEmailLogoUrl();
    assert(
      siteUrl === "https://economia-ai.vercel.app/branding/mia-logo.png",
      "next public site url"
    );

    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "economia-ai.vercel.app";
    const vercelUrl = resolveMiaEmailLogoUrl();
    assert(
      vercelUrl === "https://economia-ai.vercel.app/branding/mia-logo.png",
      "vercel url with https prefix"
    );
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("PATCH 10.1B: fallback textual MIA sem base pública", () => {
  const original = {
    MIA_PUBLIC_APP_URL: process.env.MIA_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  delete process.env.MIA_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_URL;

  try {
    assert(resolveMiaEmailLogoUrl() === null, "no public base");
    const html = buildMiaPriceDropEmailHtml({
      productName: "Produto",
      oldPriceLabel: "R$ 100,00",
      newPriceLabel: "R$ 90,00",
      link: "https://example.com/p",
      logoUrl: null,
    });
    assert(html.includes("letter-spacing:0.14em") && html.includes("MIA"), "text fallback");
    assert(!html.includes("<img"), "no img");
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("PATCH 10.1B: headline e hierarquia visual", () => {
  const html = buildMiaPriceDropEmailHtml({
    productName: "Fone Bluetooth",
    oldPriceLabel: "R$ 199,00",
    newPriceLabel: "R$ 149,00",
    link: "https://example.com/fone",
    logoUrl: "https://app.example.com/branding/mia-logo.png",
  });

  assert(html.includes("#00C6FF"), "headline color");
  assert(html.includes("#061F3A"), "headline bg");
  assert(html.includes("border:1px solid #00C6FF"), "headline border");
  assert(html.includes("text-decoration:line-through"), "old price strike");
  assert(html.includes("font-weight:600;color:#E8D8B5"), "trust champagne");
  assert(html.includes("linear-gradient(180deg, #00C6FF 0%, #7B61FF 100%)"), "institutional cta gradient");
  assert(html.includes("As recomendações são feitas pensando em você e nos seus interesses."), "institutional manifesto");
  assert(!html.includes("#F4E8D4"), "no legacy institutional color");
  assert(html.includes("color:#72D4A8"), "signature");
  assert(html.includes(MIA_EMAIL_LOGO_PUBLIC_PATH.slice(1)), "logo path segment");
  assert(normalizeMiaEmailPublicBaseUrl("teilor.com.br") === "https://teilor.com.br", "base normalize");
});

test("PATCH 10.1C: frase institucional usa identidade visual do CTA", () => {
  const html = buildMiaPriceDropEmailHtml({
    productName: "Tablet",
    oldPriceLabel: "R$ 999,00",
    newPriceLabel: "R$ 799,00",
    link: "https://example.com/tablet",
    logoUrl: null,
  });

  const institutionalStart = html.indexOf("As recomendações são feitas");
  assert(institutionalStart > -1, "institutional phrase present");
  const snippet = html.slice(Math.max(0, institutionalStart - 220), institutionalStart + 80);
  assert(snippet.includes("color:#00C6FF"), "institutional cyan fallback");
  assert(snippet.includes("linear-gradient(180deg, #00C6FF 0%, #7B61FF 100%)"), "institutional gradient");
  assert(snippet.includes("font-weight:600"), "institutional weight");
  assert(snippet.includes("font-size:16px"), "institutional size");
  assert(!snippet.includes("border:"), "no border on institutional");
});

test("PATCH 10.1A: produto com destaque premium", () => {
  const html = buildMiaPriceDropEmailHtml({
    productName: "Smart TV 55",
    oldPriceLabel: "R$ 2.499,00",
    newPriceLabel: "R$ 2.199,00",
    link: "https://example.com/tv",
    logoUrl: "https://app.example.com/branding/mia-logo.png",
  });
  assert(html.includes("font-size:20px") && html.includes("font-weight:700"), "product emphasis");
  assert(html.includes('bgcolor="#050D1F"') || html.includes("background-color:#050D1F"), "logo header bg");
});

test("compatibilidade: HTML table-based inline", () => {
  const html = buildMiaPriceDropEmailHtml({
    productName: "TV Samsung",
    oldPriceLabel: "R$ 2.499,00",
    newPriceLabel: "R$ 2.199,00",
    link: "https://example.com/tv",
    logoUrl: null,
  });
  assert(html.includes('<table role="presentation"'), "tables");
  assert(html.includes("font-family:Arial"), "inline font");
});

console.log(
  `\nPATCH 10.1C — MIA Price Drop Email Institutional Accent Audit (${MIA_PRICE_DROP_EMAIL_VERSION})\n`
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
    ? "A) MIA PRICE DROP EMAIL TEMPLATE ROBUST"
    : "B) MIA PRICE DROP EMAIL TEMPLATE GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
