# Analytics Table Reference
## Referência oficial de tabelas — Analytics Storage Schema v1

**Versão:** PATCH 1.4 + PATCH 3.1 + PATCH 3.2  
**Escopo:** somente tabelas existentes hoje — **não** inclui tabelas futuras.

---

## Índice

1. [Resumo](#1-resumo)
2. [public.analytics_events](#2-publicanalytics_events)
3. [Tabelas fora do escopo Analytics](#3-tabelas-fora-do-escopo-analytics)
4. [Referências](#4-referências)

---

## 1. Resumo

O Analytics Storage Schema v1 possui **uma única tabela oficial**:

| Tabela | Papel |
|--------|-------|
| `public.analytics_events` | Log append-only de eventos |

Não existem tabelas auxiliares de Analytics (dimensões, sessões, contratos) nesta versão.

---

## 2. `public.analytics_events`

### Objetivo

Armazenar eventos observacionais de produto e eventos técnicos legítimos para análise via SQL e auditoria operacional.

### Responsabilidade

| Aspecto | Detalhe |
|---------|---------|
| Domínio | Analytics / telemetria de produto |
| Mutabilidade | Append-only (sem UPDATE/DELETE na camada de produto) |
| Cognição MIA | **Não** alimenta decisões em tempo real |
| Contrato por evento | [Event Contract v1](./contracts/EVENT_CONTRACT.md) — sem colunas extras nesta tabela |

### Quem grava

| Writer | Mecanismo | Role Supabase |
|--------|-----------|---------------|
| `POST /api/analytics/track` | INSERT via `lib/supabaseClient` | `service_role` |
| `lib/miaPriceAlertEmailAnalytics.js` | INSERT direto | `service_role` |
| `lib/miaDataLayerUsageAnalytics.js` | INSERT direto (PATCH 6.4) | `service_role` |
| `lib/miaResponseAnalytics.js` | INSERT direto (PATCH 7.1) | `service_role` |
| Cron / admin price alerts | Indireto via módulos acima | `service_role` |

**Não grava:** browser, `anon`, `authenticated` (acesso direto bloqueado pós-migration 53001).

### Quem lê

| Leitor | Mecanismo | Autorizado |
|--------|-----------|------------|
| Operador / dashboards | SQL files em `docs/analytics/*.sql` | Sim (acesso DB admin) |
| Backend (smoke, auditoria) | service_role SELECT | Sim |
| Frontend / REST público | PostgREST anon | **Não** |
| Dashboards embarcados no app | — | **Não existem** |

### Colunas

17 — ver [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md).

Inclui `visitor_id` (PATCH 3.1) e `conversation_id` (PATCH 3.2).

### Índices

7 (PK + 6 operacionais, incl. `idx_analytics_events_visitor_id` e `idx_analytics_events_conversation_id`) — ver [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) §6.

### Segurança

| Controle | Valor |
|----------|-------|
| RLS | ON |
| Policies | 0 |
| Grants dados | `service_role` only |

Migration: `20260719153001_analytics_events_storage_security_v1.sql`

### Volume e retenção

- Sem política de retenção automática documentada no schema v1.
- Sem particionamento.
- Crescimento: append-only por evento ingerido.

---

## 3. Tabelas fora do escopo Analytics

Estas tabelas **não** fazem parte do Analytics Storage Schema v1, embora o runtime possa correlacioná-las logicamente:

| Tabela | Relação |
|--------|---------|
| `conversations`, `messages` | Origem de contexto de chat — **sem FK** |
| `users` | Perfil MVP — **sem FK** com `analytics_events.user_id` |
| `price_alerts` | Origem de eventos server-side de e-mail |
| `phone_specs`, etc. | Data Layer — lidos pela MIA, não pelo Analytics |

Não documentar estas tabelas como parte do Analytics neste patch.

---

## 4. Referências

- [README.md](./README.md) — índice oficial
- [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) — schema físico
- [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) — Event Contract v1
- [contracts/EVENT_LIFECYCLE.md](./contracts/EVENT_LIFECYCLE.md) — fluxo de ingestão
- [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) — colunas
- [DASHBOARDS.md](./DASHBOARDS.md) — leitura SQL
- [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) — histórico
- [docs/infrastructure/SUPABASE_ARCHITECTURE.md](../infrastructure/SUPABASE_ARCHITECTURE.md)
- `supabase/migrations/20260719153000_*` e `20260719153001_*`
- `supabase/migrations/20260721153002_*` (visitor_id)
- `supabase/migrations/20260721153003_*` (conversation_id)

---

*Analytics Table Reference — Analytics Storage Schema v1. PATCH 2.4.*
