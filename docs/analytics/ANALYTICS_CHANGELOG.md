# Analytics Changelog
## Histórico oficial — Roadmap Analytics Teilor/MIA

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [FASE 0 — Pré-versionamento](#2-fase-0--pré-versionamento)
3. [FASE 1 — Correção P0](#3-fase-1--correção-p0)
4. [FASE 2 — Event Contract](#4-fase-2--event-contract)
5. [FASE 3 — Identity Layer](#5-fase-3--identity-layer)
6. [Próximo patch](#6-próximo-patch)
7. [Referências](#7-referências)

---

## 1. Visão geral

Este changelog registra entregas **oficiais** do roadmap Analytics.  
Patches de infraestrutura Supabase (SUPABASE-01 → 08) estão em [docs/infrastructure/CHANGELOG_SUPABASE.md](../infrastructure/CHANGELOG_SUPABASE.md).

---

## 2. FASE 0 — Pré-versionamento

| | |
|---|---|
| **Objetivo** | Operar Analytics em produção antes da fundação versionada: tabela manual, ingestão via API, dashboards ad hoc. |
| **Resultado** | Tabela `analytics_events` criada manualmente no MVP; eventos MIA e server-side em produção; sem histórico de migrations CLI. |
| **Impacto** | Dados reais acumulados; estrutura de 15 colunas estabilizada organicamente; base para reconciliação SUPABASE-07. |

**Artefatos legados (referência, não executável):**

- SQL manual em `docs/analytics/analytics-events-storage-schema-v1.sql`
- Dashboards SQL incrementais

---

## 3. FASE 1 — Correção P0

### PATCH 1.1 — Identidade de sessão

| | |
|---|---|
| **Objetivo** | Corrigir semântica e persistência de `session_id` (aba, não visitante persistente). |
| **Resultado** | `session_id` em `sessionStorage`; remoção de legado `localStorage`; documentação [SESSION_ID.md](./SESSION_ID.md). |
| **Impacto** | Métricas de sessão única passam a representar abas, não pseudo-usuários; **sem alteração estrutural** da tabela. |

---

### PATCH 1.2 — Tracking de sugestões clicáveis

| | |
|---|---|
| **Objetivo** | Corrigir rastreamento de recomendações e cliques em sugestões. |
| **Resultado** | Payloads passam a popular `recommendation_name` e campos de oferta corretamente nos eventos relevantes. |
| **Impacto** | Dashboards de produto/CTR refletem comportamento real; **sem alteração estrutural** da tabela. |

---

### PATCH 1.3 — Dashboards SQL (produção × testes)

| | |
|---|---|
| **Objetivo** | Corrigir dashboards SQL; separar produção de QA; renomear métricas enganosas (DAU → sessões diárias). |
| **Resultado** | Arquivos `analytics-*.sql` revisados; [DASHBOARDS.md](./DASHBOARDS.md); filtros determinísticos; `analytics-daily-sessions.sql`. |
| **Impacto** | Consultas alinhadas ao schema v1; limitação de `environment` documentada; índices operacionais justificados na migration v1. |

---

### PATCH 1.4 — Versionar schema oficial + documentação

| | |
|---|---|
| **Objetivo** | Oficializar e versionar o schema Analytics **como existe hoje**, sem alterar comportamento, eventos, APIs ou dashboards. |
| **Resultado** | Migrations `20260719153000` + `20260719153001` (já reconciliadas em produção); documentação canônica: `ANALYTICS_SCHEMA.md`, `ANALYTICS_DATA_DICTIONARY.md`, `ANALYTICS_TABLE_REFERENCE.md`, este changelog, `README.md`. |
| **Impacto** | Base documental para FASE 2 (Event Contract); zero regressão funcional neste patch; apenas consolidação documental. |

**Entregáveis documentais PATCH 1.4:**

- [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md)
- [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md)
- [ANALYTICS_TABLE_REFERENCE.md](./ANALYTICS_TABLE_REFERENCE.md)
- [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) (este arquivo)
- [README.md](./README.md)

---

## 4. FASE 2 — Event Contract

### PATCH 2.1 — Event Contract oficial

| | |
|---|---|
| **Objetivo** | Documentar contrato semântico dos 16 eventos existentes. |
| **Resultado** | `docs/analytics/contracts/` — EVENT_CONTRACT, EVENT_FIELD_SPECIFICATION, EVENT_LIFECYCLE. |
| **Impacto** | Referência única para frontend, backend e dashboards; zero alteração funcional. |

### PATCH 2.2 — Padronizar payloads

| | |
|---|---|
| **Objetivo** | Estrutura consistente de payloads via `lib/miaAnalyticsPayload.js`. |
| **Resultado** | Builders centralizados; ordem canônica identification → metadata. |
| **Impacto** | Zero alteração semântica; mesmos campos persistidos. |

### PATCH 2.3 — Padronizar nomenclaturas

| | |
|---|---|
| **Objetivo** | Unificar termos oficiais (Analytics Storage Schema v1, Event Contract v1, `isAnalyticsUuid`, sufixo E2E). |
| **Resultado** | Glossário em [README.md](./README.md); docs alinhados; aliases `isValidUuid` removidos. |
| **Impacto** | Zero alteração de comportamento, schema ou payloads. |

### PATCH 2.4 — Documentação oficial consolidada

| | |
|---|---|
| **Objetivo** | Consolidar toda a documentação de eventos; eliminar referências pré-FASE 2, duplicações e links inconsistentes. |
| **Resultado** | Mapa oficial de referências cruzadas; README FASE 2; contratos, schema, dictionary, dashboards e changelog alinhados. |
| **Impacto** | Apenas documentação; zero alteração funcional. |

---

## 5. FASE 3 — Identity Layer

### PATCH 3.1 — Visitor Identity (`visitor_id`)

| | |
|---|---|
| **Objetivo** | Implementar identidade anônima persistente por navegador/origem. |
| **Resultado** | `getOrCreateAnalyticsVisitorId()` em `lib/analytics.js`; coluna `visitor_id` (migration `20260721153002`); [VISITOR_ID.md](./VISITOR_ID.md). |
| **Impacto** | Aditivo e compatível; dados históricos permanecem com `visitor_id` NULL; 6 eventos públicos passam a incluir `visitor_id` automaticamente. |

---

## 6. Próximo patch

**PATCH 3.2 — Session & Conversation Identity** (roadmap oficial)

---

## 7. Referências

| Documento | Conteúdo |
|-----------|----------|
| [README.md](./README.md) | Índice oficial consolidado |
| [contracts/](./contracts/) | Event Contract v1 |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap completo FASE 1–12 |
| [01_analytics_foundation.md](./01_analytics_foundation.md) | Princípios permanentes |
| [CHANGELOG_SUPABASE.md](../infrastructure/CHANGELOG_SUPABASE.md) | Roadmap infraestrutura |
| `supabase/planning/SUPABASE-07B-execution-report.md` | Reconciliação produção |

---

*Analytics Changelog — PATCH 2.4*
