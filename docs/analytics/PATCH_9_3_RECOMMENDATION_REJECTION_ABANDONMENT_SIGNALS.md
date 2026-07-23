# PATCH 9.3 — Recommendation Rejection and Abandonment Signals

**Evento:** `mia_recommendation_rejection_signal` · **Versão:** `9.3.0`  
**Status:** 🟢 **APROVADO** · produção `bbd9328` · build `bbd93286c96d`

## Arquitetura escolhida — Modelo Híbrido (D)

| Camada | Responsabilidade |
|--------|------------------|
| Eventos existentes | `mia_recommendation_decision` (9.1), `mia_recommendation_acceptance_signal` (9.2), follow-up contracts, cognitive turn |
| Evento agregado 9.3 | Registra fatos observáveis: rejeição, refinamento, substituição, postponement, abandono explícito |
| Derivação SQL | Recovery, métricas agregadas, abandono operacional futuro (se infra existir) |
| Sem client novo | Observação server-side + transição de decisão |

**Justificativa:** intenção negativa nem sempre está persistida em eventos client; SQL puro (A) arrisca falso positivo ao confundir refinamento com rejeição. Evento único com `signal_class` distinto evita fragmentação (C).

## Princípio fundamental

Distinção obrigatória:

- **REJECTION** — rejeição explícita observável
- **REFINEMENT** — restrição adicionada/corrigida (não implica erro da recomendação)
- **SUBSTITUTION** — nova decisão substitui anterior (causa não presumida)
- **POSTPONEMENT / ABANDONMENT** — apenas com evento mensurável
- **INCONCLUSIVE** — sem evidência (ex.: `ALTERNATIVE_REQUESTED` isolado)

Silêncio ≠ abandono. Ausência de clique ≠ rejeição.

## Correlação

- `decision_request_id` — decisão rejeitada/refinada
- `request_id` — turno que expressou o sinal
- `previous_decision_request_id` / `replacement_decision_request_id` — cadeia de substituição

## Emissão

- `observeRejectionSignalsFromTurnContext()` — após intent/follow-up/cognitive turn
- `observeRejectionSignalFromDecisionTransition()` — ao estabilizar nova decisão 9.1

Fire-and-forget: falhas analíticas nunca alteram resposta.

## Produção

```bash
npm run test:mia:analytics:patch-93:recommendation-rejection
npm run test:mia:analytics:patch-93:prod-smoke
npm run test:mia:analytics:patch-93:prod-validation
```

Evidência: [PATCH_9_3_PRODUCTION_EVIDENCE.json](./PATCH_9_3_PRODUCTION_EVIDENCE.json)

## Limitações

- Abandono por inatividade/silêncio **não implementado** — sem infra confiável (`beforeunload`, heartbeat, session timeout)
- `ALTERNATIVE_REQUESTED` registrado como INCONCLUSIVE para métricas de rejeição
- Runner-up uptake completo → PATCH 9.4
- Motivos inferidos apenas de contratos existentes (routing, refinement type, cognitive turn)

## Métricas oficiais

- **Explicit rejection rate** = decisões com rejeição explícita válida / decisões elegíveis
- **Refinement rate** = decisões com refinamento válido / elegíveis
- **Replacement rate** = decisões substituídas correlacionadas / elegíveis
- **Observed abandonment rate** = abandono observado / decisões elegíveis para lifecycle observável
- **Recovery rate after rejection** = rejeitadas com acceptance na decisão substituta / rejeitadas com replacement
