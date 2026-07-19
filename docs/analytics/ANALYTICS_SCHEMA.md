# Analytics Storage Schema
## Documento canônico — Teilor / MIA

**Versão:** Analytics Storage Schema **v1**  
**Status:** Oficial (PATCH 1.4)  
**Migration:** `docs/analytics/analytics-events-storage-schema-v1.sql`  
**Tabela:** `public.analytics_events`

Documentos relacionados:

- `01_analytics_foundation.md` — princípios permanentes
- `02_analytics_roadmap.md` — ordem oficial de patches
- `03_analytics_specification.md` — entidades e contratos futuros
- `SESSION_ID.md` — semântica de `session_id` (PATCH 1.1)
- `DASHBOARDS.md` — consultas SQL (PATCH 1.3)

---

## Finalidade

Este documento registra a **estrutura oficial de armazenamento** do Analytics.

Não define o contrato semântico completo de cada evento — isso pertence à **FASE 2 — Contrato Oficial dos Eventos**.

Distinção obrigatória:

| Conceito | Escopo | Versão |
|----------|--------|--------|
| **Storage schema** | Colunas, tipos, índices, RLS, migrations | **v1 (este documento)** |
| **Event contract** | `event_name`, payloads, campos obrigatórios por evento | FASE 2 |

---

## Versão oficial

| Campo | Valor |
|-------|-------|
| Nome | Analytics Storage Schema v1 |
| Identificador | `analytics-events-storage-schema-v1` |
| Registro primário | Migration SQL no repositório |
| Registro secundário | Este documento |

**Não existe** coluna `schema_version`, `event_schema_version` ou `payload_version` por linha nesta versão.

Motivo: a versão estrutural é registrada pela migration versionada; versões de payload/contrato pertencem à FASE 2.

---

## Tabela oficial

### `public.analytics_events`

Append-only log observacional. Falhas de Analytics **nunca** bloqueiam a MIA.

| Coluna | Tipo PostgreSQL | Nullable | Default | Finalidade |
|--------|-----------------|----------|---------|------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Chave primária |
| `event_name` | `text` | NOT NULL | — | Identificador do evento |
| `session_id` | `text` | NULL | — | Sessão anônima da aba (PATCH 1.1) |
| `user_id` | `uuid` | NULL | — | Usuário autenticado Supabase, quando houver |
| `category` | `text` | NULL | — | Categoria coarse / marcadores server-side |
| `product_name` | `text` | NULL | — | Nome do produto |
| `product_brand` | `text` | NULL | — | Marca do produto |
| `product_id` | `text` | NULL | — | ID do produto |
| `query_text` | `text` | NULL | — | Texto da pergunta |
| `recommendation_name` | `text` | NULL | — | Nome da recomendação exibida |
| `offer_store` | `text` | NULL | — | Loja / provider da oferta |
| `offer_price` | `numeric` | NULL | — | Preço da oferta |
| `offer_url` | `text` | NULL | — | URL da oferta |
| `metadata` | `jsonb` | NULL | `'{}'::jsonb` | Propriedades extras (não é o contrato oficial) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Timestamp de inserção |

**Total:** 15 colunas.

---

## Semântica permanente (patches anteriores)

### `session_id` (PATCH 1.1)

- Representa sessão da **aba** (`sessionStorage`).
- **Não** representa: usuário, visitante persistente, dispositivo, conversa, retenção, DAU ou MAU.

### Produção × QA (PATCH 1.3)

- **Não existe** coluna `environment` no Storage Schema v1.
- Dashboards de produção usam filtros determinísticos documentados em `analytics-production-scope.sql`.
- Separação estrutural universal aguarda **FASE 2 — Contrato Oficial dos Eventos** (ou migration futura explicitamente aprovada).

---

## Índices (v1)

