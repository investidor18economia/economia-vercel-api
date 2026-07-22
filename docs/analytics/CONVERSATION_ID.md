# Analytics — Identidade de `conversation_id` (PATCH 3.2)

> **Identity Layer:** índice canônico em [IDENTITY_LAYER.md](./IDENTITY_LAYER.md).

## 1. Objetivo

O `conversation_id` é a **identidade anônima de um fluxo conversacional** com a MIA dentro de uma sessão de navegação.

Permite agrupar perguntas, respostas e interações derivadas (recomendações, cliques, favoritos, alertas) que pertencem ao **mesmo thread de chat**, sem exigir login.

Complementa — não substitui — `visitor_id`, `session_id` e `user_id`.

---

## 2. Hierarquia de identidade

| Campo | Escopo | Persistência | Obrigatório |
|-------|--------|--------------|-------------|
| **`visitor_id`** | Navegador/origem (anônimo) | `localStorage` — semanas/meses | Não (nullable no banco) |
| **`session_id`** | Aba/sessão atual | `sessionStorage` — até fechar aba | Não |
| **`conversation_id`** | Thread de chat MIA | Memória (`conversationIdRef` em `MIAChat.jsx`) — vida da conversa ativa na aba | Não (nullable no banco) |
| **`user_id`** | Usuário autenticado (`public.users.id`) | Conta OTP verificada | Não |

```text
visitor_id
    ↓
uma ou mais sessões (session_id)
    ↓
uma ou mais conversas (conversation_id)
    ↓
eventos da mesma conversa
```

Exemplo:

```text
visitor_id: V1
  session_id: S1
    conversation_id: C1
    conversation_id: C2
  session_id: S2
    conversation_id: C3
```

Um mesmo `session_id` pode possuir **vários** `conversation_id` ao longo do tempo (ex.: após "limpar cache local" / nova conversa).

Ver [VISITOR_ID.md](./VISITOR_ID.md) e [SESSION_ID.md](./SESSION_ID.md).

---

## 3. Semântica

O `conversation_id` representa **uma conversa específica iniciada pelo usuário com a MIA** — o conjunto de interações que compartilham o mesmo thread de chat e o mesmo contexto enviado à API (`POST /api/mia-chat`).

**O que constitui uma conversa:**

- sequência de perguntas e respostas no mesmo fluxo;
- interações derivadas de recomendações exibidas nesse fluxo;
- continuidade contextual preservada pela MIA.

**O que `conversation_id` não representa:**

- uma sessão de navegação (`session_id`);
- um visitante persistente (`visitor_id`);
- uma mensagem individual ou turno (`turn_id` — patch futuro);
- um usuário autenticado (`user_id`).

**Princípio:** os identificadores **não são intercambiáveis**. É proibido usar `session_id` como `conversation_id`, gerar `conversation_id` server-side sem contexto real, ou criar um ID novo por evento/pergunta/resposta.

---

## 4. Criação

- UUID aleatório via `crypto.randomUUID()` no navegador;
- criado **somente** quando uma conversa real começa — gatilho oficial: **primeira pergunta aceita para envio**;
- implementação: `getOrCreateCurrentConversationId()` em `components/MIAChat.jsx` (`conversationIdRef`);
- primitivo: `createAnalyticsConversationId()` em `lib/analytics.js` (sem persistência);
- **não** é criado no mount da página nem em `session_started`;
- **não** deriva de conteúdo de mensagem, IP, user-agent ou fingerprinting.

O mesmo UUID é passado explicitamente para `/api/mia-chat` e para `trackMiaQuestionSent()` / `trackMiaEvent()`.

---

## 5. Persistência

| Armazenamento | Escopo | Duração |
|---------------|--------|---------|
| **`conversationIdRef`** (React ref em `MIAChat.jsx`) | Conversa ativa na aba | Vida da instância do componente / conversa em memória |

**Não** persiste em `localStorage` nem em `sessionStorage`.

A chave legada `mia_conversation_id` **não é mais fonte de verdade**. `removeLegacyAnalyticsConversationIdFromLocalStorage()` remove valores antigos de forma segura no mount e ao resetar conversa.

**Por que memória (e não storage):**

- mensagens do chat vivem apenas em estado React;
- reload encerra o histórico visível — o ID não deve sobreviver sozinho;
- cada aba possui estado React independente — IDs não devem ser compartilhados entre abas.

---

## 6. Reutilização

Todos os eventos emitidos **dentro** da conversa ativa compartilham o mesmo `conversation_id`:

| Evento | Resolução |
|--------|-----------|
| `mia_question_sent` | `conversationId` explícito de `resolveConversationIdForSend()` |
| `mia_recommendation_shown` | `conversationId` capturado no início do request (evita race) |
| `offer_click`, `favorite_created`, `price_alert_created` | `getCurrentConversationId()` quando conversa ativa |

Ordem canônica no payload: `event_name`, `visitor_id`, `session_id`, `conversation_id`, `user_id`, …

---

## 7. Nova conversa

Novo UUID **somente** quando o produto inicia um fluxo conversacional novo.

Gatilho oficial implementado:

- **`handleClearLocalCache()`** — limpa mensagens (`setHistory([])`), reseta contexto, invalida `conversationIdRef` via `resetCurrentConversation()`; **próxima pergunta** cria novo UUID (lazy).

