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
contracts/EVENT_CONTRACT.md  ← Event Contract v1 (16 eventos)
    ↓
contracts/EVENT_FIELD_SPECIFICATION.md
    ↓
contracts/EVENT_LIFECYCLE.md
    ↓
ANALYTICS_DATA_DICTIONARY.md ← colunas PostgreSQL
    ↓
ANALYTICS_TABLE_REFERENCE.md ← escritores / leitores
    ↓
SESSION_ID.md · VISITOR_ID.md · CONVERSATION_ID.md · DASHBOARDS.md
    ↓
ANALYTICS_CHANGELOG.md
```

**Implementação (código, não duplicar na documentação):**

- Payloads: `lib/miaAnalyticsPayload.js` (PATCH 2.2)
- Identidade: `lib/analytics.js` — `getOrCreateAnalyticsVisitorId()` (PATCH 3.1), `getOrCreateAnalyticsConversationId()` / `startNewAnalyticsConversation()` (PATCH 3.2), `getMiaSessionId()` (PATCH 1.1)
- Frontend: `lib/analytics.js` · Allowlist: `lib/miaAnalyticsAllowlist.js`
- Server-side: `lib/miaPriceAlertEmailAnalytics.js`

---

## 2. O que existe nesta pasta

### Event Contract v1 — FASE 2 (documentação principal de eventos)

| Arquivo | Descrição |
|---------|-----------|
| [contracts/README.md](./contracts/README.md) | Índice do Event Contract |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | **Contrato principal** — catálogo dos 16 eventos |
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
| [DASHBOARDS.md](./DASHBOARDS.md) | Índice dos dashboards SQL (PATCH 1.3) |

### Roadmap e especificação futura (não substituem o contrato atual)

| Arquivo | Descrição |
|---------|-----------|
| [01_analytics_foundation.md](./01_analytics_foundation.md) | Princípios arquiteturais permanentes |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap FASE 1–12 |
| [03_analytics_specification.md](./03_analytics_specification.md) | **Futuro** — entidades além do v1 (consultar contrato atual primeiro) |

### SQL (consulta e referência histórica)

| Arquivo | Descrição |
|---------|-----------|
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
| Chave conversa | `mia_conversation_id` (`localStorage`, compartilhada com API MIA) | gerar por evento |
| Helper conversa | `getOrCreateAnalyticsConversationId()` | ID por pergunta/resposta |
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
| Rodar dashboard SQL | [DASHBOARDS.md](./DASHBOARDS.md) |
| Histórico de patches | [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) |
| Roadmap futuro | [02_analytics_roadmap.md](./02_analytics_roadmap.md) |
| Migrations executáveis | `supabase/migrations/20260719153000_*` + `53001_*` + `53002_*` (visitor_id) + `53003_*` (conversation_id) |
| Operações Supabase | [docs/infrastructure/SUPABASE_OPERATIONS.md](../infrastructure/SUPABASE_OPERATIONS.md) |

---

## 5. Ordem recomendada de leitura

**Onboarding (estado atual do produto):**

1. [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) — o que existe no banco
2. [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) — o que cada evento significa
3. [contracts/EVENT_LIFECYCLE.md](./contracts/EVENT_LIFECYCLE.md) — como os dados chegam lá
4. [SESSION_ID.md](./SESSION_ID.md) + [CONVERSATION_ID.md](./CONVERSATION_ID.md) + [DASHBOARDS.md](./DASHBOARDS.md)

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
