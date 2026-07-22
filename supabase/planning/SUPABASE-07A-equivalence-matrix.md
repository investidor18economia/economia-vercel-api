# SUPABASE-07A — Matriz de Equivalência (Produção × Migrations Locais)

**Patch:** SUPABASE-07A (read-only)  
**Project ref:** `xzijmzqsquasrtnkotrw` (Teilor-MIA)  
**Data UTC:** 2026-07-21  
**Evidência:** dump lógico CP-1, `supabase db query --linked` (preflight), `migration list --linked`

> **Regra registrada:** `migration repair` altera **somente** o histórico registrado. Não cria, altera ou remove objetos. Não aplica nem reverte SQL.

## Resumo executivo

| Métrica | Valor |
|---------|-------|
| Migrations locais | 10 |
| Histórico remoto (`migration list --linked`) | **vazio** (remote="" em todas) |
| Tabela `supabase_migrations.schema_migrations` | **não existe** no remoto |
| Tabelas `public` | 16 |
| FKs em `public` | 0 |
| Preflights remotos | SELECT-only, executados |

## Matriz completa

| Timestamp | Migration | Classe | Estrutura | Segurança | Dados preservados | Ação proposta no 07B | Evidência |
|-----------|-----------|--------|-----------|-----------|-------------------|----------------------|-----------|
| 20260719153000 | `analytics_events_storage_schema_v1` | **C** | Colunas 15/15 equivalentes; PK presente; **índices legados** diferem dos oficiais (nomes, ordem DESC, parcial, composto) | Fora de escopo desta migration | Sim (~402 eventos agregados) | **EXECUÇÃO REAL DA MIGRATION** (idempotente: comments + `CREATE INDEX IF NOT EXISTS`); legacy permanece até migration corretiva opcional | Preflight remoto: `cols=15`; índices: `analytics_events_*_idx` + pkey; dump `schema-public.sql` |
| 20260719153001 | `analytics_events_storage_security_v1` | **C** | N/A (segurança) | RLS **desabilitado**; grants `SELECT` para `anon`/`authenticated`; **0 policies** (preflight G OK) | Sim | **EXECUÇÃO REAL DA MIGRATION** (enable RLS + revoke browser + grant service_role) | Remoto: `rls_enabled=false`, `policy_count=0`, grants browser presentes |
| 20260721194830 | `baseline_foundation_v1` | **A** | `usage_log`, `cache_results`, PKs, `set_updated_at()` presentes | Sem RLS na migration; produção equivalente | Sim | **REPAIR APPLIED** | Dump + preflight: 16 tabelas, função presente |
| 20260721194833 | `baseline_catalog_v1` | **A** | `phone_specs`, `notebook_specs`, `product_specs` + PKs/unique; **sem PK em product_specs** (replicado) | RLS + 3 policies de leitura idênticas | Sim | **REPAIR APPLIED** | Dump policies + RLS; preflight policies |
| 20260721194836 | `baseline_users_v1` | **A** | Tabela `users` + PK; colunas equivalentes | Sem RLS na migration; grants produção compatíveis | Sim (1 registro agregado) | **REPAIR APPLIED** | Dump + contagem agregada |
| 20260721194839 | `baseline_conversation_v1` | **A** | `conversations`, `messages`, `mia_sessions` + PKs; **sem FKs** (esperado) | Sem RLS na migration | Sim | **REPAIR APPLIED** | Dump constraints; FK count=0 remoto |
| 20260721194841 | `baseline_engagement_v1` | **A** | `wishes` + PK; colunas equivalentes | Sem RLS na migration | Sim | **REPAIR APPLIED** | Dump |
| 20260721194844 | `baseline_commercial_v1` | **A** | `commercial_products_cache`, `commercial_candidates` + constraints/índices | Sem bloco de segurança na migration | Sim | **REPAIR APPLIED** | Dump |
| 20260721194847 | `baseline_commercial_vault_v1` | **A** | `provider_credentials` 16 colunas + constraints/índices | RLS ON; **somente service_role** com privilégios de dados; revokes equivalentes | Sim (dados sensíveis não inspecionados) | **REPAIR APPLIED** | Preflight remoto grants vault; dump RLS |
| 20260721194850 | `baseline_alerts_v1` | **A** | `price_alerts`, `price_alert_delivery_logs` + índices/constraints | RLS ON em `price_alert_delivery_logs`; grants service_role-only equivalentes | Sim | **REPAIR APPLIED** | Dump + preflight colunas safety (6/6) |

