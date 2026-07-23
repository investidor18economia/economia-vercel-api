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

**Deploy (2026-07-22):** commit `2072e1d` em `master` → Vercel produção. Validação: 9 eventos reais · dashboards Q1–Q4 OK · smoke produção 4/4 caminhos comerciais instrumentados correlacionados.

**Investigação manual UI (2026-07-22 ~20:05 BRT):** três conversas em `/app-mia` correlacionadas com eventos Supabase (sessão `56e604b4-…`). Dois bugs funcionais **preexistentes** confirmados (iPhone→Samsung, TV→notebook); instrumentação registrou caminho real corretamente. Reprodução sessão limpa confirma bugs independentes de contaminação de sessão. Total eventos: **15**. Status instrumentação: 🟡 investigação funcional concluída — bugs registrados em [PATCH_FUNC_64_COMMERCIAL_RUNTIME_FIXES.md](../commercial/PATCH_FUNC_64_COMMERCIAL_RUNTIME_FIXES.md) (fora escopo Analytics). Evidências: [PATCH_6.4_MANUAL_UI_INVESTIGATION.json](./PATCH_6.4_MANUAL_UI_INVESTIGATION.json) · [PATCH_6.4_PRODUCTION_EVIDENCE.json](./PATCH_6.4_PRODUCTION_EVIDENCE.json).

---

## 35. PATCH 6.5 — Auditoria Final da Fase 6 (2026-07-22)

**Objetivo:** auditar integralmente a Fase 6 (patches 6.0–6.4) e confirmar prontidão para encerramento.

**Entregas:**

- [PHASE_6_FINAL_AUDIT.md](./PHASE_6_FINAL_AUDIT.md)
- [PATCH_FUNC_64_COMMERCIAL_RUNTIME_FIXES.md](../commercial/PATCH_FUNC_64_COMMERCIAL_RUNTIME_FIXES.md) (pendências runtime — escopo externo)
- Atualização [02_analytics_roadmap.md](./02_analytics_roadmap.md) — Fase 6 alinhada à execução real

**Validação (auditoria 6.5):** 691 verificações executadas — **688 aprovadas** (267 unit 6.1–6.4 + 90 prod 6.1–6.4 + 54 patch-45 + 92 patch-55 + 188 sql-dashboards; 3 falsos negativos sql-dashboards em SQL catálogo 6.1–6.3).

**Veredito:** 🟡 **FASE 6 APROVADA COM PENDÊNCIAS EXTERNAS** — aguardando aprovação formal do usuário.

---

## 36. PATCH 7.0 — Auditoria da Fase 7 e Validação do Roadmap (2026-07-22)

**Objetivo:** validar roadmap da Fase 7 (Reliability Analytics) **antes** de qualquer implementação.

**Entregas:**

- [PATCH_7.0_PHASE_7_ROADMAP_AUDIT.md](./PATCH_7.0_PHASE_7_ROADMAP_AUDIT.md)
- Atualização [02_analytics_roadmap.md](./02_analytics_roadmap.md) — PATCH 7.0 incluído

**Validação:** auditoria read-only — escopo, arquitetura, dependências, riscos, matriz de implementação, checklist.

**Veredito:** 🟡 **FASE 7 PRONTA COM AJUSTES DOCUMENTAIS** — aguardando aprovação formal para iniciar PATCH 7.1.

**Ajustes pré-7.1:** decisão persistência (recomendado analytics_events); delta vs 6.4/5.1/12E; taxonomia outcome; thresholds latência.

---

## 37. PATCH 7.1 — Response Reliability Analytics (2026-07-22)

**Objetivo:** medir confiabilidade do **resultado final** entregue ao usuário (primeira instrumentação runtime da Fase 7).

**Entregas:**

