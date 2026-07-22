# SUPABASE-05 — Estratégia Oficial de Baseline e Reconciliação

> **Status:** Consolidado em SUPABASE-05A — pronto como entrada oficial do SUPABASE-06.  
> **Escopo:** planejamento exclusivo — nenhum SQL executável de produção.  
> **Evidência base:** SUPABASE-04 (`supabase/.temp/audit/supabase-04-audit-report.json`).

---

## Regras transversais do documento

### Identificadores conceituais vs. migrations oficiais

> Os nomes apresentados neste documento são **identificadores conceituais**. Os timestamps e nomes oficiais das migrations deverão ser gerados **somente** no momento da criação real dos arquivos durante o **SUPABASE-06**, usando o fluxo oficial da Supabase CLI ou outro mecanismo aprovado naquele patch.

> **Nenhum timestamp deverá ser inventado, retrodatado ou reservado durante o planejamento.**

### Separação de camadas

> **O SUPABASE-05 define o que será construído e sob quais regras. O SUPABASE-06 definirá os arquivos reais, os timestamps, o SQL exato e os testes executáveis.**

| Camada | Conteúdo | O que **não** contém |
|--------|----------|----------------------|
| **1 — Estratégia aprovada** | Decisões permanentes e invariantes | Timestamps, SQL, repair em produção |
| **2 — Projeto técnico (SUPABASE-06)** | Domínios, objetos, ordem conceitual, gates, critérios | Timestamps oficiais, SQL definitivo |
| **3 — Implementação futura** | Criação de arquivos, Docker, testes, preflights, repair remoto | Pertence ao SUPABASE-06 e SUPABASE-07 |

### Ordem conceitual vs. ordem cronológica

A sequência abaixo é **ORDEM CONCEITUAL E DE DEPENDÊNCIAS**. Ela **não** representa timestamps já definidos. Os timestamps reais materializarão essa ordem quando as migrations forem criadas no SUPABASE-06.

```text
Foundation
→ Catalog
→ Users
→ Conversation
→ Engagement
→ Commercial
→ Commercial Vault
→ Alerts
→ Analytics Schema (migration existente)
→ Analytics Security (migration existente)
```

**Migrations Analytics existentes** — preservar nomes e timestamps reais atuais (não renomear, mover nem modificar neste documento):

```text
20260719153000_analytics_events_storage_schema_v1.sql
20260719153001_analytics_events_storage_security_v1.sql
```

---

# Camada 1 — Estratégia aprovada

Decisões permanentes validadas no SUPABASE-05 e preservadas nesta consolidação.

## Modelo híbrido

| Modelo | Veredito | Motivo |
|--------|----------|--------|
| Baseline único | ❌ Rejeitado | ~16 tabelas + índices + RLS/grants em um arquivo = diff impossível de revisar, rollback granular inexistente |
| Baseline por domínio puro (16 arquivos) | ❌ Rejeitado | Excesso de operações de repair, ordem frágil, overhead operacional |
| **Híbrido (escolhido)** | ✅ | **Uma onda de baseline** (janela única de oficialização) composta por **migrations de domínio** + **2 migrations Analytics existentes**, preservando bounded contexts |

## Invariantes arquiteturais

- **Git** = única fonte executável de verdade (após SUPABASE-06/07).
- **Preservação de dados** — produção não será recriada; baseline = reconciliação idempotente.
- **Migrations idempotentes** — padrão validate-or-create (evidência: `20260719153000`).
- **Schema ≠ Security** — Analytics Schema e Analytics Security permanecem separadas.
- **Analytics no final** — após domínios de aplicação; security Analytics por último.
- **Zero operações destrutivas** — proibido `DROP`, `TRUNCATE`, `DELETE` em massa, `DROP COLUMN`.
- **Tabelas sensíveis** — `provider_credentials`, `price_alert_delivery_logs`, `analytics_events` exigem fail-closed (`service_role`, RLS, preflight).
- **Preflight obrigatório** — antes de security remota e antes de qualquer repair.
- **Baseline local validado** — Docker + `db reset` green **antes** de qualquer ação remota.
- **Produção remota** — somente no **SUPABASE-07**, com aprovação explícita; **SUPABASE-06 não aplica em produção**.
- **Backup antes de produção** — checkpoint CP-1 obrigatório no SUPABASE-07.

