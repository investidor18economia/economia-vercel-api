# DataForSEO — Google Shopping Provider (PATCH 05L.2)

Provider comercial neutro integrado à MIA como fonte independente de SerpAPI.

## Provider ID

- `google_shopping_dataforseo`

Não reutiliza `google_shopping` (SerpAPI). Budget, Circuit Breaker, Cache e Dedup são independentes.

## Política de neutralidade

DataForSEO é um agregador B2B neutro:

- sem comissão por indicação;
- sem links afiliados obrigatórios;
- sem alteração de ranking por interesse comercial da Teilor.

Campos promocionais retornados pela API (`special_offer_info`, `shop_ad_aclk`, cupons) **não** entram na normalização nem influenciam seleção, ranking ou reasoning. A MIA usa apenas dados objetivos: preço, merchant, link, imagem, disponibilidade.

## Endpoint oficial

| Etapa | Método | URL |
|------|--------|-----|
| Criar task | POST | `https://api.dataforseo.com/v3/merchant/google/products/task_post` |
| Obter resultados | GET | `https://api.dataforseo.com/v3/merchant/google/products/task_get/advanced/{id}` |
| Tasks prontas (opcional) | GET | `https://api.dataforseo.com/v3/merchant/google/products/tasks_ready` |

Documentação: [Merchant Google Products task_post](https://docs.dataforseo.com/v3/merchant/google/products/task_post/)

## Execution model

**Standard (task)** — não existe endpoint Live para Google Shopping Merchant API.

Fluxo implementado:

1. `task_post` → recebe `task id` (status `20100 Task Created`)
2. polling em `task_get/advanced/{id}` até status `20000 Ok`
3. estados pendentes: `40601 Task Handed`, `40602 Task in Queue`
4. falhas: `40103 Task execution failed`, `40102 No Search Results`

## Autenticação

Basic Auth (API login + API password — **não** é a senha do dashboard):

```
Authorization: Basic base64(login:password)
```

Credenciais: https://app.dataforseo.com/api-access

## Variáveis de ambiente

| Variável | Obrigatória | Default | Descrição |
|----------|-------------|---------|-----------|
| `DATAFORSEO_LOGIN` | sim (quando ativo) | — | API login |
| `DATAFORSEO_PASSWORD` | sim (quando ativo) | — | API password |
| `COMMERCIAL_PROVIDER_DATAFORSEO_ENABLED` | não | `false` | Ativa provider no runtime |
| `COMMERCIAL_DATAFORSEO_REAL_PROBE_ENABLED` | probe real | `false` | Permite probe externa |
| `DATAFORSEO_LOCATION_CODE` | não | `2076` | Brasil |
| `DATAFORSEO_LANGUAGE_CODE` | não | `pt` | Idioma pt-BR |
| `DATAFORSEO_POLL_INTERVAL_MS` | não | `1500` | Intervalo de polling |
| `DATAFORSEO_POLL_MAX_MS` | não | `25000` | Timeout total de polling |
| `DATAFORSEO_REQUEST_TIMEOUT_MS` | não | `12000` | Timeout HTTP por request |

Nunca usar prefixo `NEXT_PUBLIC_`. Credenciais não entram em cache key, dedup key ou diagnostics.

## Locale Brasil

- `location_code`: **2076** (Brazil)
- `language_code`: **pt**
- `se_domain`: `google.com.br`
- Moeda esperada na normalização: **BRL** (itens em outra moeda são descartados)

## Custo e rate limits (documentação oficial)

- **task_post**: cobrança ao criar task (~**$0.001**/SERP padrão, até 40 resultados; priority=2 mais caro)
- **task_get**: sem cobrança adicional documentada para coleta
- **Rate limit**: até **2000** POST/min; tasks_ready até **20** calls/min
- Pay-as-you-go; saldo mínimo $50 (conta DataForSEO)

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingClient.js` | HTTP client + polling |
| `lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingAdapter.js` | Adapter + integração comercial |
| `lib/commercial/dataForSeoGoogleShoppingIntegrationAudit.js` | Helpers de audit/neutralidade |
| `lib/productSourceAdapter/commercialProviderRegistry.js` | Registry entry |
| `lib/productSourceAdapter/commercialRuntimeShadow.js` | Shadow/controlled fetch binding |

## Normalização

Campos mapeados (quando presentes na API):

| Campo MIA | Origem DataForSEO |
|-----------|-------------------|
| `product_name` | `title` |
| `price` / `numericPrice` | `price` |
| `currency` | `currency` (BRL) |
| `link` | `shopping_url` → `url` |
| `thumbnail` | `product_images[0]` |
| `source` | `seller` (merchant display) |
| `provider` | `google_shopping_dataforseo` |
| `merchant` | `seller` |
| `original_price` | `old_price` |
| `rating` | `product_rating.value` |
| `review_count` | `reviews_count` |

Campos ausentes → `null`. Nunca inventar preço, estoque ou desconto.

## Budget / Circuit / Cache / Dedup

Provider ID separado em todas as camadas:

- `COMMERCIAL_PROVIDER_GOOGLE_SHOPPING_DATAFORSEO_MAX_CALLS_PER_WINDOW`
- Circuit state independente de `google_shopping`
- Cache key inclui `provider_id=google_shopping_dataforseo`
- Dedup key inclui `provider_id=google_shopping_dataforseo`

## Ativação controlada

```bash
COMMERCIAL_PROVIDER_DATAFORSEO_ENABLED=true
DATAFORSEO_LOGIN=...
DATAFORSEO_PASSWORD=...
```

Recomendado: dev probe → shadow → comparação qualidade/custo → decisão de prioridade.

## Probe

Audit local (sem rede):

```bash
node scripts/test-mia-dataforseo-google-shopping-integration-audit.js
```

Probe real (opt-in):

```bash
COMMERCIAL_PROVIDER_DATAFORSEO_ENABLED=true
COMMERCIAL_DATAFORSEO_REAL_PROBE_ENABLED=true
node scripts/run-mia-dataforseo-google-shopping-probe.js --real --allow-external --max-calls=1
```

## Rollback

```bash
COMMERCIAL_PROVIDER_DATAFORSEO_ENABLED=false
```

Reiniciar processo. SerpAPI (`google_shopping`) permanece intacta. Código e diagnostics preservados.

## Limitações conhecidas

1. Merchant API **não** oferece modo Live — latência maior que SerpAPI (polling).
2. Alguns itens podem vir sem `shopping_url`/`url` — descartados na normalização.
3. Campos promocionais existem na resposta bruta mas são ignorados pela MIA.
4. Provider inicia **desativado** — requer flag explícita para runtime.

## Próximo patch recomendado

**05L.3** — Shadow comparison SerpAPI vs DataForSEO (qualidade, custo, latência) com métricas agregadas antes de alterar ordem no Priority Engine.
