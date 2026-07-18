# PATCH 12F — Shared State

## 1. Objetivo

Organizar o **estado compartilhado** do ciclo de vida de uma requisição para compatibilidade serverless, **sem alterar** Decision Engine, Router, Prompt, Ranking, Commercial Runtime ou respostas.

## 2. Inventário dos estados

| Contexto | Localização | Antes | Depois |
|---|---|---|---|
| `request_context` | `lib/miaSharedRequestState.js` | Implícito / module-level | **ALS request-scoped** |
| `runtimeExecutionEnv` | `chat-gpt4o.js` + `externalProviderExecutionPolicy.js` | Module-level `let` | **ALS + proxy accessor** |
| `runtimeEnforcement` | `chat-gpt4o.js` | Singleton mutável por request | **Instância fresh por request via ALS** |
| `semanticGovernance` | `chat-gpt4o.js` | Singleton mutável | **Proxy → bucket ALS** |
| `session_context` | Payload HTTP (frontend ↔ backend) | Conversation-scoped via body | **Inalterado** (ownership claro no payload) |
| `conversation_context` | `body.conversation_id` | Payload | Capturado em `sharedState.conversationContext` |
| `analytics_context` | `miaObservabilityContext.js` (12E) | ALS | **Inalterado** |
| `provider_context` | `externalProviderExecutionPolicy.js` | Module-level globals | **ALS request-scoped** |
| `cache_context` | `universalCommercialCache.js`, caches em `chat-gpt4o.js` | Application-scoped | **Documentado** (intencional) |
| `commercial_context` | `commercialRequestDeduplication.js` | ALS (05C) | **Inalterado** + `requestId` alinhado |
| `oauth_context` | OAuth endpoints | Stateless por request | **Inalterado** |

## 3. Classificação

| Escopo | Estados |
|---|---|
| **Request** | `runtimeEnforcement`, `semanticGovernance`, `runtimeExecutionEnv`, `activeExternalCallAccounting`, commercial dedup, observability |
| **Conversation** | `session_context`, `conversation_id` (via payload) |
| **Application** | Rate limit store, universal commercial cache, metrics, provider circuit breaker |
| **Persistent** | Supabase (wish, alerts, session backend legacy) |

## 4. Ownership

- **Dono do request state:** `lib/miaSharedRequestState.js` via `miaSharedRequestStorage` (AsyncLocalStorage)
- **Dono do observability:** `lib/miaObservabilityContext.js` (nested ALS — funciona corretamente)
- **Dono do commercial dedup:** `commercialRequestDeduplication.js` (ALS separado, request-scoped)
- **Dono do session_context:** cliente (`MIAChat.jsx`) + resposta do backend — sem estado global

## 5. Ciclo de vida

```
Request → withMiaObservability (requestId/correlationId)
       → runWithSharedRequestState (runtime refs fresh)
       → bindActiveRequestExecutionEnv / bindActiveExternalCallAccounting
       → enterCommercialRequestDedupContext
       → handler core
       → finally: clearActive* (ALS cleanup)
```

`commercialRequestDedupContext.requestId` agora usa o `requestId` de observabilidade (antes era `chat-${Date.now()}`).

## 6. AsyncLocalStorage

| Store | Arquivo | Status |
|---|---|---|
| Observability | `miaObservabilityContext.js` | ✅ Sem vazamento |
| Shared request | `miaSharedRequestState.js` | ✅ **Novo** |
| Commercial dedup | `commercialRequestDeduplication.js` | ✅ Já existia |

Testes paralelos confirmam isolamento entre requests concorrentes.

## 7. Caches

| Cache | Escopo | Ação 12F |
|---|---|---|
| Commercial request dedup | Request | Já ALS — mantido |
| Universal commercial cache | Application | Mantido (by design) |
| `COMMERCIAL_SEARCH_CACHE` (chat-gpt4o) | Application | Mantido (fora do escopo) |
| Perimeter rate limit | Application | Documentado como `application-scoped` |

## 8. Singletons

| Singleton | Risco | Mitigação |
|---|---|---|
| `runtimeEnforcementRef` (antes) | **Alto** — bleed entre requests | Proxy + ALS |
| `activeRequestExecutionEnv` (antes) | **Alto** | Migrado para ALS |
| Rate limit Map | Baixo (application cache) | Documentado |
| Metrics | Baixo (aggregate) | Application-scoped MVP |

