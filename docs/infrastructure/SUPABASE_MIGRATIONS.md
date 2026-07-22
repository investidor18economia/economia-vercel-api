# SUPABASE_MIGRATIONS — Registro Oficial das 10 Migrations

> Fonte executável: `supabase/migrations/`  
> **Estado remoto:** todas aplicadas/registradas (SUPABASE-07B).

---

## Índice

1. [Lista oficial](#1-lista-oficial)
2. [Ordem de execução](#2-ordem-de-execução)
3. [Timestamps diferentes](#3-timestamps-diferentes)
4. [Detalhamento por migration](#4-detalhamento-por-migration)
5. [Repair vs execução real](#5-repair-vs-execução-real)
6. [Regras permanentes](#6-regras-permanentes)
7. [Referências](#7-referências)

---

## 1. Lista oficial

| # | Timestamp | Arquivo | Domínio |
|---|-----------|---------|---------|
| 1 | `20260719153000` | `analytics_events_storage_schema_v1.sql` | Analytics Schema |
| 2 | `20260719153001` | `analytics_events_storage_security_v1.sql` | Analytics Security |
| 3 | `20260721194830` | `baseline_foundation_v1.sql` | Foundation |
| 4 | `20260721194833` | `baseline_catalog_v1.sql` | Catalog |
| 5 | `20260721194836` | `baseline_users_v1.sql` | Users |
| 6 | `20260721194839` | `baseline_conversation_v1.sql` | Conversation |
| 7 | `20260721194841` | `baseline_engagement_v1.sql` | Engagement |
| 8 | `20260721194844` | `baseline_commercial_v1.sql` | Commercial |
| 9 | `20260721194847` | `baseline_commercial_vault_v1.sql` | Commercial Vault |
| 10 | `20260721194850` | `baseline_alerts_v1.sql` | Alerts |

**Total:** 10 migrations. **Não editar** migrations já reconciliadas — criar nova migration corretiva se drift futuro.

---

## 2. Ordem de execução

### Ordem cronológica (lexicográfica / `db reset`)

```text
20260719153000  →  Analytics Schema
20260719153001  →  Analytics Security
20260721194830  →  Foundation
20260721194833  →  Catalog
20260721194836  →  Users
20260721194839  →  Conversation
20260721194841  →  Engagement
20260721194844  →  Commercial
20260721194847  →  Commercial Vault
20260721194850  →  Alerts
```

### Ordem conceitual (domínios de negócio)

```text
Foundation → Catalog → Users → Conversation → Engagement
          → Commercial → Vault → Alerts → Analytics
```

A ordem conceitual guiou **análise e classificação** no SUPABASE-07A; a ordem cronológica guiou **`db reset` local** e **repair remoto**.

---

## 3. Timestamps diferentes

| Grupo | Data nos timestamps | Origem |
|-------|---------------------|--------|
| Analytics `53000`, `53001` | 2026-07-19 15:30 | Preservados desde PATCH Analytics 1.4 |
| Baseline `94830`–`94850` | 2026-07-21 19:48 | Gerados pela CLI no SUPABASE-06 |

**Por que Analytics vem antes cronologicamente:**

- timestamps reais não foram renomeados (proibido);
- Analytics é autossuficiente (só `analytics_events`);
- zero FKs entre domínios;
- `db reset` local validou a sequência.

Ver: `supabase/planning/SUPABASE-06-chronology-decision.md`.

---

## 4. Detalhamento por migration

### 20260719153000 — Analytics Schema

**Objetivo:** definir/validar `analytics_events` (15 colunas), comments oficiais, índices operacionais.

**Conteúdo principal:**

- validação de drift (15 colunas);
- `CREATE INDEX IF NOT EXISTS` (4 índices oficiais);
- **não** altera RLS/grants (delegado à 53001).

**Reconciliação 07B:** execução SQL real (índices + comments); legados preservados.

---

### 20260719153001 — Analytics Security

**Objetivo:** fail-closed para browser; ingestão via service_role.

**Conteúdo principal:**

- guard contra policies browser inesperadas;
- `ENABLE ROW LEVEL SECURITY`;
- `REVOKE` anon/authenticated;
- `GRANT SELECT, INSERT` service_role;
- 0 policies intencionais.

**Reconciliação 07B:** execução SQL real (RLS + revokes).

---

### 20260721194830 — Foundation

**Objetivo:** `usage_log`, `cache_results`, função `set_updated_at()`.

**Reconciliação 07B:** repair only (objetos já existiam).

---

### 20260721194833 — Catalog

**Objetivo:** `phone_specs`, `notebook_specs`, `product_specs`; RLS + policies de leitura; **sem PK** em `product_specs` (estado MVP replicado).

**Reconciliação 07B:** repair only.

---

### 20260721194836 — Users

**Objetivo:** tabela `users` (perfil/plano MVP).

**Reconciliação 07B:** repair only.

---

### 20260721194839 — Conversation

**Objetivo:** `conversations`, `messages`, `mia_sessions`; sem FKs (documentado).

**Reconciliação 07B:** repair only.

---

### 20260721194841 — Engagement

**Objetivo:** tabela `wishes`.

**Reconciliação 07B:** repair only.

---

### 20260721194844 — Commercial

**Objetivo:** `commercial_products_cache`, `commercial_candidates`.

**Reconciliação 07B:** repair only.

---

### 20260721194847 — Commercial Vault

**Objetivo:** `provider_credentials`; RLS; revokes browser; grants service_role.

**Reconciliação 07B:** repair only. **Alto risco** — nunca expor via Data API pública.

---

### 20260721194850 — Alerts

**Objetivo:** `price_alerts`, `price_alert_delivery_logs`; RLS em logs; índices anti-spam.

**Reconciliação 07B:** repair only.

---

## 5. Repair vs execução real

| Migration | SUPABASE-07B |
|-----------|--------------|
| 53000 | **Execução SQL** + repair histórico |
| 53001 | **Execução SQL** + repair histórico |
| 94830–94850 | **Repair only** (8× individual) |

### O que repair faz

```text
ALTERA:  tabela supabase_migrations.schema_migrations
NÃO ALTERA: tabelas, colunas, RLS, dados, índices
```

### O que execução SQL faz

Aplica o conteúdo do arquivo `.sql` no banco remoto via:

```powershell
npx supabase db query --linked -f supabase/migrations/<arquivo>.sql
```

Depois: validar fisicamente → `migration repair --linked --status applied <version>`.

Matriz de equivalência histórica: `supabase/planning/SUPABASE-07A-equivalence-matrix.md`.

---

## 6. Regras permanentes

1. **Uma migration por intenção** — não combinar domínios novos em migration antiga.
2. **Timestamp via CLI** — `supabase migration new <nome>`.
3. **Idempotência** — preferir guards (`IF NOT EXISTS`, blocos `DO $$`).
4. **Sem DROP destrutivo** em reconciliação sem hard stop.
5. **Nova drift** → migration corretiva nova, não reexecução cega de baseline.
6. **Proibido** `db push` sem auditoria equivalente ao SUPABASE-07.

---

## 7. Referências

- [SUPABASE_ARCHITECTURE.md](./SUPABASE_ARCHITECTURE.md)
- [SUPABASE_OPERATIONS.md](./SUPABASE_OPERATIONS.md)
- `docs/analytics/ANALYTICS_SCHEMA.md`
- `supabase/planning/SUPABASE-05-baseline-strategy.md`

---

*SUPABASE-08 — registro oficial das migrations.*