## `migration repair` — princípios estratégicos

- **Não faz parte do baseline físico** — repair altera apenas o **histórico registrado** na CLI.
- **Nunca** esconder drift estrutural — repair não substitui validação.
- **Nunca** marcar applied só porque uma tabela com o mesmo nome existe.
- **Equivalência** deve incluir, quando aplicável: colunas, tipos, defaults, constraints, índices, RLS, policies, grants, functions e triggers.
- **Equivalência parcial** → corrigir estado físico com migration idempotente ou migration de reconciliação específica; **não** repair.
- **Decisão final de repair** → **SUPABASE-07** (não SUPABASE-06).

## Rollback — conceitos

| Tipo | O que faz | O que **não** faz |
|------|-----------|-------------------|
| **Rollback de histórico** | Alteração controlada do registro de migrations (`repair --status reverted`) | Desfaz DDL, RLS, grants, policies ou dados |
| **Rollback estrutural** | Migration corretiva forward-only ou restauração de backup | Automático via repair |
| **Rollback de dados** | PITR, snapshot ou backup Supabase | Reversão de migration DOWN |
| **Rollback de aplicação** | Rollback de deploy (ex.: Vercel) | Altera schema do banco |
| **Operação preferencial** | Forward-fix após alteração segura | Restore completo |
| **Restauração de backup** | Apenas quando necessária e **aprovada** | Rotina |

> `migration repair --status reverted` altera o histórico de migrations e **não** desfaz DDL, RLS, grants, policies ou dados.

---

# Camada 2 — Projeto técnico para o SUPABASE-06

Orienta implementação. **Sem timestamps oficiais. Sem SQL definitivo.**

## Gate de dependências (SUPABASE-06)

> Antes de escrever a ordem definitiva das migrations, o SUPABASE-06 deverá obter o DDL completo ou evidência equivalente para confirmar foreign keys, constraints, triggers, sequences, functions e dependências reais.

Motivo: SUPABASE-04 não inventariou FKs/triggers completos (dump estrutural bloqueado por Docker ausente).

## Domínios e objetos

| Domínio | Tabelas | Origem evidenciada | Linhas est. (SUPABASE-04) |
|---------|---------|-------------------|---------------------------|
| **Foundation** | `usage_log`, `cache_results` | MVP manual | 0 / 0 |
| **Catalog** | `phone_specs`, `product_specs`, `notebook_specs` | MVP manual | 505 / 47 / 10 |
| **Users** | `users` | MVP manual + `pages/api/register-user.js` | 1 |
| **Conversation** | `conversations`, `messages`, `mia_sessions` | MVP manual | 0 / 0 / 0 |
| **Engagement** | `wishes` | MVP manual | 10 |
| **Commercial** | `commercial_products_cache`, `commercial_candidates` | MVP manual | 65 / 0 |
| **Commercial Vault** | `provider_credentials` | `docs/commercial/provider-credentials.sql` | 1 |
| **Alerts** | `price_alerts`, `price_alert_delivery_logs` | `docs/alerts/*.sql` (PATCH 2, 9, 9b) | 9 / 6 |
| **Analytics** | `analytics_events` | migrations existentes 53000 / 53001 | ~400 |

**Nota:** `Engagement` permanece separado de `Users` — `wishes` é domínio de produto distinto do cadastro mínimo.

## Classificação de dependências

Legenda: **CS** = dependência estrutural comprovada | **L** = dependência lógica | **P** = dependência provável a confirmar | **N** = sem dependência

