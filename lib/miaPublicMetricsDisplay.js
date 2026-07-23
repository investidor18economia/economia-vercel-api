/**
 * PATCH 11.2 — Public metrics display helpers (formatting only — no aggregation).
 * All values must come pre-aggregated from GET /api/executive-metrics.
 */

/**
 * @param {number|null|undefined} value
 * @param {{ suffix?: string, compact?: boolean }} [options]
 */
export function formatPublicMetricNumber(value, options = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (options.compact && n >= 1_000_000) {
    const millions = n / 1_000_000;
    return `${millions.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi${options.suffix ?? ""}`;
  }
  if (options.compact && n >= 10_000) {
    const thousands = n / 1_000;
    return `${Math.round(thousands).toLocaleString("pt-BR")} mil${options.suffix ?? ""}`;
  }
  const formatted = n.toLocaleString("pt-BR");
  return options.suffix ? `${formatted}${options.suffix}` : formatted;
}

/**
 * @param {number|null|undefined} value
 */
export function formatPublicMetricCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (n >= 1_000_000) {
    return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} milhão`;
  }
  if (n >= 1_000) {
    return `R$ ${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * @param {number|null|undefined} rate
 */
export function formatPublicMetricRate(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return "—";
  return `${(Number(rate) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Maps executive-metrics API payload to public page sections (display only).
 * @param {Record<string, unknown>|null|undefined} metrics
 */
export function mapExecutiveMetricsToPublicPage(metrics) {
  const platform = metrics?.platform || {};
  const recommendation = metrics?.recommendation || {};
  const commerce = metrics?.commerce || {};
  const alerts = metrics?.alerts || {};
  const savings = metrics?.savings || {};
  const system = metrics?.system || {};

  const windowDays = metrics?.reference_period_days ?? platform.window_days ?? 30;

  return {
    meta: {
      metrics_version: metrics?.metrics_version ?? null,
      computed_at: metrics?.computed_at ?? null,
      reference_period_days: windowDays,
      partial_errors: metrics?.partial_errors ?? [],
    },
    hero: {
      title: "Teilor em Números",
      subtitle:
        "Métricas agregadas e atualizadas automaticamente a partir de dados reais da plataforma — sem identificação de usuários.",
    },
    sections: {
      platform: {
        id: "plataforma",
        title: "Plataforma",
        cards: [
          {
            id: "conversations",
            title: "Conversas",
            value: platform.conversations,
            description: `Conversas distintas nos últimos ${windowDays} dias.`,
          },
          {
            id: "questions",
            title: "Perguntas respondidas",
            value: platform.questions,
            description: "Perguntas enviadas à MIA no período.",
          },
          {
            id: "sessions",
            title: "Sessões",
            value: platform.total_sessions,
            description: "Sessões iniciadas na plataforma.",
          },
          {
            id: "visitors",
            title: "Visitantes únicos",
            value: platform.unique_visitors,
            description: "Visitantes com atividade no período.",
          },
        ],
      },
      recommendation: {
        id: "recomendacoes",
        title: "Recomendações",
        cards: [
          {
            id: "recommendations_generated",
            title: "Recomendações geradas",
            value: recommendation.recommendations_generated,
            description: "Decisões comerciais observadas — não representa compras.",
          },
          {
            id: "runner_up",
            title: "Alternativas (runner-up)",
            value: recommendation.runner_up_usage,
            description: "Recomendações com alternativa secundária identificada.",
          },
          {
            id: "acceptance_rate",
            title: "Taxa de aceitação",
            value: recommendation.recommendation_acceptance_rate,
            format: "rate",
            description: "Sinais de aceitação sobre sinais totais — não é satisfação.",
          },
          {
            id: "rejection_rate",
            title: "Taxa de rejeição",
            value: recommendation.rejection_rate,
            format: "rate",
            description: "Sinais de rejeição ou refinamento observados.",
          },
        ],
      },
      commerce: {
        id: "inteligencia-comercial",
        title: "Inteligência comercial",
        cards: [
          {
            id: "offers",
            title: "Ofertas analisadas",
            value: commerce.offers_returned ?? commerce.offer_sets_generated,
            description: "Ofertas consolidadas pelo pipeline comercial.",
          },
          {
            id: "clicks",
            title: "Cliques em ofertas",
            value: commerce.offer_clicks,
            description: "Cliques observados — não representam compras.",
          },
          {
            id: "favorites",
            title: "Favoritos criados",
            value: commerce.favorite_count,
            description: "Produtos salvos para acompanhamento.",
          },
          {
            id: "alerts_active",
            title: "Alertas ativos",
            value: alerts.alerts_active,
            description: "Alertas de preço com status ativo.",
          },
        ],
      },
      savings: {
        id: "economia",
        title: "Economia",
        disclaimer:
          "Economia potencial identificada. Não representa economia efetivamente realizada.",
        cards: [
          {
            id: "potential_total",
            title: "Economia potencial identificada",
            value: savings.potential_savings_total,
            format: "currency",
            description: "Soma observacional de oportunidades — valor não verificado.",
          },
          {
            id: "opportunities",
            title: "Oportunidades encontradas",
            value: savings.opportunities_found,
            description: "Estimativas com economia potencial positiva.",
          },
        ],
      },
      system: {
        id: "sistema",
        title: "Sistema",
        cards: [
          {
            id: "analytics_version",
            title: "Versão dos Analytics",
            value: system.analytics_version,
            format: "text",
            description: "Versão observacional da camada de telemetria.",
          },
          {
            id: "last_update",
            title: "Última atualização",
            value: system.last_update ?? metrics?.computed_at,
            format: "datetime",
            description: "Timestamp da última consolidação de métricas.",
          },
          {
            id: "build_version",
            title: "Build",
            value: system.build_version,
            format: "text",
            description: "Identificador de deploy da plataforma.",
          },
        ],
      },
    },
  };
}

/** Forbidden substrings in rendered public page body (not SEO head metadata) */
export const PUBLIC_METRICS_FORBIDDEN_PATTERNS = [
  /visitor_id/i,
  /request_id/i,
  /decision_request_id/i,
  /conversation_id/i,
  /product_name/i,
  /query_text/i,
  /user_email/i,
  /@gmail/i,
];

/**
 * @param {string} htmlOrText
 * @param {{ stripHead?: boolean }} [options]
 */
export function scanPublicMetricsForbiddenContent(htmlOrText = "", options = {}) {
  let text = htmlOrText;
  if (options.stripHead !== false && /<head[\s>]/i.test(text)) {
    text = text.replace(/<head[\s\S]*?<\/head>/gi, "");
  }
  const hits = [];
  for (const pattern of PUBLIC_METRICS_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) hits.push(String(pattern));
  }
  return hits;
}
