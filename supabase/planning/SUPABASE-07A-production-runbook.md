# SUPABASE-07A — Runbook SUPABASE-07B (NÃO EXECUTADO)

**Patch atual:** SUPABASE-07A — plano apenas  
**Execução:** SUPABASE-07B — **aguardando autorização explícita do operador**

> **Lembrete:** `migration repair` altera somente o histórico. Não aplica SQL.  
> `migration repair --status reverted` não desfaz objetos.

---

## 7.1 Pré-condições (obrigatórias)

- [ ] Backup CP-1 validado (`supabase/.temp/backups/SUPABASE-07A/`)
- [ ] Checklist Dashboard concluído (plano, retenção, PITR, restore)
- [ ] Project ref confirmado: `xzijmzqsquasrtnkotrw`
- [ ] Testes locais verdes (foundation, analytics, baseline, build)
- [ ] Janela de manutenção acordada (53001 altera grants/RLS Analytics)
- [ ] Observabilidade: logs Supabase + app MIA disponíveis
- [ ] Operador presente e rollback compreendido
- [ ] Autorização escrita explícita para cada migration abaixo

**Sintaxe confirmada (CLI 2.109.1):**

```text
npx supabase migration repair --linked --status applied <version>
npx supabase migration repair --linked --status reverted <version>
```

Para execução real de SQL de migration individual (alternativa a batch push):

```text
npx supabase migration up --linked --include-all
# ou aplicar SQL auditado via pipeline aprovado — confirmar flags no momento da execução:
npx supabase migration up --help
```

---

## 7.2 Ordem cronológica e comandos propostos

### Gate 0 — Baseline operacional

```powershell
npx supabase migration list --linked
npx supabase status
npm run test:mia:supabase:foundation
npm run test:mia:analytics:storage-schema
npm run test:mia:supabase:baseline
```

**Critério:** remote ainda vazio; testes locais verdes.

---

### Step 1 — `20260719153000` Analytics Schema

**Classe:** C | **Ação:** EXECUÇÃO REAL DA MIGRATION

**Motivo:** adiciona comments + índices oficiais idempotentes; colunas já equivalentes.

**Comando proposto (confirmar flag exata no 07B):**

```powershell
# Opção A — aplicar migration real (preferida quando drift de índices existe)
npx supabase migration up --linked --include-all --version 20260719153000

# Opção B — se pipeline usar SQL direto auditado (somente após aprovação):
# Executar conteúdo de supabase/migrations/20260719153000_analytics_events_storage_schema_v1.sql
# Depois registrar histórico:
npx supabase migration repair --linked --status applied 20260719153000
```

**Gate pós-step:**

```powershell
npx supabase migration list --linked
npx supabase db query --linked "select count(*) from information_schema.columns where table_schema='public' and table_name='analytics_events'"
npx supabase db query --linked "select indexname from pg_indexes where schemaname='public' and tablename='analytics_events' order by indexname"
# Executar docs/analytics/analytics-events-schema-preflight.sql (read-only)
```

**Smoke read-only:** contagem eventos inalterada (±0 inserts durante janela).

**Aprovação operador:** ☐ Step 1

---

### Step 2 — `20260719153001` Analytics Security

**Classe:** C | **Ação:** EXECUÇÃO REAL DA MIGRATION

**Motivo:** RLS off + grants browser; repair não corrige segurança.

**Pré-check:**

```powershell
npx supabase db query --linked "select count(*) as policy_count from pg_policies where schemaname='public' and tablename='analytics_events'"
```

**Comando proposto:**

```powershell
npx supabase migration up --linked --include-all --version 20260719153001
# ou SQL auditado + repair:
# npx supabase migration repair --linked --status applied 20260719153001
```

**Gate pós-step:**

```powershell
npx supabase db query --linked "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='analytics_events'"
npx supabase db query --linked "select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='analytics_events' and grantee in ('anon','authenticated','service_role') order by grantee"
```

**Esperado:** RLS=true; anon/authenticated sem SELECT; service_role com SELECT/INSERT.

**Smoke read-only:** endpoint analytics server-side (service_role) responde.

**Aprovação operador:** ☐ Step 2

---

### Step 3 — `20260721194830` Foundation

**Classe:** A | **Ação:** REPAIR APPLIED

```powershell
npx supabase migration repair --linked --status applied 20260721194830
```

**Gate:**

```powershell
npx supabase migration list --linked
npx supabase db query --linked -f supabase/tests/baseline-preflight.sql
```

**Aprovação operador:** ☐ Step 3

---

### Step 4 — `20260721194833` Catalog

**Classe:** A | **Ação:** REPAIR APPLIED

```powershell
npx supabase migration repair --linked --status applied 20260721194833
```

