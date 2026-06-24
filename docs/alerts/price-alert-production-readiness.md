# Price Alert MVP — Production Readiness (PATCH 10)

Documento de guardrails finais para o ciclo de alertas por e-mail da MIA (PATCHes 1–9).

**Status recomendado para MVP:** envio automático **desligado** até decisão explícita de produto.

---

## Resumo dos PATCHes 1–9

| PATCH | Escopo | Artefatos principais |
|-------|--------|----------------------|
| **1** | Template oficial de e-mail price drop | `lib/miaPriceDropEmailTemplate.js`, `lib/email.js` |
| **2** | Campos de segurança em `price_alerts` | `lib/miaPriceAlertsSafety.js`, SQL safety fields |
| **3** | Dry Run protegido (sem envio) | `lib/miaPriceAlertDryRun.js`, `/api/admin/price-alerts-dry-run` |
| **4** | Send Gate + Anti-Spam | `lib/miaPriceAlertSendGate.js`, `/api/admin/price-alerts-send` |
| **5** | Analytics side-effect | `lib/miaPriceAlertEmailAnalytics.js` |
| **6** | Admin Test (validate/mock/controlled-send) | `lib/miaPriceAlertAdminTest.js`, `/api/admin/price-alerts-test` |
| **7** | E2E controlado | `lib/miaPriceAlertE2EValidation.js`, `/api/admin/price-alerts-e2e` |
| **8** | Vercel Cron diário protegido | `lib/miaPriceAlertCron.js`, `/api/cron/price-alerts-daily-check`, `vercel.json` |
| **9** | Delivery audit logs | `lib/miaPriceAlertDeliveryLogs.js`, SQL delivery logs + permissions |

---