- [RELIABILITY_RESPONSE_ANALYTICS.md](./RELIABILITY_RESPONSE_ANALYTICS.md)
- [analytics-reliability-response.sql](./analytics-reliability-response.sql)
- Runtime: `lib/miaResponseOutcomeClassifier.js` · `lib/miaResponseAnalytics.js` · hooks em `chat-gpt4o.js`
- Queries split: `sql/patch-71-query1-outcome-overview.sql` … `query4`
- [PATCH_7.1_RESPONSE_ANALYTICS.md](./PATCH_7.1_RESPONSE_ANALYTICS.md)
- Event Contract §7.6 — `mia_response_outcome` (`event_version: 7.1.0`)

**Testes:** `npm run test:mia:analytics:patch-71:response-analytics` · `npm run test:mia:analytics:patch-71:prod-validation`

**Princípio:** observação apenas · fire-and-forget · taxonomia outcome única · delta explícito vs 6.4 · deploy necessário para eventos reais.

**Deploy (2026-07-23):** commit `e831307` em `master` → Vercel produção. Validação: **4 eventos reais** `mia_response_outcome` · dashboards Q1–Q4 OK · outcomes SUCCESS/PARTIAL_SUCCESS/FALLBACK · regressão 6.4 intacta (16 eventos). Evidências: [PATCH_7.1_PRODUCTION_EVIDENCE.json](./PATCH_7.1_PRODUCTION_EVIDENCE.json).

**Veredito:** 🟢 **PATCH 7.1 APROVADO**

---

## 38. PATCH 7.2 — Error Reliability Analytics (2026-07-23)

**Objetivo:** medir erros técnicos e operacionais — camada, severidade, recuperação — correlacionados com PATCH 7.1.

**Entregas:**

- [RELIABILITY_ERROR_ANALYTICS.md](./RELIABILITY_ERROR_ANALYTICS.md)
- [analytics-reliability-error.sql](./analytics-reliability-error.sql)
- Runtime: `lib/miaErrorReasonCodeCatalog.js` · `lib/miaErrorClassifier.js` · `lib/miaErrorAnalytics.js`
- Queries split: `sql/patch-72-query1-error-overview.sql` … `query4`
- [PATCH_7.2_ERROR_ANALYTICS.md](./PATCH_7.2_ERROR_ANALYTICS.md)
- Event Contract §7.8 — `mia_error_event` (`event_version: 7.2.0`)

**Testes:** `npm run test:mia:analytics:patch-72:error-analytics` · `npm run test:mia:analytics:patch-72:prod-validation` · `npm run test:mia:analytics:patch-72:prod-smoke`

**Princípio:** observação only · deduplicação por request/layer/reason · delta vs 7.1 · fire-and-forget.

**Deploy (2026-07-23):** commit `c541010` em `master` → Vercel produção (`build c541010c8ef4`). Validação: **2 eventos reais** `mia_error_event` (`chat_empty_query` · VALIDATION_ERROR/HTTP · recovered) · dashboards Q1–Q4 OK · correlação 7.1 por `request_id` · regressões 7.1 (**67/67**) e 6.4 (**71/71**) intactas. Evidências: [PATCH_7.2_PRODUCTION_EVIDENCE.json](./PATCH_7.2_PRODUCTION_EVIDENCE.json).

**Veredito:** 🟢 **PATCH 7.2 APROVADO**

---

## 39. PATCH 7.3 — Latency Reliability Analytics (2026-07-23)

**Objetivo:** medir latência E2E servidor, breakdown por etapa, percentis e correlação com 6.4/7.1/7.2.

**Entregas:**

- [RELIABILITY_LATENCY_ANALYTICS.md](./RELIABILITY_LATENCY_ANALYTICS.md)
- [analytics-reliability-latency.sql](./analytics-reliability-latency.sql)
- Runtime: `lib/miaLatencyStageCatalog.js` · `lib/miaLatencyTracker.js` · `lib/miaLatencyAnalytics.js`
- Queries split: `sql/patch-73-query1-latency-overview.sql` … `query4`
- [PATCH_7.3_LATENCY_ANALYTICS.md](./PATCH_7.3_LATENCY_ANALYTICS.md)
- Event Contract §7.9 — `mia_latency_event` (`event_version: 7.3.0`)

