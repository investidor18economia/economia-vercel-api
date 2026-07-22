# PATCH 6.4 — Data Layer Usage & Effectiveness Analytics

**Status:** 🟡 **INSTRUMENTAÇÃO OPERACIONAL — Fase 6 encerrada na auditoria 6.5; aprovação formal PATCH 6.4 instrumentação aguardando usuário**  
**Data deploy:** 2026-07-22  
**Commit deploy:** `2072e1d` · branch `master`  
**Produção:** https://economia-ai.vercel.app/app-mia  
**Investigação manual UI:** 2026-07-22 ~20:05–20:06 BRT

---

## 1. Resumo executivo

PATCH 6.4 foi **deployado em produção** e a **instrumentação analítica está operacional**: eventos `data_layer_resolution` (`event_version: 6.4.0`) são persistidos, correlacionáveis e refletidos nos dashboards SQL.

Entretanto, **validação manual pela interface real** (`/app-mia`) revelou **bugs funcionais preexistentes** em dois cenários (iPhone, TV). A instrumentação registrou corretamente o comportamento errado — **não mascarar como aprovação**.

**Veredito investigação:** **Decisão A** — instrumentação correta + bugs funcionais preexistentes (não regressão do PATCH 6.4).

---

## 2. Deploy

| Campo | Valor |
|-------|-------|
| Branch | `master` |
| Commit | `2072e1d` |
| Push | `40f0eeb..2072e1d` → `origin/master` |
| Ambiente | Vercel produção |
| URL | https://economia-ai.vercel.app |
| Confirmação | Campo `data_layer_usage_analytics` presente na resposta após deploy |
| Health | `GET /api/health` → 200 |
| UI MIA | `GET /app-mia` → 200 |

---

## 3. Testes

| Suíte | Comando | Resultado (pós-investigação) |
|-------|---------|------------------------------|
| PATCH 6.4 unit | `npm run test:mia:analytics:patch-64:data-layer-usage-analytics` | **71/71** |
| Prod validation SQL | `npm run test:mia:analytics:patch-64:prod-validation` | **25/25** |
| Regressões 6.1–6.3 (pré-deploy) | scripts dedicados | **342/342** |

---

## 4. Métricas produção (atualizado 2026-07-22)

Denominador: **15 consultas comerciais instrumentadas** (`data_layer_resolution`, `event_version: 6.4.0`)

| Métrica | Absoluto | Relativo |
|---------|----------|----------|
| Total eventos | 15 | — |
| Data Layer Hit Rate | 9 | 0.6000 |
| Fallback Rate | 15 | 1.0000 |
| Hybrid Rate | 9 | 0.6000 |
| Full Coverage Rate | 0 | 0.0000 |
| Partial Coverage Rate | 9 | 0.6000 |
| Fallback Only Rate | 6 | 0.4000 |
| No Commercial Result Rate | 0 | 0.0000 |

**Classificações:** PARTIAL_DATA_LAYER (9) · FALLBACK_ONLY (6) · FULL_DATA_LAYER (0) · NO_COMMERCIAL_RESULT (0)

---

## 5. Investigação manual UI (20:05–20:06 BRT)

**Sessão browser:** `56e604b4-23a5-4560-ad46-21b5f0ad20ee` (mesma aba, 3 turnos)  
**Evidência:** `PATCH_6.4_MANUAL_UI_INVESTIGATION.json` · `PATCH_6.4_PRODUCTION_EVIDENCE.json`

### C1 — iPhone até R$ 4.000 (20:05)

| Campo | Valor |
|-------|-------|
| Evento | `5a6eaf92-7b5f-45ec-8fab-604883709809` |
| `conversation_id` | `c5d7cfc4-2ca7-4490-81d4-b1d2e6c640f0` |
| `request_id` | `89195899-29cb-4ca8-afbe-ea1f6a955ba5` |
| Categoria detectada | `phone` / `smartphones` |
| Marca solicitada | Apple/iPhone (não aplicada no ranking) |
| Candidatos DL | 12 encontrados, 12 após isolamento |
| Produto selecionado | Samsung Galaxy S23 FE |
| Classificação | **PARTIAL_DATA_LAYER** |
| Caminho | `return_seguro` · `data_layer_rankLocalFallback` |
| Resultado funcional | ❌ **Falha** — Samsung em busca explícita por iPhone |

**Cadeia:** pergunta → categoria `phone` → intent `search` → DL primário (12 candidatos phone genéricos) → ranking sem lock de marca Apple → Samsung vence → evento PARTIAL_DATA_LAYER → dashboard coerente.

**Causa raiz:** ausência de **brand lock** quando usuário solicita marca/modelo explícito (`iPhone`). Ranking escolhe melhor custo-benefício na categoria phone sem filtrar não-Apple. **Preexistente:** smoke P3 (22:57 UTC) já retornava Samsung S23 FE para a mesma pergunta.

**PATCH 6.4:** apenas observacional (`git diff 40f0eeb..2072e1d` — +598 linhas instrumentação, zero alteração em ranking/fallback/seleção).

---

### C2 — TV 55 polegadas (20:05)

| Campo | Valor |
|-------|-------|
| Evento | `9d98f991-da1a-4e90-9182-c869e7b724cf` |
| `conversation_id` | `4d76dafb-52d4-40c7-9ea7-1c2689308dd5` (nova conversa) |
| `request_id` | `706b96a4-84d6-48f7-96bd-56031c105b3c` |
| Categoria detectada | `tv` ✅ |
| Candidatos DL | 0 (`isolation_reason: no_candidates`) |
| Produto selecionado | Notebook HP 256R G9 |
| Classificação | **FALLBACK_ONLY** |
| Caminho | `commercial_only_fallback` · `commercial_serp_only` |
| Intent persistido | `general_answer` |
| Resultado funcional | ❌ **Falha grave** — notebook para busca TV |

