# PATCH COMM-R01A — Commercial Decision Routing Architecture Audit

**Veredito:** `COMM-R01A CONCLUÍDO`  
**Tipo:** auditoria arquitetural somente leitura — **zero alterações de código**  
**Data:** 2026-07-22  
**Caso:** regressão comercial observada na validação PATCH 3.3A.2

---

## Respostas executivas (1–15)

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Como a MIA decide o fluxo comercial? | Pipeline sequencial em `miaChatCoreHandler` (`chat-gpt4o.js` ~27498): contexto → intent → routing contract (×2) → gates comerciais → **handlers por ordem de precedência** → busca ou fallback |
| 2 | Sequência completa? | Ver § Fluxograma textual |
| 3 | Quem toma cada decisão? | `resolveContextQuery`, `detectIntent`, `detectContextAction`, `buildRoutingDecision`, `recognizeMiaIntent`, `evaluateCommercialEntryPermission`, blocos early-comparison e context-decision, Decision Engine |
| 4 | Quem consulta Data Layer? | `searchUniversalDataLayer`, `getProductSpecsFromSupabase`, `getPersistentCommercialProductsFromSupabase`, `resolveComparisonProductFromDataLayer` — **somente se o handler não retornar antes** |
| 5 | Quem consulta histórico? | `buildSessionContext`, `resolveAllowedProductsForDecision`, `isComparisonContextFollowUp`, second-best handlers, priority follow-up |
| 6 | Quem identifica comparação? | **3 camadas:** `detectIntent`, `isExplicitComparisonQuery` (local), `isDirectComparisonQuery` / `extractComparisonTermsFromQuery` (lib) + early block ~33413 |
| 7 | Quem identifica descoberta? | `detectIntent→search`, `resolveContextQuery→new_or_direct`, `buildRoutingDecision→new_search/refinement`, pipeline comercial ~33980+ |
| 8 | Quem identifica continuação (segunda melhor)? | `isSecondBestDiscoveryFamilyQuery` / `detectsSecondBestDiscoverySignal` (`miaCognitiveRouter.js`), `buildRoutingDecision` hold, handler `intent===second_best_discovery` ~33258 — **mas perde para `isContextDecision`** |
| 9 | Quem decide fallback? | Cada path (`buildComparisonUnresolvedFallbackReply`, `buildDecisionEngineReply`, `buildOpenSecondBestDiscoveryFallback`, `buildCommercialNoResultReply`, social/governed fallbacks) |
| 10 | Mais de um Decision Router? | **Sim** — pelo menos 7 camadas de roteamento (ver § Routers) |
| 11 | Duplicação? | **Sim** — comparação ×3, decision vs second-best, `buildRoutingDecision` ×2 |
| 12 | Conflito entre routers? | **Sim** — Q1: `detectIntent=search` vs early-comparison; Q2: `isContextDecision` vs second-best family |
| 13 | Data Layer consultado antes e não é? | **Sim (Q1)** — early comparison retorna **antes** de `searchUniversalDataLayer` (~33995) |
| 14 | Classificação precoce? | **Sim** — `isDirectComparisonQuery` com `\s+e\s+` antes de busca comercial |
| 15 | Causa raiz é só Comparison Pattern? | **Não** — primária Q1: gate early-comparison + catch-all 33805; primária Q2: cascata histórico vazio + precedência context-decision |

---

## 1. Mapa completo do roteamento comercial

### Routers / camadas (ordem de execução)

| Ordem | Componente | Arquivo | Decisão |
|-------|------------|---------|---------|
| 1 | `resolveContextQuery` | `chat-gpt4o.js` ~24719 | mode, shouldSkipProductSearch, directReply |
| 2 | `buildSessionContext` | ~20922 | merge inbound session_context |
| 3 | `detectIntent` | ~23604 | search / comparison / decision / general_answer |
| 4 | `buildRoutingDecision` ① | `miaRoutingDecisionContract.js` ~583 | mode, allowNewSearch, conversationAct |
| 5 | `classifyMiaTurn` | `miaCognitiveRouter.js` | shadow / sinais cognitivos |
| 6 | `recognizeMiaIntent` | PATCH 11A | intent authority |
| 7 | CSO / mixed / semantic continuation | ~28300–29400 | patches de intent |
| 8 | `applyProductionFallbackGate` | `miaProductionFallbackGate.js` | family → intent |
| 9 | `buildRoutingDecision` ② | ~30095 | second-best hold, preservation |
| 10 | `evaluateCommercialEntryPermission` | `miaCommercialEntryGate.js` | allow/deny comercial |
| 11 | Priority follow-up | ~31400–31601 | eixo de prioridade |
| 12 | **Context decision / analysis** | **~31640–32761** | **early return** — Decision Engine |
| 13 | Social flows | ~32765–33205 | greeting, about_mia, etc. |
| 14 | **`intent === second_best_discovery`** | **~33258–33304** | second_best_discovery_flow |
| 15 | **Comparison early block** | **~33413–33850** | **early return** — comparison fallback |
| 16 | Commercial entry deny | ~33855 | non-commercial |
| 17 | `shouldSkipCommercialProductPipeline` | `miaRoutingGuardrails.js` | skip search |
| 18 | **Commercial search pipeline** | **~33980+** | Data Layer → providers → ranking → return_seguro |