**Testes:** `npm run test:mia:analytics:patch-73:latency-analytics` · `npm run test:mia:analytics:patch-73:prod-validation` · `npm run test:mia:analytics:patch-73:prod-smoke`

**Princípio:** observação only · 1 evento/requisição · delta vs 6.4 `query_duration_ms` · fire-and-forget.

**Deploy (2026-07-23):** commit `360768a` → Vercel (`build 360768a70d85`). Validação: **1 evento real** `mia_latency_event` (comercial 6580ms · SLOW · PARTIAL_SUCCESS) · summary inline social 2161ms · SQL Q1–Q4 OK · regressões 7.2/7.1/6.4 intactas. Evidências: [PATCH_7.3_PRODUCTION_EVIDENCE.json](./PATCH_7.3_PRODUCTION_EVIDENCE.json).

**Veredito:** 🟢 **PATCH 7.3 APROVADO**

---

## 40. PATCH 7.4 — Health Metrics Analytics (2026-07-23)

**Objetivo:** consolidar saúde operacional a partir de PATCH 7.1 + 7.2 + 7.3.

**Entregas:**

- [RELIABILITY_HEALTH_ANALYTICS.md](./RELIABILITY_HEALTH_ANALYTICS.md)
- [analytics-reliability-health.sql](./analytics-reliability-health.sql)
- Offline: `lib/miaHealthStatusCatalog.js` · `lib/miaHealthStatusClassifier.js` · `lib/miaHealthSnapshotBuilder.js`
- Queries split: `sql/patch-74-query1-overall-health.sql` … `query4`
- [PATCH_7.4_HEALTH_ANALYTICS.md](./PATCH_7.4_HEALTH_ANALYTICS.md)

**Decisão:** **sem evento runtime** — Health SQL-derived (`7.4.0` snapshot lógico).

**Deploy (2026-07-23):** commit `59fcf22`. Validação SQL produção: **24/24** · `health_status=CRITICAL` (availability 81.8% · n=11) · Q1–Q4 OK · zero alteração runtime · regressões 7.3/7.2/7.1/6.4 intactas. Evidências: [PATCH_7.4_PRODUCTION_EVIDENCE.json](./PATCH_7.4_PRODUCTION_EVIDENCE.json).

**Veredito:** 🟢 **PATCH 7.4 APROVADO**

---

## 41. PATCH 7.5 — Auditoria Final da Fase 7 (2026-07-23)

**Objetivo:** auditar a Fase 7 (Reliability Analytics) como sistema único — arquitetura, consistência entre patches, SQL, produção, regressões e documentação. **Sem novas funcionalidades.**

**Entregas:**

- [PHASE_7_FINAL_AUDIT.md](./PHASE_7_FINAL_AUDIT.md) — auditoria técnica completa
- [PHASE_7_EXECUTIVE_SUMMARY.md](./PHASE_7_EXECUTIVE_SUMMARY.md) — resumo executivo
- Meta-validação: `scripts/test-mia-analytics-patch-75-phase7-final-audit.js`

**Validação consolidada:**

| Suite | Resultado |
|-------|-----------|
| PATCH 6.4 regressão | 71/71 |
| PATCH 7.1 unit | 67/67 |
| PATCH 7.2 unit | 53/53 |
| PATCH 7.3 unit | 65/65 |
| PATCH 7.4 unit | 54/54 |
| SQL prod 7.1–7.4 (Q1–Q4) | 97/97 |

**Produção (revalidação):** deploy `f33c4c3` · `/api/health` 200 · eventos: `mia_response_outcome` 11 · `mia_error_event` 2 · `mia_latency_event` 1 · `data_layer_resolution` 20.

