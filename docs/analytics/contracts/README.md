# Event Contract — Documentação Oficial
## Pasta `docs/analytics/contracts/`

Contrato semântico oficial dos eventos Analytics Teilor/MIA — **Event Contract v1**.

Consolidado na FASE 2 (PATCH 2.4). Complementa o [Analytics Storage Schema v1](../ANALYTICS_SCHEMA.md) — não o substitui.

---

## Objetivo da pasta

Referência única sobre:

- quais `event_name` existem e quando disparam;
- quais campos e chaves de `metadata` são usados;
- como um evento percorre o sistema até os dashboards SQL.

Payloads padronizados em código: `lib/miaAnalyticsPayload.js` (PATCH 2.2).

---

## Documentos

| Arquivo | Conteúdo |
|---------|----------|
| [EVENT_CONTRACT.md](./EVENT_CONTRACT.md) | **Documento principal** — princípios, catálogo dos 16 eventos |
| [EVENT_FIELD_SPECIFICATION.md](./EVENT_FIELD_SPECIFICATION.md) | Colunas e chaves de `metadata` em uso |
| [EVENT_LIFECYCLE.md](./EVENT_LIFECYCLE.md) | Ciclo de vida frontend → banco → dashboards |

---

## Mapa de referências

```text
contracts/README.md (este arquivo)
    ↓
EVENT_CONTRACT.md
    ↓
EVENT_FIELD_SPECIFICATION.md
    ↓
EVENT_LIFECYCLE.md
    ↓
ANALYTICS_DATA_DICTIONARY.md · ANALYTICS_TABLE_REFERENCE.md
    ↓
SESSION_ID.md · DASHBOARDS.md
    ↓
ANALYTICS_CHANGELOG.md · ../README.md
```

---

## Ordem de leitura

**Onboarding:**

1. [EVENT_CONTRACT.md](./EVENT_CONTRACT.md) §1–5 — conceitos
2. [EVENT_LIFECYCLE.md](./EVENT_LIFECYCLE.md) — fluxo end-to-end
3. [EVENT_CONTRACT.md](./EVENT_CONTRACT.md) §7 — catálogo por evento

**Auditoria:**

1. [EVENT_FIELD_SPECIFICATION.md](./EVENT_FIELD_SPECIFICATION.md)
2. [ANALYTICS_DATA_DICTIONARY.md](../ANALYTICS_DATA_DICTIONARY.md)
3. Código: `lib/miaAnalyticsPayload.js`, `lib/analytics.js`, `lib/miaAnalyticsAllowlist.js`, `lib/miaPriceAlertEmailAnalytics.js`

---

## Qual documento consultar

| Situação | Documento |
|----------|-----------|
| Quais eventos existem | [EVENT_CONTRACT.md](./EVENT_CONTRACT.md) §7 |
| Quando dispara um evento | [EVENT_CONTRACT.md](./EVENT_CONTRACT.md) §7 |
| Campos de um evento | [EVENT_FIELD_SPECIFICATION.md](./EVENT_FIELD_SPECIFICATION.md) |
| Como o evento chega ao banco | [EVENT_LIFECYCLE.md](./EVENT_LIFECYCLE.md) |
| Tipos PostgreSQL | [ANALYTICS_DATA_DICTIONARY.md](../ANALYTICS_DATA_DICTIONARY.md) |
| Escritores / leitores | [ANALYTICS_TABLE_REFERENCE.md](../ANALYTICS_TABLE_REFERENCE.md) |
| Queries SQL | [DASHBOARDS.md](../DASHBOARDS.md) |
| `session_id` | [SESSION_ID.md](../SESSION_ID.md) |
| Índice geral Analytics | [../README.md](../README.md) |

---

## Relação com outros documentos

| Camada | Documento |
|--------|-----------|
| Storage físico | [ANALYTICS_SCHEMA.md](../ANALYTICS_SCHEMA.md) |
| Event Contract | Esta pasta |
| Consumo SQL | [DASHBOARDS.md](../DASHBOARDS.md) |
| Histórico | [ANALYTICS_CHANGELOG.md](../ANALYTICS_CHANGELOG.md) |

**Regra:** mudança de comportamento de evento → atualizar contrato + changelog. Mudança estrutural de tabela → migration + `ANALYTICS_SCHEMA.md`.

---

*Event Contract v1 — consolidado PATCH 2.4*
