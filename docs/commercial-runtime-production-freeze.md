# Commercial Runtime Production Freeze — MVP

**Versão congelada:** `05K`  
**Data do freeze:** 2026-06-17  
**Status alvo:** arquitetura comercial congelada para validação real controlada (FASE 2 — Coverage Validation)

---

## 1. Pipeline oficial

```
Provider Registry
↓ Runtime Eligibility
↓ Multi-Provider Priority Engine (05I)
↓ Conditional Provider Fetch (05E)
↓ Request Deduplication (05C)
↓ Universal Commercial Cache (05D)
↓ Provider Cost Guard (05B)
↓ Provider Budget / Circuit Breaker (05F)
↓ Provider Fetch (adapters)
↓ NormalizedProduct
↓ Commercial Query Product Alignment
↓ Commercial Merge
↓ Commercial Offer Dedup
↓ Commercial Selection
↓ Governed Fallback Payload (4E-B.6)
↓ Universal Governed Fallback Reasoning (4E-B.7)
↓ Universal Category Signals (4E-B.9)
↓ Universal Fallback Prompt Contract (4E-B.8)
↓ LLM verbaliza
```

**Modo controlled** usa este pipeline via `resolveOfficialCommercialOffer` → `runCommercialShadowPipeline`.

**Modo legacy** (default `COMMERCIAL_RUNTIME_MODE=legacy`) usa router inline em `chat-gpt4o.js` — ver limitações MVP.

---

## 2. Responsabilidades por camada

| Camada | Responsabilidade | Não faz |
|--------|------------------|---------|
| Provider Registry | cadastro, enabled, capabilities, billing | fetch, winner |
| Priority Engine | ordem operacional, elegibilidade | escolher produto |
| Conditional Fetch | suficiência, short-circuit | ranking cognitivo |
| Request Dedup | evitar duplicação na request | cache cross-request |
| Universal Cache | reutilizar resultados recentes | alterar policy |
| Cost Guard | bloquear custo não autorizado | override budget |
| Budget/Circuit | limitar chamadas, isolar instável | escolher provider |
| Adapters | fetch + normalização | reasoning |
| Alignment | query ↔ oferta | winner cognitivo |
| Merge/Dedup/Selection | pipeline comercial | Decision Engine |
| Governed Fallback | payload/reasoning/signals/contract | LLM intelligence |
| LLM | verbalização | decisão comercial |

---

## 3. Providers oficiais

| providerId | MVP status | enabled default | billingTier | controlled | shadow |
|------------|------------|-----------------|-------------|------------|--------|
| `google_shopping` | active | true | paid_external | yes | yes |
| `mercadolivre_public` | controlled_optional | **false** | free_external | yes | **no** |
| `apify_mercadolivre` | active | true | paid_external | yes | yes |
| `amazon` | planned | false | unknown | no | no |
| `supabasecache` | legacy only | n/a | internal | legacy router | n/a |

**Ativação ML:** `COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED=true` (reversível).

---

## 4. Flags oficiais (sem valores)

| Flag | Default | Finalidade |
|------|---------|------------|
| `COMMERCIAL_RUNTIME_MODE` | `legacy` | legacy / shadow / controlled |
| `COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED` | `false` | ML controlled |
| `COMMERCIAL_PROVIDER_PRIORITY_ENABLED` | `true` | Priority Engine |
| `COMMERCIAL_PROVIDER_PRIORITY_STRATEGY` | `cost_balanced` | ordem operacional |
| `COMMERCIAL_CACHE_*` | ver 05D | cache universal |
| `COMMERCIAL_PROVIDER_BUDGET_*` | ver 05F | budget |
| `COMMERCIAL_PROVIDER_CIRCUIT_*` | ver 05F | circuit breaker |
| `COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED` | `false` | DEV opt-in |
| `COMMERCIAL_PAID_PROVIDERS_OBSERVABILITY_ENABLED` | `false` | shadow pago |
| `COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED` | `false` | coverage real |

