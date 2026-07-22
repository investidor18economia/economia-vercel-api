# Analytics Storage Schema
## Documento canônico — Teilor / MIA

**Versão:** Analytics Storage Schema **v1**  
**Nomenclatura oficial:** Analytics Storage Schema v1  
**Status:** Oficial (PATCH 1.4)  
**Migration executável:** `supabase/migrations/20260719153000_analytics_events_storage_schema_v1.sql`  
**Migration de segurança:** `supabase/migrations/20260719153001_analytics_events_storage_security_v1.sql`  
**Referência histórica (não executável):** `docs/analytics/analytics-events-storage-schema-v1.sql`  
**Tabela:** `public.analytics_events`

Documentos relacionados:

| Documento | Uso |
|-----------|-----|
| [README.md](./README.md) | Índice da pasta |
| [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) | Dicionário coluna a coluna |
| [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md) | Responsabilidades de leitura/escrita |
| [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) | Histórico de patches |
| [SESSION_ID.md](./SESSION_ID.md) | Semântica de `session_id` (PATCH 1.1) |
| [VISITOR_ID.md](./VISITOR_ID.md) | Semântica de `visitor_id` (PATCH 3.1) |
| [CONVERSATION_ID.md](./CONVERSATION_ID.md) | Semântica de `conversation_id` (PATCH 3.2) |
| [DASHBOARDS.md](./DASHBOARDS.md) | Consultas SQL (PATCH 1.3) |
| [01_analytics_foundation.md](./01_analytics_foundation.md) | Princípios permanentes |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap oficial |
| [03_analytics_specification.md](./03_analytics_specification.md) | Especificação futura (FASE 3+) |
| [contracts/](./contracts/) | **Event Contract v1** — catálogo oficial dos eventos (FASE 2) |

Infraestrutura Supabase: [docs/infrastructure/SUPABASE_MIGRATIONS.md](../infrastructure/SUPABASE_MIGRATIONS.md)

---

## Índice

