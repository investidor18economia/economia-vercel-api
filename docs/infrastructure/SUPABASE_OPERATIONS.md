# SUPABASE_OPERATIONS — Manual Operacional

> Manual de comandos Supabase para Teilor-MIA.  
> **Estado:** pós-reconciliação (SUPABASE-07B). Histórico remoto sincronizado.

---

## Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Comandos locais](#2-comandos-locais)
3. [Comandos remotos (leitura)](#3-comandos-remotos-leitura)
4. [Comandos remotos (escrita — autorização obrigatória)](#4-comandos-remotos-escrita--autorização-obrigatória)
5. [Backup e restore](#5-backup-e-restore)
6. [Auditorias e preflights](#6-auditorias-e-preflights)
7. [Quando usar / quando NÃO usar](#7-quando-usar--quando-não-usar)
8. [Fluxograma operacional](#8-fluxograma-operacional)
9. [Referências](#9-referências)

---

## 1. Pré-requisitos

```powershell
docker version          # Client + Server ativos
npx supabase --version    # 2.109.1 (pinado no package.json)
npx supabase status       # stack local saudável
```

Project ref autorizado: **`xzijmzqsquasrtnkotrw`**

Confirmar vínculo:

```powershell
npx supabase migration list --linked
```

---

## 2. Comandos locais

### start

```powershell
npx supabase start
```

**Usar quando:** iniciar stack local (Postgres, Studio, Auth emulado).

**Não usar quando:** Docker não está rodando.

---

### stop

```powershell
npx supabase stop
```

**Usar quando:** liberar recursos Docker.

**Não usar quando:** testes locais ainda dependem do banco.

---

### status

```powershell
npx supabase status
```

**Usar quando:** verificar URLs locais, saúde dos containers.

**Não usar para:** validar produção (use `--linked` ou Dashboard).

---

### reset

```powershell
npx supabase db reset
```

**Usar quando:**

- validar que as 10 migrations aplicam do zero;
- após alterar migration local (desenvolvimento);
- gate zero antes de operação remota.

**Esperado:** 10 migrations aplicadas + seed.

**Não usar quando:** confundir com reset remoto (não existe comando equivalente seguro).

---

### migration list (local)

```powershell
npx supabase migration list --local
```

**Usar quando:** confirmar ordem e versões locais.

---

## 3. Comandos remotos (leitura)

### migration list (linked)

```powershell
npx supabase migration list --linked
```

**Usar quando:** comparar local × remoto. Pós-07B: **10 = 10**.

---

### db query (read-only)

```powershell
npx supabase db query --linked "select count(*) from information_schema.tables where table_schema='public'"
```

**Usar quando:** preflight, contagens agregadas, metadados.

**Regra:** revisar SQL — somente `SELECT` em produção sem autorização de escrita.

---

### db dump (backup lógico)

```powershell
npx supabase db dump --linked -f supabase/.temp/backups/<pasta>/roles.sql --role-only
npx supabase db dump --linked -f supabase/.temp/backups/<pasta>/schema-public.sql --schema public
npx supabase db dump --linked -f supabase/.temp/backups/<pasta>/data-public.sql --data-only --schema public
```

Ver [BACKUP_POLICY.md](./BACKUP_POLICY.md).

---

### inspect

```powershell
npx supabase inspect db table-stats --linked
```

**Usar quando:** estimativas de linhas por tabela (somente leitura).

---

## 4. Comandos remotos (escrita — autorização obrigatória)

> **Nenhum comando abaixo deve ser executado sem:** backup validado, preflight, plano documentado e aprovação do operador.

### Executar SQL de **uma** migration (Analytics)

```powershell
npx supabase db query --linked -f supabase/migrations/20260719153000_analytics_events_storage_schema_v1.sql
```

**Usar quando:** classificação exige **execução real** (drift de índices, comments, RLS/grants).

**Não usar quando:** equivalência Classe A (usar repair only).

**Comportamento:** executa **somente** o arquivo indicado; **não** registra histórico automaticamente.

---

### migration repair

```powershell
npx supabase migration repair --linked --status applied 20260721194830
npx supabase migration repair --linked --status reverted 20260721194830
```

**Usar quando:**

- objetos físicos já equivalentes (baseline Classe A);
- registrar histórico **após** validação física de execução SQL.

**Nunca assumir que repair:**

- cria tabelas;
- altera RLS;
- aplica ou desfaz SQL.

**Proibido:** múltiplos timestamps em um comando; loops automáticos; batch de 8 baselines sem gate.

---

### db push — PROIBIDO sem auditoria

```powershell
# ❌ NÃO usar como atalho pós-roadmap
npx supabase db push
```

Motivo documentado em [PROJECT_RECOVERY.md](./PROJECT_RECOVERY.md).

---

### migration up --linked — PROIBIDO no processo aprovado

```powershell
# ❌ NÃO usar — aplica batch automático
npx supabase migration up --linked
```

---

## 5. Backup e restore

| Ação | Comando / procedimento |
|------|------------------------|
| Criar backup | `db dump --linked` → `supabase/.temp/backups/` |
| Validar | tamanho > 0, SHA-256, `git check-ignore` |
| Restore | **incidente only** — ver [BACKUP_POLICY.md](./BACKUP_POLICY.md) |
| Proteger | nunca Git, nunca chat, nunca pasta pública |

---

## 6. Auditorias e preflights

### Scripts npm oficiais

```powershell
npm run test:mia:supabase:foundation    # 20 testes
npm run test:mia:analytics:storage-schema  # 100 testes
npm run test:mia:supabase:baseline      # 78 testes
npm run build
```

### SQL preflight (read-only)

| Arquivo | Uso |
|---------|-----|
| `supabase/tests/baseline-preflight.sql` | 16 tabelas, FKs, RLS, analytics cols |
| `docs/analytics/analytics-events-schema-preflight.sql` | Analytics antes/depois |
| `supabase/tests/supabase-07a-remote-preflight-readonly.sql` | Bundle remoto |

Execução remota:

```powershell
npx supabase db query --linked -f supabase/tests/baseline-preflight.sql
```

**Antes de executar:** revisar integralmente — proibir INSERT/UPDATE/DELETE/DDL.

### Script de preflight remoto

```powershell
node scripts/run-supabase-07a-remote-preflight.mjs
```

Saída: `supabase/.temp/audit/SUPABASE-07A/` (gitignored).

### Smoke pós-mudança

```powershell
node scripts/run-supabase-07b-smoke-validation.mjs
```

Ver `supabase/planning/SUPABASE-07B-smoke-validation.md`.

---

## 7. Quando usar / quando NÃO usar

| Comando | Usar | Não usar |
|---------|------|----------|
| `db reset` | Validar migrations localmente | “Consertar” produção |
| `db query -f` | Executar **uma** migration aprovada | Batch de diretório |
| `migration repair` | Registrar histórico pós-equivalência | Substituir SQL real |
| `db dump` | Backup antes de escrita | Versionar dump no Git |
| `db push` | — | Quase sempre (sem auditoria) |
| `db pull` | — | Sobrescrever migrations Git |

---

## 8. Fluxograma operacional

```text
Nova migration
        ↓
Implementação local (supabase/migrations/)
        ↓
npm run test:mia:supabase:*
        ↓
npx supabase db reset (1–2 ciclos)
        ↓
npm run build
        ↓
Auditoria read-only remota (preflight)
        ↓
Classificar: repair | execução real | corretiva | hard stop
        ↓
Backup lógico (db dump)
        ↓
Gate individual por migration
        ↓
Validação física + smoke + interface
        ↓
Conclusão
```

---

## 9. Referências

- [PROJECT_RECOVERY.md](./PROJECT_RECOVERY.md)
- [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)
- [BACKUP_POLICY.md](./BACKUP_POLICY.md)
- `supabase/planning/SUPABASE-07A-production-runbook.md` (runbook histórico 07B)

---

*SUPABASE-08 — manual operacional consolidado.*