**Princípio violado na prática:** camadas 12 e 15 executam **return antecipado** que impede camada 18 mesmo quando camadas 3–4 autorizam busca.

---

## 2. Fluxograma textual

```
Usuário (POST /api/mia-chat → chat-gpt4o.js)
    ↓
Auth perimeter (API_SHARED_KEY) — não afeta roteamento comercial
    ↓
resolveContextQuery(query, messages, session_context)
    ├─ institutional / clarification → directReply (early exit)
    ├─ context_answer (isContextDecision, anchor, etc.)
    └─ new_or_direct (discovery)
    ↓
buildSessionContext(body.session_context)
    ↓
detectIntent(query) ──────────────────────────────┐
    ↓                                              │ (Q1: "search" — ignorado depois)
buildRoutingDecision ①                             │
    ↓                                              │
Cognitive + Intent Authority + CSO patches         │
    ↓                                              │
buildRoutingDecision ②                             │
    ↓                                              │
evaluateCommercialEntryPermission                  │
    ↓                                              │
[Priority follow-up?] ──yes──→ rerank path ──→ return
    ↓ no
[Context decision path?] ──yes──→ buildDecisionEngineReply ──→ return  ← Q2
    ↓ no
[Social / non-commercial intents?] ──yes──→ return
    ↓ no
[intent === second_best_discovery?] ──yes──→ second_best_discovery_flow ──→ return  ← Q2 nunca
    ↓ no
[Early comparison?] ──yes──→ comparison_early_not_found ──→ return  ← Q1
    ↓ no
[Commercial entry denied?] ──yes──→ return
    ↓ no
[shouldSkipCommercialProductPipeline?] ──yes──→ contract hold ──→ return
    ↓ no
searchUniversalDataLayer()  ← DISCOVERY / RECOMMENDATION
    ↓
Providers (SERP, ML, etc.)
    ↓
Ranking + Decision Engine (decideComparison, score engine)
    ↓
return_seguro → populate lastProducts, lastBestProduct
    ↓
LLM verbaliza (MIA owns intelligence)
    ↓
Resposta + session_context
```

---

## 3. Mapa de chamadas — funções auditadas

### `extractComparisonTermsFromQuery`

| Campo | Valor |
|-------|-------|
| Arquivo | `lib/miaComparisonFlowCrashGuard.js` ~169 |
| Responsabilidade | Extrair ≥2 termos comparáveis de produto |
| Entradas | `query` string |
| Saídas | `string[]` termos |
| Quem chama | `isDirectComparisonQuery`, early comparison block, `findMissingComparisonTerms` |
| Data Layer? | Não |
| Classifica intenção? | Sim (termos de comparação) |
| Altera session? | Indireto via caller |
| Fallback? | Não |
| **Q1** | `[]` — "câmera" e "bateria" não viram termos |

### `isDirectComparisonQuery`

| Campo | Valor |
|-------|-------|
| Arquivo | `lib/miaComparisonFlowCrashGuard.js` ~259 |
| Responsabilidade | Detectar comparação direta |
| Entradas | query normalizada |
| Saídas | boolean |
| Quem chama | `isExplicitComparisonQuery` (local wrapper) |
| Data Layer? | Não |
| Bloqueia consulta? | **Sim** — via early comparison downstream |
| **Q1** | `true` — falso positivo: `\s+e\s+` em "câmera e bateria" |

### `COMPARISON_INTENT_PATTERN`

| Campo | Valor |
|-------|-------|
| Arquivo | `lib/miaComparisonFlowCrashGuard.js` ~29–31 |
| Responsabilidade | Regex alternativo para sinal de comparação |
| Problema | Terceiro alternativo `\s+e\s+` match prioridades, não produtos |
| Antiguidade | Desde 2025-06-23 |

### `isEarlyExplicitComparison` (variável)

