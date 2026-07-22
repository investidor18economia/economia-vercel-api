# SUPABASE-07B — Equivalência Final (Produção × Migrations)

**Data:** 2026-07-22 UTC  
**Estado:** Produção reconciliada com histórico oficial de 10 migrations

> `migration repair` altera somente histórico. Não aplica SQL.

## Matriz pós-reconciliação

| Timestamp | Migration | Classe (07A) | Ação executada (07B) | Estado final |
|-----------|-----------|--------------|----------------------|--------------|
| 20260719153000 | Analytics Schema | C | **SQL real** + repair | ✅ Colunas 15/15; 4 índices oficiais; 6 legados preservados; comments aplicados |
| 20260719153001 | Analytics Security | C | **SQL real** + repair | ✅ RLS ON; 0 policies; browser revogado; service_role OK |
| 20260721194830 | Foundation | A | **repair only** | ✅ usage_log, cache_results, set_updated_at() |
| 20260721194833 | Catalog | A | **repair only** | ✅ 3 tabelas; RLS + policies leitura |
| 20260721194836 | Users | A | **repair only** | ✅ users + PK |
| 20260721194839 | Conversation | A | **repair only** | ✅ 3 tabelas; 0 FKs |
| 20260721194841 | Engagement | A | **repair only** | ✅ wishes |
| 20260721194844 | Commercial | A | **repair only** | ✅ cache + candidates |
| 20260721194847 | Commercial Vault | A | **repair only** | ✅ RLS; service_role only |
| 20260721194850 | Alerts | A | **repair only** | ✅ alerts + logs; RLS logs |

## Analytics — estado final

### Estrutura (53000)

- 15 colunas equivalentes ✅  
- PK `analytics_events_pkey` ✅  
- Índices oficiais: `idx_analytics_events_event_name_created_at`, `_created_at`, `_session_id`, `_category` ✅  
- Índices legados: `analytics_events_*_idx` (5) + pkey — **não removidos** ✅  

### Segurança (53001)

| Aspecto | Produção final |
|---------|----------------|
| RLS | enabled |
| Policies | 0 (intencional) |
| anon | sem SELECT |
| authenticated | sem SELECT |
| service_role | SELECT, INSERT (+ bypass RLS) |

## Baseline — confirmação Classe A

Repairs executados **sem alteração física** confirmada por:

- Contagens agregadas inalteradas (exceto analytics smoke)  
- Preflight read-only antes/depois de cada repair  
- 16 tabelas, 0 FKs mantidos  

## Índices legados — recomendação futura

Coexistência confirmada. Migration opcional `analytics_indexes_reconcile_v1` permanece **fora de escopo** — avaliar em patch futuro após análise de query plans e dashboards.

## Histórico CLI

```
local = remote para todas as 10 versions
schema_migrations count = 10
```
