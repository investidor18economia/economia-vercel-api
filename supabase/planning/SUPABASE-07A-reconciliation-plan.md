# SUPABASE-07A — Plano de Reconciliação (Read-Only)

**Patch:** SUPABASE-07A  
**Status:** diagnóstico concluído — **nenhuma escrita remota executada**  
**Próximo patch:** SUPABASE-07B (requer autorização explícita)

---

## 1. Objetivo

Confirmar estado de recuperação, gerar backup lógico, auditar produção somente leitura, classificar dez migrations locais contra produção e produzir plano exato para SUPABASE-07B — **sem alterar produção**.

---

## 2. Estado confirmado de entrada

| Item | Resultado |
|------|-----------|
| SUPABASE-06 | ✅ Aprovado |
| Migrations locais | 10 (2 Analytics + 8 baseline) |
| `migration list --linked` | 10 local / **remote vazio** |
| `supabase_migrations.schema_migrations` | **não existe** no remoto |
| Produção física | 16 tabelas `public`, 0 FKs |
| Migrations alteradas inesperadamente | ❌ Não (`git diff -- supabase/migrations/` vazio) |

---

## 3. Fases executadas

### Fase 0 — Revalidação local e Git

- Docker Client/Server ativos
- Supabase CLI **2.109.1**
- Supabase local saudável
- Testes: foundation 20/20, analytics 100/100, baseline 78/78
- Estado Git preexistente registrado (docs/scripts/supabase planning — não commitado)

### Fase 1 — Vínculo remoto

- Projeto: **Teilor-MIA** / `xzijmzqsquasrtnkotrw`
- Região: `sa-east-1`
- PostgreSQL: **17.6.1.105**
- Histórico remoto: **vazio** (confirmado)

### Fase 2 — CP-1 Proteção e recuperação

#### 2.1 Dashboard — checklist manual pendente

O operador deve confirmar no Supabase Dashboard (**sem alterar nada**):

- [ ] Plano atual do projeto
- [ ] Última data/hora de backup gerenciado disponível
- [ ] Retenção visível
- [ ] PITR habilitado ou não
- [ ] Existência de backup lógico para download (se oferecido pelo plano)
- [ ] Mecanismo de restore disponível
- [ ] Tamanho aproximado do banco
- [ ] Status de saúde (`ACTIVE_HEALTHY` esperado)

**Não habilitar PITR, não mudar plano, não restaurar, não reiniciar.**

#### 2.2 Backup lógico CP-1

Comandos (read-only dump remoto):

```powershell
npx supabase db dump --linked -f supabase/.temp/backups/SUPABASE-07A/roles.sql --role-only
npx supabase db dump --linked -f supabase/.temp/backups/SUPABASE-07A/schema-public.sql --schema public
npx supabase db dump --linked -f supabase/.temp/backups/SUPABASE-07A/data-public.sql --data-only --schema public
```

| Arquivo | Bytes | SHA-256 (arquivo completo) |
|---------|-------|----------------------------|
| `roles.sql` | 297 | `25873CEC56A2CC6514E204F420231777F85C03DA818CAA7090CDCDFA89776ECD` |
| `schema-public.sql` | 22,346 | `92CBFB8A163159949E4A4111B98F47D4F3949E8AD1720CD60679B2255BA26CCA` |
| `data-public.sql` | 745,514 | `E3631732EE81E2A3E028BA4389F919B9BDB432E3B69882FFB865D19557F2F701` |

Local: `supabase/.temp/backups/SUPABASE-07A/` (gitignored)

#### 2.3 Validação backup

- Arquivos existem, tamanho > 0
- Hashes SHA-256 calculados
- Timestamp UTC coleta: **2026-07-21 ~20:12–20:13 UTC**
- Nenhum arquivo staged no Git (`git check-ignore supabase/.temp` OK)

#### 2.4 Limites do backup

- Cobre **PostgreSQL** (roles, schema public, data public)
- **Storage API** exige proteção separada — não incluída neste patch
- Restore depende do plano/configuração Supabase
- Existência ≠ validade operacional completa; backup verificável por hash/tamanho/conteúdo estrutural

### Fase 3 — Inventário imutável remoto

Artefatos em `supabase/.temp/audit/SUPABASE-07A/`:

- Cópia `schema-public.sql`
- `remote-preflight-q*.json` (13 consultas read-only)
- `remote-preflight-manifest.json`

Métodos: `db dump`, `db query --linked`, `inspect db table-stats --linked`

### Fase 4 — Preflights read-only

Scripts revisados integralmente (somente SELECT):

