# Analytics — Dashboards SQL (PATCH 1.3)

## Sessão vs usuário

| Conceito | Campo | Significado |
|----------|-------|-------------|
| **Sessão** | `session_id` | Sessão anônima da aba do navegador |
| **Usuário autenticado** | `user_id` | UUID Supabase quando logado |

`COUNT(DISTINCT session_id)` = **sessões únicas**, nunca usuários únicos, DAU, MAU ou retenção.

Usuários únicos reais dependem da Identity Layer (FASE 3).

## Schema e contrato

| Documento | Conteúdo |
|-----------|----------|
| [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) | Analytics Storage Schema v1 |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | Event Contract v1 — eventos usados nos filtros |
| [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) | Colunas consultadas |
| [README.md](./README.md) | Índice oficial |

Migrations: `supabase/migrations/20260719153000_*` + `20260719153001_*` (PATCH 1.4)

## Arquivos

| Arquivo | Uso |
|---------|-----|
| `analytics-overview.sql` | Produção — totais e sessões únicas (MIA) |
| `analytics-daily-sessions.sql` | Produção — sessões únicas por dia |
| `analytics-categories.sql` | Produção — categorias de perguntas |
| `analytics-products.sql` | Produção — produtos recomendados / cliques |
| `analytics-ctr.sql` | Produção — CTR recomendação → clique |
| `analytics-buying-intent.sql` | Produção — sinais de intenção de compra |
| `analytics-qa-overview.sql` | QA — eventos de teste isolados |
| `analytics-production-scope.sql` | Referência do filtro produção |

## Produção × testes

Filtro determinístico aplicado nos dashboards de produção:

1. `category IN ('price_alert_email_test', 'price_alert_e2e_test')`
2. `event_name LIKE 'price_drop_email_test_%'` ou `'price_drop_email_e2e_%'`
3. `session_started` com `metadata.user_agent = 'test-agent'` (harness local)

**Limitação:** não existe coluna `environment` no Analytics Storage Schema v1 (PATCH 1.4). Eventos MIA reais sem esses marcadores entram na visão de produção. Separação estrutural universal está documentada no [Event Contract](./contracts/EVENT_CONTRACT.md).

## Métricas corrigidas

| Nome | Fórmula | Limitação |
|------|---------|-----------|
| `sessoes_unicas` | `COUNT(DISTINCT session_id)` nos 6 eventos MIA públicos | Uma pessoa pode abrir várias abas |
| `sessoes_unicas_diarias` | Idem, agrupado por `date(created_at)` | Não é DAU — são sessões de aba |

`analytics-dau.sql` foi renomeado para `analytics-daily-sessions.sql` (alias `usuarios_ativos` removido).

## Referências

- [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) — definição dos eventos filtrados
- [analytics-production-scope.sql](./analytics-production-scope.sql) — predicado reutilizável
- [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) — PATCH 1.3
- [README.md](./README.md) — índice oficial

---

*Dashboards SQL — PATCH 1.3 · referências PATCH 2.4*
