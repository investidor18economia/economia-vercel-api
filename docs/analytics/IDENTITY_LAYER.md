# Identity Layer — Documentação Oficial (PATCH 3.5)

**Status:** Documentação consolidada — FASE 3 (patches 3.1–3.4)  
**Escopo:** Visitor · Session · Conversation · Authenticated Identity · Retention Foundation  
**Fonte da verdade analítica:** `public.analytics_events` (append-only)

Este documento é o **índice canônico** da Identity Layer. Detalhes por identidade permanecem nos documentos especializados listados abaixo — sem duplicar semântica de eventos (Event Contract v1 em [`contracts/`](./contracts/)).

---

## 1. Objetivo

Consolidar oficialmente a camada de identidade construída nos patches 3.1–3.4, explicando:

- o que cada identificador representa;
- como se relacionam;
- quais eventos marcam cada marco temporal;
- como autenticação e retenção se encaixam **sem** tabelas redundantes.

**Princípio permanente:** toda métrica futura (DAU, WAU, MAU, cohorts, lifetime) será **derivada** dos eventos em `analytics_events`. Nenhum snapshot, cache ou tabela de métricas calculadas.

---

## 2. Hierarquia oficial

```text
visitor_id          → identidade anônima persistente (navegador / first-party)
    ↓
session_id          → identidade temporária da aba (sessionStorage)
    ↓
conversation_id     → thread conversacional MIA (memória React — MIAChat)
    ↓
user_id             → conta autenticada (public.users.id — resolvido server-side)
```

| Campo | Escopo | Persistência cliente | Nullable no banco |
|-------|--------|----------------------|-------------------|
| `visitor_id` | Visitante anônimo cross-sessão | `localStorage` (`mia_analytics_visitor_id`) | Sim |
| `session_id` | Sessão da aba | `sessionStorage` (`mia_session_id`) | Sim |
| `conversation_id` | Conversa MIA ativa | Memória (`conversationIdRef`) | Sim |
| `user_id` | Conta verificada (OTP) | Token em `localStorage.mia_user` | Sim |

**Nomenclatura proibida:** Supabase Auth como provedor de `user_id`; `session_id` como substituto de `conversation_id`; fingerprinting para qualquer identificador.

Documentos especializados:

| Identidade | Documento |
|------------|-----------|
| Visitor | [VISITOR_ID.md](./VISITOR_ID.md) (PATCH 3.1) |
| Session | [SESSION_ID.md](./SESSION_ID.md) (PATCH 1.1) |
| Conversation | [CONVERSATION_ID.md](./CONVERSATION_ID.md) (PATCH 3.2) |
| Authenticated | [AUTHENTICATED_IDENTITY.md](./AUTHENTICATED_IDENTITY.md) (PATCH 3.3) |
| Retention | [RETENTION_FOUNDATION.md](./RETENTION_FOUNDATION.md) (PATCH 3.4) |
| Auth / OTP | [AUTHENTICATION_TRUST_FOUNDATION.md](../auth/AUTHENTICATION_TRUST_FOUNDATION.md) (PATCH 3.3A) |

---

## 3. Fluxograma oficial (Identity → Analytics)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRIMEIRA VISITA (origem)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    getOrCreateAnalyticsVisitorId()
                                    │
                                    ▼
                            visitor_id (UUID)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                    ABERTURA DA ABA — mount MIAChat                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    getMiaSessionId() + trackMiaSessionStarted()
                                    │
                                    ▼
                            session_id (UUID)
                                    │
                         evento: session_started
                         conversation_id = NULL
                         user_id = NULL ou resolvido se token presente
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│              PRIMEIRA PERGUNTA — getOrCreateCurrentConversationId()      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                         conversation_id (UUID)
                                    │
                         evento: mia_question_sent (+ derivados)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│           LOGIN OTP — request-code → verify-code → completeLogin         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    trackMiaUserAuthenticated() + token Bearer
                                    │
                                    ▼
                         evento: user_authenticated
                         user_id resolvido server-side
                         conversation_id = NULL (marco de login)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│              EVENTOS AUTENTICADOS — Authorization: Bearer              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
              mia_question_sent, favorite_created, price_alert_created, …
              user_id = public.users.id (body ignorado)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                    RETENTION FOUNDATION (derivável)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
              timelines via analytics_events + created_at
              (lib/miaAnalyticsRetentionFoundation.js — sem persistir métricas)
                                    │
                                    ▼
                         analytics_events (única fonte da verdade)