- `supabase/tests/baseline-preflight.sql`
- `docs/analytics/analytics-events-schema-preflight.sql`
- `supabase/tests/supabase-07a-remote-preflight-readonly.sql` (novo bundle)

Executados remotamente via `npx supabase db query --linked` e script `scripts/run-supabase-07a-remote-preflight.mjs`.

**Resultados-chave:**

| Check | Esperado | Remoto |
|-------|----------|--------|
| Tabelas public | 16 | 16 |
| FKs | 0 | 0 |
| analytics_events cols | 15 | 15 |
| analytics RLS | — | false |
| analytics policies | 0 pré-53001 | 0 |
| provider_credentials cols | 16 | 16 |
| price_alerts safety cols | 6 | 6 |

### Fase 5–6 — Classificação

Ver matriz completa: [`SUPABASE-07A-equivalence-matrix.md`](./SUPABASE-07A-equivalence-matrix.md)

### Fase 7 — Runbook 07B

Ver: [`SUPABASE-07A-production-runbook.md`](./SUPABASE-07A-production-runbook.md)

### Fase 8 — Smoke-test plan

Documentado no runbook (seção Smoke tests).

### Fase 9 — Testes locais finais

Executados ao final deste patch:

| Comando | Resultado |
|---------|-----------|
| `npx supabase db reset` | ✅ 10/10 migrations aplicadas |
| `npm run test:mia:supabase:foundation` | ✅ 20/20 |
| `npm run test:mia:analytics:storage-schema` | ✅ 100/100 |
| `npm run test:mia:supabase:baseline` | ✅ 78/78 |
| `npm run build` | ✅ aprovado |

---

## 4. Estratégia de reconciliação proposta

### Princípio

Produção foi construída manualmente (MVP). Migrations locais documentam o estado aprovado. Reconciliação = **histórico CLI** + **ajustes pontuais onde drift real existe**.

### Ordem cronológica obrigatória

1. `20260719153000` — Analytics Schema  
2. `20260719153001` — Analytics Security  
3. `20260721194830` — Foundation  
4. `20260721194833` — Catalog  
5. `20260721194836` — Users  
6. `20260721194839` — Conversation  
7. `20260721194841` — Engagement  
8. `20260721194844` — Commercial  
9. `20260721194847` — Commercial Vault  
10. `20260721194850` — Alerts  

### Por tipo de ação

| Tipo | Migrations | Justificativa |
|------|------------|---------------|
| **EXECUÇÃO REAL** | 53000, 53001 | Drift real (índices/comments; RLS/grants). Repair não corrige estrutura/segurança. |
| **REPAIR APPLIED** | 94830–94850 | Objetos fisicamente equivalentes; migration idempotente não deve ser reexecutada integralmente. |

### Rollback (registro)

- `migration repair --status reverted` → **somente histórico**; não desfaz SQL
- Rollback estrutural → forward-fix preferido; restore backup apenas em incidente com decisão explícita

---

## 5. Segurança observada

| Domínio | Estado produção | Risco |
|---------|-----------------|-------|
| Analytics | Browser SELECT grants; RLS off | **Médio** — 53001 corrige |
| Catalog | RLS read-only anon/auth | Baixo |
| Vault | RLS + service_role only | **Controlado** — não exposto |
| Alerts logs | RLS + service_role only | Controlado |
| SECURITY DEFINER | Não identificado em funções auditadas | — |
| FKs ausentes | Documentado/intencional | Baixo (integridade app-level) |

---

## 6. Produção intacta (confirmação)

- ❌ Nenhuma migration aplicada remotamente  
- ❌ Nenhum `migration repair`  
- ❌ Nenhum `db push`  
- ❌ Nenhum SQL remoto de escrita  
- ❌ Nenhuma policy/grant alterado  
- ❌ Nenhum dado criado/alterado/removido  

---

## 7. Arquivos deste patch

| Arquivo | Ação |
|---------|------|
| `supabase/planning/SUPABASE-07A-reconciliation-plan.md` | criado |
| `supabase/planning/SUPABASE-07A-equivalence-matrix.md` | criado |
| `supabase/planning/SUPABASE-07A-production-runbook.md` | criado |
| `supabase/tests/supabase-07a-remote-preflight-readonly.sql` | criado |
| `scripts/run-supabase-07a-remote-preflight.mjs` | criado |
| `supabase/.temp/backups/SUPABASE-07A/*` | backup CP-1 (gitignored) |
| `supabase/.temp/audit/SUPABASE-07A/*` | auditoria (gitignored) |