**Gate:** policies catálogo + RLS (read-only queries seção C/D baseline preflight).

**Aprovação operador:** ☐ Step 4

---

### Step 5 — `20260721194836` Users

**Classe:** A | **Ação:** REPAIR APPLIED

```powershell
npx supabase migration repair --linked --status applied 20260721194836
```

**Aprovação operador:** ☐ Step 5

---

### Step 6 — `20260721194839` Conversation

**Classe:** A | **Ação:** REPAIR APPLIED

```powershell
npx supabase migration repair --linked --status applied 20260721194839
```

**Aprovação operador:** ☐ Step 6

---

### Step 7 — `20260721194841` Engagement

**Classe:** A | **Ação:** REPAIR APPLIED

```powershell
npx supabase migration repair --linked --status applied 20260721194841
```

**Aprovação operador:** ☐ Step 7

---

### Step 8 — `20260721194844` Commercial

**Classe:** A | **Ação:** REPAIR APPLIED

```powershell
npx supabase migration repair --linked --status applied 20260721194844
```

**Aprovação operador:** ☐ Step 8

---

### Step 9 — `20260721194847` Commercial Vault

**Classe:** A | **Ação:** REPAIR APPLIED

```powershell
npx supabase migration repair --linked --status applied 20260721194847
```

**Gate extra (alto risco):**

```powershell
npx supabase db query --linked "select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='provider_credentials' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE') order by grantee"
```

**Esperado:** apenas `service_role`.

**Aprovação operador:** ☐ Step 9

---

### Step 10 — `20260721194850` Alerts

**Classe:** A | **Ação:** REPAIR APPLIED

```powershell
npx supabase migration repair --linked --status applied 20260721194850
```

**Gate:** RLS delivery_logs + índices anti-spam presentes.

**Aprovação operador:** ☐ Step 10

---

### Gate final — Histórico completo

```powershell
npx supabase migration list --linked
```

**Esperado:** 10 local = 10 remote (todas applied).

```powershell
npm run test:mia:supabase:foundation
npm run test:mia:analytics:storage-schema
npm run test:mia:supabase:baseline
npm run build
```

---

## 7.5 Forward-fix e rollback

| Tipo | Mecanismo | Efeito real |
|------|-----------|-------------|
| Rollback histórico | `repair --status reverted` | Só tabela de histórico |
| Rollback estrutural | Nova migration corretiva | Altera objetos |
| Rollback dados | Restore backup CP-1 / PITR | Incidente only |
| Rollback app | Deploy versão anterior | Fora do escopo DB |

**Proibido no 07B sem aprovação:** batch cego `db push` das 10 migrations; DROP destrutivo; TRUNCATE.

---

## Fase 8 — Smoke-test plan

### Read-only (executar durante/after 07B)

| Teste | Método | Critério |
|-------|--------|----------|
| Catálogo | SELECT count em `phone_specs`, `notebook_specs` | >0, sem erro |
| Schema inventory | baseline preflight seções A–D | 16 tabelas, FK 0 |
| Analytics schema | analytics preflight A–G | 15 cols, RLS pós-53001 |
| Vault grants | query grants provider_credentials | service_role only |
| Health | app + Supabase dashboard | ACTIVE_HEALTHY |
| Migration history | `migration list --linked` | coerente após cada gate |

### Escrita controlada (somente 07B, com aprovação explícita)

| Teste | Identificador | Limpeza |
|-------|---------------|---------|
| Evento analytics teste | `event_name='supabase_07b_smoke_test'` | DELETE próprio registro |
| Alerta teste | user/email prefix `supabase-07b-smoke-` | DELETE alerta + logs associados |
| Conversa teste | metadata tag `supabase_07b_smoke` | DELETE mensagens/conversa próprias |
| Credencial comercial | **não criar** em produção real | usar staging ou skip |

**Regras:** nunca apagar dados existentes; registrar IDs criados; validar limpeza.

---

## Operações expressamente proibidas no 07A

Conforme executado: nenhuma das operações abaixo foi realizada neste patch.

- `supabase db push`
- `supabase migration repair`
- `supabase migration up --linked`
- SQL remoto de escrita
- restore / PITR activation / mudança de plano

---

## Decisão necessária do operador

Antes de iniciar SUPABASE-07B, autorizar explicitamente:

1. Execução real Steps 1–2 (Analytics)  
2. Repair Steps 3–10 (baseline) — **8 comandos separados**  
3. Janela de manutenção para revogação de grants Analytics  
4. Checklist Dashboard CP-1  
5. (Opcional) Migration corretiva futura de índices legados Analytics  

**Aguardar auditoria do operador. Não iniciar 07B automaticamente.**
