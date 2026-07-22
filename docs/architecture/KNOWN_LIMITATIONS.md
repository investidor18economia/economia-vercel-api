# Limitações Conhecidas

Limitações conscientemente aceitas no MVP da MIA após conclusão do Bloco 12.

Cada item indica se é **aceito no MVP** ou planejado **pós-MVP**.

---

## Ativo — correção pendente (COMM-R01)

### Comparison intent false positive (`" e "` entre prioridades)

| Aspecto | Detalhe |
|---|---|
| **O quê** | `COMPARISON_INTENT_PATTERN` trata `"câmera e bateria"` como comparação explícita |
| **Impacto** | Recomendações com budget + multi-prioridade caem em `comparison_early_not_found`; turno 2 perde histórico |
| **Auth relacionado?** | **Não** — reproduzível anônimo; PATCH 3.3A.2 validado separadamente |
| **Patch registrado** | [PATCH COMM-R01](../commercial/PATCH_COMM_R01_COMPARISON_INTENT_ROUTING.md) |
| **Status** | ⏳ Aberto (domínio comercial, fora PATCH 3.3A) |

---

## Aceito no MVP

### Monólito `chat-gpt4o.js`

| Aspecto | Detalhe |
|---|---|
| **O quê** | Core cognitivo em arquivo único (~32k linhas) |
| **Por quê** | Escopo do Bloco 12 excluiu modularização da cognição |
| **Mitigação 12F** | Proxies ALS isolam estado mutável sem split do arquivo |
| **Risco** | Manutenibilidade — não afeta produção ou segurança |
| **Status** | ✅ Aceito MVP |

---

### Application caches in-memory

| Cache | Limitação |
|---|---|
| Rate limit (`miaPerimeterRateLimit.js`) | Não compartilhado entre instâncias Vercel |
| Universal commercial cache | TTL por instância; cold start = miss |
| Commercial search cache (chat-gpt4o) | Map module-level por instância |
| Provider cooldowns | Por instância |
| Metrics (`miaMetrics.js`) | Reset em cold start |

**Impacto:** em deploy multi-instância, rate limit e cache são "best effort" por instância. Aceitável para MVP.

**Status:** ✅ Aceito MVP

---

### HMAC session token (MVP auth)

| Aspecto | Detalhe |
|---|---|
| **O quê** | Bearer token HMAC emitido por `/api/register-user` |
| **Limitação 1** | Email não verificado — qualquer email recebe token |
| **Limitação 2** | Replayable até expiração (30 dias) |
| **Limitação 3** | Bearer credential, não prova de identidade forte |
| **Mitigação** | Endpoints de escrita validam token + user_id match |
| **Auditoria 12D** | 98% aprovado — lockdown funciona; auth não é full identity |
| **Status** | ✅ Aceito MVP |

---

### OAuth Mercado Livre operacional

| Aspecto | Detalhe |
|---|---|
| **O quê** | Fluxo OAuth ML depende de credenciais vault configuradas |
| **Limitação** | Pode retornar 403/503 em produção se credenciais ausentes |
| **Impacto** | Provider ML indisponível; fallback comercial continua |
| **Status** | ✅ Aceito MVP (operacional) |

---

### Observability parcial em wish endpoints

| Endpoint | Gap |
|---|---|
| `/api/save-wish` | Sem `withMiaObservability` |
| `/api/delete-wish` | Sem `withMiaObservability` |
| `/api/list-wish` | Sem `withMiaObservability` |
| `/api/create-price-alert` | Sem `withMiaObservability` |

**Impacto:** respostas desses endpoints não incluem `x-request-id`. Segurança (12D HMAC) funciona; rastreio incompleto.

**Status:** ✅ Aceito MVP (dívida 12E documentada)

---

### Métricas sem backend externo

| Aspecto | Detalhe |
|---|---|
| **O quê** | Métricas in-memory, sem Prometheus/Datadog |
| **Impacto** | Sem agregação cross-instance ou retenção histórica |
| **Status** | ✅ Aceito MVP |

---

### Fallback module-level (shared state)

| Aspecto | Detalhe |
|---|---|
| **O quê** | Refs fallback em `externalProviderExecutionPolicy.js` para testes legados |
| **Impacto** | Testes fora de ALS usam fallback; produção sempre usa ALS |
| **Status** | ✅ Aceito MVP |

---

### Rate limit bypass multi-instância

| Aspecto | Detalhe |
|---|---|
| **O quê** | Atacante pode distribuir requests entre instâncias |
| **Mitigação parcial** | Hash por IP + conversation ID |
| **Status** | ✅ Aceito MVP |

---

## Pós-MVP

Itens identificados para evolução futura (Bloco 13+):

| Item | Evolução proposta |
|---|---|
| Monólito chat-gpt4o | Modularização cognitiva (fora do escopo Bloco 12) |
| Application caches | Redis/KV store compartilhado (Vercel KV ou Upstash) |
| HMAC session | Verificação de email + refresh token + revogação |
| OAuth ML | Monitoramento proativo + alertas de expiração |
| Wish endpoints | Instrumentar com `withMiaObservability` |
| Métricas | Export Prometheus/OpenTelemetry |
| Rate limit | Store distribuído cross-instance |
| Card vs text mismatch | Bug funcional separado (pré-existente) |

---

## O que NÃO é limitação

Estes aspectos foram resolvidos no Bloco 12:

| Aspecto | Patch | Status |
|---|---|---|
| Core exposto ao browser | 12B proxy | ✅ Resolvido |
| Resposta vaza debug/prompts | 12C sanitization | ✅ Resolvido |
| Dev routes abertas em prod | 12D middleware | ✅ Resolvido |
| Write endpoints sem auth | 12D HMAC session | ✅ Resolvido |
| Sem requestId nos logs | 12E observability | ✅ Resolvido |
| Estado mutável vaza entre requests | 12F ALS | ✅ Resolvido |

---

## Referências

- [BLOCK_12_ARCHITECTURE.md](./BLOCK_12_ARCHITECTURE.md)
- [SECURITY_MODEL.md](./SECURITY_MODEL.md) — HMAC e auth details
- [OBSERVABILITY.md](./OBSERVABILITY.md) — instrumentation gaps
- [SHARED_STATE.md](./SHARED_STATE.md) — cache classification
