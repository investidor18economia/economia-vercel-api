# Authentication Trust Foundation — PATCH 3.3A

> **Identity Layer (Analytics):** [IDENTITY_AND_ANALYTICS.md](./IDENTITY_AND_ANALYTICS.md) · [IDENTITY_LAYER.md](../analytics/IDENTITY_LAYER.md)

Correção da fundação de confiança exigida antes de concluir o PATCH 3.3 — Authenticated Identity.

---

## 1. Objetivo

Impedir que uma pessoa obtenha sessão autenticada apenas informando nome e e-mail de outra conta.

Transformar identidade **declarada** em identidade **verificada** por prova de posse do e-mail.

---

## 2. Problema anterior

`/api/register-user` criava ou recuperava `public.users` por e-mail e emitia `session_token` HMAC **sem verificação**.

Qualquer visitante podia informar o e-mail de outra pessoa e receber token válido associado ao UUID da vítima.

---

## 3. Modelo de ameaça

| Atacante | Ação | Impacto anterior |
|----------|------|------------------|
| Visitante anônimo | Informa e-mail alheio | Sessão emitida para `public.users.id` da vítima |
| Visitante anônimo | Envia `user_id` falso no Analytics | Mitigado no PATCH 3.3 (body ignorado) |
| Visitante autenticado falso | Favoritos/alertas com token roubado | Escrita protegida por token, mas token era fácil de obter |

---

## 4. Arquitetura escolhida

**OTP por e-mail (Opção A)** via **Resend**, reutilizando infraestrutura existente de alertas.

| Critério | Decisão |
|----------|---------|
| Provider | Resend (`RESEND_API_KEY`) |
| Remetente | `MIA da Teilor <mia@teilor.com.br>` |
| Desafio | Código numérico 6 dígitos, TTL 10 min |
| Armazenamento | Hash HMAC-SHA256 em `mia_auth_challenges` |
| Usuário | Criado/recuperado **somente após** verificação |
| Sessão | Token HMAC PATCH 12D com `purpose: "session"`, `ver: 1` |

Magic link não foi escolhido: OTP encaixa melhor no popup existente sem callback/redirect adicional.

---

## 5. Prova de posse

1. Usuário informa nome + e-mail.
2. `POST /api/auth/request-code` invalida desafios anteriores, gera OTP, grava hash, envia e-mail.
3. Usuário informa código.
4. `POST /api/auth/verify-code` valida hash, expiração, tentativas e consumo.
5. Servidor cria/recupera usuário, define `email_verified_at`, emite sessão.

---

## 6. Fluxo de solicitação

```text
POST /api/auth/request-code
  email, name?
  → rate limit (email + IP hash)
  → resposta anti-enumeração
  → challenge_id (UUID público, não secreto)
```

Resposta genérica:

```text
Se o endereço puder receber mensagens, enviaremos um código de verificação.
```

---

## 7. Fluxo de verificação

```text
POST /api/auth/verify-code
  challenge_id, code, name?
  → valida challenge
  → consome challenge (uso único)
  → resolveVerifiedUser()
  → issueUserSessionToken(user.id)
```

---

## 8. Criação/recuperação do usuário

**Estratégia 1:** usuário só é criado após OTP válido.

| Caso | Comportamento |
|------|---------------|
| E-mail novo | INSERT com `email_verified_at = now()` |
| E-mail existente | UPDATE `email_verified_at` se NULL; nome só preenchido se vazio |
| Solicitação abandonada | Nenhum usuário novo |

Normalização: trim + lowercase. Sem regras Gmail/+alias.

---

## 9. Sessão

| Atributo | Valor |
|----------|-------|
| Armazenamento cliente | `localStorage.mia_user` + `session_token` |
| Assinatura | HMAC-SHA256 (`MIA_USER_SESSION_SECRET`) |
| TTL | 30 dias |
| Payload | `{ uid, iat, exp, ver: 1, purpose: "session" }` |
| Transporte Analytics | `Authorization: Bearer` |

Cookie HttpOnly não adotado neste patch (escopo); documentado como limitação.

---

## 10. Logout

- Remove `mia_user` do localStorage
- Limpa estado React
- Analytics posterior: `user_id = NULL`
- Token bearer permanece válido até expirar (limitação documentada; sem blacklist server-side)

---

## 11. Expiração

- OTP/challenge: **10 minutos**
- Sessão: **30 dias** (PATCH 12D)

---

## 12. Uso único

Challenge marcado com `consumed_at` após verificação bem-sucedida.

