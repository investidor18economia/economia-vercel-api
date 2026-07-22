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

## 11. Próximo patch

**PATCH 3.5 — Identity Documentation & Validation** (roadmap oficial)

**Dívida comercial paralela:** [PATCH COMM-R01](../commercial/PATCH_COMM_R01_COMPARISON_INTENT_ROUTING.md)

---

## 12. Referências

| Documento | Conteúdo |
|-----------|----------|
| [README.md](./README.md) | Índice oficial consolidado |
| [contracts/](./contracts/) | Event Contract v1 |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap completo FASE 1–12 |
| [01_analytics_foundation.md](./01_analytics_foundation.md) | Princípios permanentes |
| [CONVERSATION_ID.md](./CONVERSATION_ID.md) | Semântica de `conversation_id` (PATCH 3.2) |
| [CHANGELOG_SUPABASE.md](../infrastructure/CHANGELOG_SUPABASE.md) | Roadmap infraestrutura |
| `supabase/planning/SUPABASE-07B-execution-report.md` | Reconciliação produção |

---

*Analytics Changelog — PATCH 3.2*
