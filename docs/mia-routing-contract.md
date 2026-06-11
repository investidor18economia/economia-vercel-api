# MIA — Routing Decision Contract

Governança de roteamento (Patches 1–4). O contrato **não escolhe produto**; define **permissões de rota**.

## Fluxo

```text
Mensagem do usuário
  → sinais existentes (resolveContextQuery, detectIntent, CSO, sessão)
  → buildRoutingDecision()
  → applyRoutingDecisionToContextResolution()
  → respondWithContract() em cada path importante
  → Decision Engine / ranking (inalterados) → LLM verbaliza
```

## Campos do contrato

| Campo | Significado |
|-------|-------------|
| `mode` | Modo de roteamento (`context_decision`, `anchored_reaction`, `new_search`, `refinement`, `comparison_followup`, …) |
| `allowNewSearch` | Pode disparar busca nova |
| `allowCommercialFallback` | Fallback comercial pode assumir vencedor |
| `allowReplaceWinner` | Pode trocar `lastBestProduct` |
| `allowRerank` | Pode reranquear lista acima da âncora |
| `shouldPreserveAnchor` | Deve manter produto âncora da sessão |
| `shouldReturnSessionContext` | Resposta deve incluir `session_context` |

## Matriz modo × path

### `context_decision`

| Permissão | Valor |
|-----------|-------|
| allowNewSearch | false |
| allowReplaceWinner | false |
| allowCommercialFallback | false |
| allowRerank | false |
| shouldPreserveAnchor | true |

**Paths permitidos:** `context_decision_no_search`, `anchored_reaction_hold` (quando reação curta cai no mesmo bloco)

**Paths bloqueados:** `commercial_only_fallback`, `return_seguro` (troca de vencedor), `legacy_llm_search`

---

### `anchored_reaction`

| Permissão | Valor |
|-----------|-------|
| allowNewSearch | false |
| allowCommercialFallback | false |
| allowReplaceWinner | false |
| allowRerank | false |
| shouldPreserveAnchor | true |

**Paths permitidos:** `anchored_reaction_hold`, `context_decision_no_search`, `contract_anchored_hold` (safety net)

**Paths bloqueados:** `commercial_only_fallback`, `return_seguro`, `search_guidance`, `legacy_llm_search`

---

### `comparison_followup`

| Permissão | Valor |
|-----------|-------|
| allowNewSearch | false |
| allowCommercialFallback | false |
| allowReplaceWinner | false |
| allowRerank | false |
| shouldPreserveAnchor | true |

**Paths permitidos:** `comparison_followup`, `comparison_followup_forced`, `comparison_followup_locked`, `comparison_followup_priority_axis`, `comparison_early_explicit`

**Paths bloqueados:** `commercial_only_fallback`, `return_seguro` (busca comercial paralela)

**Sessão:** preservar `lastComparisonProducts`, `lastComparisonQuery`

---

### `refinement`

| Permissão | Valor |
|-----------|-------|
| allowNewSearch | true |
| allowReplaceWinner | true |
| allowRerank | true |
| shouldPreserveAnchor | false |

**Paths permitidos:** `return_seguro`, busca com rerank

---

### `new_search`

| Permissão | Valor |
|-----------|-------|
| allowNewSearch | true |
| allowReplaceWinner | true |
| allowCommercialFallback | true |
| allowRerank | true |
| shouldPreserveAnchor | false |

**Paths permitidos:** `return_seguro`, `commercial_only_fallback` (se Data Layer vazio), `legacy_llm_search`

---

### `comparison_search` / turno 1 explícito

Comparação explícita no turno 1 usa `comparison_early_explicit` ou `legacy_llm_comparison` — sem `new_search` por presença de modelo na query.

---

## Enforcement (Patch 3–4)

- **`respondWithContract`**: valida path, aplica sessão, safety net, trace v4
- **`applyFinalContractSafetyNet`**: se `shouldPreserveAnchor && !allowReplaceWinner` e sessão trocou winner → restaura âncora, `winnerChangeReason: blocked_by_contract`
- **`rankProductsUnderContract`**: se `!allowRerank`, reordena lista colocando âncora primeiro **sem alterar scores**
- **`checkContractViolation`**: registra `contractViolation` e bloqueia execução do path

## Comercial: takeover vs enriquecimento

| Situação | Comportamento |
|----------|----------------|
| `allowCommercialFallback === true` | Fallback pode definir vencedor (comportamento anterior) |
| `allowCommercialFallback === false` | Path `commercial_only_fallback` **bloqueado**; não promove produto comercial |
| Enriquecimento preço/link na âncora | Permitido apenas quando nome do produto comercial **corresponde** à âncora (`applyContractToSessionContext`) — sem trocar winner |

## Pipeline trace (debug)

Com `MIA_DEBUG=true`:

```js
pipelineTrace.routingDecision
pipelineTrace.responsePath
pipelineTrace.contractApplied
pipelineTrace.contractViolation
pipelineTrace.anchorPreserved
pipelineTrace.sessionContextReturned
pipelineTrace.winnerChanged
pipelineTrace.winnerChangeReason
```

## Testes

```bash
node scripts/test-extract-budget.js
node scripts/test-routing-decision-contract.js
node scripts/test-mia-routing-guardrails.js
node scripts/audit-patch1-scenarios.js
node scripts/audit-patch2-routing-contract.js
node scripts/audit-patch3-guardrails.js
node scripts/audit-patch4-contract-enforcement.js
```