## Variáveis de ambiente (Vercel)

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | Supabase (backend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Client admin server-only (`lib/supabaseClient.js`) |
| `MIA_ADMIN_API_KEY` | Sim | Endpoints `/api/admin/price-alerts-*` |
| `MIA_CRON_SECRET` | Sim | Cron `/api/cron/price-alerts-daily-check` |
| `RESEND_API_KEY` | Sim (para envio real) | Resend |
| `MIA_PRICE_DROP_EMAIL_SEND_ENABLED` | Sim | **`false` por padrão no MVP** — master switch de envio |
| `MIA_PRICE_ALERT_CRON_LIMIT` | Não | Limite de alertas no cron (default 10, max 25) |

**Nunca** expor `SUPABASE_SERVICE_ROLE_KEY`, `MIA_ADMIN_API_KEY`, `MIA_CRON_SECRET` ou `RESEND_API_KEY` no frontend.

`.env.local` está no `.gitignore` — não commitar.

---

## Endpoints admin

Todos exigem header `x-mia-admin-key: <MIA_ADMIN_API_KEY>` (ou `x-admin-api-key`).

| Endpoint | Função | Envia e-mail? |
|----------|--------|---------------|
| `GET/POST /api/admin/price-alerts-dry-run` | Simula checagem | **Não** |
| `GET/POST /api/admin/price-alerts-send` | Envio real gated | Somente com todas as travas |
| `GET/POST /api/admin/price-alerts-test` | validate / mock / controlled-send | controlled-send apenas com flags |
| `GET/POST /api/admin/price-alerts-e2e` | validate / controlled-e2e | controlled-e2e apenas com flags |

Sem chave admin: **401** (ausente/inválida) ou **503** (não configurada).

---

## Endpoint cron

| Endpoint | Proteção | Schedule |
|----------|----------|----------|
| `GET/POST /api/cron/price-alerts-daily-check` | `Authorization: Bearer <MIA_CRON_SECRET>` ou `?cron_secret=` | `0 12 * * *` (09:00 BRT) |

Sem secret: **401** ou **503**.

Com `MIA_PRICE_DROP_EMAIL_SEND_ENABLED=false`: retorna `code: send_disabled` e registra `cron_send_disabled` em delivery logs.

---

## Como testar cron com envio desligado

```http
GET /api/cron/price-alerts-daily-check?debug=true
Authorization: Bearer <MIA_CRON_SECRET>
```

Resposta esperada (envio desligado):

```json
{
  "ok": false,
  "code": "send_disabled",
  "delivery_log_attempted": true,
  "delivery_log_inserted": true,
  "delivery_log_error": null
}
```

Se `delivery_log_inserted: false` com `delivery_logs_permission_denied`, executar no Supabase:

- `docs/alerts/price-alert-delivery-logs.sql` (se tabela não existir)
- `docs/alerts/price-alert-delivery-logs-permissions.sql`

---

## Como testar E2E controlado

1. Modo validate (sem envio):

```http
GET /api/admin/price-alerts-e2e?mode=validate
x-mia-admin-key: <MIA_ADMIN_API_KEY>
```

2. Envio controlado (todas as travas necessárias):

```http
POST /api/admin/price-alerts-e2e
x-mia-admin-key: <MIA_ADMIN_API_KEY>
Content-Type: application/json

{
  "mode": "controlled-e2e",
  "send": true,
  "confirm_send": true,
  "allow_controlled_send": true
}
```

Requer adicionalmente: `MIA_PRICE_DROP_EMAIL_SEND_ENABLED=true`, `RESEND_API_KEY` configurada.

---

## Como validar delivery logs

No Supabase SQL Editor:

```sql
select event_type, source, reason, severity, created_at
from public.price_alert_delivery_logs
order by created_at desc
limit 20;
```

Eventos esperados no MVP com envio desligado: `cron_send_disabled`, `cron_started`.

Logs são side-effect não bloqueante — falha de insert não quebra cron/send/dry-run.

---

## Flags que habilitam envio real

Todas devem estar satisfeitas para envio em produção:

### Send Gate manual (`/api/admin/price-alerts-send`)

- `x-mia-admin-key` válida
- `send=true`
- `confirm_send=true`
- `MIA_PRICE_DROP_EMAIL_SEND_ENABLED=true`
- `RESEND_API_KEY` configurada
- Alerta elegível (preço ≤ alvo, link válido, e-mail válido)
- Anti-spam aprovado

### Admin test controlled-send

- Admin key + `send=true` + `confirm_send=true` + `allow_controlled_send=true`
- Env flags + Resend
- Produto/e-mail de teste controlados (não altera `price_alerts` reais)

### E2E controlled-e2e

- Mesmas travas do controlled-send
- Fluxo oficial documentado no PATCH 7

### Cron automático

- `MIA_CRON_SECRET` válido
- **`MIA_PRICE_DROP_EMAIL_SEND_ENABLED=true`** (master switch)
- `RESEND_API_KEY`
- Send gate + anti-spam (sem bypass)

---

## Anti-spam (PATCH 4)

| Regra | Constante / comportamento |
|-------|---------------------------|
| Cooldown 24h | `MIA_PRICE_ALERT_SEND_COOLDOWN_MS` |
| Máximo 3 envios por alerta | `MIA_PRICE_ALERT_MAX_EMAIL_SEND_COUNT = 3` |
| Preço deve ser melhor que último enviado | `not_better_than_last_sent` |
| Bloqueia `example.com` | `BLOCKED_URL_HOSTS` |
| Bloqueia link vazio/inválido | `invalid_best_url` |
| Bloqueia e-mail inválido | `missing_or_invalid_user_email` |
| Bloqueia preço acima do alvo | via `evaluatePriceAlertDryRun` |

---

## SQL manual (Supabase)

Executar nesta ordem, uma vez por ambiente:

1. `docs/alerts/price-alerts-safety-fields.sql` — colunas PATCH 2
2. `docs/alerts/price-alert-delivery-logs.sql` — tabela PATCH 9
3. `docs/alerts/price-alert-delivery-logs-permissions.sql` — GRANTs PATCH 9b

Todos são idempotentes, sem `DROP TABLE`, sem `DELETE` de dados.

---

## Scripts de auditoria

Rodar antes de cada deploy/commit do ciclo Price Alert:

```bash
node scripts/test-mia-price-drop-email-template-audit.js
node scripts/test-mia-price-alerts-safety-fields-audit.js
node scripts/test-mia-price-alert-dry-run-audit.js
node scripts/test-mia-price-alert-send-gate-audit.js
node scripts/test-mia-price-drop-email-analytics-audit.js
node scripts/test-mia-price-alert-admin-test-endpoint-audit.js
node scripts/test-mia-price-alert-e2e-flow-audit.js
node scripts/test-mia-price-alert-vercel-cron-audit.js
node scripts/test-mia-price-alert-delivery-logs-audit.js
```

Critério: **100%** em todos (PATCH 10 — jun/2026: 9/9 aprovados).

---

## Checklist antes de produção

- [ ] SQLs executados no Supabase (safety, delivery logs, permissions)
- [ ] `MIA_PRICE_DROP_EMAIL_SEND_ENABLED=false` no Vercel
- [ ] `MIA_ADMIN_API_KEY` e `MIA_CRON_SECRET` configurados (valores fortes, rotacionáveis)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` apenas no backend Vercel (nunca `NEXT_PUBLIC_*`)
- [ ] Cron responde `send_disabled` com delivery log inserido
- [ ] Dry run funciona com admin key
- [ ] Send gate bloqueia sem `send=true` + `confirm_send=true`
- [ ] 9 scripts de auditoria passam
- [ ] `.env.local` **não** está staged no git
- [ ] Decisão explícita de produto antes de `MIA_PRICE_DROP_EMAIL_SEND_ENABLED=true`

---

## Decisão explícita de envio

**Manter `MIA_PRICE_DROP_EMAIL_SEND_ENABLED=false` até decisão final de produto.**

Habilitar envio real somente após:

1. Validar E2E controlado em staging
2. Confirmar delivery logs e analytics
3. Revisar limites de cron (`MIA_PRICE_ALERT_CRON_LIMIT`)
4. Aprovação formal do time