| Relação | Classificação | Evidência / observação |
|---------|---------------|------------------------|
| Foundation → demais | **N** | Tabelas utilitárias; sem FK comprovada no SUPABASE-04 |
| Catalog → Commercial | **P** | Produtos comerciais referenciam specs — lógica de runtime; FK **a confirmar no SUPABASE-06 por inspeção do DDL/FKs** |
| Users → Conversation | **P** | Conversas tipicamente ligadas a usuários; FK **a confirmar no SUPABASE-06** |
| Users → Engagement (`wishes`) | **L** | Runtime usa `user_id`; FK física **a confirmar no SUPABASE-06** |
| Users → Alerts (`price_alerts`) | **L** | PATCH 2 indexa `user_id`; FK **a confirmar no SUPABASE-06** |
| Commercial → Commercial Vault | **L** | Vault isolado após domínio commercial por risco de segurança, não por FK comprovada |
| Alerts → Analytics | **N** | `analytics_events` independente (SUPABASE-04) |
| Analytics Schema → Analytics Security | **CS** | Migration 53001 declara prerequisite 53000 no repositório |

## Ordem conceitual das migrations (identificadores conceituais)

| Ordem | Identificador conceitual | Objetivo | Dependência (conceitual) |
|-------|--------------------------|----------|--------------------------|
| 1 | `baseline_foundation_v1` | Tabelas utilitárias | Nenhuma |
| 2 | `baseline_catalog_v1` | Specs de produto | Foundation, quando aplicável (**P**) |
| 3 | `baseline_users_v1` | Cadastro `users` | Foundation, quando aplicável (**P**) |
| 4 | `baseline_conversation_v1` | `conversations`, `messages`, `mia_sessions` | Users (**P**) |
| 5 | `baseline_engagement_v1` | `wishes` | Users (**L**) |
| 6 | `baseline_commercial_v1` | Cache e candidatos comerciais | Catalog (**P**) |
| 7 | `baseline_commercial_vault_v1` | `provider_credentials` + segurança | Commercial (**L**) |
| 8 | `baseline_alerts_v1` | `price_alerts`, logs, permissions | Users (**L**) |
| 9 | `20260719153000_analytics_events_storage_schema_v1` | Reconciliação schema Analytics | Baselines aplicáveis (**N** para Analytics) |
| 10 | `20260719153001_analytics_events_storage_security_v1` | RLS e grants Analytics | Analytics Schema + preflight G (**CS**) |

**Volume planejado:** 8 identificadores conceituais de baseline + 2 migrations Analytics existentes = **10 migrations** na onda (ajustável no SUPABASE-06 se Alerts unificar índices no mesmo arquivo).

**Por que esta ordem minimiza risco (conceitual):**
1. Começa por tabelas sem dados sensíveis e sem dependências comprovadas.
2. `users` antes de domínios que referenciam usuário (lógica/provável).
3. `provider_credentials` isolado com bloco de segurança dedicado.
4. Analytics schema → Analytics security **sempre por último**.

## Matriz — identificadores conceituais

| Identificador conceitual | Objetivo | Dependências | Risco |
|--------------------------|----------|--------------|-------|
| `baseline_foundation_v1` | Tabelas utilitárias | Nenhuma | Baixo |
| `baseline_catalog_v1` | Specs de produtos | Foundation, quando aplicável (**P**) | Baixo |
| `baseline_users_v1` | Cadastro de usuários | Foundation, quando aplicável (**P**) | Médio |
| `baseline_conversation_v1` | Conversas, mensagens e sessões | Users (**P** — a confirmar FKs no SUPABASE-06) | Médio |
| `baseline_engagement_v1` | Wishes e interações | Users (**L**) | Médio |
| `baseline_commercial_v1` | Cache e candidatos comerciais | Catalog (**P**) | Médio |
| `baseline_commercial_vault_v1` | Credenciais e segurança | Commercial (**L**) | **Alto** |
| `baseline_alerts_v1` | Alertas, logs e permissions | Users (**L**) | **Alto** |
| Migration Analytics Schema existente (`20260719153000_*`) | Reconciliação Analytics | Baselines aplicáveis | Médio |
| Migration Analytics Security existente (`20260719153001_*`) | RLS e grants Analytics | Analytics Schema + preflight G | **Alto** |