**Achados não bloqueantes:** amostra pequena (n=11) · cobertura latência 7.3 parcial (1/11) · 401/405 fora ALS · Data Layer ~5,8s comercial como baseline de performance (PATCH 7.3).

**Correções de código:** nenhuma (arquitetura consistente).

**Veredito:** 🟢 **FASE 7 — RELIABILITY ANALYTICS CONCLUÍDA**

---

## 42. PATCH 8.0 — Auditoria da Fase 8 (2026-07-23)

**Objetivo:** auditar arquitetura comercial existente **antes** de qualquer instrumentação da Fase 8. Sem implementação.

**Entregas:**

- [COMMERCIAL_ANALYTICS_PHASE_AUDIT.md](./COMMERCIAL_ANALYTICS_PHASE_AUDIT.md) — mapa completo: arquitetura, providers, jornada, eventos, gaps, roadmap validado

**Achados principais:**

- Arquitetura comercial mapeada (Router → Data Layer → Providers → Ranking → Offers → Response)
- Dois modos runtime: `legacy` (default) + `controlled`/`shadow`
- 5 providers registry + Data Layer + cache interno + LLM fallback
- Eventos comerciais existentes: frontend (7) + server (`data_layer_resolution`, 7.x reliability)
- Gaps: provider attempts, search extraction, ranking profile, offer snapshot — **não bloqueantes**
- Roadmap 8.1 → 8.2 → 8.3 **confirmado** com deltas vs Fases 4–7

**Veredito:** 🟢 **PATCH 8.0 APROVADO** — pronto para PATCH 8.1 (não iniciado)

---

## 43. PATCH 8.1 — Commercial Search Analytics (2026-07-23)

**Objetivo:** observabilidade server-side da busca comercial (`mia_commercial_search` · `8.1.0`).

**Entregas:**

- `lib/miaCommercialSearch*.js` (catalog, sanitizer, classifier, tracker, analytics)
- Hooks em `pages/api/chat-gpt4o.js` (fire-and-forget)
- SQL Q1–Q5 · [COMMERCIAL_SEARCH_ANALYTICS.md](./COMMERCIAL_SEARCH_ANALYTICS.md)
- [PATCH_8_1_COMMERCIAL_SEARCH_ANALYTICS.md](./PATCH_8_1_COMMERCIAL_SEARCH_ANALYTICS.md)

**Delta:** não duplica `data_layer_resolution` (6.4) nem reliability (7.x). Hub `request_id` para 8.2/8.3.

**Testes locais:** 8.1 **60/60** · regressões 6.4 + 7.x intactas.

**Veredito:** 🟢 **PATCH 8.1 APROVADO** — deploy `e6b5eb1` · smoke 10/10 · SQL 27/27 · regressões 370/370

---

## 44. PATCH 8.2 — Provider Analytics (2026-07-23)

**Objetivo:** observabilidade server-side por tentativa de provider (`mia_provider_attempt` · `8.2.0`).

**Entregas:**

- `lib/miaProviderAttempt*.js`, `lib/miaProviderIdCatalog.js`, `lib/miaProviderShadowTraceAdapter.js`
- Hooks legacy (`fetchCommercialProductsFromProviders`), conditional fetch, shadow subset
- SQL Q1–Q6 · [PROVIDER_ANALYTICS.md](./PROVIDER_ANALYTICS.md)
- [PATCH_8_2_PROVIDER_ANALYTICS.md](./PATCH_8_2_PROVIDER_ANALYTICS.md)

**Delta:** correlaciona com 8.1 via `request_id`; não duplica 7.2/7.3; sem `mia_provider_summary`.

**Testes locais:** 8.2 **45/45** · regressões 8.1 + 7.x intactas.

**Veredito:** 🟢 **PATCH 8.2 APROVADO** — deploy `43974ea` · smoke prod · SQL 14/14 · regressões 290/290 · evidência consolidada

