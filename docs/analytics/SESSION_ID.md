# Analytics — Identidade de `session_id` (PATCH 1.1)

> **Identity Layer:** índice canônico em [IDENTITY_LAYER.md](./IDENTITY_LAYER.md).

## Definição oficial

```text
session_id = identificador anônimo da sessão atual da aba do navegador
```

## O que `session_id` representa

- uma sessão da aba (tab session);
- preservado após reload na mesma aba;
- novo valor em nova aba ou após fechar e reabrir a aba;
- agrupa **todos** os eventos ocorridos na mesma sessão contextual do produto — incluindo **potencialmente várias conversas** (`conversation_id` diferentes).

## O que `session_id` **não** representa

- uma pessoa;
- um usuário único;
- um visitante anônimo persistente cross-device;
- uma conversa específica com a MIA (`conversation_id`);
- retenção ou cohorts (ainda não suportados).

## Relação com `conversation_id` (PATCH 3.2)

```text
visitor_id
    ↓
session_id        → uma ou mais conversas na mesma aba/sessão
    ↓
conversation_id   → eventos de um fluxo conversacional específico
```

| Identidade | Escopo | Storage |
|------------|--------|---------|
| `session_id` | Sessão da aba | `sessionStorage` (`mia_session_id`) |
| `conversation_id` | Thread de chat MIA | Memória (`conversationIdRef` em `MIAChat.jsx`) |

**Múltiplas conversas por sessão:** na mesma aba, o usuário pode iniciar uma nova conversa (ex.: `handleClearLocalCache` → `resetCurrentConversation()`). O `session_id` permanece; o `conversation_id` muda na próxima pergunta.

**Independência:** `session_id` não substitui `conversation_id` e vice-versa. `session_started` registra sessão **sem** conversa (`conversation_id` NULL).

Ver [CONVERSATION_ID.md](./CONVERSATION_ID.md).

## `user_id`

Quando o usuário está autenticado, eventos podem incluir `user_id` (`public.users.id`, resolvido server-side).

```text
visitor_id       → visitante anônimo persistente (localStorage, PATCH 3.1)
session_id       → sessão anônima da aba
conversation_id  → conversa MIA ativa (memória, PATCH 3.2)
user_id          → usuário autenticado, quando disponível
```

Um usuário autenticado pode ter várias sessões (`session_id` diferentes). Um visitante pode ter várias sessões ao longo do tempo. Uma sessão pode ter várias conversas. Isso é esperado.

Ver [VISITOR_ID.md](./VISITOR_ID.md) para a identidade persistente.

## Armazenamento

| Chave | Storage | Escopo |
|-------|---------|--------|
| `mia_session_id` | `sessionStorage` | aba atual |
| `mia_session_started_tracked` | `sessionStorage` | guard de `session_started` |

Valores legados em `localStorage.mia_session_id` **não são reutilizados** e são removidos com segurança quando possível.

## Ciclo de vida resumido

| Evento | `session_id` |
|--------|--------------|
| Primeira visita à aba | Novo UUID ou fallback `mia-sess-*` |
| Reload na mesma aba | Reutilizado |
| Nova aba | Novo valor |
| Nova conversa MIA | **Inalterado** (mesma aba) |
| Limpar cache local / nova conversa | **Inalterado** |
| SSR / sem browser | `null`; tracking não quebra |

## Implementação

- `lib/analytics.js` — `getMiaSessionId()`, `trackMiaEvent()`, `trackMiaSessionStarted()`
- `lib/miaOpeningSystem.js` — reutiliza a mesma chave `mia_session_id` em `sessionStorage` para abertura da MIA

## Referências

- [CONVERSATION_ID.md](./CONVERSATION_ID.md) — identidade conversacional (PATCH 3.2)
- [Event Contract v1 — `session_id`](./contracts/EVENT_FIELD_SPECIFICATION.md) — campo no contrato
- [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) — coluna no banco
- [contracts/EVENT_LIFECYCLE.md](./contracts/EVENT_LIFECYCLE.md) — quando `session_id` é enviado
- [README.md](./README.md) — índice oficial

---

*SESSION_ID — PATCH 1.1 · referências PATCH 2.4 e PATCH 3.2*
