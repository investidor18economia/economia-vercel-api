# Analytics Changelog
## Histórico oficial — Roadmap Analytics Teilor/MIA

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [FASE 0 — Pré-versionamento](#2-fase-0--pré-versionamento)
3. [FASE 1 — Correção P0](#3-fase-1--correção-p0)
4. [FASE 2 — Event Contract](#4-fase-2--event-contract)
5. [FASE 3 — Identity Layer](#5-fase-3--identity-layer)
6. [Próximo patch](#6-próximo-patch)
7. [Referências](#7-referências)

---

## 1. Visão geral

Este changelog registra entregas **oficiais** do roadmap Analytics.  
Patches de infraestrutura Supabase (SUPABASE-01 → 08) estão em [docs/infrastructure/CHANGELOG_SUPABASE.md](../infrastructure/CHANGELOG_SUPABASE.md).

---

## 2. FASE 0 — Pré-versionamento

| | |
|---|---|
| **Objetivo** | Operar Analytics em produção antes da fundação versionada: tabela manual, ingestão via API, dashboards ad hoc. |
| **Resultado** | Tabela `analytics_events` criada manualmente no MVP; eventos MIA e server-side em produção; sem histórico de migrations CLI. |
| **Impacto** | Dados reais acumulados; estrutura de 15 colunas estabilizada organicamente; base para reconciliação SUPABASE-07. |

**Artefatos legados (referência, não executável):**

- SQL manual em `docs/analytics/analytics-events-storage-schema-v1.sql`
- Dashboards SQL incrementais

---

## 3. FASE 1 — Correção P0

### PATCH 1.1 — Identidade de sessão

| | |
|---|---|
| **Objetivo** | Corrigir semântica e persistência de `session_id` (aba, não visitante persistente). |
| **Resultado** | `session_id` em `sessionStorage`; remoção de legado `localStorage`; documentação [SESSION_ID.md](./SESSION_ID.md). |
| **Impacto** | Métricas de sessão única passam a representar abas, não pseudo-usuários; **sem alteração estrutural** da tabela. |

---

### PATCH 1.2 — Tracking de sugestões clicáveis

| | |
|---|---|
| **Objetivo** | Corrigir rastreamento de recomendações e cliques em sugestões. |
| **Resultado** | Payloads passam a popular `recommendation_name` e campos de oferta corretamente nos eventos relevantes. |
| **Impacto** | Dashboards de produto/CTR refletem comportamento real; **sem alteração estrutural** da tabela. |

---

### PATCH 1.3 — Dashboards SQL (produção × testes)

| | |
|---|---|
| **Objetivo** | Corrigir dashboards SQL; separar produção de QA; renomear métricas enganosas (DAU → sessões diárias). |
| **Resultado** | Arquivos `analytics-*.sql` revisados; [DASHBOARDS.md](./DASHBOARDS.md); filtros determinísticos; `analytics-daily-sessions.sql`. |
| **Impacto** | Consultas alinhadas ao schema v1; limitação de `environment` documentada; índices operacionais justificados na migration v1. |

---

### PATCH 1.4 — Versionar schema oficial + documentação

| | |
|---|---|
| **Objetivo** | Oficializar e versionar o schema Analytics **como existe hoje**, sem alterar comportamento, eventos, APIs ou dashboards. |
| **Resultado** | Migrations `20260719153000` + `20260719153001` (já reconciliadas em produção); documentação canônica: `ANALYTICS_SCHEMA.md`, `ANALYTICS_DATA_DICTIONARY.md`, `ANALYTICS_TABLE_REFERENCE.md`, este changelog, `README.md`. |
| **Impacto** | Base documental para FASE 2 (Event Contract); zero regressão funcional neste patch; apenas consolidação documental. |

**Entregáveis documentais PATCH 1.4:**

- [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md)
- [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md)
- [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md)
- [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) (este arquivo)
- [README.md](./README.md)

---

## 4. FASE 2 — Event Contract

### PATCH 2.1 — Event Contract oficial

| | |
|---|---|
| **Objetivo** | Documentar contrato semântico dos 16 eventos existentes. |
| **Resultado** | `docs/analytics/contracts/` — EVENT_CONTRACT, EVENT_FIELD_SPECIFICATION, EVENT_LIFECYCLE. |
| **Impacto** | Referência única para frontend, backend e dashboards; zero alteração funcional. |

### PATCH 2.2 — Padronizar payloads

| | |
|---|---|
| **Objetivo** | Estrutura consistente de payloads via `lib/miaAnalyticsPayload.js`. |
| **Resultado** | Builders centralizados; ordem canônica identification → metadata. |
| **Impacto** | Zero alteração semântica; mesmos campos persistidos. |

### PATCH 2.3 — Padronizar nomenclaturas

| | |
|---|---|
| **Objetivo** | Unificar termos oficiais (Analytics Storage Schema v1, Event Contract v1, `isAnalyticsUuid`, sufixo E2E). |
| **Resultado** | Glossário em [README.md](./README.md); docs alinhados; aliases `isValidUuid` removidos. |
| **Impacto** | Zero alteração de comportamento, schema ou payloads. |

### PATCH 2.4 — Documentação oficial consolidada

| | |
|---|---|
| **Objetivo** | Consolidar toda a documentação de eventos; eliminar referências pré-FASE 2, duplicações e links inconsistentes. |
| **Resultado** | Mapa oficial de referências cruzadas; README FASE 2; contratos, schema, dictionary, dashboards e changelog alinhados. |
| **Impacto** | Apenas documentação; zero alteração funcional. |

---

## 5. FASE 3 — Identity Layer

### PATCH 3.1 — Visitor Identity (`visitor_id`)

| | |
|---|---|
| **Objetivo** | Implementar identidade anônima persistente por navegador/origem. |
| **Resultado** | `getOrCreateAnalyticsVisitorId()` em `lib/analytics.js`; coluna `visitor_id` (migration `20260721153002`); [VISITOR_ID.md](./VISITOR_ID.md). |
| **Impacto** | Aditivo e compatível; dados históricos permanecem com `visitor_id` NULL; 6 eventos públicos passam a incluir `visitor_id` automaticamente. |

**Validação operacional (continuação PATCH 3.1):**

| | |
|---|---|
| **Migration remota** | `20260721153002` aplicada via pipeline oficial (`db query --linked` + `migration repair`) |
| **Deploy** | `master` → Vercel produção (`economia-ai.vercel.app`) |
| **Commit** | `dc8974b` — `feat(analytics): add persistent visitor identity` |
| **Testes finais** | 320/320 automatizados + validação real navegador/produção |
| **Dados históricos** | 408 linhas preservadas; `visitor_id` NULL em 100% do histórico pré-patch |

---

### PATCH 3.2 — Session & Conversation Identity (`conversation_id`)

| | |
|---|---|
| **Objetivo** | Consolidar `session_id` documentalmente e introduzir identidade conversacional `conversation_id`. |
| **Resultado** | Coluna `conversation_id uuid NULL` (migration `20260721153003`); identidade conversacional em memória via `conversationIdRef` (`MIAChat.jsx`); [CONVERSATION_ID.md](./CONVERSATION_ID.md). |
| **Impacto** | Aditivo e compatível; 17 colunas totais; Analytics Storage Schema **permanece v1**; `session_started` com `conversation_id` NULL; eventos conversacionais propagam UUID explícito; dados históricos sem backfill. |

**Semântica resumida (correção lifecycle — pré-aprovação final):**

- Fonte oficial: `conversationIdRef` em `MIAChat.jsx` (memória) — **não** `localStorage`;
- Criação lazy na primeira pergunta; mesmo UUID para Analytics e `/api/mia-chat`;
- Reload sem histórico → nova conversa → novo UUID;
- Nova aba → estado React independente → novo UUID;
- Nova conversa via `handleClearLocalCache` → `resetCurrentConversation()` → próxima pergunta gera novo UUID;
- Chave legada `mia_conversation_id` ignorada/removida via `removeLegacyAnalyticsConversationIdFromLocalStorage()`;
- `session_id` permanece `text` no banco; `conversation_id` é `uuid`.

**Testes:** `scripts/test-mia-analytics-conversation-id.js` (`npm run test:mia:analytics:conversation-id`).

---

## 6. PATCH 3.3 — Authenticated Identity (2026-07-22)

**Objetivo:** `user_id` seguro no Analytics — resolução server-side, anti-spoofing, logout, merge prospectivo.

**Implementação:**

- `lib/miaAnalyticsAuth.js` — `resolveAuthenticatedAnalyticsUserId` / `resolveAnalyticsTrackInsertUserId`
- `/api/analytics/track` — ignora `user_id` do body; usa token MIA verificado
- `lib/analytics.js` — envia `Authorization: Bearer` quando logado; remove `user_id` do payload cliente
- `MIAChat.jsx` — logout; `session_started` com token restaurado; headers auth nos tracks
- Migration `20260722120000_analytics_events_user_id_index.sql` — índice parcial em `user_id`
- Documentação: [AUTHENTICATED_IDENTITY.md](./AUTHENTICATED_IDENTITY.md)
- Testes: `npm run test:mia:analytics:authenticated-identity`

**Merge:** estratégia prospectiva; sem tabela `analytics_identity_links`; sem backfill.

---

## 7. PATCH 3.3A — Authentication Trust Foundation (2026-07-22)

**Problema corrigido:** `/api/register-user` emitia sessão sem prova de posse do e-mail.

**Solução:** OTP por e-mail (Resend) + `mia_auth_challenges` + endpoints `/api/auth/request-code` e `/api/auth/verify-code`.

**Documentação:** [AUTHENTICATION_TRUST_FOUNDATION.md](../auth/AUTHENTICATION_TRUST_FOUNDATION.md)

**Testes:** `npm run test:mia:auth:trust-foundation` (29/29)

---

## 8. PATCH 3.3A.1 — Distributed Auth Abuse Protection (2026-07-22)

**Problema corrigido:** rate limit OTP em memória serverless; unicidade de e-mail sem preflight.

**Solução:** `mia_auth_rate_limits` + RPC atômicos; `email_normalized` + unique após preflight.

**Documentação:** [AUTH_ABUSE_PROTECTION.md](../auth/AUTH_ABUSE_PROTECTION.md), [EMAIL_IDENTITY_POLICY.md](../auth/EMAIL_IDENTITY_POLICY.md)

**Testes:** `npm run test:mia:auth:distributed-rate-limit`, `npm run test:mia:auth:email-identity-consistency`, `npm run audit:mia:auth:email-preflight`

**Testes:** 26/26 authenticated-identity; regressões PATCH 3.1–3.2 + suítes Analytics aprovadas.

---

## 9. PATCH 3.3A.2 — Cryptographic Secret Separation (2026-07-22)

**Problema corrigido:** reutilização de `API_SHARED_KEY` entre sessão, OTP e rate limit.

**Solução:** segredos exclusivos `MIA_USER_SESSION_SECRET`, `MIA_AUTH_OTP_SECRET`, `MIA_AUTH_RATE_LIMIT_SECRET` sem fallback cruzado.

**Documentação:** [CRYPTOGRAPHIC_SECRET_POLICY.md](../auth/CRYPTOGRAPHIC_SECRET_POLICY.md)

**Testes:** `npm run test:mia:auth:secret-separation` (22/22); regressões 506/506; build OK.

**Validação operacional (auth):** concluída — push `6cde47b`, Vercel Production configurada, OTP/login/logout/analytics autenticado aprovados.

**Veredito escopo auth:** PATCH 3.3A.2 **concluído** no domínio criptográfico/autenticação.

**Regressão comercial identificada (fora deste patch):** falso positivo de comparação em `"câmera e bateria"` — registrada como [PATCH COMM-R01](../commercial/PATCH_COMM_R01_COMPARISON_INTENT_ROUTING.md), domínio comercial separado de PATCH 3.3A.

---

## 10. PATCH 3.4 — Retention Foundation (2026-07-22)

**Objetivo:** infraestrutura para futuras métricas de retenção (DAU/WAU/MAU/cohorts) **sem calculá-las neste patch**.

**Implementação:**

- Evento `user_authenticated` (marco de login OTP verificado)
- `lib/miaAnalyticsRetentionFoundation.js` — derivação de timelines a partir de eventos
- Migration `20260722180000_analytics_retention_foundation_v1.sql` — índices temporais
- SQL de referência: [sql/analytics-retention-foundation.sql](./sql/analytics-retention-foundation.sql)
- Documentação: [RETENTION_FOUNDATION.md](./RETENTION_FOUNDATION.md)

**Testes:** `npm run test:mia:analytics:retention-foundation`

**Princípio:** fonte da verdade permanece `analytics_events`; sem tabelas de métricas.

---

## 11. PATCH 3.5 — Identity Documentation & Validation (2026-07-22)

**Objetivo:** consolidar documentação oficial da Identity Layer (patches 3.1–3.4) — **sem alteração de código, contratos de eventos, banco ou APIs**.

**Entregas:**

- [IDENTITY_LAYER.md](./IDENTITY_LAYER.md) — documento canônico
- [PATCH_3.5_DOCUMENTATION_AUDIT.md](./PATCH_3.5_DOCUMENTATION_AUDIT.md) — auditoria documental
- [../architecture/IDENTITY_LAYER.md](../architecture/IDENTITY_LAYER.md) — ponte arquitetura
- [../auth/IDENTITY_AND_ANALYTICS.md](../auth/IDENTITY_AND_ANALYTICS.md) — Auth ↔ Analytics
- **ADR-013** em [ARCHITECTURAL_DECISIONS.md](../architecture/ARCHITECTURAL_DECISIONS.md)
- Correções de inconsistências em docs de identidade (storage `conversation_id`, nomenclatura `user_id`, status 3.4)

**Testes:** `npm run test:mia:analytics:identity-layer-docs`

**Veredito:** PATCH 3.5 **concluído** (documentação).

---

## 12. PATCH 3.6 — Auditoria Final da Fase 3 (2026-07-22)

**Objetivo:** consolidação read-only dos patches 3.1–3.5 — sem alteração de código.

**Entregas:**

- [PATCH_3.6_PHASE_3_FINAL_AUDIT.md](./PATCH_3.6_PHASE_3_FINAL_AUDIT.md)
- Evidências: 333+ testes automatizados (0 falhas), migrations sincronizadas, produção validada

**Veredito:** **FASE 3 — IDENTITY LAYER — APROVADA**

**Débitos não bloqueantes:** docs periféricos 6/16 eventos (DT-01), COMM-R01 comercial (domínio separado).

---

## 13. PATCH 4.1 — Governança das Métricas e Dashboard Executivo (2026-07-22)

**Objetivo:** canonizar definições executivas (DAU/WAU/MAU Visitors + Users) e entregar dashboard SQL executivo.

**Decisões aprovadas:** D1-C (dual DAU), D2-A (UTC), D3-A (rolling), D4-A (7 eventos), D5-A, D6-A, D7-A.

**Entregas:**

- [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) — governança canônica de métricas
- [analytics-executive-dashboard.sql](./analytics-executive-dashboard.sql) — snapshot + evolução diária
- DT-01 parcial: dashboards PATCH 1.3 atualizados para 7 eventos (`user_authenticated`)
- [DASHBOARDS.md](./DASHBOARDS.md), [02_analytics_roadmap.md](./02_analytics_roadmap.md) — PATCH 4.1 renomeado

**Testes:** `npm run test:mia:analytics:patch-41:executive-dashboard` · `npm run test:mia:analytics:patch-41:prod-validation` (17/17 produção)

**Validação produção:** [PATCH_4.1_PRODUCTION_REPORT.md](./PATCH_4.1_PRODUCTION_REPORT.md)

**Princípio:** fonte única `analytics_events`; sem alteração estrutural; sem novos eventos.

---

## 14. Próximo passo

**PATCH 4.2 — Dashboard de Crescimento** (em andamento)

---

## 15. PATCH 4.2 — Dashboard de Crescimento (2026-07-22)

**Objetivo:** medir crescimento da plataforma ao longo do tempo reutilizando EXECUTIVE_METRICS.

**Entregas:**

- [GROWTH_DASHBOARD.md](./GROWTH_DASHBOARD.md)
- [analytics-growth-dashboard.sql](./analytics-growth-dashboard.sql)
- Queries split: `sql/patch-42-query1-daily-growth.sql`, `query2`, `query3`

**Testes:** `npm run test:mia:analytics:patch-42:growth-dashboard` · `npm run test:mia:analytics:patch-42:prod-validation`

**Princípio:** sem novas definições de métricas — rolling WAU/MAU para evolução semanal/mensal.

---

## 17. PATCH 4.3 — Dashboard de Conversão (2026-07-22)

**Objetivo:** medir jornada de conversão (funil MIA) reutilizando EXECUTIVE_METRICS e Event Contract v1.

**Entregas:**

- [CONVERSION_DASHBOARD.md](./CONVERSION_DASHBOARD.md)
- [analytics-conversion-dashboard.sql](./analytics-conversion-dashboard.sql)
- Queries split: `sql/patch-43-query1-funnel-snapshot.sql`, `query2`, `query3`

**Testes:** `npm run test:mia:analytics:patch-43:conversion-dashboard` · `npm run test:mia:analytics:patch-43:prod-validation`

**Princípio:** funil sequencial derivado de timestamps; sem novos eventos ou alteração arquitetural.

---

## 19. PATCH 4.4 — Dashboard de Produtos e Categorias (2026-07-22)

**Objetivo:** inteligência de produtos e categorias reutilizando dimensões Event Contract v1.

**Entregas:**

- [PRODUCTS_CATEGORIES_DASHBOARD.md](./PRODUCTS_CATEGORIES_DASHBOARD.md)
- [analytics-products-categories-dashboard.sql](./analytics-products-categories-dashboard.sql)
- Queries split: `sql/patch-44-query1-product-ranking.sql` … `query4`

**Testes:** `npm run test:mia:analytics:patch-44:products-categories-dashboard` · `npm run test:mia:analytics:patch-44:prod-validation`

**Princípio:** dimensões `product_name` e `category` existentes; consolida PATCH 1.3 products/categories.

---

## 21. PATCH 4.5 — Dashboard de Qualidade dos Dados (2026-07-22)

**Objetivo:** monitorar saúde dos dados Analytics via Event Contract v1 (cobertura, catálogo, integridade).

**Entregas:**

- [DATA_QUALITY_DASHBOARD.md](./DATA_QUALITY_DASHBOARD.md)
- [analytics-data-quality-dashboard.sql](./analytics-data-quality-dashboard.sql)
- Queries split: `sql/patch-45-query1-volume-snapshot.sql` … `query4`

**Testes:** `npm run test:mia:analytics:patch-45:data-quality-dashboard` · `npm run test:mia:analytics:patch-45:prod-validation`

**Princípio:** cobertura observada — campos opcionais não tratados como violação.

---

## 24. PATCH 4.6 — Auditoria Final da Fase 4 (2026-07-22)

**Objetivo:** validar integralmente a Fase 4 (dashboards SQL 4.1–4.5) antes do encerramento oficial.

**Entregas:**

- [PATCH_4.6_PHASE_4_FINAL_AUDIT.md](./PATCH_4.6_PHASE_4_FINAL_AUDIT.md)

**Validação:** 513/513 checks (452 unit + 61 produção) — 0 falhas.

**Veredito:** FASE 4 **APROVADA** para encerramento oficial.

---

## 25. Próximo passo (pós-Fase 5)

**FASE 6 — Data Layer Analytics** · PATCH 6.1 — Cobertura · PATCH 6.2 — Qualidade · PATCH 6.3 — Estatísticas

---

## 26. PATCH 5.1 — Growth Analytics Estratégico (2026-07-22)

**Objetivo:** transformar métricas operacionais de crescimento em inteligência estratégica (cohorts, retenção, tendências).

**Entregas:**

- [GROWTH_STRATEGIC_ANALYTICS.md](./GROWTH_STRATEGIC_ANALYTICS.md)
- [analytics-growth-strategic.sql](./analytics-growth-strategic.sql)
- Queries split: `sql/patch-51-query1-visitor-cohort-retention.sql` … `query4`

**Testes:** `npm run test:mia:analytics:patch-51:growth-strategic` · `npm run test:mia:analytics:patch-51:prod-validation`

**Princípio:** PATCH 4.2 permanece dashboard operacional; PATCH 5.1 adiciona camada estratégica sem duplicação.

---

## 27. PATCH 5.2 — Conversation Analytics Estratégico (2026-07-22)

**Objetivo:** transformar eventos conversacionais em inteligência sobre comportamento (profundidade, recorrência, imagem vs texto, tendências).

**Entregas:**

- [CONVERSATION_STRATEGIC_ANALYTICS.md](./CONVERSATION_STRATEGIC_ANALYTICS.md)
- [analytics-conversation-strategic.sql](./analytics-conversation-strategic.sql)
- Queries split: `sql/patch-52-query1-depth-snapshot.sql` … `query4`

**Testes:** `npm run test:mia:analytics:patch-52:conversation-strategic` · `npm run test:mia:analytics:patch-52:prod-validation`

**Princípio:** PATCH 4.1 `conversas_unicas` permanece operacional; PATCH 5.2 adiciona profundidade e comportamento.

---

## 28. PATCH 5.3 — Conversion Funnel Analytics Estratégico (2026-07-22)

**Objetivo:** transformar funil operacional em inteligência estratégica (gargalos, cohorts, segmentos, tendências).

**Entregas:**

- [CONVERSION_STRATEGIC_ANALYTICS.md](./CONVERSION_STRATEGIC_ANALYTICS.md)
- [analytics-conversion-strategic.sql](./analytics-conversion-strategic.sql)
- Queries split: `sql/patch-53-query1-dropoff-bottleneck.sql` … `query4`

**Testes:** `npm run test:mia:analytics:patch-53:conversion-strategic` · `npm run test:mia:analytics:patch-53:prod-validation`

**Princípio:** PATCH 4.3 permanece funil operacional; PATCH 5.3 adiciona gargalos e análise causal.

---

## 29. PATCH 5.4 — Buying Intent Analytics Estratégico (2026-07-22)

**Objetivo:** transformar sinais de intenção em inteligência comportamental (antecedentes, combinações, cohorts, tendências).

**Entregas:**

- [BUYING_INTENT_STRATEGIC_ANALYTICS.md](./BUYING_INTENT_STRATEGIC_ANALYTICS.md)
- [analytics-buying-intent-strategic.sql](./analytics-buying-intent-strategic.sql)
- Queries split: `sql/patch-54-query1-signal-ranking.sql` … `query4`

**Testes:** `npm run test:mia:analytics:patch-54:buying-intent-strategic` · `npm run test:mia:analytics:patch-54:prod-validation`

**Princípio:** PATCH 4.4 permanece ranking operacional; PATCH 5.4 adiciona perfil de visitante e antecedentes.

---

## 30. PATCH 5.5 — Auditoria Final da Fase 5 (2026-07-22)

**Objetivo:** validar integralmente a Fase 5 (Analytics Estratégico 5.1–5.4) antes do encerramento oficial.

**Entregas:**

- [PATCH_5.5_PHASE_5_FINAL_AUDIT.md](./PATCH_5.5_PHASE_5_FINAL_AUDIT.md)

**Validação:** 913/913 checks (361 Fase 5 + 552 regressões) — 0 falhas. Produção: 16/16 queries executadas.

**Veredito:** FASE 5 **APROVADA COM RESSALVAS** para encerramento oficial.

**Deploy:** não aplicável — patch read-only (documentação e auditoria).

**Testes:** `npm run test:mia:analytics:patch-55:phase5-final-audit`

---

## 31. PATCH 6.1 — Data Layer Coverage Analytics (2026-07-22)

**Objetivo:** medir cobertura do catálogo Data Layer (categoria, marca, família, atributos, lacunas comerciais).

**Entregas:**

- [COVERAGE_ANALYTICS.md](./COVERAGE_ANALYTICS.md)
- [analytics-data-layer-coverage.sql](./analytics-data-layer-coverage.sql)
- Queries split: `sql/patch-61-query1-category-coverage.sql` … `query4`

**Testes:** `npm run test:mia:analytics:patch-61:coverage-analytics` · `npm run test:mia:analytics:patch-61:prod-validation`

**Princípio:** PATCH 4.5 permanece qualidade de instrumentação Analytics; PATCH 6.1 consulta catálogo Supabase read-only.

---

## 32. PATCH 6.2 — Data Layer Quality Analytics (2026-07-22)

**Objetivo:** diagnosticar qualidade do catálogo Data Layer (completude, duplicações, aliases, integridade, validade, conflitos, proveniência, atualidade).

**Entregas:**

- [DATA_QUALITY_ANALYTICS.md](./DATA_QUALITY_ANALYTICS.md)
- [analytics-data-layer-quality.sql](./analytics-data-layer-quality.sql)
- Queries split: `sql/patch-62-query1-completeness.sql` … `query4`
- [PATCH_6.2_DATA_QUALITY_ANALYTICS.md](./PATCH_6.2_DATA_QUALITY_ANALYTICS.md)

**Testes:** `npm run test:mia:analytics:patch-62:data-quality-analytics` · `npm run test:mia:analytics:patch-62:prod-validation`

**Princípio:** read-only · valores absolutos e relativos com denominador · sem score único arbitrário · não duplica PATCH 4.5 (Analytics) nem PATCH 6.1 (cobertura).

---

## 33. PATCH 6.3 — Data Layer Statistics (2026-07-22)

**Objetivo:** estatísticas consolidadas do catálogo Data Layer (inventário, distribuição, concentração, atributos técnicos, temporalidade).

**Entregas:**

- [DATA_LAYER_STATISTICS.md](./DATA_LAYER_STATISTICS.md)
- [analytics-data-layer-statistics.sql](./analytics-data-layer-statistics.sql)
- Queries split: `sql/patch-63-query1-inventory-category.sql` … `query4`
- [PATCH_6.3_DATA_LAYER_STATISTICS.md](./PATCH_6.3_DATA_LAYER_STATISTICS.md)

**Testes:** `npm run test:mia:analytics:patch-63:data-layer-statistics` · `npm run test:mia:analytics:patch-63:prod-validation`

**Princípio:** read-only · absoluto + relativo · sem market share · sem score agregado · capacidade histórica = timestamps do estado atual.

---

## 34. PATCH 6.4 — Data Layer Usage & Effectiveness (2026-07-22)

**Objetivo:** medir uso real e efetividade do Data Layer durante conversas comerciais (primeira instrumentação runtime da Fase 6).

**Entregas:**

- [DATA_LAYER_USAGE_ANALYTICS.md](./DATA_LAYER_USAGE_ANALYTICS.md)
- [analytics-data-layer-usage.sql](./analytics-data-layer-usage.sql)
- Runtime: `lib/miaDataLayerResolutionClassifier.js` · `lib/miaDataLayerUsageAnalytics.js` · hooks em `chat-gpt4o.js`
- Queries split: `sql/patch-64-query1-effectiveness-overview.sql` … `query4`
- [PATCH_6.4_DATA_LAYER_USAGE_ANALYTICS.md](./PATCH_6.4_DATA_LAYER_USAGE_ANALYTICS.md)
- Event Contract §7.5 — `data_layer_resolution` (`event_version: 6.4.0`)

**Testes:** `npm run test:mia:analytics:patch-64:data-layer-usage-analytics` · `npm run test:mia:analytics:patch-64:prod-validation`

**Princípio:** observação apenas · sem alterar ranking/fallback · evento único parametrizado · retrocompatível · deploy necessário para eventos reais.

---

## 35. Referências

| Documento | Conteúdo |
|-----------|----------|
| [README.md](./README.md) | Índice oficial consolidado |
| [contracts/](./contracts/) | Event Contract v1 |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap completo FASE 1–12 |
| [01_analytics_foundation.md](./01_analytics_foundation.md) | Princípios permanentes |
| [IDENTITY_LAYER.md](./IDENTITY_LAYER.md) | Identity Layer consolidada (PATCH 3.5) |
| [PATCH_3.6_PHASE_3_FINAL_AUDIT.md](./PATCH_3.6_PHASE_3_FINAL_AUDIT.md) | Auditoria final Fase 3 (PATCH 3.6) |
| [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) | Governança métricas executivas (PATCH 4.1) |
| [CONVERSATION_ID.md](./CONVERSATION_ID.md) | Semântica de `conversation_id` (PATCH 3.2) |
| [CHANGELOG_SUPABASE.md](../infrastructure/CHANGELOG_SUPABASE.md) | Roadmap infraestrutura |
| `supabase/planning/SUPABASE-07B-execution-report.md` | Reconciliação produção |

---

*Analytics Changelog — PATCH 3.2*