Reutilização retorna `auth_challenge_consumed`.

---

## 13. Rate limiting

| Escopo | Limite | Janela |
|--------|--------|--------|
| Por e-mail | 3 solicitações | 15 min |
| Por origem (hash) | 12 solicitações | 15 min |
| Tentativas OTP | 5 por challenge | — |

**PATCH 3.3A.1:** contadores persistidos em Postgres (`mia_auth_rate_limits`) via RPC atômico. Não depende de memória serverless.

Ver [AUTH_ABUSE_PROTECTION.md](./AUTH_ABUSE_PROTECTION.md) e [CRYPTOGRAPHIC_SECRET_POLICY.md](./CRYPTOGRAPHIC_SECRET_POLICY.md).

---

## 13.1 Identidade por e-mail

Coluna `email_normalized` + índice unique após preflight remoto.

Ver [EMAIL_IDENTITY_POLICY.md](./EMAIL_IDENTITY_POLICY.md).

---

## 14. Anti-enumeração

`request-code` retorna HTTP 200 com mensagem genérica quando o fluxo prossegue.

Não expõe existência de conta, `user_id` ou diferença entre e-mail novo/existente.

Falha real de envio retorna 503 (não simula sucesso).

---

## 15. Armazenamento de segredos

| Dado | Armazenamento |
|------|---------------|
| OTP | **Nunca** persistido; só hash |
| Challenge hash | `mia_auth_challenges.token_hash` |
| Segredo HMAC OTP | `MIA_AUTH_OTP_SECRET` exclusivo |
| Logs | Sem OTP, token ou e-mail completo desnecessário |

---

## 16. Integração com Analytics

Preserva PATCH 3.3:

- Pré-verificação: `user_id = NULL`
- Pós-verificação: UUID via token validado no `/api/analytics/track`
- Body `user_id`: ignorado
- Merge: prospectivo, sem backfill

---

## 17. Privacidade

Analytics metadata sem e-mail, OTP, token ou nome de credencial.

---

## 18. RLS e backend

`mia_auth_challenges`: RLS enabled, grants apenas `service_role`.

`/api/register-user`: bloqueado (`403 auth_verification_required`).

---

## 19. Limitações conhecidas

- Sessão em localStorage (risco XSS residual)
- Logout não revoga token server-side
- ~~Rate limit in-memory (não global cross-instance)~~ corrigido no PATCH 3.3A.1
- E-mail-only MVP (sem senha/OAuth)

---

## 20. Operação em produção

Ordem obrigatória:

```text
migrations remotas → push/deploy → login real → validação Supabase
```

Scripts operacionais:

- `scripts/patch-33-remote-smoke.mjs`
- `scripts/patch-33-production-browser-validation.mjs` (atualizar para OTP antes do deploy)

---

## 21. Testes

```bash
npm run test:mia:auth:trust-foundation
npm run test:mia:auth:distributed-rate-limit
npm run test:mia:auth:email-identity-consistency
npm run audit:mia:auth:email-preflight
```

Cenários cobrindo crypto, rate limit distribuído, delivery gate, register-user bloqueado, sessão com purpose, Analytics.

---

## 22. Referências

- [AUTHENTICATED_IDENTITY.md](../analytics/AUTHENTICATED_IDENTITY.md)
- [CRYPTOGRAPHIC_SECRET_POLICY.md](./CRYPTOGRAPHIC_SECRET_POLICY.md) — PATCH 3.3A.2 (concluído)
- [AUTH_ABUSE_PROTECTION.md](./AUTH_ABUSE_PROTECTION.md) — PATCH 3.3A.1
- `lib/miaAuthSecrets.js`
- `lib/miaAuthChallengeCrypto.js`
- `lib/miaAuthChallengeStore.js`
- `pages/api/auth/request-code.js`
- `pages/api/auth/verify-code.js`

---

## 23. Isolamento de domínios (pós–3.3A.2)

| Patch | Domínio | Status |
|-------|---------|--------|
| 3.3A.2 | Segredos criptográficos auth | **Concluído** |
| 3.3A.1 | Rate limit + email identity | Concluído (infra) |
| **COMM-R01** | Roteamento comercial (comparação) | **Aberto** — [PATCH COMM-R01](../commercial/PATCH_COMM_R01_COMPARISON_INTENT_ROUTING.md) |

Regressões conversacionais comerciais **não** são corrigidas dentro do PATCH 3.3A.

---

*PATCH 3.3A — Authentication Trust Foundation*