Efeitos esperados:

| Identidade | Comportamento |
|------------|---------------|
| `visitor_id` | **Inalterado** |
| `session_id` | **Inalterado** (mesma aba) |
| `conversation_id` | **Novo UUID** na próxima pergunta |

---

## 8. Reload

| Identidade | Reload na mesma aba |
|------------|---------------------|
| `visitor_id` | Preservado (`localStorage`) |
| `session_id` | Preservado (`sessionStorage`) |
| `conversation_id` | **Perdido** (estado React); próxima pergunta gera **novo UUID** |

Recarregar a página encerra a conversa em memória. O histórico de mensagens **não** é restaurado — reutilizar um ID antigo seria semanticamente incorreto.

---

## 9. Nova aba e nova sessão

| Cenário | `session_id` | `conversation_id` | `visitor_id` |
|---------|--------------|-------------------|--------------|
| **Nova aba** (mesma origem) | Novo | **Novo** (estado React independente) | Mesmo |
| **Fechar e reabrir aba** | Novo | **Novo** na primeira pergunta | Mesmo |
| **Nova conversa explícita** (mesma aba) | Mesmo | **Novo** na próxima pergunta | Mesmo |
| **Reload** | Mesmo | **Novo** na próxima pergunta | Mesmo |

---

## 10. Integração com eventos

Classificação de `conversation_id` por evento — catálogo completo em [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) §7 (Event Contract v1, incl. `user_authenticated` PATCH 3.4):

| Evento | `conversation_id` | Categoria |
|--------|-------------------|-----------|
| `session_started` | **NULL** (explícito) | NULL por semântica |
| `user_authenticated` | **NULL** (marco de login) | NULL por semântica |
| `mia_question_sent` | **Obrigatório** no fluxo chat | Cria/reutiliza conversa |
| `mia_recommendation_shown` | **Obrigatório** quando emitido no chat | Mesmo ID da pergunta/resposta |
| `offer_click` | Opcional | Presente se conversa ativa |
| `favorite_created` | Opcional | Presente se conversa ativa |
| `price_alert_created` | Opcional | Presente se conversa ativa |
| `price_drop_email_*` (4) | **NULL** | Server-side — produção |
| `price_drop_email_test_*` (3) | **NULL** | Server-side — teste |
| `price_drop_email_e2e_*` (3) | **NULL** | Server-side — E2E |

`session_started` usa `trackMiaEvent(..., { conversationId: false })` para forçar `conversation_id = null` — a sessão pode existir antes de qualquer conversa.

---

## 11. Server-side

Eventos `price_drop_email_*`, `price_drop_email_test_*` e `price_drop_email_e2e_*` **não** possuem contexto de chat no browser por padrão.

Regras:

- persistir `conversation_id = NULL` quando não houver contexto legítimo;
- **não** inventar UUID server-side;
- **não** usar `session_id` ou `visitor_id` como substituto de `conversation_id`;
- **não** associar e-mail posterior a conversa antiga sem infraestrutura real de propagação.

Propagação futura de `conversation_id` para pipelines server-side fica fora deste patch.

---

## 12. Privacidade

- UUID aleatório first-party — sem PII;
- proibido derivar de pergunta, e-mail, telefone, IP, user-agent, produto ou hash de texto;
- proibida associação automática com dados pessoais;
- `metadata` continua sujeita à sanitização existente (sem secrets).

---

## 13. Limitações

| Cenário | Efeito |
|---------|--------|
| Abas simultâneas (mesma origem) | `conversation_id` **independente** por aba (memória React) |
| Antes da primeira pergunta | Sem `conversation_id` — eventos não conversacionais ok |
| Dados históricos pré-PATCH 3.2 | `conversation_id` NULL — sem backfill |
| Server-side / e-mail | `conversation_id` NULL por design |
| SSR / sem browser | Helpers retornam `null`; tracking não quebra |
| `turn_id` | **Não implementado** — patch futuro FASE 3 |
| Cross-device | **Não** suportado neste patch |

Neste patch **não há** expiração automática, merge de identidade ou identity stitching.

---

## 14. Referências

| Documento | Conteúdo |
|-----------|----------|
| [SESSION_ID.md](./SESSION_ID.md) | Semântica de `session_id` e relação com conversas |
| [VISITOR_ID.md](./VISITOR_ID.md) | Identidade persistente do visitante |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | Catálogo de eventos |
| [contracts/EVENT_FIELD_SPECIFICATION.md](./contracts/EVENT_FIELD_SPECIFICATION.md) | Campo `conversation_id` |
| [contracts/EVENT_LIFECYCLE.md](./contracts/EVENT_LIFECYCLE.md) | Fluxo frontend → banco |
| [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) | Coluna, migration `53003`, índice |
| [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) | Dicionário |
| [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md) | Escritores/leitores |
| [README.md](./README.md) | Índice oficial |

Implementação: `lib/analytics.js`, `lib/miaAnalyticsPayload.js`, `components/MIAChat.jsx`.

Migration: `supabase/migrations/20260721153003_analytics_events_conversation_id.sql`.

Testes: `scripts/test-mia-analytics-conversation-id.js` (`npm run test:mia:analytics:conversation-id`).

---

*CONVERSATION_ID — PATCH 3.2 · Identity Layer (FASE 3)*