## Matriz domínio × objetos

| Domínio | Objetos | Origem | Estratégia |
|---------|---------|--------|------------|
| Foundation | `usage_log`, `cache_results` | MVP | Reconciliação + repair (SUPABASE-07) |
| Catalog | `phone_specs`, `product_specs`, `notebook_specs` | MVP | Reconciliação + repair |
| Users | `users` | MVP + API | Reconciliação + repair |
| Conversation | `conversations`, `messages`, `mia_sessions` | MVP | Reconciliação + repair |
| Engagement | `wishes` | MVP | Reconciliação + repair |
| Commercial | `commercial_products_cache`, `commercial_candidates` | MVP | Reconciliação + repair |
| Commercial Vault | `provider_credentials` | docs/commercial | Reconciliação + security + repair |
| Alerts | `price_alerts`, `price_alert_delivery_logs` | docs/alerts | Reconciliação + security + repair |
| Analytics | `analytics_events` | 53000 / 53001 | 53000 repair esperado; 53001 apply após preflight |

## Padrão SQL obrigatório (a ser implementado no SUPABASE-06)

Toda migration de baseline deverá seguir o **padrão de reconciliação** já usado em Analytics 53000:

```text
BEGIN
  → IF NOT EXISTS: CREATE (ambiente vazio local)
  → IF EXISTS: validar colunas/tipos/constraints (RAISE se drift)
  → CREATE INDEX IF NOT EXISTS (ou validar índices legados equivalentes)
  → COMMENT ON (idempotente)
  → bloco security separado quando aplicável
COMMIT
```

## Estratégia Analytics (migrations existentes)

| Migration existente | Decisão | Justificativa |
|---------------------|---------|---------------|
| `20260719153000_*` | **Permanece** incremental de reconciliação | 100/100 testes; colunas produção = v1; não absorver no baseline DDL |
| Índices 53000 | **Ajuste no SUPABASE-06** | Índices legados em produção; validar equivalência funcional antes de CREATE |
| `20260719153001_*` | **Permanece separada** | Schema/security — PATCH 1.4 |
| Apply 53001 | **Somente após preflight G = 0 policies browser** | Fail-safe se policies inesperadas |

## Estratégia do legado

| Tipo | Tratamento |
|------|------------|
| SQLs em `docs/alerts/` | Referência → canonicalizar em `baseline_alerts_v1` (SUPABASE-06) |
| SQLs em `docs/commercial/` | Referência → canonicalizar em `baseline_commercial_vault_v1` |
| Tabelas MVP sem SQL no repo | Inventário SUPABASE-04 → checklist de validação |
| Índices legados | **Preservar nomes** em produção; validar existência, não renomear |
| Comentários | Idempotente; divergência = aviso |
| Grants / RLS / policies | Bloco dedicado por domínio sensível; fail-closed `service_role` |

**Docs SQL não serão reexecutados em produção** — serão transcritos para migrations versionadas.

## Estratégia de índices legados

- Validar equivalência funcional (colunas indexadas, partial predicates quando aplicável).
- Não renomear índices existentes em produção.
- Não criar duplicata funcional (caso Analytics: `analytics_events_event_name_idx` vs. composite v1).

## Estratégia de segurança (RLS, grants, policies)

- Domínios sensíveis: Commercial Vault, Alerts (logs), Analytics Security.
- Padrão: `ENABLE RLS` + `REVOKE` browser roles + grants `service_role` + zero policies anon/authenticated.
- Preflight adaptado (queries E–G para Analytics; equivalentes por domínio no SUPABASE-06/07).

## Docker (requisito SUPABASE-06)

Docker **não** é necessário para SUPABASE-05 / SUPABASE-05A.

No **SUPABASE-06**, antes de criar ou validar migrations definitivas, deverá ser confirmado:

- Docker Desktop instalado e funcional;
- Versão compatível com Supabase CLI 2.109.1;
- `supabase start` / `db reset` operacionais **localmente**;
- Execução local **não afeta** o projeto remoto vinculado.

