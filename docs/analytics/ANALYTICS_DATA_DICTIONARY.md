# Analytics Data Dictionary
## Dicionário oficial — `public.analytics_events`

**Versão:** Analytics Storage Schema v1 + PATCH 3.1 (`visitor_id`)  
**Migration:** `supabase/migrations/20260719153000_analytics_events_storage_schema_v1.sql`  
**Migration identity:** `supabase/migrations/20260721153002_analytics_events_visitor_id.sql`  
**Documento principal:** [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md)

Este dicionário descreve as **16 colunas** oficiais de `analytics_events`. Campos ainda não implementados (`conversation_id`, etc.) permanecem fora deste dicionário.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Dicionário por coluna](#2-dicionário-por-coluna)
3. [Referências](#3-referências)

---

## 1. Visão geral

| Métrica | Valor |
|---------|-------|
| Tabela | `public.analytics_events` |
| Colunas | 16 |
| Colunas NOT NULL | `id`, `event_name`, `created_at` |
| Colunas geradas pelo banco | `id`, `created_at` (default) |

---

## 2. Dicionário por coluna

### `id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `uuid` |
| **Obrigatória** | Sim |
| **Nullable** | Não |
| **Default** | `gen_random_uuid()` |
| **Descrição** | Chave primária da linha de evento. Identificador único server-side. |
| **Exemplo** | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| **Origem** | Banco (default na INSERT) |
| **Quem popula** | PostgreSQL |
| **Quando preenchida** | Automaticamente em todo INSERT |
| **Quando nula** | Nunca |

---

### `event_name`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Sim |
| **Nullable** | Não |
| **Default** | — |
| **Descrição** | Identificador do tipo de evento. No endpoint público, restrito à allowlist; no server-side, nomes técnicos legítimos. |
| **Exemplo** | `mia_question_sent`, `session_started`, `price_drop_email_sent` |
| **Origem** | Payload da requisição / builder server-side |
| **Quem popula** | Frontend (via API) ou APIs backend |
| **Quando preenchida** | Todo INSERT |
| **Quando nula** | Nunca (INSERT rejeitado) |

---

### `session_id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Identificador anônimo da **sessão da aba** do navegador (PATCH 1.1). Não é pessoa, DAU, MAU ou visitante persistente. |
| **Exemplo** | `mia-sess-679abc-1234` ou UUID |
| **Origem** | `sessionStorage` via `lib/analytics.js` → API |
| **Quem popula** | Frontend (eventos MIA); server-side geralmente `null` |
| **Quando preenchida** | Eventos originados no browser com sessão ativa |
| **Quando nula** | Eventos server-side (ex.: e-mail de alerta), testes controlados |

Ver [SESSION_ID.md](./SESSION_ID.md).

---

### `visitor_id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `uuid` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Identificador anônimo persistente do navegador/origem (PATCH 3.1). Não é sessão, não é usuário autenticado. |
| **Exemplo** | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| **Origem** | `localStorage.mia_analytics_visitor_id` via `lib/analytics.js` → API |
| **Quem popula** | Frontend (6 eventos públicos); server-side somente se contexto legítimo |
| **Quando preenchida** | Eventos originados no browser com identidade persistente disponível |
| **Quando nula** | Dados históricos; eventos server-side; testes; storage indisponível |

Ver [VISITOR_ID.md](./VISITOR_ID.md).

---

### `user_id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `uuid` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | UUID do usuário autenticado Supabase, quando disponível no payload e válido. |
| **Exemplo** | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| **Origem** | Payload opcional do cliente ou alerta server-side |
| **Quem popula** | Frontend (se enviar UUID válido) ou `miaPriceAlertEmailAnalytics` |
| **Quando preenchida** | Sessão autenticada ou alerta com `user_id` UUID |
| **Quando nula** | Sessão anônima ou eventos técnicos sem usuário |

---

### `category`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Categoria coarse: vertical de produto (ex.: `smartphones`, `notebooks`) ou marcador server-side (ex.: `price_alert_email_test`). |
| **Exemplo** | `smartphones`, `price_alert_email`, `price_alert_e2e_test` |
| **Origem** | `detectAnalyticsCategory()` no frontend ou constantes server-side |
| **Quem popula** | Frontend ou APIs de alerta |
| **Quando preenchida** | Quando o writer define categoria |
| **Quando nula** | Eventos sem categorização |

Usada nos filtros QA de dashboards (PATCH 1.3).

---

### `product_name`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Nome de exibição do produto associado ao evento. |
| **Exemplo** | `Samsung Galaxy A15 5G` |
| **Origem** | Contexto da conversa, recomendação ou alerta |
| **Quem popula** | Frontend ou server-side |
| **Quando preenchida** | Eventos com contexto de produto |
| **Quando nula** | Eventos sem produto (ex.: `session_started`) |

---

### `product_brand`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Marca do produto, quando aplicável. |
| **Exemplo** | `Samsung` |
| **Origem** | Payload do track |
| **Quem popula** | Frontend (allowlist) ou server-side |
| **Quando preenchida** | Quando marca conhecida no contexto |
| **Quando nula** | Maioria dos eventos server-side de e-mail |

---

### `product_id`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Identificador de produto do Data Layer ou contexto comercial. |
| **Exemplo** | `phone_specs:12345` (formato depende do writer) |
| **Origem** | Payload |
| **Quem popula** | Frontend ou server-side |
| **Quando preenchida** | Eventos com ID de produto disponível |
| **Quando nula** | Quando ID não aplicável |

---

### `query_text`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Texto da pergunta do usuário em eventos orientados a pergunta. Sujeito a limite na API (2000 chars). |
| **Exemplo** | `Qual celular tem melhor bateria até 1500 reais?` |
| **Origem** | Payload do track (`mia_question_sent`, etc.) |
| **Quem popula** | Frontend |
| **Quando preenchida** | Eventos que carregam pergunta |
| **Quando nula** | Eventos sem pergunta (ex.: `offer_click`) |

Não é campo de segredo; ainda assim sujeito a limites de ingestão.

---

### `recommendation_name`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Nome do produto recomendado exibido ao usuário. |
| **Exemplo** | `Motorola Moto G84` |
| **Origem** | Payload (PATCH 1.2 — tracking de sugestões clicáveis) |
| **Quem popula** | Frontend |
| **Quando preenchida** | `mia_recommendation_shown`, cliques relacionados |
| **Quando nula** | Eventos sem recomendação |

---

### `offer_store`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Loja ou provider da oferta comercial. |
| **Exemplo** | `Mercado Livre`, `Amazon` |
| **Origem** | Payload ou avaliação de alerta |
| **Quem popula** | Frontend (`offer_click`) ou server-side |
| **Quando preenchida** | Eventos de oferta |
| **Quando nula** | Eventos não comerciais |

---

### `offer_price`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `numeric` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | Preço numérico da oferta quando aplicável. |
| **Exemplo** | `1299.90` |
| **Origem** | Payload (convertido para Number na API) |
| **Quem popula** | Frontend ou server-side |
| **Quando preenchida** | Cliques/ofertas com preço |
| **Quando nula** | Sem preço no contexto |

---

### `offer_url`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `text` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | — |
| **Descrição** | URL outbound da oferta. Limite 2048 chars na API pública. |
| **Exemplo** | `https://example.com/produto/123` |
| **Origem** | Payload |
| **Quem popula** | Frontend ou server-side |
| **Quando preenchida** | Eventos com link de oferta |
| **Quando nula** | Sem URL |

---

### `metadata`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `jsonb` |
| **Obrigatória** | Não |
| **Nullable** | Sim |
| **Default** | `'{}'::jsonb` |
| **Descrição** | Sacola JSON de propriedades extras específicas do evento. Sem schema rígido no Analytics Storage Schema v1; chaves documentadas no [Event Contract](./contracts/EVENT_FIELD_SPECIFICATION.md). |
| **Exemplo** | `{ "page": "/app-mia", "user_agent": "..." }` |
| **Origem** | Payload |
| **Quem popula** | Frontend ou builders server-side (sanitizados) |
| **Quando preenchida** | Quase sempre (default `{}`) |
| **Quando nula** | Permitido no schema; API normalmente envia `{}` |

Server-side remove chaves proibidas (`email`, `token`, `secret`, etc.).

---

### `created_at`

| Atributo | Valor |
|----------|-------|
| **Tipo** | `timestamptz` |
| **Obrigatória** | Sim |
| **Nullable** | Não |
| **Default** | `now()` |
| **Descrição** | Timestamp de inserção no banco (UTC). |
| **Exemplo** | `2026-07-22T00:25:04.502+00:00` |
| **Origem** | Banco (default) |
| **Quem popula** | PostgreSQL |
| **Quando preenchida** | Todo INSERT |
| **Quando nula** | Nunca |

Base temporal de todos os dashboards PATCH 1.3.

---

## 3. Referências

- [README.md](./README.md) — índice oficial
- [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) — Event Contract v1
- [contracts/EVENT_FIELD_SPECIFICATION.md](./contracts/EVENT_FIELD_SPECIFICATION.md) — metadata por evento
- [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) — visão estrutural
- [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md) — quem grava/lê
- [DASHBOARDS.md](./DASHBOARDS.md) — uso em SQL
- [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) — histórico
- `lib/miaAnalyticsPayload.js` — builders padronizados (PATCH 2.2)
- `pages/api/analytics/track/index.js` — INSERT público
- `lib/miaPriceAlertEmailAnalytics.js` — INSERT server-side

---

*Analytics Data Dictionary — Analytics Storage Schema v1. PATCH 2.4.*
