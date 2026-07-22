# Event Field Specification — Analytics Teilor / MIA
## Especificação oficial de campos (PATCH 2.1)

**Versão:** Event Contract v1 (documentação)  
**Contrato principal:** [EVENT_CONTRACT.md](./EVENT_CONTRACT.md)  
**Storage físico:** [ANALYTICS_DATA_DICTIONARY.md](../ANALYTICS_DATA_DICTIONARY.md)

Este documento lista **somente** campos existentes na implementação atual: colunas de `analytics_events` e chaves de `metadata` efetivamente usadas pelos writers oficiais.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Campos de persistência (colunas)](#2-campos-de-persistência-colunas)
3. [Chaves de metadata em uso](#3-chaves-de-metadata-em-uso)
4. [Valores de category (frontend)](#4-valores-de-category-frontend)
5. [Limites de ingestão (API pública)](#5-limites-de-ingestão-api-pública)
6. [Referências](#6-referências)

---

## 1. Visão geral

| Camada | Quantidade | Observação |
|--------|------------|------------|
| Colunas `analytics_events` | 17 | 2 geradas pelo banco (`id`, `created_at`) |
| Colunas preenchidas pelo writer | 15 | Inclui `event_name` |
| Chaves `metadata` documentadas | 28 | Distintas no código atual |
| Campos do body HTTP não persistidos | 0 | Tudo mapeado para colunas ou `metadata` |

---

## 2. Campos de persistência (colunas)

### `id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `uuid` |
| **Obrigatório** | Sim |
| **Descrição** | Chave primária gerada pelo banco |
| **Origem** | PostgreSQL (`gen_random_uuid()`) |
| **Exemplo** | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| **Quem popula** | Banco |
| **Quando nulo** | Nunca |

---

### `event_name`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Sim |
| **Descrição** | Identificador do tipo de evento |
| **Origem** | Payload / builder server-side |
| **Exemplo** | `mia_question_sent` |
| **Quem popula** | Frontend (API) ou backend |
| **Quando nulo** | Nunca (INSERT inválido) |

Valores permitidos: catálogo em [EVENT_CONTRACT.md](./EVENT_CONTRACT.md) §7.

---

### `session_id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Não |
| **Descrição** | Identificador anônimo da sessão da aba (PATCH 1.1) |
| **Origem** | `sessionStorage` via `getMiaSessionId()` |
| **Exemplo** | `mia-sess-679abc-1234` ou UUID |
| **Quem popula** | Frontend (eventos MIA); API repassa |
| **Quando nulo** | Eventos server-side; testes E2E/admin |

Ver [SESSION_ID.md](../SESSION_ID.md).

---

### `conversation_id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `uuid` |
| **Obrigatório** | Não |
| **Descrição** | Identificador anônimo de um fluxo conversacional com a MIA (PATCH 3.2) |
| **Origem** | `conversationIdRef` em `MIAChat.jsx` — explícito em `trackMiaQuestionSent()` / `trackMiaEvent()` |
| **Persistência** | Memória (React ref) — **não** `localStorage` |
| **Legado** | `mia_conversation_id` removido via `removeLegacyAnalyticsConversationIdFromLocalStorage()` |
| **Exemplo** | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| **Quem popula** | Frontend (eventos conversacionais); API repassa |
| **Quando nulo** | `session_started`; antes da primeira pergunta; dados históricos; eventos server-side; SSR; storage indisponível |

Ver [CONVERSATION_ID.md](../CONVERSATION_ID.md).

**Regra API:** valores não-UUID são descartados → `null` (mesmo padrão de `visitor_id` e `user_id`).

**Resolução em `trackMiaEvent()`:**

| Opção | Efeito |
|-------|--------|
| `{ conversationId: false }` | Força `conversation_id = null` (`session_started`) |
| `{ conversationId: "<uuid>" }` | UUID explícito passado pelo `MIAChat` |
| omitido | Campo omitido do payload (eventos sem conversa ativa) |

---

### `visitor_id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `uuid` |
| **Obrigatório** | Não |
| **Descrição** | Identificador anônimo persistente do navegador/origem (PATCH 3.1) |
| **Origem** | `localStorage` via `getOrCreateAnalyticsVisitorId()` |
| **Exemplo** | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| **Quem popula** | Frontend (6 eventos públicos); API repassa |
| **Quando nulo** | Dados históricos; eventos server-side; SSR; storage indisponível |

Ver [VISITOR_ID.md](../VISITOR_ID.md).

**Regra API:** valores não-UUID são descartados → `null` (mesmo padrão de `user_id`).

---

### `user_id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `uuid` |
| **Obrigatório** | Não |
| **Descrição** | UUID Supabase Auth quando disponível e válido |
| **Origem** | **Servidor:** token MIA verificado → `public.users.id` no `/api/analytics/track`. **Server-side e-mail:** `alert.user_id` com ownership confiável. **Body HTTP:** ignorado (PATCH 3.3) |
| **Exemplo** | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| **Quem popula** | API track (sessão) ou `miaPriceAlertEmailAnalytics` (alerta) |
| **Quando nulo** | Sessão anônima; logout; token inválido/expirado; `offer_click` anônimo; eventos de teste/E2E |

**Regra API:** valores não-UUID são descartados → `null`.

---

### `category`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Não |
| **Descrição** | Vertical de produto (frontend) ou marcador server-side |
| **Origem** | `detectAnalyticsCategory()` ou constantes server-side |
| **Exemplo** | `smartphones`, `price_alert_email` |
| **Quem popula** | Frontend ou builders de price alert |
| **Quando nulo** | `session_started`; alguns eventos server-side mínimos |

---

### `product_name`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Não |
| **Descrição** | Nome de exibição do produto |
| **Origem** | Contexto do card, recomendação ou alerta |
| **Exemplo** | `Samsung Galaxy A15 5G` |
| **Quem popula** | Frontend ou server-side |
| **Quando nulo** | Eventos sem produto |

---

### `product_brand`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Não |
| **Descrição** | Marca do produto |
| **Origem** | Objeto produto / alerta |
| **Exemplo** | `Samsung` |
| **Quem popula** | Frontend ou server-side |
| **Quando nulo** | Quando marca desconhecida; testes E2E/test |

---

### `product_id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Não |
| **Descrição** | Identificador do produto no data layer |
| **Origem** | Objeto produto / alerta |
| **Exemplo** | Valor dependente do writer |
| **Quem popula** | Frontend ou server-side |
| **Quando nulo** | Quando ID indisponível |

---

### `query_text`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Não |
| **Descrição** | Texto da pergunta do usuário |
| **Origem** | Input ou sugestão clicável |
| **Exemplo** | `Qual celular tem melhor bateria até 1500?` |
| **Quem popula** | Frontend; server-side (`evaluation.search_query`) |
| **Quando nulo** | Eventos não orientados a pergunta |

---

### `recommendation_name`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Não |
| **Descrição** | Nome do produto recomendado exibido |
| **Origem** | Card de oferta / builder server-side |
| **Exemplo** | `Motorola Moto G84` |
| **Quem popula** | Frontend (`mia_recommendation_shown`); server-side (espelha `product_name`) |
| **Quando nulo** | Eventos sem recomendação |

---

### `offer_store`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Não |
| **Descrição** | Loja ou provider da oferta |
| **Origem** | `prod.source` / `prod.store` ou avaliação de alerta |
| **Exemplo** | `Mercado Livre` |
| **Quem popula** | Frontend ou server-side |
| **Quando nulo** | Eventos não comerciais |

---

### `offer_price`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `numeric` |
| **Obrigatório** | Não |
| **Descrição** | Preço numérico da oferta |
| **Origem** | Payload (API converte com `Number()`) |
| **Exemplo** | `1299.90` |
| **Quem popula** | Frontend ou server-side |
| **Quando nulo** | Sem preço no contexto |

---

### `offer_url`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatório** | Não |
| **Descrição** | URL outbound da oferta |
| **Origem** | `prod.link` ou avaliação |
| **Exemplo** | `https://example.com/produto/123` |
| **Quem popula** | Frontend ou server-side |
| **Quando nulo** | Sem URL |

---

### `metadata`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `jsonb` |
| **Obrigatório** | Não (default `{}`) |
| **Descrição** | Propriedades extras específicas do evento |
| **Origem** | Payload ou builder sanitizado |
| **Exemplo** | `{ "has_image": false }` |
| **Quem popula** | Frontend ou server-side |
| **Quando nulo** | Schema permite; writers normalmente enviam `{}` |

Chaves em uso: §3.

---

### `created_at`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `timestamptz` |
| **Obrigatório** | Sim |
| **Descrição** | Timestamp de inserção (UTC) |
| **Origem** | PostgreSQL (`now()`) |
| **Exemplo** | `2026-07-22T00:25:04.502+00:00` |
| **Quem popula** | Banco |
| **Quando nulo** | Nunca |

---

## 3. Chaves de metadata em uso

Somente chaves encontradas nos writers oficiais (`lib/analytics.js`, `MIAChat.jsx`, `miaPriceAlertEmailAnalytics.js`).

### 3.1 Frontend — eventos MIA

| Chave | Tipo | Eventos | Obrigatória | Descrição | Quem popula | Pode ser nulo |
|-------|------|---------|-------------|-----------|-------------|---------------|
| `page` | string | `session_started` | Não* | Pathname da página | `trackMiaSessionStarted` | Sim (`referrer` sim) |
| `user_agent` | string | `session_started` | Não* | User-Agent do navegador | `trackMiaSessionStarted` | Não na prática |
| `referrer` | string \| null | `session_started` | Não | Referrer document | `trackMiaSessionStarted` | Sim |
| `has_image` | boolean | `mia_question_sent` | Não* | Pergunta inclui imagem | `trackMiaQuestionSent` | Não (sempre bool) |
| `has_offer_card` | boolean | `mia_recommendation_shown` | Não* | Resposta tinha card | `MIAChat.jsx` | Não |
| `products_count` | number | `mia_recommendation_shown` | Não* | Qtd. produtos na resposta | `MIAChat.jsx` | Não |
| `action_source` | string | `favorite_created`, `price_alert_created` | Não* | Origem da ação | `MIAChat.jsx` | Não |
| `target_price` | number \| null | `price_alert_created` | Não | Preço alvo do alerta | `MIAChat.jsx` | Sim |
| `current_price` | number \| null | `price_alert_created` | Não | Preço atual no momento | `MIAChat.jsx` | Sim |
| `button_text` | string | `offer_click` | Não* | Texto do CTA | `MIAChat.jsx` | Não (`"Ver oferta"`) |

\*Obrigatória **no contrato de uso atual** (sempre enviada quando o evento dispara), mas não enforced pelo banco.

**Valores de `action_source`:** `"offer_card"`, `"alert_form"`.

---

### 3.2 Server-side — produção (`price_alert_email`)

| Chave | Tipo | Descrição | Pode ser nulo |
|-------|------|-----------|---------------|
| `alert_id` | number \| null | ID do alerta | Sim |
| `normalized_product_key` | string \| null | Chave normalizada | Sim |
| `target_price` | number \| null | Preço alvo | Sim |
| `best_found_price` | number \| null | Melhor preço encontrado | Sim |
| `best_found_source` | string \| null | Fonte da melhor oferta | Sim |
| `best_found_url` | string \| null | URL da melhor oferta | Sim |
| `reason` | string \| null | Motivo operacional | Sim |
| `send_mode` | boolean | Envio real habilitado | Não (default `true`) |
| `dry_run` | boolean | Sempre `false` em produção | Não |
| `email_send_count` | number \| null | Contador de envios | Sim |
| `last_alert_sent_price` | number \| null | Último preço enviado | Sim |
| `resend_result_id` | string \| null | ID do provedor de e-mail | Sim |
| `blocked_by` | string \| null | Gate que bloqueou | Sim |
| `error_code` | string \| null | Código de erro | Sim |

**Chaves proibidas (removidas na sanitização):** `user_email`, `email`, `resend_api_key`, `api_key`, `admin_key`, `password`, `token`, `secret`, e qualquer chave contendo `secret` ou `password`.

---

### 3.3 Server-side — teste controlado (`price_alert_email_test`)

| Chave | Tipo | Descrição | Pode ser nulo |
|-------|------|-----------|---------------|
| `controlled_test` | boolean | Sempre `true` | Não |
| `not_market_real` | boolean | Sempre `true` | Não |
| `mode` | string | Ex.: `"controlled-send"` | Não (default) |
| `reason` | string \| null | Motivo skip/falha | Sim |
| `blocked_by` | string \| null | Gate bloqueador | Sim |
| `error_code` | string \| null | Código de erro | Sim |
| `resend_result_id` | string \| null | ID Resend | Sim |
| `offer_store` | string \| null | Loja do teste | Sim |
| `offer_price` | number \| null | Preço do teste | Sim |
| `offer_url` | string \| null | URL do teste | Sim |
| `test_url_used` | string \| null | URL usada no teste | Sim |

---

### 3.4 Server-side — E2E controlado (`price_alert_e2e_test`)

| Chave | Tipo | Descrição | Pode ser nulo |
|-------|------|-----------|---------------|
| `controlled_test` | boolean | Sempre `true` | Não |
| `not_market_real` | boolean | Sempre `true` | Não |
| `mode` | string | Ex.: `"controlled-e2e"` | Não (default) |
| `flow` | string | Sempre `"price_alert_e2e"` | Não |
| `reason` | string \| null | Motivo | Sim |
| `blocked_by` | string \| null | Gate bloqueador | Sim |
| `error_code` | string \| null | Código de erro | Sim |
| `resend_result_id` | string \| null | ID Resend | Sim |
| `template_rendered` | boolean \| null | Template renderizado | Sim |
| `offer_store` | string \| null | Loja | Sim |
| `offer_price` | number \| null | Preço | Sim |
| `offer_url` | string \| null | URL | Sim |

---

## 4. Valores de category (frontend)

Retornados por `detectAnalyticsCategory()` em `lib/analytics.js`:

| Valor | Gatilho (regex simplificado) |
|-------|------------------------------|
| `smartphones` | celular, smartphone, iphone, galaxy, etc. |
| `notebooks` | notebook, laptop, macbook, ultrabook |
| `tv` | tv, televisão, smart tv, oled, qled |
| `camera` | câmera, canon, nikon, gopro, etc. |
| `placa_de_video` | placa de vídeo, gpu, rtx, radeon |
| `audio` | fone, headphone, earbuds, airpods |
| `games` | console, ps5, playstation, xbox, switch |
| `unknown` | demais perguntas |

**Categorias server-side (constantes):**

| Valor | Uso |
|-------|-----|
| `price_alert_email` | Eventos `price_drop_email_*` produção |
| `price_alert_email_test` | Eventos `price_drop_email_test_*` |
| `price_alert_e2e_test` | Eventos `price_drop_email_e2e_*` |

---

## 5. Limites de ingestão (API pública)

Definidos em `lib/miaAnalyticsAllowlist.js`:

| Campo / limite | Valor |
|----------------|-------|
| `event_name` | max 128 chars; allowlist de 6 nomes |
| Campos string padrão | max 512 chars |
| `query_text` | max 2000 chars |
| `offer_url` | max 2048 chars |
| `metadata` (JSON serializado) | max 4000 chars |
| `offer_price` | convertido com `Number()`; inválido → `NaN` → persistido como null na prática |

Server-side aplica truncamento em strings de metadata (500 chars) e profundidade máxima 4.

---

## 6. Referências

- [EVENT_CONTRACT.md](./EVENT_CONTRACT.md) — catálogo de eventos
- [EVENT_LIFECYCLE.md](./EVENT_LIFECYCLE.md) — fluxo de ingestão
- [ANALYTICS_SCHEMA.md](../ANALYTICS_SCHEMA.md) — Analytics Storage Schema v1
- [ANALYTICS_DATA_DICTIONARY.md](../ANALYTICS_DATA_DICTIONARY.md) — colunas PostgreSQL
- [ANALYTICS_TABLE_REFERENCE.md](../ANALYTICS_TABLE_REFERENCE.md) — escritores
- [README.md](../README.md) — índice oficial
- [ANALYTICS_CHANGELOG.md](../ANALYTICS_CHANGELOG.md) — histórico
- `lib/miaAnalyticsPayload.js` — builders padronizados (PATCH 2.2)
- `lib/miaAnalyticsAllowlist.js` — validação API
- `lib/miaPriceAlertEmailAnalytics.js` — builders server-side

---

*Event Field Specification v1 — consolidado PATCH 2.4*