## Detalhamento Analytics (53000 / 53001)

### 53000 — Schema

| Aspecto | Produção | Migration v1 | Equivalência |
|---------|----------|--------------|--------------|
| Colunas | 15 | 15 validadas | ✅ |
| PK `analytics_events_pkey` | presente | implícito no create vazio | ✅ |
| Índice composto `(event_name, created_at DESC)` | ausente | `idx_analytics_events_event_name_created_at` | ❌ |
| Índice `created_at DESC` | `analytics_events_created_at_idx` ASC | `idx_analytics_events_created_at` DESC | ❌ funcional |
| Índice session parcial | sem partial | partial `WHERE session_id IS NOT NULL` | ❌ |
| Índice category parcial | sem partial | partial `WHERE category IS NOT NULL` | ❌ |
| Índice extra product_name | presente (legado) | não previsto | legado extra |
| Comments oficiais | ausentes no dump | migration adiciona | drift documental |

**Classe C** — estrutura de tabela equivalente; índices operacionais divergentes.

### 53001 — Security

| Aspecto | Produção | Migration v1 | Equivalência |
|---------|----------|--------------|--------------|
| RLS | `false` | `ENABLE ROW LEVEL SECURITY` | ❌ |
| Policies | 0 | 0 intencional pós-migration | ✅ pré-condição |
| Grants browser | SELECT em anon/authenticated | REVOKE + service_role only | ❌ |
| Guard unexpected policies | N/A | passa (0 policies) | ✅ |

**Classe C** — segurança parcial/ausente; execução real necessária (repair sozinho não altera grants/RLS).

## Migrations corretivas propostas (não aplicadas)

| ID proposto | Motivo | Escopo | Risco | Validação local | Por que não executar baseline inteira |
|-------------|--------|--------|-------|-----------------|----------------------------------------|
| `analytics_indexes_reconcile_v1` (proposta) | Índices legados coexistem com oficiais após 53000 | DROP INDEX legados **somente após** validar planos de query e dashboards | Médio (performance temporária) | 2× `db reset` + `test:mia:analytics:storage-schema` | Baseline analytics já reconciliada; drift é pontual em índices |
| *(nenhuma corretiva baseline)* | Objetos baseline fisicamente presentes | — | — | — | Executar baseline inteira sobre tabelas existentes violaria regra arquitetural |

## Hard stops avaliados

| Condição | Status |
|----------|--------|
| Project ref incorreto | ✅ OK (`xzijmzqsquasrtnkotrw`) |
| Histórico remoto não vazio | ✅ OK (vazio; schema migrations ausente) |
| Divergência de tipo com risco | ✅ Não detectada |
| Vault exposto via anon/authenticated | ✅ Não (service_role only) |
| Preflight com escrita | ✅ Scripts revisados SELECT-only |
| Backup inválido | ✅ Arquivos >0 + SHA-256 registrados |

## Decisões pendentes do operador (SUPABASE-07B)

1. Aprovar **execução real** de `20260719153000` e `20260719153001`.
2. Aprovar **repair applied** sequencial das oito migrations baseline (94830→94850).
3. Decidir se migration corretiva de índices legados Analytics será necessária após 53000.
4. Confirmar checklist Dashboard (plano, PITR, retenção) antes de janela de escrita.
