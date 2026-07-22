# Analytics — Identidade de `conversation_id` (PATCH 3.2)

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
| **`conversation_id`** | Thread de chat MIA | `localStorage` — até nova conversa ou limpeza | Não (nullable no banco) |
| **`user_id`** | Usuário autenticado Supabase | Conta/login | Não |

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
- implementação: `getOrCreateAnalyticsConversationId()` em `lib/analytics.js`, invocado por `trackMiaQuestionSent()` com `{ ensureConversation: true }`;
- **não** é criado no mount da página nem em `session_started`;
- **não** deriva de conteúdo de mensagem, IP, user-agent ou fingerprinting.

O mesmo UUID é reutilizado pelo chat (`components/MIAChat.jsx` → `resolveConversationIdForSend()`) e pelo Analytics — chave única `mia_conversation_id`.

---

## 5. Persistência

| Chave | Storage | Escopo |
|-------|---------|--------|
| `mia_conversation_id` | `localStorage` | origem do site (first-party); **compartilhada com a API MIA** |

**Por que `localStorage` (e não `sessionStorage`):**

- o produto preserva o thread de chat após reload na mesma origem;
- a mesma chave alimenta `conversation_id` no body de `/api/mia-chat` e nos eventos Analytics;
- nova aba na mesma origem **compartilha** o mesmo `conversation_id` (comportamento `localStorage`).

Funções oficiais em `lib/analytics.js`:

| Função | Comportamento |
|--------|---------------|
| `getCurrentAnalyticsConversationId()` | Lê UUID válido existente; **não cria** |
| `getOrCreateAnalyticsConversationId()` | Lê ou cria na primeira conversa real |
| `startNewAnalyticsConversation()` | Substitui por UUID novo (nova conversa explícita) |

Constante exportada: `MIA_CONVERSATION_ID_KEY = "mia_conversation_id"`.

---

## 6. Reutilização

Todos os eventos emitidos **dentro** da conversa ativa devem compartilhar o mesmo `conversation_id`:

| Evento | Resolução |
|--------|-----------|
| `mia_question_sent` | `ensureConversation: true` — cria se ausente |
| `mia_recommendation_shown` | `getCurrentAnalyticsConversationId()` via `trackMiaEvent()` |
| `offer_click`, `favorite_created`, `price_alert_created` | ID atual se existir em `localStorage`; caso contrário omitido/`null` |

Ordem canônica no payload: `event_name`, `visitor_id`, `session_id`, `conversation_id`, `user_id`, …

Implementação centralizada em `trackMiaEvent()` → `buildAnalyticsTrackPayload()` (`lib/miaAnalyticsPayload.js`).

---

## 7. Nova conversa

Novo UUID **somente** quando o produto inicia um fluxo conversacional novo.

Gatilho oficial implementado:

- **`handleClearLocalCache()`** em `components/MIAChat.jsx` — remove chaves `mia_*` do `localStorage` (exceto preferências e alertas), depois chama **`startNewAnalyticsConversation()`**.

Efeitos esperados:

| Identidade | Comportamento |
|------------|---------------|
| `visitor_id` | **Inalterado** (recriado apenas se removido do storage) |
| `session_id` | **Inalterado** (mesma aba) |
| `conversation_id` | **Novo UUID** |

A conversa anterior deixa de receber eventos futuros — novos eventos conversacionais usam o ID substituto.

Neste patch **não há** eventos `conversation_started` / `conversation_ended`.

---

## 8. Reload

| Identidade | Reload na mesma aba |
|------------|---------------------|
| `visitor_id` | Preservado (`localStorage`) |
| `session_id` | Preservado (`sessionStorage`) |
| `conversation_id` | **Preservado** (`localStorage`) |

Recarregar a página **não** encerra a conversa nem gera novo `conversation_id`.

O histórico de mensagens exibido depende do estado React/backend; o identificador Analytics/API permanece estável enquanto a chave existir.

---

## 9. Nova aba e nova sessão

| Cenário | `session_id` | `conversation_id` | `visitor_id` |
|---------|--------------|-------------------|--------------|
| **Nova aba** (mesma origem) | Novo | Mesmo ( `localStorage` compartilhado ) | Mesmo |
| **Fechar e reabrir aba** | Novo | Mesmo (se chave não removida) | Mesmo |
| **Nova conversa explícita** (mesma aba) | Mesmo | Novo | Mesmo |
| **Limpar `localStorage`** | Depende da aba | Novo na próxima pergunta | Novo se chave visitor removida |

**Limitação documentada:** `localStorage` é compartilhado entre abas da mesma origem — duas abas abertas simultaneamente referenciam o **mesmo** `conversation_id` ativo. Não há sincronização cross-tab além do storage nativo do navegador.

---

## 10. Integração com eventos

Classificação oficial dos **16** `event_name` (PATCH 3.2):

| Evento | `conversation_id` | Categoria |
|--------|-------------------|-----------|
| `session_started` | **NULL** (explícito) | NULL por semântica |
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
| Abas simultâneas (mesma origem) | Mesmo `conversation_id` via `localStorage` |
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
