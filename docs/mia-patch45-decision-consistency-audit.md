# PATCH 4.5 — Decision Consistency Audit

**Tipo:** auditoria apenas (sem correção estrutural).  
**Data:** 2026-05-29  
**Ambiente:** `npm run dev` + `MIA_DEBUG=true`, script `scripts/audit-patch45-decision-consistency.js`

---

## Resumo executivo

Os Patches 1–4 **estabilizaram roteamento, âncora e contrato**. As incoerências restantes **não nascem no Routing Decision Contract** na maior parte dos casos reproduzidos: nascem na **camada de verbalização / formatters** que **não consomem o mesmo winner** que a sessão, o ranking da busca ou o card exibido.

| Camada | Responsável pelas incoerências observadas? |
|--------|---------------------------------------------|
| Routing / Contract | Parcialmente OK — preserva `lastBestProduct` |
| Ranking (busca) | OK no turno 1 |
| Decision Engine (`buildDecisionEngineReply`) | **Sim — Caso 1** |
| Priority follow-up template | **Sim — Caso 3** |
| Context LLM + correction guard | **Sim — Casos 2 e B** |
| Comparison engine | **Parcial — Caso D** (verbalização correta no tradeoff, trace interno diverge) |
| Data Layer / provider OLX | **A investigar isoladamente — Caso 4** (sem reprodução nesta rodada) |

---

## Instrumentação adicionada (somente logs)

- `lib/miaDecisionConsistencyAudit.js` — snapshot `winner_real`, `winner_exibido`, `winner_verbalizado`, `anchor_product`, `formatter_used`, `template_used`, `response_path`, divergências.
- Hook em `respondWithContract()` — console `🔬 MIA_DECISION_CONSISTENCY_AUDIT` e campo `mia_debug.pipelineTrace.decisionConsistencyAudit` quando `MIA_DEBUG=true` ou `MIA_DECISION_AUDIT=true`.
- Script: `node scripts/audit-patch45-decision-consistency.js`

**Comportamento de resposta:** inalterado (apenas metadados de debug).

---

## Reprodução — Cenários A–D

### Cenário A — `celular até 2.000` → `vale a pena?`

| Campo | Turno 1 | Turno 2 |
|-------|---------|---------|
| `responsePath` | `return_seguro` | `context_decision_no_search` |
| `routingDecision.mode` | `new_search` | `context_decision` |
| `contextAction` | `search` | `decision` |
| Âncora / `lastBestProduct` | iPhone 13 | iPhone 13 (preservado) |
| Verbalizado | iPhone 13 | **Samsung Galaxy S23 FE** |
| `formatter_used` | `data_layer_rankLocalFallback` | `buildDecisionEngineReply` |
| `reasoning_fields` | `performance` | `priority_axis:value` |
| Divergências | — | `anchor_vs_verbalizado` |

**Respostas às perguntas do Caso 1:**

