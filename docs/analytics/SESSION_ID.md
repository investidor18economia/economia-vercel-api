# Analytics — Identidade de `session_id` (PATCH 1.1)

## Definição oficial

```text
session_id = identificador anônimo da sessão atual da aba do navegador
```

## O que `session_id` representa

- uma sessão da aba (tab session);
- preservado após reload na mesma aba;
- novo valor em nova aba ou após fechar e reabrir a aba.

## O que `session_id` **não** representa

- uma pessoa;
- um usuário único;
- um visitante anônimo persistente cross-device;
- retenção ou cohorts (ainda não suportados).

## `user_id`

Quando o usuário está autenticado, eventos podem incluir `user_id` (UUID Supabase).

```text
visitor_id → visitante anônimo persistente (localStorage, PATCH 3.1)
session_id → sessão anônima da aba
user_id    → usuário autenticado, quando disponível
```

Um usuário autenticado pode ter várias sessões (`session_id` diferentes). Um visitante pode ter várias sessões ao longo do tempo. Isso é esperado.

Ver [VISITOR_ID.md](./VISITOR_ID.md) para a identidade persistente.

## Armazenamento

| Chave | Storage | Escopo |
|-------|---------|--------|
| `mia_session_id` | `sessionStorage` | aba atual |
| `mia_session_started_tracked` | `sessionStorage` | guard de `session_started` |

Valores legados em `localStorage.mia_session_id` **não são reutilizados** e são removidos com segurança quando possível.

## Implementação

- `lib/analytics.js` — `getMiaSessionId()`, `trackMiaEvent()`, `trackMiaSessionStarted()`
- `lib/miaOpeningSystem.js` — reutiliza a mesma chave `mia_session_id` em `sessionStorage` para abertura da MIA

## Referências

- [Event Contract v1 — `session_id`](./contracts/EVENT_FIELD_SPECIFICATION.md) — campo no contrato
- [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) — coluna no banco
- [contracts/EVENT_LIFECYCLE.md](./contracts/EVENT_LIFECYCLE.md) — quando `session_id` é enviado
- [README.md](./README.md) — índice oficial

---

*SESSION_ID — PATCH 1.1 · referências PATCH 2.4*