Secrets: `SERPAPI_KEY`, `APIFY_API_TOKEN`, `MERCADOLIVRE_*`, `DEV_API_SECRET`.

---

## 5. Defaults seguros confirmados

- Shadow não chama provider pago sem opt-in observability + DEV guard
- DEV não chama API real sem opt-in explícito
- ML controlled **desativado** por default
- Coverage real **desativada** por default
- Cache: max 500 entries, TTL 5min, empty TTL 45s
- Budget e circuit **ativos** por default
- Provider disabled / sem capability não executa
- Erros de provider retornam contrato neutro (não fatal)
- Fallback governado permanece disponível

---

## 6. Proteções financeiras (05A–05F)

- **05A** Cost Audit — perfis de billing
- **05B** Cost Guard — bloqueio de custo não autorizado
- **05C** Request Dedup — deduplicação intra-request
- **05D** Universal Cache — reutilização controlada
- **05E** Conditional Fetch — short-circuit por suficiência
- **05F** Budget/Circuit — limites e isolamento

---

## 7. Proteções DEV (05G)

- Default dry-run em endpoints e scripts DEV
- Opt-in: `COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED=true` + flags CLI
- Produção: `DEV_API_SECRET` obrigatório para endpoints DEV

---

## 8. Modos de runtime

### Legacy (default)
- Router inline `chat-gpt4o.js`
- Ordem hardcoded: ML → supabasecache → serpapi
- SerpAPI via adapter stack quando usa `fetchGoogleShoppingLegacyResult`
- ML gated por `COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED`
- **Limitação MVP aceita** — migrar para controlled em patch futuro

### Shadow
- Pipeline observacional via `runCommercialShadowPipeline`
- Apenas providers com `supportsShadow=true`
- ML **excluído** (`supportsShadow=false`)
- Paid providers bloqueados sem opt-in

### Controlled
- `resolveOfficialCommercialOffer` + pipeline completo
- Priority Engine + Conditional Fetch + 05B–05G
- ML entra somente quando enabled

---

## 9. Limitações aceitas no MVP

1. Legacy router fora do Priority Engine quando `COMMERCIAL_RUNTIME_MODE=legacy`
2. `LEGACY_FUNCTIONAL_DEFAULT_ALLOW` para SerpAPI funcional em produção (budget/circuit/cache ativos via adapter)
3. Dual cache: legacy `COMMERCIAL_SEARCH_CACHE` + Universal Cache
4. `supabasecache` apenas no legacy router
5. FASE 2 coverage real não executada automaticamente

---

## 10. Pendências pós-MVP

- Migrar legacy router para Priority Engine ou default `controlled`
- Executar FASE 2 — Commercial Coverage Validation real (5 produtos)
- Consolidar cache layers
- Registrar `supabasecache` no Provider Registry se necessário
- Dashboard de observabilidade comercial

---

## 11. Regras para descongelar

Qualquer alteração em:
- ordem de providers
- guards (05B–05G)
- capabilities de provider
- contratos de fallback
- flags com default inseguro

**Exige:** novo patch numerado + auditoria local + validação.

---

## 12. Checklist de rollback

1. `COMMERCIAL_RUNTIME_MODE=legacy`
2. `COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED=false`
3. `COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED=false`
4. `COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED=false`
5. `COMMERCIAL_PAID_PROVIDERS_OBSERVABILITY_ENABLED=false`
6. Manter budget/circuit enabled
7. Redeploy / restart
8. Rodar audits 05B–05J localmente

---

## 13. Próximo passo autorizado

**FASE 2 — Commercial Coverage Validation: Mercado Livre-First Controlled Run**

Comando (não executar sem autorização):

```bash
COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED=true COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED=true node scripts/run-mia-commercial-coverage-validation.js --real --allow-external --allow-paid-external --max-products=5
```

---

## 14. Validação do freeze

```bash
node scripts/test-mia-commercial-runtime-production-freeze-audit.js
```

Endpoint DEV (read-only):

```
GET /api/dev/commercial-runtime-production-freeze
```