1. Winner ativo antes: **iPhone 13** (`lastBestProduct`, card #1).
2. `lastBestProduct`: iPhone 13 (mantido após resposta).
3. `anchorProduct`: iPhone 13.
4. `routingDecision.mode`: `context_decision`.
5. Path: `context_decision_no_search`.
6. Texto: `buildDecisionEngineReply()` (template `decision_engine_eu_iria_no`).
7. S23 FE: introduzido pelo **Decision Engine**, não pelo ranking da busca nem pelo verbalizer CSO da busca.
8. Origem: `rememberedProducts` + regra interna do engine (`products[0]` após filtro de família); **prioridade inferida `value`** por “vale a pena”; compara scores vs 2º item da lista — **não reancora no iPhone** quando a lista ordinal favorece S23.
9. Divergência: **winner_real (trace/session anchor) ≠ produto mencionado** — sessão diz iPhone, fala S23 FE.

---

### Cenário B — `celular até 2.000` → `loucura`

| Campo | Turno 2 |
|-------|---------|
| `responsePath` | `anchored_reaction_hold` |
| `routingDecision.mode` | `anchored_reaction` |
| `contextAction` | `refinement` |
| Verbalizado | iPhone 13 (correção estática) |
| `formatter_used` | `context_llm_runMiaBrainTask` → substituído por guard |
| Template efetivo | texto fixo do guard `responseMentionsUnknownProduct` |

**Caso 2 (contradição uso pesado vs leve)** — mesma família de bug que B:

| Turno | Formatter | Tom |
|-------|-----------|-----|
| 1 busca | Search cognition / `return_seguro` | “uso pesado”, “mais folga” |
| 2 follow-up ambíguo | Guard em `chat-gpt4o.js` ~26185–26193 | “uso leve ou intermediário”, “cautela para jogos” |

**Origem da contradição:** não é Data Layer conflitante — é **dois formatters diferentes** (narrativa de performance na busca vs **fallback hardcoded** na análise). Reasoning fields turno 1: eixo `performance`; turno 2: `priority_axis:inherited` + template de cautela genérico.

---

### Cenário C — `celular até 2.000` → `quero mais bateria`

| Campo | Turno 2 |
|-------|---------|
| `responsePath` | `priority_followup_short` |
| `routingDecision.mode` | `refinement` |
| Rerank | **Sim** — `rankedFollowUpProducts` por score `battery` |
| Winner após rerank | **Galaxy A35 5G** (`lastBestProduct` atualizado) |
| Card (`prices[0]`) | A35 |
| Verbalização corpo | Análise de bateria do **A35** |
| Fechamento | **“eu manteria esse produto como referência, sem buscar outro agora”** (template fixo) |

**Inconsistência:** não é troca ilegítima de winner — o contrato **permite rerank** em refinement. O bug é **semântico**: template `priority_followup_hold_reference` foi escrito para “manter referência”, mas o produto analisado/exibido **já mudou** para o vencedor do rerank (A35). Mistura **formatter de hold** com **winner novo**.

---

### Cenário D — `iPhone 13 ou S23 FE` → `e a bateria?`

| Campo | Turno 2 |
|-------|---------|
| `responsePath` | `comparison_followup_forced` |
| Verbalizado | Tradeoff honesto: iPhone conjunto, **S23 FE bateria** |
| `lastBestProduct` | iPhone 13 |
| `ranking_winner` (trace) | S23 FE |
| Divergência trace | `ranking_winner_vs_winner_real` |

**Leitura:** verbalização **coerente** com pergunta de eixo (bateria). Divergência é de **telemetria** (`ranking_winner` = eixo vencedor, `winner_real` = vencedor global da comparação) — risco de falso positivo em auditoria automática, não necessariamente bug de UX.

---

### Caso 4 — A35 R$700 OLX (mapeamento de código, não reproduzido aqui)

| Pergunta | Estado no código atual |
|----------|------------------------|
| Origem preço/loja | Pipeline comercial (`fetchSerpPrices` / cards em `prices`) |
| Filtro outlier | Sem filtro dedicado “OLX usado barato” encontrado em grep de produção |
| Impacto ranking | Preço entra em `rankingScore` no follow-up (`parsePrice`, bônus menor preço) — anúncio outlier pode **puxar rerank** |
| Classificação | Provável **anúncio individual / parsing** até validar provider |

**Recomendação de auditoria manual:** fluxo `Galaxy A35` → mencionar `R$700` → `OLX` com log de `prices[].source` e `link`.

---

## Caso 5 — Decision Engine vs Verbalizer (mapa de pontos)

| Ponto no pipeline | Sintoma | Evidência |
|-------------------|---------|-----------|
| `buildDecisionEngineReply` | `lastBest` ≠ “Eu iria no X” | Cenário A |
| `priority_followup_short` | Card ≠ fechamento semântico | Cenário C |
| `responseMentionsUnknownProduct` fallback | Tom oposto à busca anterior | Cenário B / Caso 2 |
| Trace `ranking_winner` vs `winner_real` | Falso desalinhamento em comparação por eixo | Cenário D |
| `decisionWinnerProduct` no trace context | Antes do patch de audit: trace apontava âncora enquanto reply era outro produto | Corrigido metadado; bug de produto persiste |

---

## Respostas ao relatório final

### 1. Onde a inconsistência nasce?

Principalmente **depois do contrato**, nas camadas:

- `buildDecisionEngineReply` (decisão contextual)
- Template `priority_followup_short`
- Guards pós-LLM de contexto (`responseMentionsUnknownProduct`)

### 2. É problema de…?

| Área | Veredito |
|------|----------|
| ranking | Não no turno 1; pode influenciar ordem de `lastProducts` |
| decision engine | **Sim (Caso 1)** |
| routing | Não — modo correto, âncora preservada na sessão |
| formatter / verbalizer | **Sim (Casos 2, 3, B)** |
| data layer | Não evidenciado nas contradições de texto |
| provider comercial | **Possível (Caso 4)** — preço outlier |

### 3. O Composer consegue corrigir?

**Sim**, correções mínimas são locais (3–5 pontos), sem novo router:

- Ancorar `buildDecisionEngineReply` em `lastBestProduct` quando contrato preserva âncora.
- Ajustar copy do `priority_followup_short` quando houve rerank (“passaria a referência para X”).
- Remover/substituir fallback genérico “uso leve” por reutilização do último `reasoning`/eixo da sessão.

### 4. Deve ser guardado para modelo forte?

**Não como primeira linha.** São bugs determinísticos de ordenação/template, não ambiguidade semântica profunda. Modelo forte só ajuda se a decisão continuar delegada ao LLM livre.

### 5. Correção mínima e mais segura

1. **`buildDecisionEngineReply`:** `best = anchorProduct || lastBestProduct` quando `shouldPreserveAnchor` e `context_decision`; nunca `products[0]` cego.
2. **`priority_followup_short`:** se `followUpProduct !== sessionBefore.lastBestProduct`, trocar frase de fechamento para “faria sentido considerar X para bateria” (sem “manter referência”).
3. **Guard unknown product:** usar último eixo/`lastMainConsequence` em vez de string fixa “uso leve/intermediário”.

### 6. Correção ideal

- **Single source of truth** para `presentationWinner` propagado a: card, `reply`, trace e session.
- Decision Engine **só explica** o winner já escolhido pelo contrato (comentário já existe no código — enforcement faltando).
- Separar `axis_winner` vs `overall_winner` no trace para comparações (eliminar falsos positivos Caso D).
- Filtro de preço outlier por fonte (OLX usado) no Data Layer — escopo separado.

---

## Como repetir

```bash
# Terminal 1
npm run dev

# Terminal 2
node scripts/audit-patch45-decision-consistency.js
```

Logs no servidor: `🔬 MIA_DECISION_CONSISTENCY_AUDIT`

---

## Arquivos tocados neste patch (auditoria)

| Arquivo | Alteração |
|---------|-----------|
| `lib/miaDecisionConsistencyAudit.js` | Novo — snapshot + log |
| `pages/api/chat-gpt4o.js` | Hook em `respondWithContract`; metadados extras em context decision + priority followup |
| `scripts/audit-patch45-decision-consistency.js` | Novo — cenários A–D |
| `docs/mia-patch45-decision-consistency-audit.md` | Este relatório |

**Não alterado:** Routing Contract, CSO, ranking core, Data Layer, Search Cognition, Comparison Engine core, Decision Engine lógica de scores (apenas telemetria).

---

## PATCH 4.6 — Correções aplicadas

| Fix | Arquivo | O que mudou |
|-----|---------|-------------|
| Âncora no Decision Engine | `lib/miaDecisionConsistencyFixes.js` + `buildDecisionEngineReply` | `resolveDecisionEngineWinners` usa `lastBestProduct` quando `shouldPreserveAnchor` |
| Copy priority follow-up | `buildPriorityFollowUpClosingLine` | Se rerank trocou produto → “passa a ser a referência”; senão mantém hold |
| Guard contexto | `buildContextUnknownProductCorrectionReply` | Substitui texto fixo “uso leve” por tom alinhado a `lastPriority` / `lastMainConsequence` |

Testes: `node scripts/test-mia-decision-consistency-fixes.js`  
Revalidação: `node scripts/audit-patch45-decision-consistency.js`
