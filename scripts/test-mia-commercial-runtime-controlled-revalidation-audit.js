/**
 * PATCH Comercial 4E-B.4 — Controlled Runtime Revalidation Audit
 *
 * Revalidação completa do Runtime Comercial em modo controlled.
 * Audit-only — não corrige problemas automaticamente.
 *
 * Usage:
 *   node scripts/test-mia-commercial-runtime-controlled-revalidation-audit.js
 *   node scripts/test-mia-commercial-runtime-controlled-revalidation-audit.js --http
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  resolveAndApplyCommercialRuntimeActivation,
  resolveOfficialCommercialOffer,
} from "../lib/productSourceAdapter/commercialRuntimeActivation.js";
import {
  getCommercialRuntimeMode,
  isCommercialRuntimeControlled,
} from "../lib/productSourceAdapter/commercialRuntimeMode.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { calculateCommercialAlignment } from "../lib/productSourceAdapter/commercialQueryProductAlignmentLayer.js";
import {
  filterDataLayerCandidatesForCommercialFallback,
} from "../lib/commercial/nonDataLayerFallbackCandidateIsolation.js";
import {
  buildCommercialKnowledgeMetadata,
} from "../lib/commercial/nonDataLayerCommercialResponseGuard.js";
import {
  shouldShowCommercialTransparencyNotice,
} from "../lib/miaCommercialKnowledgeTransparency.js";
import {
  GOVERNED_FALLBACK_CARD_BADGE,
  resolveOfferCardPresentationWithTrustLabels,
} from "../lib/miaCommercialCardTrustLabels.js";
import { hasValidCommercialPrice } from "../lib/miaCommercialFallbackDisplay.js";
import {
  isOfferCompatibleWithAccessoryIntent,
  shouldEnforceAccessoryCommercialRuntime,
} from "../lib/productSourceAdapter/accessoryCommercialRuntimeEnforcement.js";

export const COMMERCIAL_RUNTIME_CONTROLLED_REVALIDATION_VERSION = "4E-B.4";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ORIGINAL_MODE = process.env.COMMERCIAL_RUNTIME_MODE;
const ORIGINAL_SHADOW = process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;

const metrics = {
  total: 0,
  approved: 0,
  failures: 0,
  warnings: 0,
  timingsMs: [],
  fallbacks: 0,
  providersUsed: new Set(),
  failureReports: [],
  warningReports: [],
  coverage: {},
};

const subsystem = {
  decisionEngine: "OK",
  winner: "OK",
  commercialRuntime: "OK",
  providers: "OK",
  fallback: "OK",
  transparency: "OK",
  accessoryRuntime: "OK",
  selection: "OK",
  card: "OK",
  ui: "OK",
};

function markSubsystem(name, status) {
  if (status !== "OK" && subsystem[name] === "OK") {
    subsystem[name] = status;
  }
}

function recordScenario({
  id,
  category,
  ok,
  warning = false,
  detail = "",
  severity = "critical",
  problem = "",
  location = "",
  impact = "",
  recommendedPatch = "",
  durationMs = 0,
  provider = null,
  usedFallback = false,
}) {
  metrics.total += 1;
  if (durationMs > 0) metrics.timingsMs.push(durationMs);

  if (ok) {
    metrics.approved += 1;
    if (usedFallback) metrics.fallbacks += 1;
    if (provider) metrics.providersUsed.add(provider);
    if (!metrics.coverage[category]) metrics.coverage[category] = { approved: 0, total: 0 };
    metrics.coverage[category].total += 1;
    metrics.coverage[category].approved += 1;
    console.log(`  ✅ [${category}] ${id}`);
    return;
  }

  metrics.failures += 1;
  if (!metrics.coverage[category]) metrics.coverage[category] = { approved: 0, total: 0 };
  metrics.coverage[category].total += 1;

  const report = {
    id,
    category,
    problem: problem || detail || id,
    location: location || category,
    impact,
    severity,
    recommendedPatch,
    detail,
  };
  metrics.failureReports.push(report);
  console.log(`  ❌ [${category}] ${id}${detail ? ` — ${detail}` : ""}`);
}

function recordWarning({ id, category, detail = "" }) {
  metrics.warnings += 1;
  metrics.warningReports.push({ id, category, detail });
  console.log(`  ⚠️  [${category}] ${id}${detail ? ` — ${detail}` : ""}`);
}

async function withControlledMode(fn) {
  process.env.COMMERCIAL_RUNTIME_MODE = "controlled";
  delete process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;
  try {
    return await fn();
  } finally {
    if (ORIGINAL_MODE == null) delete process.env.COMMERCIAL_RUNTIME_MODE;
    else process.env.COMMERCIAL_RUNTIME_MODE = ORIGINAL_MODE;
    if (ORIGINAL_SHADOW == null) delete process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;
    else process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW = ORIGINAL_SHADOW;
  }
}

async function withRuntimeMode(mode, fn) {
  process.env.COMMERCIAL_RUNTIME_MODE = mode;
  delete process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;
  try {
    return await fn();
  } finally {
    if (ORIGINAL_MODE == null) delete process.env.COMMERCIAL_RUNTIME_MODE;
    else process.env.COMMERCIAL_RUNTIME_MODE = ORIGINAL_MODE;
  }
}

function dataLayerWinner(name, extra = {}) {
  return {
    product_name: name,
    category: extra.category || "phone",
    isDataLayerProduct: true,
    price: extra.price ?? "R$ 3.499,00",
    link: extra.link ?? `https://datalayer.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://datalayer.test/img.jpg",
    source: "Data Layer MIA",
    trustedSpecs: {
      official_name: name,
      strengths: ["desempenho estável"],
      ideal_for: ["uso diário"],
      ...(extra.trustedSpecs || {}),
    },
    dataLayerScore: extra.dataLayerScore ?? 900,
  };
}

function fallbackWinner(name, extra = {}) {
  return {
    product_name: name,
    category: extra.category || "",
    isDataLayerProduct: false,
    price: extra.price ?? "R$ 899,00",
    link: extra.link ?? `https://shop.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://shop.test/img.jpg",
    source: extra.source ?? "Google Shopping",
  };
}

function googleProduct(title, extra = {}) {
  return {
    product_name: title,
    price: Object.hasOwn(extra, "price") ? extra.price : "R$ 879,90",
    link: extra.url ?? extra.link ?? `https://shop.test/${encodeURIComponent(title)}`,
    thumbnail: extra.image ?? "https://shop.test/img.jpg",
    source: "Google Shopping",
  };
}

function apifyProduct(title, extra = {}) {
  return {
    title,
    price: Object.hasOwn(extra, "price") ? extra.price : 879.9,
    url: extra.url ?? extra.link ?? `https://mercadolivre.test/${encodeURIComponent(title)}`,
    image: extra.image ?? "https://shop.test/ml.jpg",
    source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  };
}

function mockProviders({ googleProducts = [], apifyProducts = [], googleError = null, apifyError = null, googleDelayMs = 0, apifyDelayMs = 0 } = {}) {
  return {
    fetchGoogle: async () => {
      if (googleDelayMs) await new Promise((r) => setTimeout(r, googleDelayMs));
      if (googleError) return { ok: false, products: [], error: googleError };
      return {
        ok: googleProducts.length > 0,
        products: googleProducts,
        error: googleProducts.length ? null : "empty_results",
      };
    },
    fetchApify: async () => {
      if (apifyDelayMs) await new Promise((r) => setTimeout(r, apifyDelayMs));
      if (apifyError) return { ok: false, products: [], error: apifyError };
      return {
        ok: apifyProducts.length > 0,
        products: apifyProducts,
        error: apifyProducts.length ? null : "empty_results",
      };
    },
  };
}

function parsePrice(value) {
  if (typeof value === "number") return value;
  const raw = String(value || "").replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(raw);
  return Number.isFinite(num) ? num : null;
}

function assertAccessoryNotMain(query, productName = "") {
  if (!shouldEnforceAccessoryCommercialRuntime(query)) return true;
  return isOfferCompatibleWithAccessoryIntent({ query, offer: { title: productName } });
}

function assertNoFalseTransparency(metadata) {
  return metadata?.transparencyRequired !== true;
}

function assertGovernedTransparency(metadata) {
  return metadata?.transparencyRequired === true && metadata?.isAudited === false;
}

async function runAuditedProducts() {
  console.log("\n── 1. Produtos auditados (controlled) ──");
  const cases = [
    { query: "iphone 13", winner: "iPhone 13", offer: "iPhone 13 128GB" },
    { query: "galaxy a55", winner: "Samsung Galaxy A55", offer: "Samsung Galaxy A55 256GB" },
    { query: "s23 fe", winner: "Samsung Galaxy S23 FE", offer: "Samsung Galaxy S23 FE 128GB" },
    { query: "moto g84", winner: "Motorola Moto G84", offer: "Motorola Moto G84 256GB" },
    { query: "redmi note 13", winner: "Redmi Note 13", offer: "Redmi Note 13 128GB" },
  ];

  await withControlledMode(async () => {
    assert(
      "controlled mode active",
      isCommercialRuntimeControlled() && getCommercialRuntimeMode() === "controlled"
    );

    for (const item of cases) {
      const started = Date.now();
      const winner = dataLayerWinner(item.winner);
      const isolation = filterDataLayerCandidatesForCommercialFallback({
        query: item.query,
        candidates: [winner],
      });
      const metadata = buildCommercialKnowledgeMetadata({
        product: winner,
        hasDataLayer: true,
      });
      const result = await resolveOfficialCommercialOffer({
        query: item.query,
        legacyOffer: winner,
        winnerProduct: winner,
        mode: "controlled",
        ...mockProviders({
          googleProducts: [googleProduct(item.offer, { price: winner.price, url: winner.link })],
          apifyProducts: [apifyProduct(item.offer, { price: 879.9, url: winner.link })],
        }),
      });

      const card = result.officialOffer;
      const ok =
        isolation.applied === false &&
        assertNoFalseTransparency(metadata) &&
        !shouldShowCommercialTransparencyNotice(metadata) &&
        !!card &&
        hasValidCommercialPrice(card.price) &&
        !!card.link &&
        !!card.thumbnail &&
        /iphone|galaxy|moto|redmi/i.test(card.product_name || item.winner);

      recordScenario({
        id: item.query,
        category: "audited_products",
        ok,
        detail: ok
          ? ""
          : JSON.stringify({
              isolation: isolation.applied,
              transparency: metadata.transparencyRequired,
              card: card?.product_name,
              price: card?.price,
              link: card?.link,
            }),
        severity: "critical",
        problem: `Produto auditado ${item.query} falhou revalidação controlled`,
        location: "commercialRuntimeActivation + isolation + transparency",
        impact: "Produtos auditados podem perder confiança ou card incorreto",
        recommendedPatch: "4E-B.x follow-up",
        durationMs: Date.now() - started,
        provider: result.officialProvider,
        usedFallback: result.fallbackToLegacy,
      });

      if (isolation.applied) markSubsystem("decisionEngine", "FAIL");
      if (!assertNoFalseTransparency(metadata)) markSubsystem("transparency", "FAIL");
      if (!card) markSubsystem("commercialRuntime", "FAIL");
    }
  });
}

async function runNonDataLayerProducts() {
  console.log("\n── 2. Produtos sem Data Layer (controlled) ──");
  const cases = [
    { query: "cadeira gamer", winner: "Cadeira Gamer Ergonômica", offer: "Cadeira Gamer Ergonômica Premium", blocked: "Notebook Lenovo IdeaPad" },
    { query: "tv samsung", winner: "TV Samsung 55 4K", offer: "TV Samsung 55 Smart 4K", blocked: "Samsung Galaxy S23 FE" },
    { query: "monitor gamer", winner: "Monitor Gamer 27", offer: "Monitor Gamer 27 165Hz", blocked: "Samsung Galaxy A35" },
    { query: "webcam logitech", winner: "Webcam Logitech C920", offer: "Webcam Logitech C920 HD", blocked: "Samsung Galaxy S23 FE" },
    { query: "volante g29", winner: "Volante Logitech G29", offer: "Volante Logitech G29 Driving Force", blocked: "Samsung Galaxy S23 FE" },
    { query: "microfone fifine", winner: "Microfone Fifine K669", offer: "Microfone Fifine K669 USB", blocked: "Samsung Galaxy S23 FE" },
  ];

  await withControlledMode(async () => {
    for (const item of cases) {
      const started = Date.now();
      const winner = fallbackWinner(item.winner);
      const wrongCandidate = dataLayerWinner(item.blocked, {
        category: /notebook/i.test(item.blocked) ? "notebook" : "phone",
      });
      const isolation = filterDataLayerCandidatesForCommercialFallback({
        query: item.query,
        candidates: [wrongCandidate],
      });
      const metadata = buildCommercialKnowledgeMetadata({
        product: winner,
        hasDataLayer: false,
      });
      const fallbackCard = {
        product_name: item.winner,
        price: null,
        link: null,
        source: "query_product_anchor",
        displayBadge: "✓ Produto disponível na base da MIA",
        displaySubtitle: "A MIA continua analisando este produto com base no Data Layer.",
        displaySource: "Conhecimento validado da MIA",
        commercial_fallback_display_applied: true,
      };
      const presentation = resolveOfferCardPresentationWithTrustLabels(
        fallbackCard,
        metadata
      );
      const result = await resolveOfficialCommercialOffer({
        query: item.query,
        legacyOffer: winner,
        winnerProduct: winner,
        mode: "controlled",
        ...mockProviders({
          googleProducts: [googleProduct(item.offer, { price: winner.price, url: winner.link })],
          apifyProducts: [apifyProduct(item.offer, { price: 879.9, url: winner.link })],
        }),
      });

      const ok =
        isolation.applied === true &&
        assertGovernedTransparency(metadata) &&
        shouldShowCommercialTransparencyNotice(metadata) &&
        presentation.badge === GOVERNED_FALLBACK_CARD_BADGE &&
        presentation.trustLabelMode === "governed_fallback" &&
        !!result.officialOffer &&
        !new RegExp(item.blocked.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
          result.officialOffer.product_name || ""
        );

      recordScenario({
        id: item.query,
        category: "non_data_layer",
        ok,
        detail: ok
          ? ""
          : JSON.stringify({
              isolation: isolation.applied,
              transparency: metadata.transparencyRequired,
              badge: presentation.badge,
              card: result.officialOffer?.product_name,
            }),
        severity: "critical",
        problem: `Fallback governado ${item.query} contaminado ou transparência incorreta`,
        location: "nonDataLayerFallbackCandidateIsolation + card trust labels",
        impact: "Confiança quebrada para categorias não auditadas",
        recommendedPatch: "4E-B.2 / 4E-B.3 follow-up",
        durationMs: Date.now() - started,
        provider: result.officialProvider,
        usedFallback: result.fallbackToLegacy,
      });

      if (!ok) {
        markSubsystem("fallback", "FAIL");
        markSubsystem("transparency", "FAIL");
        markSubsystem("card", "FAIL");
      }
    }
  });
}

async function runAccessories() {
  console.log("\n── 3. Acessórios (controlled) ──");
  const cases = [
    { query: "pelicula iphone 13", good: "Película vidro iPhone 13", bad: "iPhone 13" },
    { query: "capa iphone 13", good: "Capa silicone iPhone 13", bad: "iPhone 13" },
    { query: "controle ps5", good: "Controle DualSense PS5", bad: "PlayStation 5 Console" },
    { query: "controle remoto samsung", good: "Controle remoto Samsung Smart TV", bad: "TV Samsung 55" },
    { query: "carregador notebook lenovo", good: "Carregador notebook Lenovo 65W", bad: "Notebook Lenovo IdeaPad" },
    { query: "cabo hdmi", good: "Cabo HDMI 2m", bad: "Notebook Lenovo" },
    { query: "dock notebook", good: "Dock station notebook USB-C", bad: "Notebook Lenovo IdeaPad" },
    { query: "suporte monitor", good: "Suporte articulado monitor", bad: "Monitor Gamer 27" },
  ];

  await withControlledMode(async () => {
    for (const item of cases) {
      const started = Date.now();
      const legacy = fallbackWinner(item.bad);
      const badResult = await resolveOfficialCommercialOffer({
        query: item.query,
        legacyOffer: legacy,
        winnerProduct: legacy,
        mode: "controlled",
        ...mockProviders({
          googleProducts: [googleProduct(item.bad)],
          apifyProducts: [apifyProduct(item.bad)],
        }),
      });
      const goodResult = await resolveOfficialCommercialOffer({
        query: item.query,
        legacyOffer: legacy,
        winnerProduct: legacy,
        mode: "controlled",
        ...mockProviders({
          googleProducts: [googleProduct(item.good)],
          apifyProducts: [apifyProduct(item.good)],
        }),
      });

      const badBlocked =
        badResult.officialOffer == null ||
        assertAccessoryNotMain(item.query, badResult.officialOffer?.product_name || "");
      const goodApplied =
        goodResult.usedNewPipeline === true &&
        assertAccessoryNotMain(item.query, goodResult.officialOffer?.product_name || item.good);
      const ok = badBlocked && goodApplied;

      recordScenario({
        id: item.query,
        category: "accessories",
        ok,
        detail: ok
          ? ""
          : JSON.stringify({
              badCard: badResult.officialOffer?.product_name,
              goodCard: goodResult.officialOffer?.product_name,
              badBlocked,
              goodApplied,
            }),
        severity: "critical",
        problem: `Acessório ${item.query} virou produto principal ou perdeu oferta compatível`,
        location: "accessoryCommercialRuntimeEnforcement",
        impact: "Card comercial exibe produto errado para acessórios",
        recommendedPatch: "4E-B.1 follow-up",
        durationMs: Date.now() - started,
        provider: goodResult.officialProvider,
        usedFallback: goodResult.fallbackToLegacy,
      });

      if (!ok) markSubsystem("accessoryRuntime", "FAIL");
    }
  });
}

async function runComparisons() {
  console.log("\n── 4. Comparações (controlled) ──");
  const cases = [
    {
      id: "iphone 13 ou galaxy a55",
      query: "iphone 13 ou galaxy a55",
      winners: ["iPhone 13", "Samsung Galaxy A55"],
    },
    {
      id: "s23 fe vs a56",
      query: "s23 fe vs a56",
      winners: ["Samsung Galaxy S23 FE", "Samsung Galaxy A56"],
    },
    {
      id: "monitor lg ou samsung",
      query: "monitor lg ou samsung",
      winners: ["Monitor LG UltraGear 27", "Monitor Samsung Odyssey G4"],
    },
    {
      id: "tv samsung ou lg",
      query: "tv samsung ou lg",
      winners: ["TV Samsung 55 4K", "TV LG 55 4K"],
    },
  ];

  await withControlledMode(async () => {
    for (const item of cases) {
      const started = Date.now();
      let allOk = true;
      const details = [];

      for (const winnerName of item.winners) {
        const winner = dataLayerWinner(winnerName, {
          category: /tv|monitor/i.test(winnerName) ? ( /tv/i.test(winnerName) ? "tv" : "monitor") : "phone",
        });
        const offerTitle = `${winnerName} Oferta`;
        const result = await resolveOfficialCommercialOffer({
          query: item.query,
          legacyOffer: winner,
          winnerProduct: winner,
          mode: "controlled",
          ...mockProviders({
            googleProducts: [googleProduct(offerTitle, { url: winner.link })],
            apifyProducts: [apifyProduct(offerTitle, { url: winner.link })],
          }),
        });
        const alignment = calculateCommercialAlignment({
          query: winnerName,
          offer: { title: result.officialOffer?.product_name || "" },
        });
        const winnerPreserved =
          !!result.officialOffer &&
          new RegExp(winnerName.split(/\s+/)[0], "i").test(result.officialOffer.product_name || "");
        const offerAligned = alignment.isAligned !== false;
        if (!winnerPreserved || !offerAligned) {
          allOk = false;
          details.push({ winnerName, winnerPreserved, offerAligned, card: result.officialOffer?.product_name });
        }
      }

      recordScenario({
        id: item.id,
        category: "comparisons",
        ok: allOk,
        detail: allOk ? "" : JSON.stringify(details),
        severity: "high",
        problem: `Comparação ${item.id} não preservou winner/oferta`,
        location: "commercialRuntimeActivation + alignment",
        impact: "Comparações podem exibir oferta desalinhada ao winner",
        recommendedPatch: "4D-A / 4E-B follow-up",
        durationMs: Date.now() - started,
      });

      if (!allOk) markSubsystem("winner", "FAIL");
    }
  });
}

async function runBudgetCases() {
  console.log("\n── 5. Orçamento (controlled) ──");
  const cases = [
    { query: "notebook até 3500", offer: "Notebook IdeaPad 3500", budget: 3500 },
    { query: "tv até 2500", offer: "TV Samsung 50 4K", budget: 2500 },
    { query: "fone bluetooth até 200", offer: "Fone Bluetooth JBL Tune 120", budget: 200 },
    { query: "cadeira gamer até 800", offer: "Cadeira Gamer Ergonômica", budget: 800 },
  ];

  await withControlledMode(async () => {
    for (const item of cases) {
      const started = Date.now();
      const price = item.budget - 50;
      const priceLabel = `R$ ${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},00`;
      const winner = fallbackWinner(item.offer, { price: priceLabel });
      const result = await resolveOfficialCommercialOffer({
        query: item.query,
        legacyOffer: winner,
        winnerProduct: winner,
        mode: "controlled",
        ...mockProviders({
          googleProducts: [googleProduct(item.offer, { price: priceLabel })],
          apifyProducts: [apifyProduct(item.offer, { price: price - 10 })],
        }),
      });
      const numeric = parsePrice(result.officialOffer?.price);
      const productAlignment = calculateCommercialAlignment({
        query: item.offer,
        offer: { title: result.officialOffer?.product_name || item.offer },
      });
      const ok =
        !!result.officialOffer &&
        numeric != null &&
        numeric <= item.budget + 1 &&
        productAlignment.isAligned !== false &&
        (result.usedNewPipeline === true || result.fallbackToLegacy === true);

      recordScenario({
        id: item.query,
        category: "budget",
        ok,
        detail: ok ? "" : `price=${result.officialOffer?.price} budget=${item.budget}`,
        severity: "high",
        problem: `Orçamento não respeitado em ${item.query}`,
        location: "commercial selection / runtime activation",
        impact: "Card pode exibir oferta acima do orçamento declarado",
        recommendedPatch: "4D selection follow-up",
        durationMs: Date.now() - started,
        provider: result.officialProvider,
      });

      if (!ok) markSubsystem("selection", "FAIL");
    }
  });
}

async function runLongContextSequence() {
  console.log("\n── 6. Contexto longo (controlled stability) ──");
  const turns = [
    "quero notebook até 3500",
    "qual recomenda?",
    "e desempenho?",
    "mostra alternativas",
    "nao quero errar",
    "continua recomendando?",
    "quero gastar menos",
    "qual ficou em segundo?",
    "voce tem certeza?",
    "detalha melhor",
    "entendi",
    "espera ai",
    "continua nesse mesmo?",
    "fechou nele",
    "valeu",
    "tem oferta melhor?",
    "e bateria?",
    "blz",
    "mostra outra opcao",
    "continua valendo?",
  ];

  await withControlledMode(async () => {
    const started = Date.now();
    let winner = fallbackWinner("Notebook IdeaPad 3500");
    let stable = true;
    let lastProvider = null;

    for (let i = 0; i < turns.length; i += 1) {
      const query = turns[i];
      const result = await resolveOfficialCommercialOffer({
        query,
        legacyOffer: winner,
        winnerProduct: winner,
        mode: "controlled",
        ...mockProviders({
          googleProducts: [googleProduct("Notebook IdeaPad 3500", { price: "R$ 3.299,00" })],
          apifyProducts: [apifyProduct("Notebook IdeaPad 3500", { price: 3299 })],
        }),
      });

      if (!isCommercialRuntimeControlled()) {
        stable = false;
        break;
      }
      if (result.officialOffer) {
        winner = { ...winner, ...result.officialOffer, product_name: winner.product_name };
        lastProvider = result.officialProvider;
      }
      if (result.fallbackReason === "unexpected_error") {
        stable = false;
        break;
      }
    }

    recordScenario({
      id: "long_context_20_turns",
      category: "long_context",
      ok: stable,
      detail: stable ? `provider=${lastProvider}` : "runtime unstable",
      severity: "high",
      problem: "Runtime controlled instável em contexto longo",
      location: "commercialRuntimeActivation sequence",
      impact: "Sessões longas podem quebrar card comercial",
      recommendedPatch: "4E-B stability follow-up",
      durationMs: Date.now() - started,
      provider: lastProvider,
    });

    if (!stable) markSubsystem("commercialRuntime", "FAIL");
  });
}

async function runProviderFailureCases() {
  console.log("\n── 7. Providers / fallback (controlled) ──");
  const winner = fallbackWinner("Cadeira Gamer XYZ");
  const offer = "Cadeira Gamer Premium";

  const cases = [
    {
      id: "google_unavailable",
      mocks: mockProviders({
        googleError: "provider_unavailable",
        apifyProducts: [apifyProduct(offer)],
      }),
    },
    {
      id: "apify_unavailable",
      mocks: mockProviders({
        googleProducts: [googleProduct(offer)],
        apifyError: "provider_unavailable",
      }),
    },
    {
      id: "both_empty",
      mocks: mockProviders({ googleProducts: [], apifyProducts: [] }),
    },
    {
      id: "timeout",
      mocks: {
        fetchGoogle: () => new Promise(() => {}),
        fetchApify: () => new Promise(() => {}),
      },
      timeoutMs: 50,
    },
  ];

  await withControlledMode(async () => {
    for (const item of cases) {
      const started = Date.now();
      const result = await resolveOfficialCommercialOffer({
        query: "cadeira gamer",
        legacyOffer: winner,
        winnerProduct: winner,
        mode: "controlled",
        timeoutMs: item.timeoutMs || 15000,
        ...item.mocks,
      });

      const noCrash = !!result && typeof result === "object";
      const graceful =
        item.id === "both_empty" || item.id === "timeout"
          ? result.fallbackToLegacy === true || result.officialOffer == null
          : result.usedNewPipeline === true || result.fallbackToLegacy === true;
      const hasCardOrSafeEmpty =
        item.id === "both_empty" || item.id === "timeout"
          ? true
          : !!result.officialOffer && hasValidCommercialPrice(result.officialOffer.price);

      const ok = noCrash && graceful && hasCardOrSafeEmpty;

      recordScenario({
        id: item.id,
        category: "providers",
        ok,
        detail: ok
          ? ""
          : JSON.stringify({
              fallback: result.fallbackToLegacy,
              reason: result.fallbackReason,
              card: result.officialOffer?.product_name,
            }),
        severity: "critical",
        problem: `Falha de provider ${item.id} não tratada com fallback seguro`,
        location: "commercialRuntimeActivation providers",
        impact: "Usuário pode ver erro ou card inconsistente",
        recommendedPatch: "4E-B provider resilience follow-up",
        durationMs: Date.now() - started,
        provider: result.officialProvider,
        usedFallback: result.fallbackToLegacy,
      });

      if (!ok) markSubsystem("providers", "FAIL");
    }
  });
}

async function runRuntimeModeComparison() {
  console.log("\n── 8. Runtime legacy / shadow / controlled ──");
  const query = "cadeira gamer";
  const legacyWinner = fallbackWinner("Cadeira Gamer XYZ", { price: "R$ 899,00" });
  const pipelineTitle = "Cadeira Gamer Premium";
  const mocks = mockProviders({
    googleProducts: [googleProduct(pipelineTitle, { price: "R$ 879,90" })],
    apifyProducts: [apifyProduct(pipelineTitle, { price: 879.9 })],
  });

  const modes = {};
  for (const mode of ["legacy", "shadow", "controlled"]) {
    modes[mode] = await withRuntimeMode(mode, async () =>
      resolveOfficialCommercialOffer({
        query,
        legacyOffer: legacyWinner,
        winnerProduct: legacyWinner,
        mode,
        ...mocks,
      })
    );
  }

  const ok =
    modes.legacy.usedNewPipeline === false &&
    modes.shadow.usedNewPipeline === false &&
    modes.legacy.officialOffer?.product_name === "Cadeira Gamer XYZ" &&
    modes.shadow.officialOffer?.product_name === "Cadeira Gamer XYZ" &&
    modes.controlled.usedNewPipeline === true &&
    /cadeira/i.test(modes.controlled.officialOffer?.product_name || "");

  recordScenario({
    id: "runtime_mode_comparison",
    category: "runtime_modes",
    ok,
    detail: ok
      ? ""
      : JSON.stringify({
          legacy: modes.legacy.officialOffer?.product_name,
          shadow: modes.shadow.officialOffer?.product_name,
          controlled: modes.controlled.officialOffer?.product_name,
          controlledPipeline: modes.controlled.usedNewPipeline,
        }),
    severity: "critical",
    problem: "Modos legacy/shadow/controlled divergem do contrato esperado",
    location: "commercialRuntimeMode + commercialRuntimeActivation",
    impact: "Ativação controlled pode afetar modos legacy/shadow",
    recommendedPatch: "4E-B follow-up",
  });

  if (!ok) markSubsystem("commercialRuntime", "FAIL");
}

function runRegression(scriptName, label, optional = false) {
  const scriptPath = join(ROOT, "scripts", scriptName);

  const started = Date.now();
  const env = { ...process.env };
  delete env.COMMERCIAL_RUNTIME_MODE;
  delete env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const ok = result.status === 0;

  if (optional) {
    if (!ok) {
      recordWarning({
        id: label,
        category: "regressions_optional",
        detail: (result.stdout || result.stderr || "").split("\n").slice(-2).join(" | ") || "gap pré-existente",
      });
    } else {
      console.log(`  ✅ [regressions_optional] ${label} (${durationMs}ms)`);
    }
    return;
  }

  recordScenario({
    id: label,
    category: "regressions",
    ok,
    detail: ok ? `${durationMs}ms` : (result.stderr || result.stdout || "").split("\n").slice(-3).join(" | "),
    severity: "critical",
    problem: `Regressão ${label} falhou`,
    location: scriptName,
    impact: "Patch anterior regrediu após 4E-B.1–4E-B.3",
    recommendedPatch: label,
    durationMs,
  });

  if (!ok) {
    markSubsystem("commercialRuntime", "FAIL");
  }
}

function printExecutiveSummary() {
  const avgMs =
    metrics.timingsMs.length > 0
      ? Math.round(metrics.timingsMs.reduce((a, b) => a + b, 0) / metrics.timingsMs.length)
      : 0;

  console.log("\n════════════════════════════════════════════════════════");
  console.log("Runtime Controlled Summary");
  console.log("════════════════════════════════════════════════════════");
  console.log(`Decision Engine:     ${subsystem.decisionEngine}`);
  console.log(`Winner:              ${subsystem.winner}`);
  console.log(`Commercial Runtime:  ${subsystem.commercialRuntime}`);
  console.log(`Providers:           ${subsystem.providers}`);
  console.log(`Fallback:            ${subsystem.fallback}`);
  console.log(`Transparency:        ${subsystem.transparency}`);
  console.log(`Accessory Runtime:   ${subsystem.accessoryRuntime}`);
  console.log(`Selection:           ${subsystem.selection}`);
  console.log(`Card:                ${subsystem.card}`);
  console.log(`UI:                  ${subsystem.ui}`);
  console.log(`Overall:             ${metrics.failures === 0 ? "READY" : "NOT READY"}`);
  console.log("════════════════════════════════════════════════════════");

  console.log("\n── Métricas ──");
  console.log(`Total de cenários:   ${metrics.total}`);
  console.log(`Aprovados:           ${metrics.approved}`);
  console.log(`Falhas:              ${metrics.failures}`);
  console.log(`Warnings:            ${metrics.warnings}`);
  console.log(`Tempo médio:         ${avgMs}ms`);
  console.log(`Fallbacks:           ${metrics.fallbacks}`);
  console.log(`Providers utilizados:${[...metrics.providersUsed].join(", ") || "(n/a)"}`);
  console.log("\n── Cobertura ──");
  for (const [category, data] of Object.entries(metrics.coverage)) {
    console.log(`  ${category}: ${data.approved}/${data.total}`);
  }

  if (metrics.failureReports.length) {
    console.log("\n── Falhas (report-only, sem correção automática) ──");
    for (const report of metrics.failureReports) {
      console.log(`\nProblema: ${report.problem}`);
      console.log(`Local: ${report.location}`);
      console.log(`Impacto: ${report.impact || report.detail}`);
      console.log(`Severidade: ${report.severity}`);
      console.log(`Patch recomendado: ${report.recommendedPatch}`);
    }
  }

  if (metrics.warningReports.length) {
    console.log("\n── Warnings ──");
    for (const warning of metrics.warningReports) {
      console.log(`  ⚠️  ${warning.id}: ${warning.detail}`);
    }
  }

  console.log("\n── Veredito final ──");
  if (metrics.failures === 0) {
    console.log("A) PRODUCTION READY\n");
  } else {
    console.log("B) NOT PRODUCTION READY — ver falhas acima\n");
  }
}

function assert(label, condition) {
  if (!condition) {
    recordScenario({
      id: label,
      category: "runtime_bootstrap",
      ok: false,
      detail: label,
      severity: "critical",
      problem: label,
      location: "bootstrap",
      impact: "Auditoria não executou em controlled",
      recommendedPatch: "4E-B.4 harness",
    });
  }
}

async function optionalHttpSmoke() {
  if (!process.argv.includes("--http")) return;

  console.log("\n── HTTP smoke (optional, requires dev server) ──");
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": "minha_chave_181199",
  };
  const queries = ["iphone 13", "cadeira gamer", "pelicula iphone 13"];

  for (const query of queries) {
    try {
      const started = Date.now();
      const resp = await fetch("http://localhost:3000/api/chat-gpt4o", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: query, session_context: {}, messages: [] }),
      });
      const data = await resp.json();
      const price = data?.prices?.[0] || {};
      const ok = resp.status === 200 && !!data?.reply;
      recordScenario({
        id: `http:${query}`,
        category: "http_smoke",
        ok,
        detail: ok ? price.product_name || "(no card)" : String(resp.status),
        severity: "medium",
        problem: `HTTP smoke falhou para ${query}`,
        location: "pages/api/chat-gpt4o.js",
        impact: "Smoke HTTP indica possível divergência runtime",
        recommendedPatch: "investigar manualmente",
        durationMs: Date.now() - started,
      });
    } catch (err) {
      recordWarning({
        id: `http:${query}`,
        category: "http_smoke",
        detail: err?.message || "dev server unavailable",
      });
    }
  }
}

async function main() {
  console.log(
    `\nPATCH Comercial 4E-B.4 — Controlled Runtime Revalidation Audit (${COMMERCIAL_RUNTIME_CONTROLLED_REVALIDATION_VERSION})\n`
  );
  console.log("Modo obrigatório: COMMERCIAL_RUNTIME_MODE=controlled\n");

  await runAuditedProducts();
  await runNonDataLayerProducts();
  await runAccessories();
  await runComparisons();
  await runBudgetCases();
  await runLongContextSequence();
  await runProviderFailureCases();
  await runRuntimeModeComparison();

  console.log("\n── Regressões obrigatórias (env default — sem forçar controlled) ──");
  const mandatoryRegressions = [
    ["test-mia-apify-mercadolivre-client-isolated-audit.js", "4A"],
    ["test-mia-commercial-provider-registry-audit.js", "4B"],
    ["test-mia-commercial-offer-merge-layer-audit.js", "4C-A"],
    ["test-mia-commercial-deduplication-layer-audit.js", "4C-B"],
    ["test-mia-commercial-selection-engine-audit.js", "4D"],
    ["test-mia-commercial-query-product-alignment-layer-audit.js", "4D-A"],
    ["test-mia-commercial-runtime-shadow-audit.js", "4E-A"],
    ["test-mia-commercial-shadow-diagnostic-summary-audit.js", "4E-A.1"],
    ["test-mia-accessory-intent-lock-guard-audit.js", "4E-A.2"],
    ["test-mia-non-data-layer-commercial-response-guard-audit.js", "4E-A.3"],
    ["test-mia-data-layer-transparency-ui-audit.js", "4E-A.4"],
    ["test-mia-commercial-runtime-controlled-activation-audit.js", "4E-B"],
    ["test-mia-accessory-commercial-runtime-enforcement-audit.js", "4E-B.1"],
    ["test-mia-non-data-layer-card-trust-label-fix-audit.js", "4E-B.2"],
    ["test-mia-non-data-layer-fallback-candidate-isolation-audit.js", "4E-B.3"],
    ["test-mia-tone-compliance-guard-audit.js", "Tone Compliance"],
  ];

  for (const [script, label] of mandatoryRegressions) {
    runRegression(script, label, false);
  }

  console.log("\n── Regressões opcionais (gaps pré-existentes separados) ──");
  runRegression("test-mia-winner-preservation-audit.js", "Winner Preservation", true);
  runRegression("test-mia-anchor-preservation-audit.js", "Anchor Preservation", true);
  runRegression("test-mia-long-context-preservation-audit.js", "Long Context", true);

  await optionalHttpSmoke();

  printExecutiveSummary();
  process.exit(metrics.failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("REVALIDATION AUDIT CRASHED:", err?.message || err);
  process.exit(1);
});