---

## 45. PATCH 8.3 — Offer Analytics (2026-07-23)

**Objetivo:** observabilidade agregada do pipeline de ofertas (`mia_offer_set` · `8.3.0`).

**Entregas:**

- `lib/miaOfferSet*.js`, `lib/miaOfferIdentity.js`
- Hooks pipeline + delivery em `pages/api/chat-gpt4o.js`
- SQL Q1–Q7 · [OFFER_ANALYTICS.md](./OFFER_ANALYTICS.md)

**Modelo:** 1 evento agregado por `request_id` (sem evento por oferta individual).

**Testes locais:** 8.3 **39/39** · regressões 8.1 **60/60** + 8.2 **45/45**.

**Produção:** deploy `2158de6` · build `2158de61bc27` · smoke **12/12** · SQL Q1–Q7 **8/8** · evidência [PATCH_8_3_PRODUCTION_EVIDENCE.json](./PATCH_8_3_PRODUCTION_EVIDENCE.json).

**Veredito:** 🟢 **PATCH 8.3 APROVADO** — `mia_offer_set` · `8.3.0` · DATA_LAYER SUCCESS (`delivered=3`) · PROVIDER_ONLY funil observado · social sem evento

---

## 46. PATCH 8.4 — Auditoria Final da Fase 8 (2026-07-23)

**Objetivo:** encerrar formalmente a Fase 8 — coerência arquitetural, contratos, correlação, SQL, produção, documentação.

**Entregas:**

- [PHASE_8_MASTER_DOCUMENT.md](./PHASE_8_MASTER_DOCUMENT.md)
- [PATCH_8_4_PHASE_8_FINAL_AUDIT.md](./PATCH_8_4_PHASE_8_FINAL_AUDIT.md)
- [PHASE_8_FINAL_AUDIT_EVIDENCE.json](./PHASE_8_FINAL_AUDIT_EVIDENCE.json)
- Script meta-audit + prod audit (`patch-84-*`)
- Correção SQL Q5 fan-out (`patch-83-query5-offer-interactions.sql`)

**Testes:** 8.1 **60/60** · 8.2 **45/45** · 8.3 **39/39** · SQL prod **49/49** · meta-audit 8.4

**Veredito:** 🟢 **PATCH 8.4 APROVADO** · 🟢 **FASE 8 CONCLUÍDA**

---

## 47. PATCH 9.1 — Recommendation Decision Outcomes (2026-07-23)

**Objetivo:** observar a decisão cognitiva final da MIA (`mia_recommendation_decision` · `9.1.0`) sem alterar ranking, selection, routing ou Response Builder.

**Entregas:**

- Libs `miaRecommendationDecision*` (catalog, classifier, identity, tracker, analytics)
- Hooks em `chat-gpt4o.js` — `return_seguro`, `commercial_only_fallback`, `commercial_new_search_no_result`, legacy LLM
- SQL Q1–Q5 (`patch-91-query*`)
- Docs: [PATCH_9_1_RECOMMENDATION_DECISION.md](./PATCH_9_1_RECOMMENDATION_DECISION.md), [RECOMMENDATION_DECISION_ANALYTICS.md](./RECOMMENDATION_DECISION_ANALYTICS.md)
- `EVENT_CONTRACT.md` §7.14

**Veredito:** 🟢 **PATCH 9.1 APROVADO** — `mia_recommendation_decision` · `9.1.0` · smoke 15/15 · SQL 5/5 · unit 54/54 · regressões 8.x intactas

---

## 48. PATCH 9.2 — Recommendation Acceptance Signals (2026-07-23)

**Objetivo:** observar sinais graduados pós-decisão (`mia_recommendation_acceptance_signal` · `9.2.0`) sem tratar clique como compra.

**Arquitetura:** modelo híbrido — eventos client preservados + camada agregada 9.2 + propagação cirúrgica de `request_id`.