| Campo | Valor |
|-------|-------|
| Arquivo | `chat-gpt4o.js` ~33413 |
| Fórmula | `isExplicitComparisonQuery(resolvedQuery) \|\| isExplicitComparisonQuery(query)` |
| **Q1** | true |
| **Q2** | false |

### `comparison_early_not_found`

| Campo | Valor |
|-------|-------|
| Arquivo | `chat-gpt4o.js` ~33499, ~33805 |
| Condição A | `comparisonTerms.length >= 2` && produtos < 2 |
| Condição C (Q1) | entrou early block, `lockedComparisonProducts < 2`, A false |
| Data Layer antes? | **Não** — short-circuit total |
| session escrito | `lastInteractionType: "comparison"`, **sem** lastProducts |

### `buildComparisonUnresolvedFallbackReply`

| Campo | Valor |
|-------|-------|
| Arquivo | `lib/miaComparisonFlowCrashGuard.js` ~365 |
| Mensagem Q1 | "Consigo comparar, mas não encontrei esses modelos..." |
| Necessário Q1? | **Não** — deveria ser discovery search |

### `buildDecisionEngineReply`

| Campo | Valor |
|-------|-------|
| Arquivo | `chat-gpt4o.js` ~18424 |
| Entrada crítica | `products[]` filtrados de `sessionContext.lastProducts` |
| Mensagem vazia | ~18455–18457 |
| **Q2** | `rememberedProducts=[]` → mensagem de histórico inválido |

### `second_best_discovery_flow`

| Campo | Valor |
|-------|-------|
| Handler | `chat-gpt4o.js` ~33258 |
| Gate | `intent === "second_best_discovery"` |
| Detector | `isSecondBestDiscoveryFamilyQuery` / `detectsSecondBestDiscoverySignal` (~4724) |
| **Q2** | Detector **match**, handler **não alcançado** (precedência + intent=general_answer) |

---

## 4. Mapa do Data Layer

| Momento | Consulta | Q1 | Q2 |
|---------|----------|----|----|
| Early comparison resolve | `getProductSpecsFromSupabase` via `resolveComparisonProductFromDataLayer` | Tentado só se terms≥2 — **não** | N/A |
| Commercial pipeline | `searchUniversalDataLayer` ~1562, ~33995 | **Nunca** | **Nunca** |
| Decision Engine com produtos | specs via produtos em histórico | N/A | **Sem produtos** |
| Comparison success path | specs + `getPersistentCommercialProductsFromSupabase` | N/A (não entrou) | N/A |

**Bypass / short-circuit Q1:** return em ~33825 antes de ~33995.  
**Fallback antes da consulta:** sim — `buildComparisonUnresolvedFallbackReply`.  
**Quem decide:** early comparison gate (~33421), não `buildRoutingDecision`.

---

## 5. Mapa do histórico

| Campo | Popula | Consome | Q1 | Q2 |
|-------|--------|---------|----|----|
| `lastProducts` | `applyContractToSessionContext` no `return_seguro`; comparison success | `resolveAllowedProductsForDecision`, second-best | **vazio** | **vazio** |
| `lastBestProduct` | idem + ranking winner | decision scope, anchor | **null** | **null** |
| `lastInteractionType` | cada path (comparison/search/context_decision) | follow-up detectors | `"comparison"` | herda Q1 |
| `lastRankingSnapshot` | search success | second-best anchored | **ausente** | **ausente** |
| `lastComparisonProducts` | comparison success | `isComparisonContextFollowUp` | **ausente** | **ausente** |

**Perda de contexto:** Q1 grava tipo `"comparison"` sem produtos → Q2 não tem memória comercial válida.

---

## 6. Mapa dos fallbacks (comerciais relevantes)

| Fallback | Caller | Condição | Catálogo antes? | Q1/Q2 |
|----------|--------|----------|-----------------|-------|
| `buildComparisonUnresolvedFallbackReply` | early comparison ~33831 | lockedProducts < 2 | **Não** | Q1 |
| `buildDecisionEngineReply` empty | context path ~32446 | products.length===0 | **Não** (histórico vazio) | Q2 |
| `buildOpenSecondBestDiscoveryFallback` | second_best ~24398 | sem anchor | ranking snapshot | não alcançado Q2 |
| `buildCommercialNoResultReply` | search pipeline ~34645 | zero resultados pós-busca | **Sim** (busca rodou) | N/A |
| `buildSafeDecisionReply` | decision variants | specs ausentes | parcial | N/A |

---

## 7. Mapa das comparações

