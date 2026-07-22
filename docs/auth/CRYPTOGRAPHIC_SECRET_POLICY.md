# Cryptographic Secret Policy — PATCH 3.3A.2

## Finalidade por variável

| Variável | Domínio | Proibido para |
|----------|---------|---------------|
| `MIA_USER_SESSION_SECRET` | Assinar/validar `session_token` | OTP, rate limit, API interna |
| `MIA_AUTH_OTP_SECRET` | HMAC OTP/challenge | Sessão, rate limit, API interna |
| `MIA_AUTH_RATE_LIMIT_SECRET` | HMAC chaves de rate limit | Sessão, OTP, API interna |
| `API_SHARED_KEY` | Auth interna core (`x-api-key`) | Sessão, OTP, rate limit |

## Regras

- Sem fallback cruzado entre variáveis.
- Ausência → falha fechada (`503 auth_temporarily_unavailable` nos endpoints auth).
- Comprimento mínimo: 32 caracteres.
- Gerar valores independentes: `openssl rand -base64 48` (não commitar).
- Nunca usar `NEXT_PUBLIC_*` para segredos.

## Contexto HMAC

- OTP: `mia-auth-otp:v1:login_otp:<challenge_id>:<code>`
- Rate limit: `mia-auth-rate-limit:v1:<scope>:<value>`
- Sessão: payload JSON com `purpose: session`, `ver: 1`

## Rotação (MVP — Opção A)

Trocar `MIA_USER_SESSION_SECRET` invalida sessões anteriores. Usuários devem refazer OTP.

Tokens assinados com `API_SHARED_KEY` **não** são mais aceitos após PATCH 3.3A.2.

## Deploy seguro

1. Configurar as três variáveis na Vercel (Production)
2. Confirmar presença (sem imprimir valores)
3. Push/deploy do código
4. Smoke auth endpoints

## Resposta a incidente

Rotacionar apenas o segredo comprometido. Nunca reutilizar o mesmo valor entre domínios.

## Status operacional

| Item | Status |
|------|--------|
| Implementação | Concluída (`6cde47b`) |
| Testes locais | 506/506 + `test:mia:auth:secret-separation` 22/22 |
| Vercel Production (3 segredos) | Configurada |
| OTP / login / logout / analytics auth | Validados em produção |
| **Veredito** | **PATCH 3.3A.2 concluído** (domínio auth/crypto) |

Regressão conversacional comercial (`câmera e bateria` → falso positivo de comparação) **não pertence a este patch**. Ver [PATCH COMM-R01](../commercial/PATCH_COMM_R01_COMPARISON_INTENT_ROUTING.md).

---

*PATCH 3.3A.2 — Cryptographic Secret Separation*