**Entregas:**

- Libs `miaRecommendationAcceptance*`
- Hook track + follow-up server-side
- Frontend `decision_request_id` propagation
- SQL Q1–Q8
- Docs PATCH_9_2 + RECOMMENDATION_ACCEPTANCE_ANALYTICS

**Veredito:** 🟢 **PATCH 9.2 APROVADO** — smoke 17/17 · SQL 8/8 · unit 51/51 · correlação HIGH em produção

---

## 49. PATCH 9.3 — Recommendation Rejection and Abandonment Signals (2026-07-23)

**Objetivo:** observar sinais negativos e de interrupção pós-decisão (`mia_recommendation_rejection_signal` · `9.3.0`) distinguindo rejeição, refinamento, substituição e abandono observável.

**Arquitetura:** modelo híbrido (D) — evento agregado server-side + transição de decisão + SQL Q1–Q10.

**Lib:** `lib/miaRecommendationRejection*.js` · hooks em `pages/api/chat-gpt4o.js`

**Veredito:** 🟢 **PATCH 9.3 APROVADO** — smoke 17/17 · SQL 10/10 · unit 58/58 · build `bbd93286c96d`

---

## 50. PATCH 9.4 — Runner-up and Alternative Analytics (2026-07-23)

**Objetivo:** analisar runner-up cognitivo vs alternativas exibidas/selecionadas sem recalcular ranking.

**Arquitetura:** modelo derivado — enriquecimento 9.1 + interpretação 9.2/9.3 + SQL Q1–Q12. Sem evento novo.

**Veredito:** 🟢 **PATCH 9.4 APROVADO** — produção validada (build `1a73a053dc28`, smoke 8/8, SQL 12/12)

---

## 51. PATCH 9.5 — Auditoria Final da Fase 9 (2026-07-23)

**Objetivo:** auditoria arquitetural completa da Fase 9 — sem novos eventos ou alterações funcionais.

**Entregas:** `PHASE_9_MASTER_DOCUMENT.md` · `PATCH_9_5_FINAL_AUDIT_EVIDENCE.json` · correção bloqueante SQL Q8 recovery (9.4).

**Veredito:** 🟢 **FASE 9 ENCERRADA E APROVADA**

---

## 52. PATCH 10.0 — Auditoria da Arquitetura de Preços, Economia e Alertas (2026-07-23)

**Objetivo:** mapear arquitetura de preços, alertas, favoritos e economia antes de implementar Analytics Fase 10.

**Entregas:** `PRICE_ARCHITECTURE_AUDIT.md` · `PATCH_10_0_ARCHITECTURE_AUDIT_EVIDENCE.json`

**Veredito:** 🟢 **PATCH 10.0 APROVADO** — auditoria exclusivamente documental; nenhum código alterado

---

## 53. PATCH 10.1 — Price Intelligence & Price Quality Analytics (2026-07-23)

**Evento:** `mia_price_intelligence` · `10.1.0` · categoria `price_intelligence`

**Arquitetura:** derivado de `mia_offer_set` (8.3) — sem recálculo de preços; hook em `instrumentOfferSetAnalyticsForDelivery`.

**Produção:** build `b6e5d555a8d6` · smoke 12/12 · SQL Q1–Q10 validado · regressões 8.3/9.1/8.4 OK

**Correção pós-deploy:** domain gate redundante removido (`b6e5d55`) — `commercialPermission` não persistido em sharedState bloqueava emit.

**Veredito:** 🟢 **PATCH 10.1 APROVADO**

---

## 54. PATCH 10.2 — Savings Estimation & Confidence Analytics (2026-07-23)

**Evento:** `mia_savings_estimation` · `10.2.0` · categoria `savings_estimation`

**Arquitetura:** derivado de `mia_offer_set` (8.3) + contexto 10.1 — sem recálculo de ranking; hook em `instrumentOfferSetAnalyticsForDelivery`.