| Tipo | Detector | Entrada no fluxo |
|------|----------|------------------|
| Explícita `ou/vs` | `extractComparisonTermsFromQuery`, `COMPARISON_CONNECTOR_PATTERN` | Early block ~33413 |
| Implícita ` e ` | **`isDirectComparisonQuery` `\s+e\s+`** | Early block — **falso positivo Q1** |
| Anchored "compara com X" | `isExplicitAnchoredComparisonRequest` | Early block |
| Follow-up comparação | `isComparisonContextFollowUp` | Requer ≥2 produtos em sessão |
| Por atributos | `isPriorityShiftInsideComparison`, priority regex | Follow-up com produtos locked |

---

## 8. Mapa das descobertas

| Sinal | Detector | Vira discovery? |
|-------|----------|-----------------|
| "recomenda" + budget | `detectIntent→search`, `extractBudget` | **Deveria** — Q1 intent=search ✓ |
| "até R$ 2.500" | `extractBudget`, `hasBudgetOrSearchIntent` | Sim, mas **bloqueado** por early comparison |
| "câmera e bateria" | `detectUserPriority` | Prioridade — **não** comparação de produtos |
| "Samsung" / "iPhone" | category/model tokens | Discovery se passa gates |
| Marca só | `isSpecificProductOnlyQuery` | Pode ser product-only |

**Quando NÃO vira discovery:** early comparison true **antes** do pipeline ~33980.

---

## 9. Mapa dos follow-ups

| Frase | Detector esperado | Path real (pós-Q1 falho) |
|-------|-------------------|--------------------------|
| "segunda melhor opção" | `detectsSecondBestDiscoverySignal` ✓ | **`isContextDecision` → decision** ✗ |
| "e esse?" | product reference / analysis | analysis se anchor |
| "qual deles?" | comparison follow-up | requer produtos locked |
| "vale a pena?" | `isContextDecision` | context decision |
| "e o melhor?" | `isContextDecision` /melhor.*opção/ | context decision |
| "o segundo" | second-best family | deveria second_best — conflito |
| "e bateria?" | priority follow-up | requer lastProducts + priority context |

---

## 10. Violações arquiteturais

| Princípio | Violação |
|-----------|----------|
| MIA owns intelligence | Gate regex (`\s+e\s+`) decide path sem evidência de produtos |
| Data Layer antes de fallback | Q1: fallback de comparação **sem** consultar catálogo/buscador |
| Router único coerente | 7+ camadas; `detectIntent=search` contradito por early comparison |
| Decision Engine com dados | Q2: decision engine invocado **sem** produtos estruturados |
| Contracts (`mia-routing-contract.md`) | `comparison_followup` exige produtos locked — Q1 entra sem produtos |

---

## 11. Duplicações

1. Comparação: `detectIntent`, `isExplicitComparisonQuery` (local), lib guards  
2. Decision: `isContextDecision`, `detectContextAction`, `buildRoutingDecision.conversationAct`  
3. Second-best: cognitive family + `isContextDecision` /segunda opção/ + intent patch  
4. `buildRoutingDecision` executado duas vezes com patches intermediários  

---

## 12. Acoplamentos

- Early comparison acoplado a `isDirectComparisonQuery` **sem** exigir termos resolvidos  
- Context-decision acoplado a regex `/melhor.*opção/` incluindo "segunda melhor opção"  
- Handler order acoplado: context-decision (31640) **antes** de second-best (33258)  
- Session poison: `lastInteractionType=comparison` sem produtos afeta turno 2  

---

## 13. Fluxos mortos (para Q1/Q2)

- `searchUniversalDataLayer` + pipeline comercial completo  
- `second_best_discovery_flow` handler (~33258)  
- `buildOpenSecondBestDiscoveryFallback` / anchored second-best com ranking  

---

## 14. Fluxos redundantes

- `isContextDecision` /segunda opção/ vs `detectsSecondBestDiscoverySignal` /segundo\|segunda.*melhor/  
- `detectIntent=comparison` vs lib comparison guards (divergem em Q1)  
- Dois passes `buildRoutingDecision`  

---

## 15. Causa raiz

### Múltiplas causas — não apenas Comparison Pattern

