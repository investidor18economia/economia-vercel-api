# Event Contract — Analytics Teilor / MIA
## Contrato oficial de eventos (PATCH 2.1)

**Versão:** Event Contract v1 (documentação)  
**Status:** Oficial — FASE 2  
**Escopo:** eventos **existentes hoje** — sem campos ou eventos futuros  
**Storage:** [ANALYTICS_SCHEMA.md](../ANALYTICS_SCHEMA.md)  
**Campos:** [EVENT_FIELD_SPECIFICATION.md](./EVENT_FIELD_SPECIFICATION.md)  
**Ciclo de vida:** [EVENT_LIFECYCLE.md](./EVENT_LIFECYCLE.md)

Este documento descreve **exatamente** a implementação atual (Event Contract v1). Payloads padronizados via `lib/miaAnalyticsPayload.js` (PATCH 2.2).

---

## Índice

1. [Objetivo](#1-objetivo)
2. [Princípios](#2-princípios)
3. [Fluxo resumido](#3-fluxo-resumido)
4. [Responsabilidades](#4-responsabilidades)
5. [Definições oficiais](#5-definições-oficiais)
6. [Canais de ingestão](#6-canais-de-ingestão)
7. [Catálogo de eventos](#7-catálogo-de-eventos)
8. [Referências de implementação](#8-referências-de-implementação)

---

## 1. Objetivo

Estabelecer a **referência única** sobre o que constitui um evento Analytics válido no Teilor/MIA:

- quais `event_name` existem;
- quando cada um dispara;
- quem o gera;
- quais campos top-level e chaves de `metadata` são usados hoje;
- como os eventos são persistidos e consumidos.

Frontend, backend, dashboards, auditorias e integrações futuras devem tratar este contrato como fonte semântica. A estrutura física da tabela permanece em `ANALYTICS_SCHEMA.md`.

---

## 2. Princípios

| Princípio | Regra atual |
|-----------|-------------|
| Observacional | Eventos registram comportamento; **não** dirigem cognição da MIA em tempo real |
| Append-only | INSERT em `analytics_events`; sem UPDATE/DELETE na camada de produto |
| Dois writers | (1) API pública com allowlist; (2) server-side com INSERT direto |
| Fail-safe no cliente | Falhas de analytics no browser não quebram a UI (`console.warn`) |
| Fail-closed na API pública | Evento fora da allowlist → HTTP 400 |
| Sem segredos | E-mails, tokens, API keys e senhas **não** entram em payloads |
| Sessão anônima | `session_id` = aba do navegador (PATCH 1.1); distinto de `user_id` |
| Metadata flexível | `metadata` é JSONB; chaves documentadas aqui refletem uso real, não schema rígido no banco |

---

## 3. Fluxo resumido

```
Usuário / Cron / Admin
        ↓
Frontend (MIAChat)  ou  Backend (price alert modules)
        ↓
lib/analytics.js  ou  lib/miaPriceAlertEmailAnalytics.js
        ↓
POST /api/analytics/track  ou  INSERT direto (service role)
        ↓
Validação (allowlist + limites)  [somente API pública]
        ↓
public.analytics_events
        ↓
Dashboards SQL (docs/analytics/*.sql)
```

Detalhamento: [EVENT_LIFECYCLE.md](./EVENT_LIFECYCLE.md).

---

## 4. Responsabilidades

| Papel | Responsabilidade |
|-------|------------------|
| **Frontend** (`components/MIAChat.jsx`, `lib/analytics.js`) | Gerar `session_id`; disparar 6 eventos públicos; nunca escrever no Supabase diretamente |
| **API pública** (`pages/api/analytics/track/index.js`) | Validar allowlist e limites; normalizar campos; INSERT via service role |
| **Server-side** (`lib/miaPriceAlertEmailAnalytics.js`, callers) | Montar payload; sanitizar metadata; INSERT direto (sem allowlist) |
| **Banco** (`analytics_events`) | Persistir linha; gerar `id` e `created_at` |
| **Dashboards** (`docs/analytics/*.sql`) | Ler agregados; filtrar QA/produção |
| **Documentação** (`docs/analytics/contracts/`) | Contrato semântico oficial (este patch) |

---

## 5. Definições oficiais

### O que é um evento

Um **evento** é um registro append-only em `public.analytics_events` identificado por `event_name`, com contexto opcional em colunas tipadas e propriedades extras em `metadata`.

Todo evento possui:

- `event_name` (obrigatório);
- `id` e `created_at` (gerados pelo banco);
- demais colunas nullable conforme contexto.

### Quando um evento **deve** existir

| Situação | Evento esperado |
|----------|-----------------|
| Primeira carga da aba MIA (uma vez por aba) | `session_started` |
| Pergunta enviada (input manual ou sugestão clicável) | `mia_question_sent` |
| Resposta exibe card de oferta com produto | `mia_recommendation_shown` |
| Usuário favorita produto no card | `favorite_created` |
| Usuário cria alerta de preço | `price_alert_created` |
| Usuário clica em "Ver oferta" | `offer_click` |
| Pipeline de e-mail de queda de preço (produção) | `price_drop_email_*` |
| Testes controlados de e-mail (admin) | `price_drop_email_test_*` |
| Validação E2E controlada | `price_drop_email_e2e_*` |

### Quando um evento **não** deve existir

- Ação cancelada antes de concluir (ex.: favorito falhou no backend).
- Dry run de envio de e-mail (analytics de produção não registra tentativa em dry run).
- Evento duplicado de `session_started` na mesma aba (guard em `sessionStorage`).
- Qualquer nome fora do catálogo §7 enviado à API pública (rejeitado).
- Telemetria de debug ad hoc sem writer oficial.

### Quem pode **gerar** eventos

| Origem | Eventos |
|--------|---------|
| Browser → API | 6 eventos da allowlist pública |
| Backend (service role) | 10 eventos `price_drop_email_*` |
| Operador / cron | Indiretamente via módulos de price alert |

### Quem **consome** eventos

| Consumidor | Mecanismo |
|------------|-----------|
| Operadores / produto | SQL dashboards em `docs/analytics/` |
| Auditorias automatizadas | Scripts `scripts/test-mia-analytics-*.js` |
| Backend (smoke) | SELECT via service role |
| Frontend / PostgREST público | **Não** — leitura bloqueada |

---

## 6. Canais de ingestão

### 6.1 API pública — `POST /api/analytics/track`

- **Allowlist:** `lib/miaAnalyticsAllowlist.js` → `ALLOWED_ANALYTICS_EVENTS`
- **Limites:** string 512 chars (padrão), `query_text` 2000, `offer_url` 2048, `metadata` JSON ≤ 4000 chars
- **`user_id`:** persistido somente se UUID v4 válido; caso contrário `null`

### 6.2 Server-side — INSERT direto

- **Módulo:** `lib/miaPriceAlertEmailAnalytics.js`
- **Sem allowlist HTTP** — nomes técnicos inseridos diretamente
- **Sanitização:** remove chaves proibidas (`email`, `token`, `secret`, etc.) de `metadata`

---

## 7. Catálogo de eventos

Total: **16** `event_name` distintos em produção hoje.

### 7.1 Eventos públicos (frontend → API)

#### `session_started`

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Marcar abertura de sessão da aba MIA |
| **Origem** | Frontend |
| **Quando dispara** | `useEffect` no mount de `MIAChat`; no máximo 1× por aba |
| **Quem dispara** | `trackMiaSessionStarted()` em `lib/analytics.js` |
| **Persistência** | API → `analytics_events` |
| **Campos típicos** | `visitor_id`, `session_id`; `metadata.page`, `metadata.user_agent`, `metadata.referrer` |
| **Exemplo** | `{ "event_name": "session_started", "visitor_id": "f47ac10b-…", "session_id": "mia-sess-…", "metadata": { "page": "/app-mia", "user_agent": "Mozilla/5.0 …", "referrer": null } }` |

---

#### `mia_question_sent`

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Registrar pergunta aceita para envio à MIA |
| **Origem** | Frontend |
| **Quando dispara** | Antes de `POST /api/mia-chat` — input manual **ou** sugestão clicável (PATCH 1.2) |
| **Quem dispara** | `trackMiaQuestionSent()` — chamado em `enviar()` e no listener `mia-suggestion` |
| **Persistência** | API → `analytics_events` |
| **Campos típicos** | `visitor_id`, `session_id`, `query_text`, `category` (`detectAnalyticsCategory`), `user_id` (se autenticado), `metadata.has_image` |
| **Exemplo** | `{ "event_name": "mia_question_sent", "query_text": "Qual celular até 1500?", "category": "smartphones", "user_id": null, "metadata": { "has_image": false } }` |

---

#### `mia_recommendation_shown`

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Registrar exibição de recomendação com card de oferta |
| **Origem** | Frontend |
| **Quando dispara** | Após resposta da MIA quando existe `cardProduct` derivado da resposta |
| **Quem dispara** | `trackMiaEvent("mia_recommendation_shown", …)` em `MIAChat.jsx` |
| **Persistência** | API → `analytics_events` |
| **Campos típicos** | `query_text`, `category`, `product_name`, `product_brand`, `product_id`, `recommendation_name`, `user_id`, `metadata.has_offer_card`, `metadata.products_count` |
| **Exemplo** | `{ "event_name": "mia_recommendation_shown", "product_name": "Galaxy A15", "recommendation_name": "Galaxy A15", "metadata": { "has_offer_card": true, "products_count": 3 } }` |

---

#### `favorite_created`

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Registrar favorito criado a partir do card de oferta |
| **Origem** | Frontend |
| **Quando dispara** | Após favorito persistido com sucesso |
| **Quem dispara** | `trackMiaEvent("favorite_created", …)` em `MIAChat.jsx` |
| **Persistência** | API → `analytics_events` |
| **Campos típicos** | `category`, `product_*`, `offer_store`, `offer_price`, `offer_url`, `user_id`, `metadata.action_source: "offer_card"` |
| **Exemplo** | `{ "event_name": "favorite_created", "product_name": "PS5 Slim", "offer_store": "Amazon", "metadata": { "action_source": "offer_card" } }` |

---

#### `price_alert_created`

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Registrar criação de alerta de preço |
| **Origem** | Frontend |
| **Quando dispara** | Após alerta criado com sucesso |
| **Quem dispara** | `trackMiaEvent("price_alert_created", …)` em `MIAChat.jsx` |
| **Persistência** | API → `analytics_events` |
| **Campos típicos** | `category`, `product_*`, `offer_*`, `user_id`, `metadata.action_source` (`"offer_card"` ou `"alert_form"`), `metadata.target_price`, `metadata.current_price` |
| **Exemplo** | `{ "event_name": "price_alert_created", "metadata": { "action_source": "alert_form", "target_price": 999, "current_price": 1299 } }` |

---

#### `offer_click`

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Registrar clique outbound em oferta comercial |
| **Origem** | Frontend |
| **Quando dispara** | Clique no link "Ver oferta" do card |
| **Quem dispara** | `trackMiaEvent("offer_click", …)` no `onClick` do anchor |
| **Persistência** | API → `analytics_events` |
| **Campos típicos** | `category`, `product_*`, `offer_*`, `metadata.button_text: "Ver oferta"` — **não envia `user_id` hoje** |
| **Exemplo** | `{ "event_name": "offer_click", "offer_url": "https://…", "metadata": { "button_text": "Ver oferta" } }` |

---

### 7.2 Eventos server-side — produção (`price_drop_email_*`)

**Categoria:** `price_alert_email`  
**Writer:** `emitPriceAlertEmailAnalytics()` via `lib/miaPriceAlertSendGate.js` e callers  
**Persistência:** INSERT direto — `session_id` geralmente `null`; `user_id` do alerta se UUID válido

| event_name | Objetivo | Quando dispara |
|------------|----------|----------------|
| `price_drop_email_attempted` | Tentativa de envio iniciada | Antes de chamar provedor de e-mail |
| `price_drop_email_sent` | E-mail enviado com sucesso | Após `sendResult.ok === true` |
| `price_drop_email_failed` | Falha no envio ou pós-envio | Falha do provedor ou falha de update pós-envio |
| `price_drop_email_skipped` | Envio não realizado | Alerta inelegível, anti-spam, gate bloqueado, etc. |

**Campos típicos:** `product_name`, `product_brand`, `product_id`, `query_text` (search), `recommendation_name`, `offer_store`, `offer_price`, `offer_url`, `metadata` com contexto operacional (ver [EVENT_FIELD_SPECIFICATION.md](./EVENT_FIELD_SPECIFICATION.md) §3.1).

**Exemplo (`sent`):**

```json
{
  "event_name": "price_drop_email_sent",
  "category": "price_alert_email",
  "user_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "product_name": "Galaxy A15",
  "offer_store": "Mercado Livre",
  "offer_price": 899.9,
  "metadata": {
    "alert_id": 42,
    "send_mode": true,
    "dry_run": false,
    "resend_result_id": "re_abc123"
  }
}
```

---

### 7.3 Eventos server-side — teste controlado (`price_drop_email_test_*`)

**Categoria:** `price_alert_email_test`  
**Writer:** `emitPriceAlertEmailTestAnalytics()` — endpoints/admin de teste  
**Persistência:** INSERT direto — `session_id` e `user_id` **null**

| event_name | Objetivo | Quando dispara |
|------------|----------|----------------|
| `price_drop_email_test_sent` | Envio de teste bem-sucedido | Teste controlado concluído |
| `price_drop_email_test_failed` | Falha no teste | Erro no fluxo de teste |
| `price_drop_email_test_skipped` | Teste não executado | Gate ou pré-condição bloqueou |

**Metadata marcadores:** `controlled_test: true`, `not_market_real: true`, `mode`, `reason`, `blocked_by`, `error_code`, etc.

---

### 7.4 Eventos server-side — E2E controlado (`price_drop_email_e2e_*`)

**Categoria:** `price_alert_e2e_test`  
**Writer:** `emitPriceAlertEmailE2EAnalytics()` — `lib/miaPriceAlertE2EValidation.js`  
**Persistência:** INSERT direto — `session_id` e `user_id` **null**

| event_name | Objetivo | Quando dispara |
|------------|----------|----------------|
| `price_drop_email_e2e_sent` | Fluxo E2E concluído com sucesso | Validação E2E passou |
| `price_drop_email_e2e_failed` | Falha no E2E | Erro no fluxo E2E |
| `price_drop_email_e2e_skipped` | E2E não executado | Pré-condição não atendida |

**Metadata marcadores:** `controlled_test: true`, `not_market_real: true`, `flow: "price_alert_e2e"`, `template_rendered`, etc.

---

## 8. Referências de implementação

| Artefato | Caminho |
|----------|---------|
| Payload builders | `lib/miaAnalyticsPayload.js` |
| Allowlist pública | `lib/miaAnalyticsAllowlist.js` |
| Cliente frontend | `lib/analytics.js` |
| UI MIA | `components/MIAChat.jsx` |
| API track | `pages/api/analytics/track/index.js` |
| Analytics server-side | `lib/miaPriceAlertEmailAnalytics.js` |
| Send gate (produção) | `lib/miaPriceAlertSendGate.js` |
| Analytics Storage Schema | `supabase/migrations/20260719153000_*` |
| Dashboards | [DASHBOARDS.md](../DASHBOARDS.md) |

Documentação relacionada: [ANALYTICS_SCHEMA.md](../ANALYTICS_SCHEMA.md) · [EVENT_FIELD_SPECIFICATION.md](./EVENT_FIELD_SPECIFICATION.md) · [EVENT_LIFECYCLE.md](./EVENT_LIFECYCLE.md) · [README.md](../README.md) · [ANALYTICS_CHANGELOG.md](../ANALYTICS_CHANGELOG.md)

---

*Event Contract v1 — consolidado PATCH 2.4*
