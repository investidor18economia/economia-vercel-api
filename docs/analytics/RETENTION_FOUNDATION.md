# Retention Foundation — PATCH 3.4

> **Identity Layer:** índice canônico em [IDENTITY_LAYER.md](./IDENTITY_LAYER.md).

**Status:** Implementado e validado em produção (commit `e4423c1`)  
**Fonte da verdade:** `public.analytics_events` (append-only)  
**Princípio:** nenhuma tabela de métricas calculadas; retenção derivada em query time

---

## 1. Auditoria inicial (COMM-R01A / PATCH 3.4)

### Colunas auditadas

| Coluna | Presente | Retenção |
|--------|----------|----------|
| `id` | ✓ | linha única |
| `event_name` | ✓ | tipo de marco |
| `visitor_id` | ✓ PATCH 3.1 | visitante persistente |
| `session_id` | ✓ PATCH 1.1 | sessão de aba |
| `conversation_id` | ✓ PATCH 3.2 | thread do chat |
| `user_id` | ✓ PATCH 3.3 | conta autenticada |
| `created_at` | ✓ | eixo temporal oficial |
| Demais campos produto/oferta | ✓ | contexto; não identidade |

### Eventos públicos (allowlist)

| Evento | Papel na timeline |
|--------|-------------------|
| `session_started` | primeira sessão de aba |
| `user_authenticated` | **PATCH 3.4** — marco de login verificado |
| `mia_question_sent` | atividade + conversa |
| `mia_recommendation_shown` | engajamento |
| `offer_click` | conversão |
| `favorite_created` | engajamento autenticado |
| `price_alert_created` | engajamento autenticado |

### Respostas da auditoria

| Pergunta | Resposta |
|----------|----------|
| Informação faltando para retenção? | **Sim (gap):** marco explícito de login — corrigido com `user_authenticated` |
| Redundância? | **Não** — sem tabelas paralelas |
| Inconsistência? | `session_started` na aba anônima + login posterior exigia marco auth separado |
| Coluna desnecessária? | **Nenhuma** |
| Coluna ausente? | **Nenhuma** — `created_at` suficiente |

### Fora do escopo deste patch

- Cálculo de DAU, WAU, MAU, cohorts, lifetime
- Dashboards de retenção (FASE 4+)
- Merge funcional cross-device
- Alteração de Auth, Data Layer, Contracts conversacionais, Response Layer

---

## 2. Identity Timeline (derivável)

```text
Visitor (visitor_id)
  ↓ MIN(created_at)
Primeira sessão (session_started / first session_id)
  ↓ eventos na mesma aba
Sessões seguintes (distinct session_id por visitor — nova aba = nova sessão)
  ↓ first conversation_id em mia_question_sent
Primeira conversa
  ↓ conversas seguintes (distinct conversation_id)
Primeiro login (user_authenticated ou first user_id event)
  ↓ eventos com user_id + Authorization
Sessões autenticadas
  ↓ MAX(created_at)
Última atividade
```

Implementação de derivação (JS, testável): `lib/miaAnalyticsRetentionFoundation.js`  
Consultas SQL de referência: [sql/analytics-retention-foundation.sql](./sql/analytics-retention-foundation.sql)

---

## 3. Lifecycle (classificação futura)

| Estado | Regra (foundation) |
|--------|-------------------|
| **new** | `first_active_day = evaluation_day` e um dia ativo |
| **returning** | atividade em `evaluation_day`, `first_active_day` anterior |
| **reactivated** | retorno após gap configurável (default 7 dias) |
| **active** | atividade no dia de avaliação |

Função: `classifyVisitorLifecycle()` — **não persiste** estado.

---

## 4. Implementação PATCH 3.4

| Entrega | Detalhe |
|---------|---------|
| Evento `user_authenticated` | allowlist + payload + track no OTP login |
| `lib/miaAnalyticsRetentionFoundation.js` | derivação de timelines |
| Migration indexes | `20260722180000_analytics_retention_foundation_v1.sql` |
| Testes | `npm run test:mia:analytics:retention-foundation` |

### `user_authenticated`

- **Dispara:** `completeAuthenticatedLogin()` após OTP verificado
- **Não dispara:** `session_started` duplicado (preserva PATCH 1.1)
- **user_id:** resolvido server-side (PATCH 3.3)
- **metadata:** `{ page, auth_method: "otp_email" }` — sem PII

---

## 5. Migrations

`supabase/migrations/20260722180000_analytics_retention_foundation_v1.sql`

Índices compostos (somente leitura futura):

- `(visitor_id, created_at desc)`
- `(user_id, created_at desc)`
- `(conversation_id, created_at desc)`

Sem novas colunas. Sem backfill.

---

## 6. Compatibilidade

| Patch | Impacto |
|-------|---------|
| 1.x session_id | Preservado |
| 3.1 visitor_id | Preservado |
| 3.2 conversation_id | Preservado |
| 3.3 user_id / anti-spoofing | Preservado |
| 3.3A auth | Não alterado (apenas analytics pós-login) |

Eventos históricos sem `user_authenticated`: first login derivável via `MIN(created_at) WHERE user_id IS NOT NULL`.

---

## 7. Limitações conhecidas

- Login antes de PATCH 3.4: sem evento `user_authenticated` — usar fallback SQL documentado
- `session_started` na aba anônima não é reemitido após login (by design)
- Retenção cross-device: um `user_id` pode linkar múltiplos `visitor_id` prospectivamente
- Logout local não gera evento (continua PATCH 3.3)

---

## 8. Próximos passos

| Patch | Conteúdo |
|-------|----------|
| **3.5** | [Identity Documentation & Validation](./IDENTITY_LAYER.md) — **concluído** |
| **3.6** | Auditoria final FASE 3 |
| **FASE 4** | Dashboards DAU / cohorts / retenção (SQL agregado) |
| **COMM-R01B** | Correção roteamento comercial (domínio separado) |

---

## Referências

- [IDENTITY_LAYER.md](./IDENTITY_LAYER.md)
- [VISITOR_ID.md](./VISITOR_ID.md)
- [SESSION_ID.md](./SESSION_ID.md)
- [CONVERSATION_ID.md](./CONVERSATION_ID.md)
- [AUTHENTICATED_IDENTITY.md](./AUTHENTICATED_IDENTITY.md)
- [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md)
- [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md)

---

*PATCH 3.4 — Retention Foundation*
