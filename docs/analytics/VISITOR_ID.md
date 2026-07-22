# Analytics — Identidade de `visitor_id` (PATCH 3.1)

## 1. Objetivo

O `visitor_id` é a **identidade anônima persistente** do Analytics, associada ao navegador e à origem (first-party).

Permite reconhecer o mesmo visitante entre diferentes sessões de navegação **sem exigir login**.

Complementa — não substitui — `session_id` e `user_id`.

---

## 2. Diferença entre identidades

| Campo | Escopo | Persistência | Obrigatório |
|-------|--------|--------------|-------------|
| **`visitor_id`** | Navegador/origem (anônimo) | `localStorage` — semanas/meses | Não (nullable no banco) |
| **`session_id`** | Aba/sessão atual | `sessionStorage` — até fechar aba | Não |
| **`conversation_id`** | Thread de chat MIA | `localStorage` (`mia_conversation_id`) — até nova conversa | Não (nullable no banco) |
| **`user_id`** | Usuário autenticado Supabase | Conta/login | Não |

```text
visitor_id       → identidade anônima persistente do navegador
session_id       → identidade temporária de uma sessão ou aba
conversation_id  → identidade de um fluxo conversacional com a MIA
user_id          → identidade autenticada opcional
```

Um mesmo `visitor_id` pode possuir vários `session_id`. Um mesmo `session_id` pode possuir vários `conversation_id`.

Ver [CONVERSATION_ID.md](./CONVERSATION_ID.md) (PATCH 3.2).

---

## 3. Geração

- UUID aleatório via `crypto.randomUUID()` no navegador;
- gerado **somente** quando não existe valor válido em `localStorage`;
- **não** deriva de IP, user-agent, e-mail, telefone ou fingerprinting;
- **não** depende de login;
- **não** utiliza cookies de terceiros.

Implementação: `getOrCreateAnalyticsVisitorId()` em `lib/analytics.js`.

---

## 4. Persistência

| Chave | Storage | Escopo |
|-------|---------|--------|
| `mia_analytics_visitor_id` | `localStorage` | origem do site (first-party) |

Valores legados em `localStorage.mia_session_id` **não** são reutilizados como `visitor_id` (PATCH 1.1 remove essa chave legada de sessão).

---

## 5. Ciclo de vida

| Evento | Comportamento |
|--------|---------------|
| **Primeira visita** | Gera UUID; persiste em `localStorage` |
| **Visitas subsequentes** | Reutiliza o mesmo UUID |
| **Valor inválido/corrompido** | Gera novo UUID; substitui apenas esse valor |
| **Nova aba** | Mesmo `visitor_id`; novo `session_id` |
| **Reload** | Mesmo `visitor_id`; mesmo `session_id` (aba) |
| **Limpar storage** | Novo `visitor_id` na próxima visita |
| **SSR / sem browser** | Retorna `null`; tracking não quebra |

Neste patch **não há** expiração automática, rotação periódica, merge de identidade ou identity stitching.

### Status operacional (PATCH 3.1 continuação)

| Item | Estado |
|------|--------|
| Migration remota `20260721153002` | Aplicada |
| Coluna `visitor_id` em produção | 16 colunas totais; nullable UUID |
| Deploy frontend/API | Produção Vercel ativa |
| Validação navegador real | Concluída (Playwright em `/app-mia`) |
| Persistência remota | Confirmada (`session_started`, `mia_question_sent`) |

---

## 6. Privacidade

- UUID aleatório first-party — sem PII;
- proibido fingerprinting, hash de e-mail/telefone, IP como identidade;
- proibida associação automática com dados pessoais;
- `metadata` continua sujeita à sanitização existente (sem secrets).

---

## 7. Limitações

| Cenário | Efeito |
|---------|--------|
| Navegador diferente | Novo `visitor_id` |
| Dispositivo diferente | Novo `visitor_id` |
| Limpeza de `localStorage` | Novo `visitor_id` |
| Modo anônimo/privado | Identidade independente por sessão de navegação privada |
| Origem diferente | Novo `visitor_id` (same-origin policy) |
| Cross-device | **Não** suportado neste patch |

---

## 8. Integração com eventos

### Eventos públicos (6)

Todos recebem `visitor_id` automaticamente via `trackMiaEvent()` → `buildAnalyticsTrackPayload()`:

- `session_started`
- `mia_question_sent`
- `mia_recommendation_shown`
- `favorite_created`
- `price_alert_created`
- `offer_click`

O evento `session_started` registra **simultaneamente** `visitor_id` e `session_id` — ligação básica visitante ↔ sessão.

Ordem canônica no payload: `event_name`, `visitor_id`, `session_id`, `user_id`, …

---

## 9. Server-side

Eventos `price_drop_email_*`, `price_drop_email_test_*` e `price_drop_email_e2e_*` **não** possuem contexto de navegador por padrão.

Regras:

- persistir `visitor_id = NULL` quando não houver contexto legítimo;
- **não** inventar UUID server-side;
- **não** usar `user_id` ou `session_id` como substituto de `visitor_id`;
- se contexto futuro propagar um `visitor_id` válido com segurança, permitir persistência.

---

## 10. Referências

| Documento | Conteúdo |
|-----------|----------|
| [SESSION_ID.md](./SESSION_ID.md) | Semântica de `session_id` |
| [CONVERSATION_ID.md](./CONVERSATION_ID.md) | Semântica de `conversation_id` (PATCH 3.2) |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | Catálogo de eventos |
| [contracts/EVENT_FIELD_SPECIFICATION.md](./contracts/EVENT_FIELD_SPECIFICATION.md) | Campo `visitor_id` |
| [contracts/EVENT_LIFECYCLE.md](./contracts/EVENT_LIFECYCLE.md) | Fluxo frontend → banco |
| [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) | Coluna e migration |
| [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) | Dicionário |
| [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md) | Escritores/leitores |
| [README.md](./README.md) | Índice oficial |

---

*VISITOR_ID — PATCH 3.1 · Identity Layer (FASE 3)*
