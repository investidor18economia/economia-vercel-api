# SUPABASE_ARCHITECTURE — Arquitetura Final

> Visão consolidada da infraestrutura Supabase Teilor-MIA após o roadmap SUPABASE-01 → 08.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Ambiente local](#2-ambiente-local)
3. [Ambiente remoto](#3-ambiente-remoto)
4. [Docker e WSL](#4-docker-e-wsl)
5. [Supabase CLI](#5-supabase-cli)
6. [Migrations e baseline](#6-migrations-e-baseline)
7. [Analytics](#7-analytics)
8. [RLS e segurança](#8-rls-e-segurança)
9. [Histórico remoto e repair](#9-histórico-remoto-e-repair)
10. [Diagrama textual](#10-diagrama-textual)
11. [Referências](#11-referências)

---

## 1. Visão geral

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Git (master)   │────▶│  Supabase Local  │────▶│  Supabase Remoto    │
│  migrations/    │     │  Docker + CLI    │     │  xzijmzqsquasrtnkotrw│
└─────────────────┘     └──────────────────┘     └─────────────────────┘
         │                        │                         │
         │                        │                         │
         ▼                        ▼                         ▼
   Fonte de verdade          db reset / testes          PostgreSQL 17
   estrutural                 npm run dev                Vercel app
```

**Princípio:** o repositório define migrations; produção foi reconciliada sem `db push` em batch.

---

## 2. Ambiente local

| Componente | Detalhe |
|------------|---------|
| Pasta | `C:\(PROJETOS) MIA TEILOR OFICIAL\Teilor-MIA` |
| Config | `supabase/config.toml` |
| Migrations | `supabase/migrations/` (10 arquivos) |
| Seed | `supabase/seed.sql` |
| Temporários | `supabase/.temp/` (gitignored) |
| Postgres local | porta 54322 (via `supabase status`) |
| Studio local | porta 54323 |

Comandos: ver [SUPABASE_OPERATIONS.md](./SUPABASE_OPERATIONS.md).

---

## 3. Ambiente remoto

| Item | Valor |
|------|-------|
| Projeto | Teilor-MIA |
| Ref | `xzijmzqsquasrtnkotrw` |
| Região | sa-east-1 |
| Status | ACTIVE_HEALTHY |
| Plano | Free |
| Tabelas `public` | 16 |
| FKs | 0 (integridade app-level) |
| Histórico migrations | 10 registros (sincronizado) |

### Domínios de dados (16 tabelas)

| Domínio | Tabelas |
|---------|---------|
| Analytics | `analytics_events` |
| Foundation | `usage_log`, `cache_results` |
| Catalog | `phone_specs`, `notebook_specs`, `product_specs` |
| Users | `users` |
| Conversation | `conversations`, `messages`, `mia_sessions` |
| Engagement | `wishes` |
| Commercial | `commercial_products_cache`, `commercial_candidates` |
| Vault | `provider_credentials` |
| Alerts | `price_alerts`, `price_alert_delivery_logs` |

Inventário detalhado: `supabase/planning/SUPABASE-06-structural-inventory.md`.

---

## 4. Docker e WSL

No Windows:

- **Docker Desktop** executa containers Supabase locais.
- **WSL2** é backend do Docker Desktop.
- Sem Docker ativo: `supabase start` falha.

Validação:

```powershell
docker version
npx supabase start
```

---

## 5. Supabase CLI

| Item | Valor |
|------|-------|
| Versão pinada | `2.109.1` (devDependency) |
| Invocação | `npx supabase` ou `npm run supabase:version` |
| Link | `npx supabase link --project-ref xzijmzqsquasrtnkotrw` |

A CLI gerencia:

- stack local (Docker);
- migrations locais;
- consultas e dumps remotos (`--linked`);
- repair de histórico (`--linked`).

---

## 6. Migrations e baseline

### Fonte executável única

```text
supabase/migrations/
```

Documentação legada em `docs/**/*.sql` é **referência histórica** — não executar como fonte primária.

### Baseline

Oito migrations `baseline_*` capturam o schema MVP existente em produção (SUPABASE-06), geradas a partir de dump read-only remoto.

**Reconciliação 07B:** baseline recebeu **repair only** — objetos já existiam fisicamente.

Ver [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md).

### Ordem cronológica vs conceitual

| Ordem cronológica (`db reset`) | Ordem conceitual (domínios) |
|-------------------------------|----------------------------|
| 53000 Analytics Schema | Foundation → Catalog → … → Alerts |
| 53001 Analytics Security | Analytics por último conceitualmente |
| 94830 … 94850 Baseline | |

Decisão: `supabase/planning/SUPABASE-06-chronology-decision.md`.

---

## 7. Analytics

### Storage Schema v1 (`53000`)

- Tabela `analytics_events` — 15 colunas
- Índices oficiais + índices legados coexistem
- Documentação: `docs/analytics/ANALYTICS_SCHEMA.md`

### Storage Security v1 (`53001`)

- RLS habilitado
- 0 policies intencionais (fail-closed)
- `anon` / `authenticated`: sem SELECT
- `service_role`: INSERT + bypass RLS
- Ingestão: `POST /api/analytics/track` (backend service_role)

---

## 8. RLS e segurança

| Tabela / grupo | RLS | Acesso browser |
|----------------|-----|----------------|
| `analytics_events` | ON | bloqueado |
| `phone_specs`, `notebook_specs`, `product_specs` | ON | SELECT (policies leitura) |
| `provider_credentials` | ON | bloqueado |
| `price_alert_delivery_logs` | ON | bloqueado |
| Demais tabelas MVP | OFF ou grants amplos | conforme dump original |

Vault e Analytics logs: **service_role only**.

Modelo de segurança da app: `docs/architecture/SECURITY_MODEL.md`.

---

## 9. Histórico remoto e repair

Antes do SUPABASE-07B:

- histórico remoto **vazio** (MVP manual);
- `supabase_migrations.schema_migrations` **inexistente**.

Após SUPABASE-07B:

- **10** registros;
- `migration list --linked`: local = remote para todas as versions.

### Semântica de repair

```text
migration repair --status applied  →  registra no histórico
migration repair                   →  NÃO altera objetos SQL
```

Usado para 8 baselines + registro pós-execução Analytics.

---

## 10. Diagrama textual

```text
                    ┌──────────────────────────────────────┐
                    │           Vercel (Next.js)           │
                    │  /api/mia-chat  /api/analytics/track │
                    └───────────────┬──────────────────────┘
                                    │ service_role
                                    ▼
┌──────────────┐    link     ┌─────────────────────────────┐
│ Supabase CLI │◀───────────▶│  PostgreSQL (sa-east-1)     │
│ local Docker │             │  16 tables · RLS seletivo     │
└──────────────┘             │  schema_migrations: 10 rows   │
       │                     └─────────────────────────────┘
       │ db reset
       ▼
┌──────────────┐
│ 10 migrations│
│ (Git source) │
└──────────────┘
```

---

## 11. Referências

- [PROJECT_RECOVERY.md](./PROJECT_RECOVERY.md)
- [SUPABASE_OPERATIONS.md](./SUPABASE_OPERATIONS.md)
- [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)
- [BACKUP_POLICY.md](./BACKUP_POLICY.md)
- `supabase/README.md` (fundação local — atualizar leitura via docs/infrastructure)

---

*SUPABASE-08 — arquitetura consolidada.*
