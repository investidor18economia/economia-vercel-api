# SUPABASE-07B — Smoke Validation

**Produção:** `https://economia-ai.vercel.app`  
**Supabase:** `xzijmzqsquasrtnkotrw`  
**Artefato:** `supabase/.temp/audit/SUPABASE-07B/smoke-validation.json`

---

## 10.1 Health checks (read-only)

| Teste | Endpoint | Resultado |
|-------|----------|-----------|
| Health | `/api/health` | 200 — `status: ok` |
| Ready | `/api/ready` | 200 |
| App page | `/app-mia` | 200 |

---

## 10.2 Analytics

| Teste | Método | Resultado |
|-------|--------|-----------|
| Track controlado | POST `/api/analytics/track` | 200 `{ success: true }` |
| Persistência backend | service_role read by session_id | 1 registro encontrado |
| Bloqueio SELECT público | anon REST (se key disponível) | bloqueado / sem dados |
| Contagem agregada | SQL remoto | 402 → 404 (+2 eventos smoke) |

**Identificadores smoke:**

- `session_id` prefix: `supabase_07b_analytics_<timestamp>`
- metadata: `{ source: 'supabase_07b_smoke', patch: 'SUPABASE-07B' }`

**Limpeza:** registros mantidos identificados (DELETE não faz parte do fluxo seguro aprovado).

---

## 10.3 Conversação

| Teste | Método | Resultado |
|-------|--------|-----------|
| Chat produção | POST `/api/mia-chat` | **200** — resposta gerada (~6.4 KB JSON) |
| conversation_id | `supabase_07b_chat_<timestamp>` | identificável |

**Nota:** validação funcional via endpoint público usado pela interface (`/api/mia-chat`). Teste visual browser MCP indisponível no ambiente; API confirma fluxo cognitivo operacional.

**Pergunta smoke:** *"SUPABASE-07B smoke: qual celular tem melhor bateria abaixo de 1500 reais?"*

---

## 10.4 Alertas

**Não executado (escrita)** — risco de disparo de e-mail real.

Validação read-only:

- `price_alerts`: 9 registros (inalterado)  
- `price_alert_delivery_logs`: 6 registros (inalterado)  
- RLS logs: ON; service_role only  

---

## 10.5 Vault (read-only)

| Teste | Resultado |
|-------|-----------|
| Grants provider_credentials | postgres + service_role only |
| anon REST select | bloqueado / vazio |
| Registros | 1 (inalterado) |
| Valores secretos | não consultados |

---

## 10.6 Catálogo (read-only)

| Teste | Resultado |
|-------|-----------|
| phone_specs count | 505 |
| REST sample read | OK via service_role |

---

## Script automatizado

```powershell
node scripts/run-supabase-07b-smoke-validation.mjs
```

**Resultado:** 7/7 passed

Checks: health, ready, analytics track, service_role read, anon block (skip se sem anon key), catalog read, vault anon block.

---

## Regressões observadas

Nenhuma regressão 5xx identificada nos smoke tests executados.
