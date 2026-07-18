# Bloco 12 — Arquitetura Consolidada

Documentação oficial da arquitetura de produção da MIA após conclusão do Bloco 12 (patches 12A → 12F).

**Produção:** `https://economia-ai.vercel.app`  
**Runtime:** Next.js 14 (Pages Router) em Vercel Serverless (Node 22.x)

---

## Visão geral

O Bloco 12 transformou a MIA de um MVP funcional em um sistema **pronto para produção** com camadas explícitas de:

1. **Perímetro público** — proxy, rate limit, validação
2. **Hardening de resposta** — sanitização, CORS, headers
3. **Lockdown de endpoints** — fail-closed, auth interna, sessão HMAC
4. **Observabilidade operacional** — logs estruturados, métricas, health/ready
5. **Estado compartilhado serverless-safe** — AsyncLocalStorage por request

A cognição (Decision Engine, Router, Prompt, Ranking, Commercial Runtime) **não foi alterada** neste bloco. Apenas infraestrutura, segurança, observabilidade e lifecycle de estado.

---

## Objetivos do Bloco 12

| Patch | Objetivo |
|---|---|
| **12A** | Baseline de prontidão MVP e delimitação do escopo de hardening de produção |
| **12A.1** | Refinamentos da baseline antes do perímetro |
| **12B** | Perímetro público: proxy `/api/mia-chat`, rate limit, forward interno para core |
| **12C** | Hardening de request/response nas rotas públicas aprovadas |
| **12D** | Lockdown de endpoints abertos: dev/legacy/internal/write auth |
| **12E** | Observabilidade operacional: logger, requestId, métricas, health/ready |
| **12F** | Estado compartilhado request-scoped via AsyncLocalStorage (serverless-safe) |

---

## Arquitetura em camadas

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (MIAChat.jsx)                                     │
│  session_context · conversation_id · React local state      │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST /api/mia-chat
┌───────────────────────────▼─────────────────────────────────┐
│  PERÍMETRO (12B + 12C)                                      │
│  rate limit · CORS · validação · sanitização de resposta    │
└───────────────────────────┬─────────────────────────────────┘
                            │ forward interno (x-api-key)
┌───────────────────────────▼─────────────────────────────────┐
│  CORE COGNITIVO (chat-gpt4o.js)                             │
│  observability · shared state · commercial · decision · LLM │
└───────────────────────────┬─────────────────────────────────┘
                            │ resposta sanitizada
┌───────────────────────────▼─────────────────────────────────┐
│  Frontend                                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Componentes principais

### Perímetro e hardening

| Arquivo | Patch | Responsabilidade |
|---|---|---|
| `pages/api/mia-chat.js` | 12B/12C | Proxy público aprovado para chat |
| `lib/miaPerimeterRateLimit.js` | 12B | Rate limit in-memory por IP/conversation |
| `lib/miaPerimeterChatProxy.js` | 12B | Forward interno com propagação de IDs |
| `lib/miaPublicApiHardening.js` | 12C | CORS, validação, sanitização, headers |

### Segurança e acesso

| Arquivo | Patch | Responsabilidade |
|---|---|---|
| `lib/miaEndpointAccessPolicy.js` | 12D | Política central de acesso a endpoints |
| `middleware.js` | 12D | Fail-closed 404 para rotas dev/test |
| `lib/miaUserSessionToken.js` | 12D | Tokens HMAC para endpoints de escrita |
| `lib/miaAnalyticsAllowlist.js` | 12D | Allowlist de eventos analytics |
| `lib/miaClientSession.js` | 12D | Helper frontend para Bearer token |

### Observabilidade

| Arquivo | Patch | Responsabilidade |
|---|---|---|
| `lib/miaObservabilityContext.js` | 12E | AsyncLocalStorage: requestId, correlationId |
| `lib/miaObservability.js` | 12E | Wrapper `withMiaObservability` |
| `lib/miaLogger.js` | 12E | Logs JSON estruturados |
| `lib/miaLogRedaction.js` | 12E | Redação automática de segredos |
| `lib/miaMetrics.js` | 12E | Métricas in-memory MVP |
| `pages/api/health.js` | 12E | Liveness probe |
| `pages/api/ready.js` | 12E | Readiness probe |

### Shared state

| Arquivo | Patch | Responsabilidade |
|---|---|---|
| `lib/miaSharedRequestState.js` | 12F | ALS hub: runtime enforcement, governance, env |
| `lib/commercial/externalProviderExecutionPolicy.js` | 12F | Bindings de env/accounting via ALS |
| `lib/commercial/commercialRequestDeduplication.js` | 05C/12F | Dedup comercial request-scoped (ALS) |

### Core cognitivo (inalterado no Bloco 12)