| ID | Causa | Explica Q1 | Explica Q2 | Impacto |
|----|-------|------------|------------|---------|
| **RC-1** | `isDirectComparisonQuery` + `\s+e\s+` trata prioridades como comparação | **Sim** | Indireto | **Alto** |
| **RC-2** | Early comparison catch-all ~33805 entra **sem** `comparisonTerms≥2` | **Sim** | Indireto | **Alto** |
| **RC-3** | Short-circuit antes de Data Layer / commercial search | **Sim** | N/A | **Alto** |
| **RC-4** | Cascata: Q1 não popula `lastProducts` | N/A | **Sim** | **Alto** |
| **RC-5** | `isContextDecision` captura "segunda melhor opção" antes de second-best | N/A | **Sim** | **Alto** |
| **RC-6** | Precedência handler: context-decision antes de second_best_discovery | N/A | **Sim** | **Médio** |
| **RC-7** | Handler usa `intent===second_best_discovery`, não `routingDecision.conversationAct` | N/A | **Sim** | **Médio** |

**Causa raiz única?** Não.  
**Explica o problema observado:** RC-1 + RC-2 + RC-3 (Q1); RC-4 + RC-5 + RC-6 (Q2).  
**Explica outros problemas:** RC-5/RC-6 provavelmente afetam outros follow-ups "melhor opção"; RC-1 afeta qualquer query com `" e "` entre eixos (foto e vídeo, custo e qualidade).

---

## 16. Correção mínima possível (recomendação — NÃO implementada)

1. `isDirectComparisonQuery`: remover `\s+e\s+` como evidência suficiente; exigir `extractComparisonTermsFromQuery.length >= 2` **ou** `ou|vs|versus|contra`.  
2. Early block ~33421: não entrar se `comparisonTerms.length < 2` (salvo anchored explícito).

**Escopo:** 2 funções + 1 gate. Risco baixo.

---

## 17. Correção ideal (recomendação — NÃO implementada)

1. Correção mínima (RC-1/RC-2/RC-3)  
2. Second-best precedence: `isSecondBestDiscoveryFamilyQuery` **antes** de `isContextDecision` para runner-up  
3. Unificar handler: `routingDecision.conversationAct === "second_best_discovery"`  
4. Refinar `isContextDecision`: excluir "segunda/segundo melhor/opção" quando family second-best match  
5. Testes dedicados `test:mia:commercial:comparison-intent-routing` + stress second-best pós-discovery  
6. (Futuro) consolidar routers de comparação em um módulo único  

---

## 18. Riscos

| Correção | Risco |
|----------|-------|
| Mínima | Comparisons reais com " e " raro (ex. listas) — mitigar com terms≥2 |
| Ideal | Reordenar handlers pode afetar anti-regret / anchored holds — exige regressão ampla |
| Nenhuma | Discovery budget+multi-prioridade permanece quebrada em produção |

---

## 19. Impacto esperado

| Correção | Impacto |
|----------|---------|
| Mínima | Q1 executa busca comercial; popula histórico; desbloqueia Q2 parcialmente |
| Ideal | Q2 usa second_best_discovery ou decision com ranking; continuidade multi-turn estável |
| Auth / 3.3A.2 | **Zero impacto** |

---

## 20. Próximo patch recomendado

**PATCH COMM-R01B — Comparison Gate & Discovery Precedence Fix**

Escopo sugerido:
- RC-1, RC-2, RC-3 (obrigatório)
- RC-5, RC-6, RC-7 (obrigatório para Q2)
- Testes + smoke produção com as duas perguntas do caso
- **Fora do escopo:** auth, segredos, Analytics, migrations

---

## Perguntas de auditoria — respostas

| Pergunta | Resposta |
|----------|----------|
| Descoberta pode virar comparação? | **Sim** — Q1 via `isDirectComparisonQuery` |
| Comparação pode virar descoberta? | Sim, se gates falharem — não no caso observado |
| Quem faz a conversão? | Early comparison block (~33421) |
| Classificação duplicada? | **Sim** |
| Classificação contraditória? | **Sim** — intent search vs comparison path |
| Fallback prematuro? | **Sim** — antes de Data Layer |
| Consulta catálogo tarde demais? | N/A Q1 — nunca consultou |
| Consulta catálogo cedo demais? | Não |
| Múltiplas identificações de intent? | **Sim** — ≥7 camadas |
| Acoplamento excessivo? | **Sim** |
| Violação arquitetura oficial? | **Sim** — ver §10 |
| Código morto? | Handlers não alcançados no caso Q1/Q2 |
| Fluxo inalcançável? | second_best + commercial search no caso |
| Fluxo redundante? | decision vs second-best detectors |

---

## Clarificação

| Quando pede esclarecimento | `needsClarification` ~29629 |
| Quando deveria responder direto | Q1 discovery com budget claro |
| Data Layer antes? | Deveria em Q1 — não ocorreu |

---

*PATCH COMM-R01A — Commercial Decision Routing Architecture Audit — somente leitura*
