# Event Lifecycle — Analytics Teilor / MIA
## Ciclo de vida completo de um evento (PATCH 2.1)

**Contrato:** [EVENT_CONTRACT.md](./EVENT_CONTRACT.md)  
**Campos:** [EVENT_FIELD_SPECIFICATION.md](./EVENT_FIELD_SPECIFICATION.md)

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Fluxograma textual](#2-fluxograma-textual)
3. [Etapa a etapa](#3-etapa-a-etapa)
4. [Dois caminhos de ingestão](#4-dois-caminhos-de-ingestão)
5. [Pós-persistência](#5-pós-persistência)
6. [Estados de falha](#6-estados-de-falha)
7. [Referências](#7-referências)

---

## 1. Visão geral

Todo evento Analytics segue o mesmo destino final — uma linha em `public.analytics_events` — mas pode entrar por **dois caminhos**:

1. **Público:** browser → `lib/analytics.js` → `POST /api/analytics/track` → validação → INSERT.
2. **Server-side:** cron/admin/send gate → `lib/miaPriceAlertEmailAnalytics.js` → INSERT direto.

Após persistência, o evento é consumido exclusivamente por **consultas SQL** (dashboards) e auditorias backend — nunca pelo frontend em tempo real.

---

## 2. Fluxograma textual

```
Usuário
   │
   ├─ interage com MIA (pergunta, clique, favorito, alerta)
   │       ↓
   │   Frontend (MIAChat.jsx)
   │       ↓
   │   lib/analytics.js
   │   • getOrCreateAnalyticsVisitorId() → localStorage
   │   • getMiaSessionId() → sessionStorage
   │   • getOrCreateAnalyticsConversationId() → localStorage (lazy, PATCH 3.2)
   │   • trackMiaEvent / trackMiaQuestionSent / trackMiaSessionStarted
   │       ↓
   │   POST /api/analytics/track
   │       ↓
   │   Validação (miaAnalyticsAllowlist.js)
   │   • event_name na allowlist
   │   • limites de tamanho
   │   • metadata objeto JSON
   │       ↓
   │   pages/api/analytics/track/index.js
   │   • visitor_id / conversation_id / user_id UUID check
   │   • INSERT via supabaseClient (service role)
   │
   └─ (sem UI) cron / pipeline price alert
           ↓
       lib/miaPriceAlertSendGate.js (e módulos admin/E2E)
           ↓
       lib/miaPriceAlertEmailAnalytics.js
       • build*Payload + sanitizeMetadata
       • INSERT direto (service role)
           ↓
       ────────────┬────────────
                   ↓
           analytics_events
           • id, created_at gerados
           • RLS ON, sem policy pública
                   ↓
           Dashboards SQL
           • docs/analytics/*.sql
           • filtros produção / QA
                   ↓
           Relatórios
           • operador / produto / auditoria
```

---

## 3. Etapa a etapa

### 3.1 Usuário

O usuário (ou operador via cron) realiza uma ação observável:

- abre a MIA;
- envia pergunta (texto ou sugestão);
- recebe recomendação com card;
- favorita, cria alerta ou clica em oferta;
- (indiretamente) dispara avaliação de alerta de preço que pode gerar e-mail.

**Regra:** nenhum evento é gerado para intenção abortada (ex.: envio vazio bloqueado na UI).

---

### 3.2 Frontend

`components/MIAChat.jsx` importa helpers de `lib/analytics.js` e chama tracking **antes ou no momento** da ação:

| Ação | Helper |
|------|--------|
| Mount da aba | `trackMiaSessionStarted()` — `conversation_id` **NULL** |
| Pergunta (manual ou sugestão) | `trackMiaQuestionSent()` — cria/reutiliza `conversation_id` |
| Nova conversa (limpar cache) | `startNewAnalyticsConversation()` em `handleClearLocalCache()` |
| Card exibido | `trackMiaEvent("mia_recommendation_shown", …)` — mesmo `conversation_id` |
| Favorito | `trackMiaEvent("favorite_created", …)` |
| Alerta | `trackMiaEvent("price_alert_created", …)` |
| Clique oferta | `trackMiaEvent("offer_click", …)` |

**Sugestões clicáveis (PATCH 1.2):** botões disparam `CustomEvent("mia-suggestion")` → mesmo fluxo de `trackMiaQuestionSent` que input manual.

---

### 3.3 `lib/analytics.js`

Responsabilidades:

1. **`getMiaSessionId()`** — lê/cria ID em `sessionStorage`; remove legado de `localStorage`.
2. **`getOrCreateAnalyticsVisitorId()`** — identidade persistente do visitante (PATCH 3.1).
3. **`getOrCreateAnalyticsConversationId()` / `getCurrentAnalyticsConversationId()` / `startNewAnalyticsConversation()`** — identidade conversacional (PATCH 3.2); chave `mia_conversation_id` compartilhada com `/api/mia-chat`.
4. **`trackMiaEvent()`** — monta body via `buildAnalyticsTrackPayload()` (`lib/miaAnalyticsPayload.js`); opções `conversationId` e `ensureConversation`.
5. **`fetch("/api/analytics/track")`** — POST fire-and-forget; erros → `console.warn` apenas.
6. **`detectAnalyticsCategory()`** — infere `category` a partir do texto.
7. **Guards** — `session_started` deduplicado via flag `mia_session_started_tracked` em `sessionStorage`; `session_started` força `conversation_id = null`.

**Não faz:** INSERT Supabase, validação de allowlist, persistência local de eventos.

---

### 3.4 API — `POST /api/analytics/track`

Handler: `pages/api/analytics/track/index.js`

1. Headers de segurança internos (`applyInternalSecurityHeaders`).
2. Aceita somente `POST`.
3. Delega validação a `validateAnalyticsTrackRequest(body)`.
4. Em sucesso: INSERT nas colunas writer + defaults (`conversation_id` nullable).
5. Em falha de INSERT: HTTP 500 + log de auditoria.
6. Observabilidade via `withMiaObservability`.

**Cliente Supabase:** `lib/supabaseClient.js` — credencial server-side; browser nunca acessa a tabela.

---

### 3.5 Validação

Módulo: `lib/miaAnalyticsAllowlist.js`

| Check | Resultado se falhar |
|-------|---------------------|
| `event_name` ausente | 400 `event_name_required` |
| `event_name` fora da allowlist | 400 `event_not_allowed` |
| `metadata` não-objeto | 400 `invalid_metadata` |
| JSON metadata > 4000 chars | 413 `metadata_too_large` |
| Strings | trim + truncate por campo |

Saída: objeto `row` normalizado pronto para INSERT.

**Nota:** eventos server-side **não passam** por esta validação — confiam nos builders internos.

---

### 3.6 `analytics_events`

Tabela append-only em PostgreSQL.

| Propriedade | Comportamento |
|-------------|---------------|
| PK | `id uuid` default `gen_random_uuid()` |
| Timestamp | `created_at timestamptz` default `now()` |
| RLS | ON, zero policies → deny default |
| Grants | INSERT/SELECT apenas `service_role` |
| Índices | `event_name+created_at`, `created_at`, `session_id`, `visitor_id`, `conversation_id`, `category` |

Migrations executáveis: `20260719153000_*` (schema) + `20260719153001_*` (segurança) + `20260721153002_*` (visitor_id) + `20260721153003_*` (conversation_id).

---

### 3.7 Dashboards

Arquivos SQL em `docs/analytics/` — executados manualmente por operador com acesso ao banco.

Padrões comuns:

- agregação por `event_name` e `date_trunc('day', created_at)`;
- `COUNT(DISTINCT session_id)` para sessões;
- `COUNT(DISTINCT conversation_id)` para conversas (PATCH 3.2);
- exclusão de QA via `category` e prefixos `price_drop_email_test_*` / `price_drop_email_e2e_*`;
- exclusão de harness via `metadata.user_agent = 'test-agent'` em `session_started`.

Índice: [DASHBOARDS.md](../DASHBOARDS.md).

---

### 3.8 Relatórios

Não existe UI de analytics embarcada no app. "Relatórios" = resultado das queries SQL + auditorias automatizadas (`scripts/test-mia-analytics-*.js`) + smoke tests operacionais.

Eventos **não** alimentam dashboards em tempo real nem feedback loop para a MIA.

---

## 4. Dois caminhos de ingestão

### Caminho A — Frontend (6 eventos)

```
MIAChat → analytics.js → fetch track API → allowlist → INSERT
```

Características:

- sempre inclui `session_id` e `visitor_id` (quando storage disponível);
- `conversation_id` NULL em `session_started`; criado na primeira pergunta; reutilizado nos demais eventos conversacionais;
- restrito à allowlist;
- falha silenciosa no cliente, falha explícita (4xx/5xx) no servidor.

### Caminho B — Server-side (10 eventos)

```
SendGate / Admin / E2E → miaPriceAlertEmailAnalytics → INSERT direto
```

Características:

- `session_id` e `conversation_id` null na maioria dos casos;
- `category` fixa por tipo (`price_alert_email`, `_test`, `_e2e_test`);
- metadata sanitizada contra segredos;
- side-effect não bloqueante (`emit*` nunca propaga exception).

---

## 5. Pós-persistência

Após INSERT bem-sucedido:

1. A linha é imutável na camada de produto.
2. Dashboards podem incluí-la em agregados históricos.
3. Nenhum worker consome a fila de eventos — não há pipeline stream.
4. Retenção/arquivamento: **fora do escopo** deste contrato (política operacional).

---

## 6. Estados de falha

| Etapa | Comportamento |
|-------|---------------|
| Frontend fetch falha | `console.warn`; UX continua |
| API rejeita (400/413) | JSON error; log audit `analytics_rejected` |
| INSERT falha (500) | JSON error; log audit `analytics_failed` |
| Server-side insert falha | `{ ok: false, code: … }`; console.warn; fluxo principal continua |
| Storage indisponível | Novo `session_id` em memória; `conversation_id` pode ser omitido; evento ainda enviado |

---

## 3.9 Ciclo de vida conversacional (PATCH 3.2)

Fluxo típico na mesma aba:

```text
Mount MIAChat
  → trackMiaSessionStarted()
  → visitor_id + session_id; conversation_id NULL

Primeira pergunta
  → getOrCreateAnalyticsConversationId()
  → trackMiaQuestionSent({ ensureConversation: true })
  → conversation_id C1 persistido em localStorage

Resposta com card
  → trackMiaEvent("mia_recommendation_shown")
  → conversation_id C1 (reutilizado)

Pergunta de continuidade
  → trackMiaQuestionSent()
  → conversation_id C1 (mesmo)

Limpar cache local / nova conversa
  → startNewAnalyticsConversation()
  → conversation_id C2 (novo UUID)
  → visitor_id e session_id inalterados na mesma aba

Reload
  → conversation_id preservado (localStorage)
  → session_id preservado (sessionStorage)
```

Detalhamento: [CONVERSATION_ID.md](../CONVERSATION_ID.md).

---

## 7. Referências

| Documento | Conteúdo |
|-----------|----------|
| [EVENT_CONTRACT.md](./EVENT_CONTRACT.md) | Catálogo de eventos |
| [EVENT_FIELD_SPECIFICATION.md](./EVENT_FIELD_SPECIFICATION.md) | Campos e metadata |
| [ANALYTICS_SCHEMA.md](../ANALYTICS_SCHEMA.md) | Analytics Storage Schema v1 |
| [ANALYTICS_DATA_DICTIONARY.md](../ANALYTICS_DATA_DICTIONARY.md) | Colunas PostgreSQL |
| [ANALYTICS_TABLE_REFERENCE.md](../ANALYTICS_TABLE_REFERENCE.md) | Escritores e leitores |
| [SESSION_ID.md](../SESSION_ID.md) | Semântica de sessão |
| [CONVERSATION_ID.md](../CONVERSATION_ID.md) | Semântica conversacional (PATCH 3.2) |
| [VISITOR_ID.md](../VISITOR_ID.md) | Semântica de visitante |
| [DASHBOARDS.md](../DASHBOARDS.md) | Queries SQL |
| [README.md](../README.md) | Índice oficial |
| [ANALYTICS_CHANGELOG.md](../ANALYTICS_CHANGELOG.md) | Histórico |

---

*Event Lifecycle v1 — PATCH 2.4 + PATCH 3.2*