1. [Objetivo do Analytics](#1-objetivo-do-analytics)
2. [Arquitetura](#2-arquitetura)
3. [Fluxo de dados](#3-fluxo-de-dados)
4. [Tabela principal](#4-tabela-principal)
5. [Campos, tipos e obrigatoriedade](#5-campos-tipos-e-obrigatoriedade)
6. [Índices](#6-índices)
7. [Relacionamentos e constraints](#7-relacionamentos-e-constraints)
8. [Segurança](#8-segurança)
9. [Escritores e leitores](#9-escritores-e-leitores)
10. [Eventos conhecidos](#10-eventos-conhecidos)
11. [Reprodução e evolução](#11-reprodução-e-evolução)
12. [Limitações conhecidas (v1)](#12-limitações-conhecidas-v1)

---

## 1. Objetivo do Analytics

O Analytics da Teilor/MIA é uma **camada observacional append-only** que registra eventos de produto e eventos técnicos legítimos para:

- dashboards SQL de produto e QA;
- auditoria operacional;
- evolução futura do contrato de eventos (ver [Event Contract v1](./contracts/EVENT_CONTRACT.md)).

**Não** dirige cognição da MIA. Falhas de ingestão **nunca** bloqueiam a experiência do usuário.

Este documento registra **somente** a estrutura de armazenamento v1. O contrato semântico de cada `event_name` está em [Event Contract v1](./contracts/EVENT_CONTRACT.md).

| Conceito | Escopo | Versão |
|----------|--------|--------|
| **Analytics Storage Schema** | Colunas, tipos, índices, RLS, migrations | **v1 (este documento)** |
| **Event Contract** | Payloads, campos por evento | **v1** — [contracts/](./contracts/) (PATCH 2.1) |

---

## 2. Arquitetura

```text
┌──────────────┐     POST JSON      ┌─────────────────────┐     service_role     ┌──────────────────┐
│   Browser    │ ───────────────▶ │ /api/analytics/track │ ──────────────────▶ │ analytics_events │
│ lib/analytics│                    │ pages/api/...        │      INSERT          │   (PostgreSQL)   │
└──────────────┘                    └─────────────────────┘                      └────────┬─────────┘
                                                                                            │
┌──────────────┐     service_role INSERT                                                    │
│ APIs server  │ ──────────────────────────────────────────────────────────────────────────┘
│ (price alert)│
└──────────────┘

Leitura: dashboards SQL (admin/operador) + service_role backend — nunca browser direto na tabela.
```

Camadas:

| Camada | Responsabilidade |
|--------|------------------|
| Frontend | Gera `visitor_id` e `conversation_id` (localStorage) e `session_id` (sessionStorage); envia eventos allowlist via fetch |
| API perímetro | Valida allowlist, limites, insere via service_role |
| Storage | Tabela `analytics_events` versionada por migration |
| Dashboards | SQL read-only documentado em `DASHBOARDS.md` |

---

## 3. Fluxo de dados

```text
Frontend (lib/analytics.js)
        │
        │  POST /api/analytics/track
        │  { event_name, visitor_id, session_id, conversation_id, ... }
        ▼
API (pages/api/analytics/track/index.js)
        │
        │  validateAnalyticsTrackRequest()
        │  supabase.from("analytics_events").insert(...)
        ▼
Supabase PostgreSQL
        │
        │  public.analytics_events
        │  RLS ON · service_role INSERT/SELECT
        ▼
Dashboards SQL (PATCH 1.3)
        │
        │  analytics-overview.sql, analytics-daily-sessions.sql, ...
        ▼
Operador / análise de produto
```

Fluxo server-side (exemplo: e-mail de alerta de preço):

```text
Cron / Admin API → lib/miaPriceAlertEmailAnalytics.js → INSERT service_role → analytics_events
```

---

## 4. Tabela principal

### `public.analytics_events`

- **Schema:** `public`
- **Tipo:** append-only log
- **Colunas:** 17
- **PK:** `id` (`uuid`)
- **FKs:** nenhuma
- **Enum em `event_name`:** nenhum (texto livre validado na API)

Única tabela oficial do Analytics Storage v1. Ver [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md).

---

## 5. Campos, tipos e obrigatoriedade

Detalhamento coluna a coluna: [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md).

| Coluna | Tipo PostgreSQL | Nullable | Default | Obrigatória na linha |
|--------|-----------------|----------|---------|----------------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Sim (gerada) |
| `event_name` | `text` | NOT NULL | — | Sim |
| `session_id` | `text` | NULL | — | Não |
| `conversation_id` | `uuid` | NULL | — | Não |
| `user_id` | `uuid` | NULL | — | Não |
| `visitor_id` | `uuid` | NULL | — | Não |
| `category` | `text` | NULL | — | Não |
| `product_name` | `text` | NULL | — | Não |
| `product_brand` | `text` | NULL | — | Não |
| `product_id` | `text` | NULL | — | Não |
| `query_text` | `text` | NULL | — | Não |
| `recommendation_name` | `text` | NULL | — | Não |
| `offer_store` | `text` | NULL | — | Não |
| `offer_price` | `numeric` | NULL | — | Não |
| `offer_url` | `text` | NULL | — | Não |
| `metadata` | `jsonb` | NULL | `'{}'::jsonb` | Não |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Sim (gerada) |

**Não existem** nesta versão: `environment`, `schema_version`, `event_schema_version`, `payload_version`, `turn_id`.

**Adicionado em PATCH 3.1:** `visitor_id` (migration `20260721153002`). Ver [VISITOR_ID.md](./VISITOR_ID.md).

**Adicionado em PATCH 3.2:** `conversation_id` (migration `20260721153003`). Ver [CONVERSATION_ID.md](./CONVERSATION_ID.md).

---

## 6. Índices

### Índices oficiais (migration v1)

| Índice | Definição | Finalidade |
|--------|-----------|------------|
| `analytics_events_pkey` | PK em `id` | Identidade da linha |
| `idx_analytics_events_event_name_created_at` | `(event_name, created_at DESC)` | Agregações por evento + tempo |
| `idx_analytics_events_created_at` | `(created_at DESC)` | Séries temporais |
| `idx_analytics_events_session_id` | `(session_id) WHERE session_id IS NOT NULL` | Sessões únicas |
| `idx_analytics_events_visitor_id` | `(visitor_id) WHERE visitor_id IS NOT NULL` | Visitantes únicos (PATCH 3.1) |
| `idx_analytics_events_conversation_id` | `(conversation_id) WHERE conversation_id IS NOT NULL` | Conversas únicas (PATCH 3.2) |
| `idx_analytics_events_category` | `(category) WHERE category IS NOT NULL` | Filtros QA / exclusões |

### Nota sobre produção

A migration usa `CREATE INDEX IF NOT EXISTS`. Ambientes que existiam antes do v1 podem conter **índices legados** adicionais (nomes `analytics_events_*_idx`). Eles **não** fazem parte da definição oficial v1, mas podem coexistir em produção até patch futuro opcional de reconciliação de índices.

---

## 7. Relacionamentos e constraints

| Tipo | Detalhe |
|------|---------|
| Primary key | `analytics_events_pkey` → `id` |
| Foreign keys | **Nenhuma** |
| Unique (exceto PK) | **Nenhuma** |
| Check constraints | **Nenhuma** no storage v1 |
| Enum types | **Nenhum** |

Relacionamentos lógicos (não enforced no banco):

- `user_id` pode corresponder a `auth.users` quando autenticado — **sem FK**.
- Campos de produto referenciam contexto da conversa/comercial — **sem FK**.

---

## 8. Segurança

Migration: `20260719153001_analytics_events_storage_security_v1.sql`

| Controle | Estado v1 |
|----------|-------------|
| RLS | Habilitado |
| Policies | **0** (intencional — fail-closed para browser) |
| `anon` / `authenticated` | Sem grants de dados |
| `service_role` | `SELECT`, `INSERT` |
| Browser direto na tabela | **Bloqueado** |

Preflight antes de aplicar segurança: `docs/analytics/analytics-events-schema-preflight.sql`

**Nunca** armazenar senhas, tokens ou segredos em qualquer coluna.

---

## 9. Escritores e leitores

### Escritores

| Caminho | Mecanismo | Eventos |
|---------|-----------|---------|
| `pages/api/analytics/track/index.js` | Allowlist pública | 6 eventos MIA (ver §10) |
| `lib/miaPriceAlertEmailAnalytics.js` | Server-side | Eventos `price_drop_email_*`, test, e2e |

Cliente Supabase: **service_role** (`lib/supabaseClient.js`) — somente backend.

### Leitores

| Consumidor | Mecanismo |
|------------|-----------|
| Dashboards SQL | Consultas documentadas em `DASHBOARDS.md` |
| Testes/auditoria | service_role read-only |
| Browser / anon | **Sem acesso** à tabela |

---

## 10. Eventos conhecidos

Catálogo completo (16 eventos, payloads, metadata): **[Event Contract v1](./contracts/EVENT_CONTRACT.md) §7**.

Resumo:

### Allowlist pública (`lib/miaAnalyticsAllowlist.js`)

- `session_started`
- `mia_question_sent`
- `mia_recommendation_shown`
- `offer_click`
- `favorite_created`
- `price_alert_created`

### Server-side (exemplos)

- `price_drop_email_attempted`, `price_drop_email_sent`, `price_drop_email_failed`, `price_drop_email_skipped`
- `price_drop_email_test_*`, `price_drop_email_e2e_*`

A tabela **aceita** qualquer `event_name` inserido por código autorizado; a allowlist restringe apenas o endpoint público.

---

## 11. Reprodução e evolução

### Reprodução (novo ambiente)

1. `supabase db reset` local (aplica migrations oficiais) **ou**
2. Preflight → migration 53000 → validação → migration 53001 (produção controlada)

Ver [docs/infrastructure/SUPABASE_OPERATIONS.md](../infrastructure/SUPABASE_OPERATIONS.md).

### Regras de evolução

1. Mudança estrutural → **nova migration** aditiva versionada (ex.: `…53002_*.sql`).
2. Proibido alterar produção manualmente sem migration no Git.
3. **Analytics Storage Schema v1** permanece v1 para alterações **aditivas compatíveis** (coluna nullable, índice novo); bump para v2 reservado a mudanças breaking.
4. **Analytics Storage Schema** ≠ **Event Contract** — camadas complementares; ver [contracts/](./contracts/).
5. Este documento deve ser atualizado junto com qualquer migration estrutural futura.

---

## 12. Limitações conhecidas (v1)

| Limitação | Resolução prevista |
|-----------|-------------------|
| Sem coluna `environment` | Migration futura aprovada ou evolução do contrato |
| `visitor_id` ausente em dados históricos | Esperado — sem backfill (PATCH 3.1) |
| `conversation_id` ausente em dados históricos | Esperado — sem backfill (PATCH 3.2) |
| `turn_id` | Patch futuro FASE 3 |
| `metadata` sem schema rígido no banco | Chaves documentadas no [Event Contract v1](./contracts/EVENT_FIELD_SPECIFICATION.md) |
| Separação produção/QA por filtros SQL | PATCH 1.3; ver [DASHBOARDS.md](./DASHBOARDS.md) |
| Índices legados em produção | Patch opcional futuro |

---

*Documento consolidado — Analytics Storage Schema v1. Eventos: [Event Contract v1](./contracts/EVENT_CONTRACT.md). PATCH 2.4.*