**Métodos:** `WINNER_VS_MINIMUM` (OBSERVED) · `PERCENTAGE_ASSUMPTION` (UNVERIFIED UI 4–6%)

**Produção:** build `28bd732c2325` · smoke 15/15 · SQL Q1–Q15 validado · regressões 8.3/9.1/9.2/10.1 OK

**Correção pós-deploy:** emite estimativas inelegíveis quando `winner_price` ausente (`28bd732`)

**Veredito:** 🟢 **PATCH 10.2 APROVADO**

---

## 55. PATCH 10.3 — Price Alert Lifecycle Analytics (2026-07-23)

**Evento:** `mia_price_alert_lifecycle` · `10.3.0` · categoria `price_alert_lifecycle`

**Arquitetura:** hooks aditivos em create-price-alert, dry run e send gate — sem alterar fluxo funcional; `price_alert_created` mantido.

**Stages:** REQUESTED → CREATED → ACTIVE → CHECKED → TARGET_REACHED → NOTIFICATION_* (PREPARED/SENT/FAILED)

**Reservados:** NOTIFICATION_DELIVERED, USER_RETURNED, OFFER_OPENED, PAUSED, REACTIVATED, CANCELLED, EXPIRED

**SQL:** Q1–Q30 em `docs/analytics/sql/patch-103-query*.sql`

**Testes locais:** `test-mia-analytics-patch-103-price-alert-lifecycle.js` (111/111) · regressões 10.1/10.2/dry-run/send-gate OK

**Produção:** build `b0b32c80ce77` · smoke 12/12 · browser UI 14/14 · SQL Q1–Q30 32/32

**Correções pós-deploy:** dedup REQUESTED único (`fce798b`) · await inserts create path (`a743540`, `b0b32c8`)

**Veredito:** 🟢 **PATCH 10.3 APROVADO**

---

## 56. PATCH 10.4 — Anti-Regret Foundation Analytics (2026-07-23)

**Evento:** `mia_anti_regret_foundation` · `10.4.0` · categoria `anti_regret`

**Arquitetura:** derivado de offer_set + decision + price intelligence + savings; hook pós-decisão opcional via acceptance/rejection.

**Score:** `anti_regret_score` 0–100 observacional (interno) · confiança HIGH/MEDIUM/LOW/UNKNOWN

**SQL:** Q1–Q15 em `docs/analytics/sql/patch-104-query*.sql`

**Testes locais:** `test-mia-analytics-patch-104-anti-regret-foundation.js` (68/68) · regressões 10.1–10.3 OK

**Produção:** build `5e103f2e611d` · smoke 14/14 · SQL Q1–Q15 17/17

**Correção pós-deploy:** await delivery analytics chain para persistência serverless (`5e103f2`)

**Veredito:** 🟢 **PATCH 10.4 APROVADO**

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
| [PHASE_7_FINAL_AUDIT.md](./PHASE_7_FINAL_AUDIT.md) | Auditoria final Fase 7 (PATCH 7.5) |
| [PHASE_7_EXECUTIVE_SUMMARY.md](./PHASE_7_EXECUTIVE_SUMMARY.md) | Resumo executivo Fase 7 |
| [COMMERCIAL_ANALYTICS_PHASE_AUDIT.md](./COMMERCIAL_ANALYTICS_PHASE_AUDIT.md) | Auditoria Fase 8 (PATCH 8.0) |
| [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) | Governança métricas executivas (PATCH 4.1) |
| [CONVERSATION_ID.md](./CONVERSATION_ID.md) | Semântica de `conversation_id` (PATCH 3.2) |
| [CHANGELOG_SUPABASE.md](../infrastructure/CHANGELOG_SUPABASE.md) | Roadmap infraestrutura |
| `supabase/planning/SUPABASE-07B-execution-report.md` | Reconciliação produção |

---

*Analytics Changelog — PATCH 3.2*