**Cadeia:** pergunta → categoria `tv` correta → DL vazio → Serp/cache comercial → notebook passa filtro categórico → `commercial_only_fallback` → evento FALLBACK_ONLY → dashboard coerente com caminho errado.

**Causa raiz comprovada:** regex de categoria TV em `productMatchesCategory` inclui `\buhd\b`, que faz **match falso positivo** em `"Intel UHD Graphics"` no título do notebook. Notebook passa `cleanAndRankProducts` / `getLocalCommercialFallbackProducts` como se fosse TV. **Não é contaminação de sessão** — reprodução em sessão limpa confirma o mesmo notebook.

**PATCH 6.4:** não causou; smoke P6 (22:57 UTC) já apresentava FALLBACK_ONLY para TV (produto errado não estava no campo winner do smoke, mas resposta continha notebook).

---

### C3 — Samsung bom de bateria (20:06)

| Campo | Valor |
|-------|-------|
| Evento | `7bb5e84f-d6cd-4a62-b7a2-e79f57bb01dd` |
| `conversation_id` | `9927780b-7cf0-4367-a19c-0a920bc9cb17` |
| `request_id` | `6515bf6c-0d18-4f92-999d-8fa188690f84` |
| Query persistida | `"quero um samsumg bom de bateria"` (typo) |
| Categoria | `phone` |
| Marca | Samsung ✅ |
| Candidatos DL | 12 encontrados → 0 após isolamento |
| Isolamento | `accessory_query_main_product_blocked` (token `bateria` em accessory guard) |
| Produto selecionado | Samsung Galaxy A15 5G |
| Classificação | **FALLBACK_ONLY** (`fallback_kind: avoidable`) |
| Caminho | `commercial_only_fallback` |
| Resultado funcional | ✅ Coerente (marca respeitada) · ⚠️ caminho subótimo |

**Cadeia:** pergunta → categoria phone → DL bloqueado por falso positivo de accessory intent → fallback comercial → Samsung A15 → evento FALLBACK_ONLY.

---

## 6. Reprodução sessão limpa

Script: `scripts/patch-64-clean-session-reproduction.mjs` (2026-07-22)

| Cenário | Sessão | Resultado |
|---------|--------|-----------|
| TV 55" | limpa | Notebook HP 256R G9 · FALLBACK_ONLY |
| iPhone R$ 4.000 | limpa | Samsung Galaxy S23 FE · PARTIAL_DATA_LAYER |
| TV após iPhone | contaminada simulada | Notebook HP 256R G9 · FALLBACK_ONLY (idêntico à limpa) |

**Conclusão:** bugs **não dependem** de `session_context` / `lastBestProduct`. São reproduzíveis isoladamente.

---

## 7. Auditoria PATCH 6.4 vs pré-patch (`40f0eeb..2072e1d`)

| Arquivo | Alteração | Impacto funcional |
|---------|-----------|------------------|
| `lib/miaDataLayerResolutionClassifier.js` | novo | nenhum |
| `lib/miaDataLayerUsageAnalytics.js` | novo | nenhum (INSERT observacional) |
| `pages/api/chat-gpt4o.js` | +106 linhas | hooks `recordDataLayerUsageForCommercialTurn` antes de returns existentes |
| `components/MIAChat.jsx` | +44 linhas | `analytics_context` + enrich recommendation |
| `lib/miaAnalyticsPayload.js` | +15 linhas | campos opcionais DL |

**Confirmado:** nenhuma alteração em ranking, fallback selection, category detection, brand lock ou product selection.

---

## 8. Pendências funcionais (fora do escopo 6.4)

| ID | Bug | Prioridade | Patch sugerido |
|----|-----|------------|----------------|
| FUNC-64-C1 | Brand lock ausente para marca/modelo explícito (iPhone → Samsung) | Alta | Comercial / ranking |
| FUNC-64-C2 | Falso positivo UHD em filtro TV → notebook recomendado | Crítica | `productMatchesCategory` |
| FUNC-64-C3 | Token `bateria` classifica query como accessory → DL bloqueado desnecessariamente | Média | `accessoryIntentLockGuard` |

**Não corrigir silenciosamente dentro do PATCH 6.4 sem autorização.**

---

## 9. Veredito

| Critério | Status |
|----------|--------|
| Deploy confirmado | ✅ |
| Instrumentação operacional | ✅ (15 eventos) |
| Correlação conversa→evento | ✅ |
| Dashboards funcionais | ✅ (25/25 prod validation) |
| Instrumentação descreve caminho real | ✅ |
| Bugs funcionais preexistentes documentados | ✅ |
| Regressão PATCH 6.4 | ❌ **Não comprovada** |
| Aprovação formal PATCH 6.4 | ⏳ **Bloqueada** — investigação funcional concluída, bugs runtime pendentes |

---

## 10. Próximo passo

- **PATCH 6.5:** não iniciar.
- Corrigir pendências FUNC-64-* em patch comercial dedicado, com autorização.
- Revalidar interface após correções funcionais; então reconsiderar aprovação formal do 6.4.

---

*Relatório PATCH 6.4 — deploy + investigação manual UI 2026-07-22*
