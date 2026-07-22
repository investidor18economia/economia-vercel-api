# Auth Abuse Protection — PATCH 3.3A.1

Distributed rate limiting and atomic challenge operations for serverless (Vercel).

---

## 1. Problema corrigido

O PATCH 3.3A usava `Map` em memória para limites de solicitação OTP. Em produção serverless:

- cada instância mantém contador próprio;
- redeploy zera contadores;
- requests paralelas podem contornar limites;
- múltiplos challenges geram novas tentativas.

---

## 2. Fonte persistente

| Componente | Armazenamento |
|----------|---------------|
| Rate limit por e-mail | `public.mia_auth_rate_limits` |
| Rate limit por origem | `public.mia_auth_rate_limits` |
| Tentativas OTP | `public.mia_auth_challenges.attempt_count` |
| Consumo OTP | `public.mia_auth_challenges.consumed_at` |

Backend usa **service_role** + RPC transacionais.

---

## 3. Rate limits finais

| Scope | Limite | Janela | Chave |
|-------|--------|--------|-------|
| `request_email` | 3 | 15 min | HMAC-SHA256(`email_normalized`) |
| `request_origin` | 12 | 15 min | HMAC-SHA256(IP resolvido) |
| `verify_challenge` | 5 tentativas | por challenge | linha do challenge |

Janela alinhada por bucket fixo de 900s (epoch-aligned), global entre instâncias.

---

## 4. Chaves hash

- Segredo: `MIA_AUTH_RATE_LIMIT_SECRET` (fallback: challenge/session secret)
- Formato: `HMAC-SHA256("mia-auth-rate-v1:{scope}:{value}")`
- Não persiste e-mail bruto nem IP bruto

---

## 5. RPC atômicos

| Função | Objetivo |
|--------|----------|
| `mia_auth_consume_rate_limit` | incremento atômico ON CONFLICT |
| `mia_auth_request_challenge` | advisory lock + rate limits + invalidação + insert |
| `mia_auth_mark_challenge_delivered` | marca envio OK |
| `mia_auth_mark_challenge_delivery_failed` | invalida challenge se envio falhar |
| `mia_auth_verify_challenge` | `FOR UPDATE`, tentativa/consumo único |

Execução revogada de `anon`/`authenticated`; apenas `service_role`.

---

## 6. Fluxo request-code

```text
normalizar e-mail
→ derivar hashes
→ RPC mia_auth_request_challenge (transação)
→ commit
→ enviar e-mail (Resend)
→ marcar delivery_sent_at
```

Se envio falhar: `delivery_failed_at` + challenge invalidado. Verificação exige `delivery_sent_at IS NOT NULL`.

---

## 7. Fluxo verify-code

```text
hash OTP no backend
→ RPC mia_auth_verify_challenge (FOR UPDATE)
→ incremento ou consumo atômico
→ resolveVerifiedUser()
→ emitir session_token
```

Duas verificações paralelas com código correto: apenas uma consome.

---

## 8. Falha fechada

Erro Supabase / RPC → **não** emite OTP, **não** emite sessão, HTTP 500 seguro.

Rate limit excedido → HTTP 429 + `Retry-After`.

---

## 9. Concorrência

- Solicitação: `pg_advisory_xact_lock(hashtext(email))`
- Verificação: `SELECT ... FOR UPDATE`
- Rate limit: `INSERT ... ON CONFLICT DO UPDATE`

---

## 10. Cleanup

Registros em `mia_auth_rate_limits` expiram naturalmente por janela. Retenção oportunista pode ser feita por job futuro; MVP aceita crescimento limitado (duas scopes × hashes × buckets/15min).

Challenges expirados/consumidos permanecem para auditoria mínima; índice parcial em `expires_at` onde `consumed_at IS NULL`.

---

## 11. Testes

```bash
npm run test:mia:auth:distributed-rate-limit
npm run test:mia:auth:trust-foundation
```

---

## 12. Operação

Auditar limites (sem PII):

```sql
select scope, count(*) from public.mia_auth_rate_limits group by scope;
```

Preflight remoto de e-mails:

```bash
npm run audit:mia:auth:email-preflight
```

---

*PATCH 3.3A.1 — Distributed Auth Abuse Protection*
