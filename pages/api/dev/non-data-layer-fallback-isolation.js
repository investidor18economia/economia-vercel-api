/**
 * PATCH Comercial 4E-B.3 — DEV endpoint: Non-Data-Layer Fallback Candidate Isolation
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import {
  NON_DATA_LAYER_FALLBACK_CANDIDATE_ISOLATION_VERSION,
  assessDataLayerCandidateReliability,
  buildFallbackCandidateIsolationDevPayload,
  buildFallbackCandidateIsolationDiagnostics,
  detectNonDataLayerCommercialIntent,
  filterDataLayerCandidatesForCommercialFallback,
} from "../../../lib/commercial/nonDataLayerFallbackCandidateIsolation.js";

function isDevEndpointAllowed(req) {
  if (process.env.NODE_ENV !== "production") return true;

  const secret = String(process.env.DEV_API_SECRET || "").trim();
  if (!secret) return false;

  const provided = String(
    req.headers["x-dev-api-secret"] || req.query.secret || ""
  ).trim();

  return provided === secret;
}

function candidate(name, extra = {}) {
  return {
    product_name: name,
    category: extra.category || "",
    isDataLayerProduct: extra.isDataLayerProduct !== false,
    trustedSpecs: extra.trustedSpecs || {
      official_name: name,
      strengths: extra.strengths || ["desempenho estável"],
      ideal_for: extra.ideal_for || ["uso diário"],
    },
    dataLayerScore: extra.dataLayerScore ?? 420,
  };
}

function mockCandidatesForQuery(query = "") {
  const q = String(query || "").toLowerCase();

  if (/tv|televis/.test(q)) {
    return [
      candidate("Samsung Galaxy S23 FE", { category: "phone" }),
      candidate("Samsung Galaxy A55", { category: "phone" }),
    ];
  }

  if (/cadeira|chair/.test(q)) {
    return [candidate("Notebook Lenovo IdeaPad", { category: "notebook" })];
  }

  if (/webcam|volante|microfone|impressora/.test(q)) {
    return [
      candidate("Samsung Galaxy S23 FE", { category: "phone" }),
      candidate("Notebook Lenovo IdeaPad", { category: "notebook" }),
    ];
  }

  if (/iphone|galaxy|s23|moto g|redmi/.test(q)) {
    const name =
      /iphone 13/.test(q)
        ? "iPhone 13"
        : /galaxy a55/.test(q)
          ? "Samsung Galaxy A55"
          : /s23 fe/.test(q)
            ? "Samsung Galaxy S23 FE"
            : /moto g84/.test(q)
              ? "Motorola Moto G84"
              : /redmi note 13/.test(q)
                ? "Redmi Note 13"
                : /galaxy s24/.test(q)
                  ? "Samsung Galaxy S24"
                  : "Samsung Galaxy S23 FE";

    return [
      candidate(name, {
        category: "phone",
        trustedSpecs: {
          official_name: name,
          strengths: ["desempenho estável"],
          ideal_for: ["uso diário"],
        },
      }),
    ];
  }

  if (/pelicula|capa|controle|cabo|carregador/.test(q)) {
    if (/iphone|ps5|notebook|hdmi/.test(q)) {
      return [
        candidate(
          /iphone/.test(q)
            ? "iPhone 13"
            : /ps5/.test(q)
              ? "PlayStation 5 Console"
              : "Notebook Lenovo IdeaPad",
          { category: /iphone/.test(q) ? "phone" : /ps5/.test(q) ? "console" : "notebook" }
        ),
      ];
    }
  }

  return [];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isDevEndpointAllowed(req)) {
    return res.status(403).json({
      ok: false,
      error: "forbidden_in_production",
    });
  }

  const query = String(req.query.q || "").trim();
  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=tv%20samsung",
      version: NON_DATA_LAYER_FALLBACK_CANDIDATE_ISOLATION_VERSION,
    });
  }

  const categoryHint = String(req.query.categoryHint || "").trim();
  const mockCandidates = mockCandidatesForQuery(query);
  const isolation = filterDataLayerCandidatesForCommercialFallback({
    query,
    candidates: mockCandidates,
    categoryHint,
  });
  const diagnostics = buildFallbackCandidateIsolationDiagnostics(isolation);

  return res.status(200).json({
    ok: true,
    version: NON_DATA_LAYER_FALLBACK_CANDIDATE_ISOLATION_VERSION,
    query,
    commercialIntent: detectNonDataLayerCommercialIntent(query, { categoryHint }),
    candidateAssessments: mockCandidates.map((entry) => ({
      product_name: entry.product_name,
      assessment: assessDataLayerCandidateReliability({
        query,
        candidate: entry,
        commercialIntent: isolation.commercialIntent,
      }),
    })),
    isolation: buildFallbackCandidateIsolationDevPayload(diagnostics),
    diagnostics,
  });
}