| Componente | Arquivo principal |
|---|---|
| Decision Engine / Router / Runtime | `pages/api/chat-gpt4o.js` |
| Commercial Runtime | `lib/commercial/*` |
| Runtime Enforcement | `lib/miaRuntimeEnforcement.js` |
| Intent Authority / Routing | `lib/miaIntentAuthority.js`, `lib/miaRuntimePrecedence.js` |

---

## Rotas públicas aprovadas

Endpoints acessíveis sem `x-api-key` interna:

| Rota | Método | Descrição |
|---|---|---|
| `/api/mia-chat` | POST | Chat principal (proxy para core) |
| `/api/mia-cognitive-loading` | POST | Preview cognitivo de loading |
| `/api/analytics/track` | POST | Ingestão analytics (allowlist) |
| `/api/health` | GET | Liveness |
| `/api/ready` | GET | Readiness |
| `/api/register-user` | POST | Registro + emissão de session token |

## Rotas internas (requerem `x-api-key`)

| Rota | Descrição |
|---|---|
| `/api/chat-gpt4o` | Core cognitivo — nunca exposto diretamente ao browser |

## Rotas de escrita (requerem HMAC session token)

| Rota | Descrição |
|---|---|
| `/api/save-wish` | Salvar favorito |
| `/api/delete-wish` | Remover favorito |
| `/api/list-wish` | Listar favoritos |
| `/api/create-price-alert` | Criar alerta de preço |

## Rotas bloqueadas por padrão

- `/api/dev/*`, `/api/test/*`, `/api/env`, `/mia-test` → **404** (`MIA_DEV_ROUTES_ENABLED=false`)
- `/api/economia` → **404** (`MIA_LEGACY_ECONOMIA_ENABLED=false`)
- `/api/get-final-price` → **404**

---

## Ownership de responsabilidades

| Domínio | Dono | Escopo |
|---|---|---|
| Perímetro HTTP | `mia-chat.js` + `miaPublicApiHardening.js` | Request |
| Autenticação interna | `miaEndpointAccessPolicy.js` | Request |
| Sessão de usuário (write) | `miaUserSessionToken.js` | Conversation/user |
| Observability IDs | `miaObservabilityContext.js` | Request |
| Runtime mutable state | `miaSharedRequestState.js` | Request |
| session_context | Frontend + payload HTTP | Conversation |
| Commercial dedup | `commercialRequestDeduplication.js` | Request |
| Application caches | `universalCommercialCache.js`, rate limit | Application |
| Persistência | Supabase | Persistent |

---

## Ciclo de vida da request (resumo)

Ver documento detalhado: [REQUEST_LIFECYCLE.md](./REQUEST_LIFECYCLE.md)

```
Browser → mia-chat → observability → shared state → core → hardening → browser
```

---

## Segurança (resumo)

Ver documento detalhado: [SECURITY_MODEL.md](./SECURITY_MODEL.md)

- Perímetro público isolado do core via proxy
- Core protegido por `API_SHARED_KEY`
- Endpoints de escrita protegidos por HMAC session token
- Cron protegido por `MIA_CRON_SECRET`
- Admin protegido por `MIA_ADMIN_API_KEY`
- Respostas sanitizadas (sem `mia_debug`, prompts, stack traces)

---

## Observabilidade (resumo)

Ver documento detalhado: [OBSERVABILITY.md](./OBSERVABILITY.md)

- `x-request-id` e `x-correlation-id` em todas as rotas instrumentadas
- Logs JSON com redação automática
- Métricas in-memory por endpoint
- `/api/health` e `/api/ready` para probes

---

## Shared state (resumo)

Ver documento detalhado: [SHARED_STATE.md](./SHARED_STATE.md)

- Request-scoped via AsyncLocalStorage (3 stores)
- Proxies estáveis em `chat-gpt4o.js` delegam para ALS
- Application caches documentados e intencionais

---

## Limitações conhecidas

Ver documento detalhado: [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)

---

## Testes automatizados (Bloco 12)

| Script npm | Patch | Testes |
|---|---|---|
| `test:mia:12b:perimeter` | 12B | 59 |
| `test:mia:12c:hardening` | 12C | 43 |
| `test:mia:12d:lockdown` | 12D | 33 |
| `test:mia:12e:observability` | 12E | 20 |
| `test:mia:12f:shared-state` | 12F | 29 |

Suíte completa validada: **233/233** (inclui 11B4 e 11C).

---

## Documentos relacionados

- [REQUEST_LIFECYCLE.md](./REQUEST_LIFECYCLE.md)
- [SECURITY_MODEL.md](./SECURITY_MODEL.md)
- [OBSERVABILITY.md](./OBSERVABILITY.md)
- [SHARED_STATE.md](./SHARED_STATE.md)
- [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)
