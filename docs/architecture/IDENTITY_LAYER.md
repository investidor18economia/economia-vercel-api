# Identity Layer — Visão Arquitetural

A **Identity Layer** do Analytics Teilor/MIA define como visitantes, sessões, conversas e usuários autenticados são representados nos eventos persistidos.

---

## Documentação canônica

Toda a semântica oficial está consolidada em:

**[docs/analytics/IDENTITY_LAYER.md](../analytics/IDENTITY_LAYER.md)**

Este arquivo na pasta `architecture/` existe apenas como **ponto de entrada** para leitores que começam pela arquitetura geral.

---

## Princípios (resumo)

| Princípio | Detalhe |
|-----------|---------|
| Fonte única | `public.analytics_events` |
| Sem redundância | Nenhuma tabela paralela de identidade analítica |
| Derivação | Retenção e métricas futuras via eventos + `created_at` |
| Segurança | `user_id` resolvido server-side; body ignorado |
| Merge | Associação prospectiva — sem backfill |

ADR formal: [ADR-013 — Analytics Identity Layer](./ARCHITECTURAL_DECISIONS.md#adr-013--analytics-identity-layer).

---

## Patches que compõem a camada

| Patch | Entrega |
|-------|---------|
| 1.1 | `session_id` |
| 3.1 | `visitor_id` |
| 3.2 | `conversation_id` |
| 3.3 | `user_id` autenticado |
| 3.3A | OTP / confiança |
| 3.4 | `user_authenticated` + fundação retenção |
| 3.5 | Documentação consolidada (este índice) |

---

## Referências

- [ARCHITECTURAL_DECISIONS.md](./ARCHITECTURAL_DECISIONS.md)
- [REQUEST_LIFECYCLE.md](./REQUEST_LIFECYCLE.md)
- [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)
- [docs/analytics/README.md](../analytics/README.md)

---

*PATCH 3.5 — ponte arquitetura ↔ analytics*