```

---

## 4. Identity Timeline — marcos e eventos

Cada marco é **derivável** de `analytics_events.created_at` e dos campos de identidade. Nenhuma coluna adicional de “first_*” existe no banco.

| Marco | Definição oficial | Evento / regra primária | Fallback histórico |
|-------|-------------------|---------------------------|-------------------|
| **Primeira visita** | Primeiro evento do `visitor_id` | `MIN(created_at) WHERE visitor_id = ?` | — |
| **Primeira sessão** | Primeiro `session_started` do visitante | `session_started` | Primeiro evento com `session_id` |
| **Primeira conversa** | Primeiro `conversation_id` não nulo | `mia_question_sent` (ou primeiro evento com `conversation_id`) | — |
| **Primeiro login** | Primeiro marco de autenticação verificada | `user_authenticated` (PATCH 3.4) | `MIN(created_at) WHERE user_id IS NOT NULL` |
| **Eventos autenticados** | Qualquer evento com `user_id` resolvido | Eventos pós-login com Bearer válido | — |
| **Última atividade** | Último evento do visitante ou usuário | `MAX(created_at)` | — |

### Por que `user_authenticated` existe (PATCH 3.4)

`session_started` dispara no mount da aba — frequentemente **antes** do login e **sem** distinguir “abertura anônima” de “login verificado”. O evento `user_authenticated` marca explicitamente o marco OTP, com `metadata.auth_method: "otp_email"`, sem reemitir `session_started`.

---

## 5. Relacionamentos entre identidades

```text
1 visitor_id  →  N session_id        (novas abas / sessões)
1 session_id  →  N conversation_id   (nova conversa na mesma aba)
1 visitor_id  →  N user_id           (contas diferentes no tempo)
1 user_id     →  N visitor_id        (dispositivos / storage limpo)
```

### Merge de identidade (estratégia implementada)

| Aspecto | Política |
|---------|----------|
| Eventos pré-login | Permanecem `user_id = NULL` |
| Eventos pós-login | `user_id` via token verificado no `/api/analytics/track` |
| Backfill histórico | **Não** |
| Tabela de vínculo visitor↔user | **Não** — relação observada nos eventos autenticados |
| Spoofing de `user_id` no body | **Ignorado** — resolução server-side |

Ver [AUTHENTICATED_IDENTITY.md §9](./AUTHENTICATED_IDENTITY.md) e [AUTHENTICATION_TRUST_FOUNDATION.md](../auth/AUTHENTICATION_TRUST_FOUNDATION.md).

---

## 6. Auth e Analytics (resumo)

| Tópico | Onde está documentado |
|--------|----------------------|
| OTP por e-mail (Resend) | [AUTHENTICATION_TRUST_FOUNDATION.md](../auth/AUTHENTICATION_TRUST_FOUNDATION.md) |
| Normalização de e-mail | [EMAIL_IDENTITY_POLICY.md](../auth/EMAIL_IDENTITY_POLICY.md) |
| Rate limit distribuído | [AUTH_ABUSE_PROTECTION.md](../auth/AUTH_ABUSE_PROTECTION.md) |
| Segredos criptográficos | [CRYPTOGRAPHIC_SECRET_POLICY.md](../auth/CRYPTOGRAPHIC_SECRET_POLICY.md) |
| Resolução `user_id` no track | [AUTHENTICATED_IDENTITY.md §5](./AUTHENTICATED_IDENTITY.md) |
| Evento `user_authenticated` | [RETENTION_FOUNDATION.md §4](./RETENTION_FOUNDATION.md) |

Fluxo resumido:

```text
POST /api/auth/request-code  → OTP (hash no banco)
POST /api/auth/verify-code   → session_token + public.users.id
completeAuthenticatedLogin() → trackMiaUserAuthenticated()
POST /api/analytics/track    → user_id resolvido do Bearer (body ignorado)
```

---

## 7. Retention Foundation — o que existe e o que não existe

PATCH 3.4 entregou **fundação**, não métricas:

| Métrica | Status | Motivo |
|---------|--------|--------|
| DAU | **Não calculado** | Requer agregação SQL/dashboard — FASE 4+ |
| WAU | **Não calculado** | Idem |
| MAU | **Não calculado** | Idem |
| Cohorts | **Não calculado** | Idem |
| Timelines deriváveis | **Sim** | `lib/miaAnalyticsRetentionFoundation.js` + SQL referência |
| Índices temporais | **Sim** | Migration `20260722180000` |

---

## 8. Arquitetura confirmada (PATCH 3.5)

| Decisão | Estado |
|---------|--------|
| `analytics_events` = única fonte da verdade | ✅ |
| Sem tabelas redundantes de identidade analítica | ✅ |
| Sem snapshots de retenção | ✅ |
| Sem cache de métricas | ✅ |
| Identificadores no payload canônico | `visitor_id`, `session_id`, `conversation_id`, `user_id` |
| Event Contract v1 | Catálogo em [`contracts/EVENT_CONTRACT.md`](./contracts/EVENT_CONTRACT.md) — **não alterado neste patch** |

ADR formal: [ADR-013 — Analytics Identity Layer](../architecture/ARCHITECTURAL_DECISIONS.md#adr-013--analytics-identity-layer).

---

## 9. Implementação (referência — não duplicar lógica)

| Responsabilidade | Módulo / local |
|------------------|----------------|
| `visitor_id` | `getOrCreateAnalyticsVisitorId()` — `lib/analytics.js` |
| `session_id` | `getMiaSessionId()` — `lib/analytics.js` |
| `conversation_id` | `conversationIdRef` — `components/MIAChat.jsx` |
| Payloads canônicos | `lib/miaAnalyticsPayload.js` |
| Allowlist pública | `lib/miaAnalyticsAllowlist.js` |
| Resolução `user_id` | `lib/miaAnalyticsAuth.js` |
| Timelines retenção | `lib/miaAnalyticsRetentionFoundation.js` |
| Persistência | `pages/api/analytics/track/index.js` → Supabase `service_role` |

Frontend **nunca** escreve diretamente em `analytics_events`.

---

## 10. Limitações conhecidas (consolidadas)

- `conversation_id` não sobrevive a reload (memória) — nova conversa na próxima pergunta.
- Abas simultâneas: mesmo `visitor_id`, `session_id` e `conversation_id` independentes por aba.
- Logout local não emite evento analítico; `user_id` volta a `NULL`.
- Histórico pré-PATCH 3.4 pode não ter `user_authenticated` — usar fallback SQL documentado.
- Cross-device identity graph / CDP: **fora de escopo** FASE 3.
- DAU/WAU/MAU/cohorts: **fora de escopo** até FASE 4.

Lista ampliada: [KNOWN_LIMITATIONS.md](../architecture/KNOWN_LIMITATIONS.md).

---

## 11. Validação documental (PATCH 3.5)

Auditoria executada em 2026-07-22. Relatório completo: [PATCH_3.5_DOCUMENTATION_AUDIT.md](./PATCH_3.5_DOCUMENTATION_AUDIT.md).

Comando de regressão documental:

```bash
npm run test:mia:analytics:identity-layer-docs
```

---

## 12. Próximos passos

| Item | Patch / fase |
|------|----------------|
| Auditoria final FASE 3 | PATCH 3.6 |
| Dashboards DAU / cohorts / retenção | FASE 4 |
| `turn_id` | Roadmap FASE 3+ (não implementado) |

---

## Referências cruzadas

| Documento | Conteúdo |
|-----------|----------|
| [README.md](./README.md) | Índice Analytics |
| [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) | Schema físico |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | Event Contract v1 |
| [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) | Histórico patches |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap FASE 3 |
| [../architecture/IDENTITY_LAYER.md](../architecture/IDENTITY_LAYER.md) | Visão arquitetural |
| [../auth/IDENTITY_AND_ANALYTICS.md](../auth/IDENTITY_AND_ANALYTICS.md) | Auth ↔ Analytics |

---

*PATCH 3.5 — Identity Documentation & Validation · Documento canônico da Identity Layer*
