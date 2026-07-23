# Analytics — Documentação Oficial

Pasta canônica do **Analytics Storage Schema v1** e do **Event Contract v1** — Teilor/MIA.

Documentação consolidada na **FASE 2 (PATCH 2.4)**. Nenhum documento desta pasta deve contradizer o contrato oficial em [`contracts/`](./contracts/).

---

## Índice

1. [Mapa oficial da documentação](#1-mapa-oficial-da-documentação)
2. [O que existe nesta pasta](#2-o-que-existe-nesta-pasta)
3. [Nomenclatura oficial](#3-nomenclatura-oficial)
4. [Qual documento consultar](#4-qual-documento-consultar)
5. [Ordem recomendada de leitura](#5-ordem-recomendada-de-leitura)
6. [Artefatos executáveis vs referência](#6-artefatos-executáveis-vs-referência)
7. [Infraestrutura relacionada](#7-infraestrutura-relacionada)

---

## 1. Mapa oficial da documentação

Fluxo de referência — cada documento aponta para os adjacentes:

```text
README.md (este arquivo)
    ↓
ANALYTICS_SCHEMA.md          ← Analytics Storage Schema v1 (estrutura física)
    ↓
contracts/EVENT_CONTRACT.md  ← Event Contract v1 (catálogo §7)
    ↓
contracts/EVENT_FIELD_SPECIFICATION.md
    ↓
contracts/EVENT_LIFECYCLE.md
    ↓
ANALYTICS_DATA_DICTIONARY.md ← colunas PostgreSQL
    ↓
ANALYTICS_TABLE_REFERENCE.md ← escritores / leitores
    ↓
SESSION_ID.md · VISITOR_ID.md · CONVERSATION_ID.md · AUTHENTICATED_IDENTITY.md · IDENTITY_LAYER.md · EXECUTIVE_METRICS.md · DASHBOARDS.md
    ↓
ANALYTICS_CHANGELOG.md
```

**Implementação (código, não duplicar na documentação):**

- Payloads: `lib/miaAnalyticsPayload.js` (PATCH 2.2)
- Identidade: `lib/analytics.js` — `getOrCreateAnalyticsVisitorId()` (PATCH 3.1), `createAnalyticsConversationId()` (PATCH 3.2); lifecycle em `MIAChat.jsx` (`conversationIdRef`); `getMiaSessionId()` (PATCH 1.1); auth headers (PATCH 3.3)
- Auth Analytics: `lib/miaAnalyticsAuth.js` (PATCH 3.3)
- Frontend: `lib/analytics.js` · Allowlist: `lib/miaAnalyticsAllowlist.js`
- Server-side: `lib/miaPriceAlertEmailAnalytics.js`

---

## 2. O que existe nesta pasta

### Event Contract v1 — FASE 2 (documentação principal de eventos)

| Arquivo | Descrição |
|---------|-----------|
| [contracts/README.md](./contracts/README.md) | Índice do Event Contract |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | **Contrato principal** — Event Contract v1 |
| [contracts/EVENT_FIELD_SPECIFICATION.md](./contracts/EVENT_FIELD_SPECIFICATION.md) | Campos top-level e chaves de `metadata` |
| [contracts/EVENT_LIFECYCLE.md](./contracts/EVENT_LIFECYCLE.md) | Ciclo de vida frontend → banco → dashboards |

### Analytics Storage Schema v1 — FASE 1

| Arquivo | Descrição |
|---------|-----------|
| [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) | Schema físico, arquitetura, índices, segurança |
| [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) | Dicionário das 17 colunas |
| [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md) | Quem grava/lê `analytics_events` |
| [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) | Histórico oficial de patches |

### Complementares (FASE 1, ainda vigentes)

| Arquivo | Descrição |
|---------|-----------|
| [SESSION_ID.md](./SESSION_ID.md) | Semântica de `session_id` (PATCH 1.1) |
| [VISITOR_ID.md](./VISITOR_ID.md) | Semântica de `visitor_id` (PATCH 3.1) |
| [CONVERSATION_ID.md](./CONVERSATION_ID.md) | Semântica de `conversation_id` (PATCH 3.2) |
| [AUTHENTICATED_IDENTITY.md](./AUTHENTICATED_IDENTITY.md) | Identidade autenticada (PATCH 3.3) |
| [RETENTION_FOUNDATION.md](./RETENTION_FOUNDATION.md) | Fundação de retenção (PATCH 3.4) |
| [IDENTITY_LAYER.md](./IDENTITY_LAYER.md) | **Identity Layer consolidada (PATCH 3.5)** |
| [PATCH_3.6_PHASE_3_FINAL_AUDIT.md](./PATCH_3.6_PHASE_3_FINAL_AUDIT.md) | Auditoria final Fase 3 (PATCH 3.6) |
| [PATCH_4.1_EXECUTIVE_DASHBOARD_AUDIT.md](./PATCH_4.1_EXECUTIVE_DASHBOARD_AUDIT.md) | Auditoria PATCH 4.1 |
| [PATCH_4.1_PRODUCTION_REPORT.md](./PATCH_4.1_PRODUCTION_REPORT.md) | Relatório produção PATCH 4.1 |
| [PATCH_4.2_GROWTH_DASHBOARD_AUDIT.md](./PATCH_4.2_GROWTH_DASHBOARD_AUDIT.md) | Auditoria PATCH 4.2 |
| [GROWTH_DASHBOARD.md](./GROWTH_DASHBOARD.md) | **Dashboard de Crescimento (PATCH 4.2)** |
| [PATCH_4.3_CONVERSION_DASHBOARD_AUDIT.md](./PATCH_4.3_CONVERSION_DASHBOARD_AUDIT.md) | Auditoria PATCH 4.3 |
| [CONVERSION_DASHBOARD.md](./CONVERSION_DASHBOARD.md) | **Dashboard de Conversão (PATCH 4.3)** |
| [PATCH_4.4_PRODUCTS_CATEGORIES_DASHBOARD_AUDIT.md](./PATCH_4.4_PRODUCTS_CATEGORIES_DASHBOARD_AUDIT.md) | Auditoria PATCH 4.4 |
| [PRODUCTS_CATEGORIES_DASHBOARD.md](./PRODUCTS_CATEGORIES_DASHBOARD.md) | **Dashboard de Produtos e Categorias (PATCH 4.4)** |
| [PATCH_4.5_DATA_QUALITY_DASHBOARD_AUDIT.md](./PATCH_4.5_DATA_QUALITY_DASHBOARD_AUDIT.md) | Auditoria PATCH 4.5 |
| [DATA_QUALITY_DASHBOARD.md](./DATA_QUALITY_DASHBOARD.md) | **Dashboard de Qualidade dos Dados (PATCH 4.5)** |
| [PATCH_4.6_PHASE_4_FINAL_AUDIT.md](./PATCH_4.6_PHASE_4_FINAL_AUDIT.md) | **Auditoria final Fase 4 (PATCH 4.6)** |
| [PHASE_7_FINAL_AUDIT.md](./PHASE_7_FINAL_AUDIT.md) | **Auditoria final Fase 7 (PATCH 7.5)** |
| [PHASE_7_EXECUTIVE_SUMMARY.md](./PHASE_7_EXECUTIVE_SUMMARY.md) | Resumo executivo Fase 7 |
| [RELIABILITY_RESPONSE_ANALYTICS.md](./RELIABILITY_RESPONSE_ANALYTICS.md) | Response Reliability (PATCH 7.1) |
| [RELIABILITY_ERROR_ANALYTICS.md](./RELIABILITY_ERROR_ANALYTICS.md) | Error Analytics (PATCH 7.2) |
| [RELIABILITY_LATENCY_ANALYTICS.md](./RELIABILITY_LATENCY_ANALYTICS.md) | Latency Analytics (PATCH 7.3) |
| [RELIABILITY_HEALTH_ANALYTICS.md](./RELIABILITY_HEALTH_ANALYTICS.md) | Health Metrics (PATCH 7.4) |
| [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) | Governança métricas executivas (PATCH 4.1) |
| [DASHBOARDS.md](./DASHBOARDS.md) | Índice dos dashboards SQL (PATCH 1.3 + 4.1–4.5) |

### Roadmap e especificação futura (não substituem o contrato atual)

| Arquivo | Descrição |
|---------|-----------|
| [01_analytics_foundation.md](./01_analytics_foundation.md) | Princípios arquiteturais permanentes |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap FASE 1–12 |
| [03_analytics_specification.md](./03_analytics_specification.md) | **Futuro** — entidades além do v1 (consultar contrato atual primeiro) |

### SQL (consulta e referência histórica)

| Arquivo | Descrição |
|---------|-----------|
| `analytics-growth-dashboard.sql` | **PATCH 4.2** — Dashboard de crescimento |
| `analytics-executive-dashboard.sql` | **PATCH 4.1** — Dashboard executivo (DAU/WAU/MAU) |
| `analytics-overview.sql` | Totais produção |
| `analytics-daily-sessions.sql` | Sessões únicas por dia |
| `analytics-categories.sql` | Categorias |
| `analytics-products.sql` | Produtos |
| `analytics-ctr.sql` | CTR recomendação → clique |
| `analytics-buying-intent.sql` | Intenção de compra |
| `analytics-qa-overview.sql` | Visão QA |
| `analytics-production-scope.sql` | Filtros produção |
| `analytics-events-schema-preflight.sql` | Preflight read-only |
| `analytics-events-schema-inspection.sql` | Inspeção pós-migration |
| `analytics-dau.sql` | **Deprecated** — usar `analytics-daily-sessions.sql` |
| `analytics-events-storage-schema-v1.sql` | **Referência histórica** — não executar |

---

## 3. Nomenclatura oficial

| Conceito | Nome oficial | Evitar |
|----------|--------------|--------|
| Schema físico | **Analytics Storage Schema v1** | "Storage Schema", "Storage v1" isolado |
| Contrato semântico | **Event Contract v1** | "payload contract", "FASE 2 pendente" |
| Dicionário de colunas | **Analytics Data Dictionary** | sinônimos ad hoc |
| Referência de tabela | **Analytics Table Reference** | — |
| Tabela | `public.analytics_events` | aliases inventados |
| Colunas | `snake_case` (`session_id`, `event_name`, …) | camelCase em persistência |
| Categorias frontend | plural (`smartphones`, `notebooks`, …) | singular (`phone`, `notebook`) |
| Módulo de payload | `lib/miaAnalyticsPayload.js` | montagem inline duplicada |
| Chave visitor | `mia_analytics_visitor_id` (`localStorage`) | reutilizar `mia_session_id` |
| Fonte conversa | `conversationIdRef` em `MIAChat.jsx` (memória) | gerar por evento / localStorage legado |
| Helper conversa | `getOrCreateCurrentConversationId()` | ID por pergunta/resposta |
| Validação UUID | `isAnalyticsUuid()` | `isValidUuid()` local |
| Helper visitor | `getOrCreateAnalyticsVisitorId()` | fingerprint, PII |
| Helpers E2E | sufixo `E2E` (`emitPriceAlertEmailE2EAnalytics`) | `E2e` misto |

---

## 4. Qual documento consultar

| Situação | Documento |
|----------|-----------|
| Visão geral / por onde começar | Este [README.md](./README.md) |
| Estrutura física da tabela | [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) |
| Quais eventos existem | [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) |
| Campos e metadata por evento | [contracts/EVENT_FIELD_SPECIFICATION.md](./contracts/EVENT_FIELD_SPECIFICATION.md) |
| Fluxo de um evento | [contracts/EVENT_LIFECYCLE.md](./contracts/EVENT_LIFECYCLE.md) |
| Significado de uma coluna | [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) |
| Quem pode INSERT/SELECT | [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md) |
| O que é `session_id` | [SESSION_ID.md](./SESSION_ID.md) |
| O que é `visitor_id` | [VISITOR_ID.md](./VISITOR_ID.md) |
| O que é `conversation_id` | [CONVERSATION_ID.md](./CONVERSATION_ID.md) |
| Identidade autenticada (`user_id`) | [AUTHENTICATED_IDENTITY.md](./AUTHENTICATED_IDENTITY.md) |
| Fundação de retenção (timelines) | [RETENTION_FOUNDATION.md](./RETENTION_FOUNDATION.md) |
| **Identity Layer (documentação oficial)** | [IDENTITY_LAYER.md](./IDENTITY_LAYER.md) |
| Rodar dashboard SQL | [DASHBOARDS.md](./DASHBOARDS.md) |
| Histórico de patches | [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) |
| **Reliability Analytics (Fase 7)** | [PHASE_7_FINAL_AUDIT.md](./PHASE_7_FINAL_AUDIT.md) |
| **Commercial Analytics (Fase 8)** | [COMMERCIAL_SEARCH_ANALYTICS.md](./COMMERCIAL_SEARCH_ANALYTICS.md) · [PATCH_8_1](./PATCH_8_1_COMMERCIAL_SEARCH_ANALYTICS.md) · [PROVIDER_ANALYTICS.md](./PROVIDER_ANALYTICS.md) · [PATCH_8_2](./PATCH_8_2_PROVIDER_ANALYTICS.md) |
| Roadmap futuro | [02_analytics_roadmap.md](./02_analytics_roadmap.md) |
| Migrations executáveis | `supabase/migrations/20260719153000_*` + `53001_*` + visitor/conversation + `20260722180000_analytics_retention_foundation_v1.sql` |
| Operações Supabase | [docs/infrastructure/SUPABASE_OPERATIONS.md](../infrastructure/SUPABASE_OPERATIONS.md) |

---

## 5. Ordem recomendada de leitura

**Onboarding (estado atual do produto):**

1. [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) — o que existe no banco
2. [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) — o que cada evento significa
3. [contracts/EVENT_LIFECYCLE.md](./contracts/EVENT_LIFECYCLE.md) — como os dados chegam lá
4. [SESSION_ID.md](./SESSION_ID.md) + [CONVERSATION_ID.md](./CONVERSATION_ID.md) + [IDENTITY_LAYER.md](./IDENTITY_LAYER.md) + [DASHBOARDS.md](./DASHBOARDS.md)

**Implementação / auditoria:**

1. [contracts/EVENT_FIELD_SPECIFICATION.md](./contracts/EVENT_FIELD_SPECIFICATION.md)
2. [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md)
3. [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md)
4. `lib/miaAnalyticsPayload.js` + migrations `53000` / `53001`

**Contexto histórico e futuro:**

1. [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md)
2. [01_analytics_foundation.md](./01_analytics_foundation.md)
3. [02_analytics_roadmap.md](./02_analytics_roadmap.md)

---

## 6. Artefatos executáveis vs referência

| Tipo | Localização |
|------|-------------|
| **Executável (fonte de verdade)** | `supabase/migrations/` |
| **Documentação canônica** | Este diretório (`docs/analytics/`) |
| **Event Contract** | `docs/analytics/contracts/` |
| **SQL legado / referência** | `docs/analytics/*.sql` (não substituir migrations) |

Regra: mudança **estrutural** → nova migration + `ANALYTICS_SCHEMA.md`. Mudança **semântica de evento** → Event Contract + changelog.

---

## 7. Infraestrutura relacionada

Roadmap Supabase concluído (SUPABASE-01 → 08):

- [docs/infrastructure/](../infrastructure/) — recuperação, operações, backup, migrations

Analytics define **o quê** armazenar; infraestrutura define **como** versionar e operar o banco.

---

*README oficial — FASE 2 consolidada (PATCH 2.4)*