Uso previsto: `supabase start`, `db reset`, `migration up`, `db dump --schema-only` (local), testes audit.

## Backups e checkpoints

| Checkpoint | Momento | Ação |
|------------|---------|------|
| CP-0 | Antes SUPABASE-06 | Tag Git manual (operador) |
| CP-1 | Antes SUPABASE-07 | Backup Supabase (PITR/snapshot) |
| CP-2 | Antes Analytics 53001 | Preflight A–H + count `analytics_events` |
| CP-3 | Após batch repair | Log `migration list --linked` |
| CP-4 | Pós SUPABASE-07 | Inspeção SQL + smoke APIs |

## Critérios de aprovação

### SUPABASE-06 aprovado quando:

- [ ] Migrations baseline escritas (padrão reconciliação) com timestamps gerados na criação real
- [ ] DDL/FKs confirmados ou dependências reclassificadas com evidência
- [ ] `supabase db reset` local 100% green
- [ ] Testes audit existentes + novo baseline audit passando
- [ ] Nenhum `DROP`/destrutivo
- [ ] **Nenhuma aplicação remota**

### SUPABASE-07 aprovado quando:

- [ ] CP-1 backup confirmado
- [ ] Preflight por migration PASS em produção
- [ ] `migration list --linked` local = remoto
- [ ] Row counts estáveis (tabelas críticas)
- [ ] Smoke APIs: register-user, create-price-alert, analytics track, commercial vault
- [ ] Repair aplicado **somente** onde equivalência comprovada

### Projeto oficialmente migrado quando:

- [ ] SUPABASE-08 documentação alinhada
- [ ] Zero drift estrutural conhecido
- [ ] RLS confirmado em tabelas sensíveis
- [ ] Git = única fonte executável de verdade

## Riscos (resumo)

| Risco | Nível | Mitigação |
|-------|-------|-----------|
| Repair prematuro | **Alto** | Preflight + equivalência completa; decisão no SUPABASE-07 |
| FKs não mapeadas | **Médio** | Gate DDL no início do SUPABASE-06 |
| Índices Analytics duplicados | **Médio** | Validar legado vs v1 |
| RLS desconhecido Vault/Alerts | **Alto** | Preflight grants/policies SUPABASE-07 |
| Doc provider-credentials desatualizado | **Baixo** | SUPABASE-08 |
| Docker ausente | **Médio** | Bloquear SUPABASE-06 até confirmado |

---

# Camada 3 — Implementação futura

Pertence ao **SUPABASE-06** (e validação remota ao **SUPABASE-07**). Não faz parte deste documento executável.

## SUPABASE-06 — escopo de implementação

- Criação real dos arquivos em `supabase/migrations/`
- Geração dos timestamps (CLI ou mecanismo aprovado)
- Escrita do SQL definitivo (padrão reconciliação)
- Engenharia dos preflights por domínio
- Criação de `test:mia:supabase:baseline` (ou equivalente)
- Validação com Docker (`db reset`, migration up)
- Ajustes nas migrations Analytics existentes (índices legados)
- Confirmação de FKs/constraints/triggers via DDL completo
- **Proibido:** repair remoto, db push/pull em produção, alteração de dados

## SUPABASE-07 — escopo de validação remota

- Backup CP-1
- Preflight por migration em produção
- `migration repair` **condicional** (equivalência comprovada)
- Execução real quando drift exige (ex.: Analytics 53001)
- Smoke tests e inspeção final

## Fluxo repair planejado (SUPABASE-07)

1. **Local (SUPABASE-06):** `db reset` → todas migrations green em DB vazio.
2. **Produção (SUPABASE-07):** preflight migration N → PASS → `repair applied` **ou** executar migration se drift.
3. Analytics 53000: repair **esperado** (schema existe).
4. Analytics 53001: **execução real provável** se RLS/grants ausentes (após preflight G).

---

*Documento consolidado em SUPABASE-05A — não altera runtime, migrations existentes, `.temp`, `config.toml` ou produção.*
