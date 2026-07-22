# PATCH FUNC-64 — Correções Runtime Comerciais (fora do roadmap Analytics)

**Origem:** descobertas durante validação manual do PATCH 6.4 (2026-07-22)  
**Escopo:** runtime comercial / ranking / fallback — **não pertence à Fase 6 Analytics**  
**Status:** 📋 Pendente — aguardando autorização e patch dedicado

---

## Contexto

Durante a validação da instrumentação analítica do PATCH 6.4, três conversas manuais em `/app-mia` revelaram bugs **funcionais preexistentes**. A instrumentação registrou corretamente o comportamento ocorrido — os bugs não são regressão do PATCH 6.4.

**Evidências:** [PATCH_6.4_MANUAL_UI_INVESTIGATION.json](../analytics/PATCH_6.4_MANUAL_UI_INVESTIGATION.json) · [PATCH_6.4_DATA_LAYER_USAGE_ANALYTICS.md](../analytics/PATCH_6.4_DATA_LAYER_USAGE_ANALYTICS.md)

**Reprodução:** `scripts/patch-64-clean-session-reproduction.mjs` — bugs reproduzíveis em sessão limpa.

---

## FUNC-64-C1 — Brand lock ausente (iPhone → Samsung)

| Campo | Valor |
|-------|-------|
| Query | `Quero um iPhone até R$ 4.000.` |
| Esperado | iPhone dentro do orçamento ou mensagem clara de ausência |
| Observado | Samsung Galaxy S23 FE recomendado |
| Causa raiz | Ranking DL sem restrição de marca Apple/iPhone |
| Prioridade | Alta |
| Arquivos prováveis | `rankLocalFallbackProducts`, constraint refinement, ranking comercial |

---

## FUNC-64-C2 — Falso positivo categoria TV (notebook recomendado)

| Campo | Valor |
|-------|-------|
| Query | `Quero uma televisão de 55 polegadas.` |
| Esperado | TV, fallback compatível ou ausência clara |
| Observado | Notebook HP 256R G9 |
| Causa raiz | Regex TV `\buhd\b` casa `"Intel UHD Graphics"` em títulos de notebook |
| Prioridade | Crítica |
| Arquivos prováveis | `productMatchesCategory` em `pages/api/chat-gpt4o.js`, `commercial_only_fallback` |

---

## FUNC-64-C3 — Token `bateria` classificado como accessory intent

| Campo | Valor |
|-------|-------|
| Query | `quero um samsung bom de bateria` |
| Esperado | DL phone com prioridade bateria |
| Observado | DL bloqueado (`accessory_query_main_product_blocked`) → fallback comercial |
| Causa raiz | `bateria` listado em `ACCESSORY_INTENT_SIGNAL_RULES` |
| Prioridade | Média |
| Arquivos prováveis | `lib/commercial/accessoryIntentLockGuard.js` |

---

## Plano de correção (proposto — não iniciado)

1. FUNC-64-C2 primeiro (impacto crítico cross-category)
2. FUNC-64-C1 (brand/model explicit lock)
3. FUNC-64-C3 (refinar accessory vs priority signal)
4. Revalidar manualmente `/app-mia` + correlacionar eventos `data_layer_resolution`

---

*Não bloqueia encerramento da Fase 6 Analytics — roadmap funcional separado.*
