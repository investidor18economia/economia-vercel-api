# Executive AI Insights — PATCH 11.4

Camada de inteligência executiva determinística integrada ao Cockpit do Fundador.

**Endpoint:** `GET /api/founder/executive-insights?days={7|30|90|365}`  
**Versão:** `11.4.0`  
**Princípio:** A Teilor calcula os fatos. A IA interpreta e verbaliza.

---

## Arquitetura

```
GET /api/founder/executive-insights (auth: founder gate)
        │
        ├─ buildExecutiveMetricsPeriodComparison()
        │     ├─ buildExecutiveMetricsResponse(days, offset=0)   ← período atual
        │     └─ buildExecutiveMetricsResponse(days, offset=days) ← período anterior
        │
        ├─ generateDeterministicInsights()  ← fatos estruturados
        ├─ buildDeterministicExecutiveSummary()
        └─ verbalizeExecutiveInsights() [opcional LLM]
```

| Arquivo | Função |
|---------|--------|
| `lib/miaExecutiveInsightsThresholds.js` | Limiares centralizados |
| `lib/miaExecutiveInsightsEngine.js` | Motor determinístico |
| `lib/miaExecutiveInsightsCompare.js` | Comparação de períodos (backend) |
| `lib/miaExecutiveInsightsLlm.js` | Verbalização opcional |
| `lib/miaExecutiveInsightsApi.js` | Builder do contrato |
| `lib/miaExecutiveInsightsCache.js` | Cache TTL por período |
| `pages/api/founder/executive-insights.js` | Endpoint privado |
| `components/founder-cockpit/FounderExecutiveInsights.jsx` | UI no Cockpit |

---

## Comparação de períodos

- **Atual:** últimos N dias  
- **Anterior:** N dias imediatamente anteriores (`offset_days = N`)  
- Calculado no backend via `buildExecutiveMetricsResponse({ offsetDays })`  
- Migration: `20260723230000_mia_executive_metrics_period_offset_v11_4.sql` + complement `20260723240000_mia_executive_metrics_period_offset_complement_v11_4.sql`
- **Todas as 9 categorias RPC** suportam `p_offset_days` (sem fallback por offset ausente)

---

## Tipos de insight

`trend` · `decline` · `risk` · `anomaly` · `opportunity` · `system_health` · `insufficient_data`

---

## Limiares (`EXECUTIVE_INSIGHTS_THRESHOLDS`)

- `min_absolute_change`: 5  
- `min_percentage_change`: 10%  
- `min_sample_volume`: 10  
- `min_rate_point_change`: 0.05 (5 p.p.)  
- `api_latency_warning_ms`: 5000  

---

## Confiança

`high` · `medium` · `low` · `insufficient_data`

---

## Severidade

`critical` · `warning` · `opportunity` · `info`

---

## LLM (opcional)

- Env: `MIA_EXECUTIVE_INSIGHTS_LLM_ENABLED` (default on if `OPENAI_API_KEY` set)  
- Query: `?no_llm=1` força fallback determinístico  
- LLM recebe apenas insights estruturados — nunca eventos ou PII

---

## Fallback

Sem LLM ou em falha: resumo e insights determinísticos permanecem disponíveis.

---

## Cache

- Env: `MIA_EXECUTIVE_INSIGHTS_CACHE_TTL_MS` (default 300000)  
- Chave: `executive-insights:v11.4.0:d{days}`

---

## Privacidade

Endpoint protegido por gate do fundador. Scan de PII em auditorias. Cockpit `noindex`.

---

## Testes

```bash
npm run test:mia:analytics:patch-114:executive-ai-insights
npm run test:mia:analytics:patch-114:period-offset-complement
npm run test:mia:analytics:patch-114:prod-smoke
```

---

## Limitações

- Sem histórico intra-janela além de dois períodos adjacentes  
- LLM opcional — módulo funciona sem ele