| Índice | Colunas | Uso |
|--------|---------|-----|
| `idx_analytics_events_created_at` | `created_at DESC` | Séries temporais |
| `idx_analytics_events_event_name` | `event_name` | Filtros por evento |
| `idx_analytics_events_session_id` | `session_id` (partial) | `COUNT(DISTINCT session_id)` |
| `idx_analytics_events_category` | `category` (partial) | Exclusões QA |
| `idx_analytics_events_event_name_created_at` | `event_name, created_at DESC` | Dashboards compostos |

---

## Segurança

- **RLS:** habilitado.
- **Grants:** `service_role` — `SELECT`, `INSERT`.
- **Browser (`anon` / `authenticated`):** sem acesso direto à tabela.
- Ingestão pública ocorre via `POST /api/analytics/track` (allowlist PATCH 12D).
- Eventos server-side (ex.: price alert email) inserem via `SUPABASE_SERVICE_ROLE_KEY`.

Nunca armazenar senhas, tokens ou segredos em qualquer coluna.

---

## Escritores oficiais (runtime)

| Caminho | Eventos |
|---------|---------|
| `pages/api/analytics/track/index.js` | Allowlist pública (`lib/miaAnalyticsAllowlist.js`) |
| `lib/miaPriceAlertEmailAnalytics.js` | Eventos técnicos de e-mail / QA / E2E |

Colunas escritas pelo endpoint público:

`event_name`, `session_id`, `user_id`, `category`, `product_name`, `product_brand`, `product_id`, `query_text`, `recommendation_name`, `offer_store`, `offer_price`, `offer_url`, `metadata`

(`id`, `created_at` — gerados pelo banco.)

---

## Eventos conhecidos (não exaustivo)

**MIA pública (allowlist):**

- `session_started`
- `mia_question_sent`
- `mia_recommendation_shown`
- `offer_click`
- `favorite_created`
- `price_alert_created`

**Server-side legítimos (exemplos):**

- `price_drop_email_*`
- `price_drop_email_test_*`
- `price_drop_email_e2e_*`

A tabela **não** possui constraint enum em `event_name`. Novos eventos técnicos não exigem migration estrutural, salvo decisão arquitetural futura.

---

## Reprodução em novo ambiente

1. Aplicar `docs/analytics/analytics-events-storage-schema-v1.sql` no Supabase SQL Editor.
2. Validar colunas via `information_schema` (queries no final da migration).
3. Confirmar `SUPABASE_SERVICE_ROLE_KEY` nas APIs.
4. Executar dashboards do PATCH 1.3.

---

## Regras de evolução

1. Toda mudança estrutural exige **nova migration versionada** (`…-v2.sql`, etc.).
2. Nenhuma alteração manual em produção sem migration equivalente no repositório.
3. Mudanças destrutivas exigem estratégia explícita e aprovação.
4. Campos novos devem preservar compatibilidade com eventos históricos.
5. Campos **não podem mudar de semântica** silenciosamente.
6. Remoções exigem depreciação documentada.
7. Este documento deve ser atualizado junto com a migration.
8. Storage schema ≠ event contract.
9. Não adicionar `visitor_id`, `conversation_id`, `turn_id` nesta camada sem a **FASE 3 — Identity Layer**.

---

## Limitações conhecidas (v1)

| Limitação | Resolução prevista |
|-----------|-------------------|
| Sem coluna `environment` | FASE 2 / migration futura aprovada |
| Sem contrato oficial por evento | FASE 2 |
| Sem `visitor_id` / retenção | FASE 3 |
| Tabela criada manualmente antes do v1 | Formalizada por esta migration idempotente |
| `metadata` sem schema rígido | FASE 2 (payload contract) |

---

## Histórico de patches

| Patch | Relação com o schema |
|-------|----------------------|
| 1.1 | Definiu semântica de `session_id` |
| 1.2 | Sem alteração estrutural |
| 1.3 | Dashboards alinhados; limitação de `environment` documentada |
| **1.4** | **Migration + documento canônico v1** |
| 1.5 | Auditoria final da Fase 1 (pendente) |
