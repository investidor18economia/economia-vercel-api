# PATCH COMM-R01 — Comparison Intent False Positive Guard

**Domínio:** comercial / roteamento conversacional  
**Status:** **Aberto** (registrado; implementação pendente)  
**Relacionamento:** **fora** do PATCH 3.3A (auth). Descoberto durante validação operacional pós–PATCH 3.3A.2.

---

## 1. Problema

Consultas de **recomendação com prioridades múltiplas** são roteadas incorretamente para o path de **comparação explícita**, antes da busca comercial.

### Evidência (produção, 2026-07-22)

| Turno | Pergunta | Resposta observada |
|-------|----------|-------------------|
| 1 | *Qual celular você recomenda até R$ 2.500 para câmera e bateria?* | *Consigo comparar, mas não encontrei esses modelos com segurança no catálogo da MIA ainda...* |
| 2 | *E qual seria a segunda melhor opção?* | *Preciso de pelo menos uma opção válida no histórico...* |

### Impacto

- Busca comercial **não executada** no turno 1
- `session_context.lastProducts` **não populado**
- Turno 2 (second-best / decision) falha por histórico vazio
- Comportamento reproduzível **com ou sem login** — não é regressão de auth

---

## 2. Causa raiz

### Falso positivo em `isDirectComparisonQuery`

Arquivo: `lib/miaComparisonFlowCrashGuard.js`

```javascript
const COMPARISON_INTENT_PATTERN =
  /\b(comparar|compare|comparação|comparacao|versus| vs | x )\b|\b(ou|versus|contra)\b|\s+e\s+/i;
```

O alternativo `\s+e\s+` corresponde a **qualquer** conjunção `" e "` — inclusive `"câmera e bateria"` (prioridades, não produtos).

Simulação:

```text
Query: "Qual celular você recomenda até R$ 2.500 para câmera e bateria?"
extractComparisonTermsFromQuery → []
isDirectComparisonQuery         → true   ← falso positivo
```

### Sequência em runtime

1. `isExplicitComparisonQuery` → `isDirectComparisonQuery` → `true`  
   (`pages/api/chat-gpt4o.js` ~33413)
2. Early comparison block **antes** da busca comercial global
3. `lockedComparisonProducts.length < 2` → fallback  
   `buildComparisonUnresolvedFallbackReply()` (`responsePath: comparison_early_not_found`)
4. `session_context.lastInteractionType = "comparison"` sem `lastProducts`
5. Turno 2 → `buildDecisionEngineReply()` com histórico vazio  
   (`pages/api/chat-gpt4o.js` ~18455)

### Antiguidade

Padrão presente desde commit `bee55e09` (2025-06-23). **Não** introduzido por PATCH 3.3A.2.

---

## 3. Escopo do patch

### Incluído

- Corrigir detecção de comparação explícita vs. **prioridade multi-eixo** (`câmera e bateria`, `foto e vídeo`, etc.)
- Preservar comparações reais (`Galaxy A15 ou Moto G84`, `vs`, `versus`)
- Garantir que recomendações com budget (`até R$ 2.500`) entrem na **busca comercial**
- Garantir continuidade multi-turn (`second_best_discovery`, decision engine) com `lastProducts` populado
- Testes de regressão dedicados

### Excluído

- Alterações em auth, OTP, sessão, rate limit, segredos criptográficos
- Alterações em Analytics `user_id`
- PATCH 3.4 (Retention)

---

## 4. Direção de correção (proposta)

1. **Remover** `\s+e\s+` isolado de `COMPARISON_INTENT_PATTERN` / `isDirectComparisonQuery` como gatilho suficiente
2. Exigir **≥ 2 termos de produto** via `extractComparisonTermsFromQuery`, **ou** conectores explícitos (`ou`, `vs`, `versus`, `contra`)
3. Adicionar guarda **priority-coordination**: `" e "` entre eixos semânticos conhecidos (`câmera`, `bateria`, `desempenho`, …) **não** dispara comparação
4. Respeitar `hasBudgetOrSearchIntent` já existente em `isSpecificProductOnlyQuery` — estender lógica similar ao gate de comparação early

### Arquivos afetados (previstos)

| Arquivo | Alteração |
|---------|-----------|
| `lib/miaComparisonFlowCrashGuard.js` | `COMPARISON_INTENT_PATTERN`, `isDirectComparisonQuery`, possivelmente `extractComparisonTermsFromQuery` |
| `pages/api/chat-gpt4o.js` | Gate early comparison (~33413) — só entrar com evidência forte |
| `scripts/test-mia-comparison-intent-routing-guard.js` | **Novo** — casos positivos/negativos |

---

## 5. Critérios de aceite

- [ ] Query budget + prioridades (`câmera e bateria`) → busca comercial, **não** `comparison_early_not_found`
- [ ] Turno 2 `segunda melhor opção` → `second_best_discovery_flow` ou equivalente com histórico válido
- [ ] Comparação real (`A15 ou G84`) continua funcionando
- [ ] Auth/analytics inalterados (regressão 506/506 + auth suites)
- [ ] Validação produção: mesmas duas perguntas do teste humano 2026-07-22

---

## 6. Testes obrigatórios (planejados)

```bash
npm run test:mia:commercial:comparison-intent-routing   # a criar
npm run test:mia:auth:secret-separation                 # regressão auth
npm run test:mia:auth:trust-foundation
```

Casos mínimos:

| Query | Esperado |
|-------|----------|
| `Qual celular até R$ 2.500 para câmera e bateria?` | **Não** comparison early |
| `Galaxy A15 ou Moto G84` | Comparison early |
| `E qual seria a segunda melhor opção?` (com lastProducts) | Second-best / decision com histórico |

---

## 7. Separação de domínios (auditoria 2026-07-22)

| Pergunta | Resposta |
|----------|----------|
| Causado por PATCH 3.3A.2? | **Não** |
| `user_id` / sessão auth afetam catálogo? | **Não** |
| Segredos criptográficos afetam `chat-gpt4o`? | **Não** |
| PATCH 3.3A.2 validado no escopo auth? | **Sim** |

---

## 8. Referências

- Descoberta: validação operacional PATCH 3.3A.2 (2026-07-22)
- Mensagens: `lib/miaComparisonFlowCrashGuard.js` (`buildComparisonUnresolvedFallbackReply`), `pages/api/chat-gpt4o.js` (`buildDecisionEngineReply`)
- Contrato roteamento: [mia-routing-contract.md](../mia-routing-contract.md)
- Limitação ativa: [KNOWN_LIMITATIONS.md](../architecture/KNOWN_LIMITATIONS.md)

---

*PATCH COMM-R01 — Comparison Intent False Positive Guard — domínio comercial, separado de PATCH 3.3A*