## 9. Frontend

- `MIAChat.jsx`: `sessionContext` permanece em `useState` local — ✅ isolado por instância React
- Sem estado global inadequado identificado
- Hooks e contextos React consistentes

## 10. Backend

| Área | Status |
|---|---|
| analytics | Stateless + allowlist (12D) |
| oauth | Stateless por request |
| cron | Protegido (401 sem secret) |
| email | Stateless |
| providers | ALS env + accounting |
| runtime (chat-gpt4o) | **ALS request-scoped** |
| wish/alerts | DB + HMAC session (12D) |

## 11. Compatibilidade Serverless

- ✅ Vercel serverless — estado mutável por request isolado via ALS
- ✅ Execuções paralelas — testadas (29 testes 12F)
- ✅ Cold start — fallbacks module-level para testes legados
- ✅ Edge-safe — ALS é Node-only (chat-gpt4o já roda em Node runtime)

## 12. Testes

| Suite | Resultado |
|---|---|
| 12F shared-state | **29/29** ✅ |
| 12E observability | 20/20 ✅ |
| 12D lockdown | 33/33 ✅ |
| 12C hardening | 43/43 ✅ |
| 12B perimeter | 59/59 ✅ |
| 11C polish | 22/22 ✅ |
| 11B4 runner | 27/27 ✅ |
| **Total** | **233/233** ✅ |

## 13. Build

`npm run build` — ✅ Compiled successfully

## 14. Commits

| Commit | Mensagem |
|---|---|
| `9ad845d` | Normalize shared request state for serverless request lifecycle. |
| `01714ac` | Isolate serverless shared contexts in chat runtime and provider policy. |
| `033aead` | Add shared state validation tests for PATCH 12F. |

## 15. Push

`git push origin master` — ✅ `5523cee..033aead`

## 16. Deploy

Vercel auto-deploy acionado via push para `master`. Produção validada em `https://economia-ai.vercel.app`.

## 17. Smoke Test (Produção)

| Endpoint | Resultado |
|---|---|
| `/api/health` | ✅ 200 |
| `/api/ready` | ✅ 200 |
| `/api/mia-chat` | ✅ 200 + `x-request-id` + `x-correlation-id` + `session_context` |
| `/api/chat-gpt4o` (sem key) | ✅ 401 |
| `/api/mia-cognitive-loading` | ✅ 200 |
| `/api/analytics/track` | ✅ 200 (`event_name: session_started`) |
| `/api/check-prices` (cron) | ✅ 401 |
| `/api/dev/*` | ✅ 404 |

## 18. Limitações

1. **Application caches** (commercial cache, rate limit, metrics) permanecem in-memory por instância — comportamento MVP intencional
2. **`chat-gpt4o.js` não foi dividido** — proxies delegam para ALS sem refactor cognitivo
3. Wish/alert endpoints ainda sem `withMiaObservability` (dívida 12E, fora do escopo 12F)
4. Fallback module-level em `externalProviderExecutionPolicy` mantido para testes que não usam ALS

## 19. Veredito

```text
PATCH 12F
✅ SHARED STATE CONCLUÍDO

REQUEST STATE       ✅
SESSION STATE       ✅
CACHE STATE         ✅ (classificado)
SERVERLESS SAFE     ✅
ASYNC LOCAL STORAGE ✅
SEM REGRESSÕES      ✅ (233/233)
BUILD               ✅
PRODUÇÃO            ✅
```

## 20. Status Final

```text
PATCH 12F
✅ SHARED STATE CONCLUÍDO

PRÓXIMO PASSO
PATCH 12G — Documentation
```

### Arquivos principais criados/alterados

- **Novo:** `lib/miaSharedRequestState.js` — hub ALS + accessors
- **Alterado:** `pages/api/chat-gpt4o.js` — `runWithSharedRequestState` + proxies
- **Alterado:** `lib/commercial/externalProviderExecutionPolicy.js` — bindings via ALS
- **Novo:** `scripts/test-mia-shared-state.js` — 29 testes
- **npm:** `test:mia:12f:shared-state`