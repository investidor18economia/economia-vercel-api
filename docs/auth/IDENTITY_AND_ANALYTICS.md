# Auth e Identity Layer (Analytics)

Relação entre autenticação MVP Teilor e a Identity Layer analítica (PATCH 3.3–3.5).

Documento canônico completo: [IDENTITY_LAYER.md](../analytics/IDENTITY_LAYER.md).

---

## 1. Objetivo

Explicar como OTP, sessão HMAC e `user_id` se conectam aos eventos em `analytics_events`, **sem** duplicar o Event Contract.

---

## 2. Provedor de identidade

| Atributo | Valor oficial |
|----------|---------------|
| Conta | `public.users` (PostgreSQL) |
| Verificação | OTP 6 dígitos por e-mail (Resend) |
| Sessão | Token HMAC (`lib/miaUserSessionToken.js`) |
| **Não utilizado** | Supabase Auth (`auth.users`) |

Detalhes: [AUTHENTICATION_TRUST_FOUNDATION.md](./AUTHENTICATION_TRUST_FOUNDATION.md).

---

## 3. Fluxo OTP → Analytics

```text
1. POST /api/auth/request-code
      → hash OTP em mia_auth_challenges (código nunca persistido)

2. POST /api/auth/verify-code
      → public.users.id + session_token

3. completeAuthenticatedLogin() (MIAChat.jsx)
      → trackMiaUserAuthenticated()
      → evento user_authenticated (marco de retenção)

4. Eventos subsequentes
      → Authorization: Bearer {session_token}
      → /api/analytics/track resolve user_id server-side
```

---

## 4. Campos de identidade no track

| Campo | Origem no login |
|-------|-----------------|
| `visitor_id` | Cliente (`localStorage`) — inalterado no login |
| `session_id` | Cliente (`sessionStorage`) — inalterado no login |
| `conversation_id` | `NULL` em `user_authenticated` |
| `user_id` | **Servidor** — de token verificado; body ignorado |

---

## 5. Merge visitor ↔ user

| Regra | Implementação |
|-------|---------------|
| Pré-login | Eventos com `user_id = NULL` |
| Pós-login | Eventos com `user_id` autenticado |
| Backfill | Não |
| Tabela de vínculo | Não |
| Observação | Mesmo `visitor_id` pode aparecer com diferentes `user_id` ao longo do tempo |

Ver [AUTHENTICATED_IDENTITY.md §9](../analytics/AUTHENTICATED_IDENTITY.md).

---

## 6. Proteção contra spoofing

| Vetor | Mitigação |
|-------|-----------|
| `user_id` falso no body Analytics | Ignorado |
| Token no payload | Proibido — só header |
| Login sem posse de e-mail | OTP obrigatório (3.3A) |
| Rate limit / abuso | [AUTH_ABUSE_PROTECTION.md](./AUTH_ABUSE_PROTECTION.md) |

---

## 7. Persistência

- Eventos: `analytics_events` via `service_role` (backend).
- Desafios OTP: `mia_auth_challenges` (auth — fora do Analytics).
- Sessão browser: `localStorage.mia_user` (token + metadados mínimos).

Frontend **não** insere em `analytics_events`.

---

## 8. Referências

| Documento | Conteúdo |
|-----------|----------|
| [EMAIL_IDENTITY_POLICY.md](./EMAIL_IDENTITY_POLICY.md) | Normalização de e-mail |
| [CRYPTOGRAPHIC_SECRET_POLICY.md](./CRYPTOGRAPHIC_SECRET_POLICY.md) | Segredos OTP/sessão/rate limit |
| [AUTHENTICATED_IDENTITY.md](../analytics/AUTHENTICATED_IDENTITY.md) | `user_id` analítico |
| [RETENTION_FOUNDATION.md](../analytics/RETENTION_FOUNDATION.md) | `user_authenticated` |

---

*PATCH 3.5 — Auth ↔ Identity Layer*
