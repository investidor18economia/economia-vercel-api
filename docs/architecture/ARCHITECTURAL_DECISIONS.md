# ARCHITECTURAL_DECISIONS

> Documento oficial das decisões arquiteturais permanentes da MIA.
>
> Este documento registra princípios de arquitetura que orientam toda evolução do projeto.
>
> Alterações neste documento devem ser raras e refletir apenas decisões arquiteturais consolidadas.

---

# ADR-001 — MIA Owns the Intelligence

**Status:** Accepted

## Decisão

A inteligência pertence exclusivamente à arquitetura da MIA.

O modelo de linguagem (LLM) não toma decisões de negócio.

Toda lógica de decisão deve existir na arquitetura da aplicação.

## Consequências

- O LLM nunca decide qual produto recomendar.
- O LLM nunca decide ranking.
- O LLM nunca define regras de negócio.
- A arquitetura permanece previsível, auditável e testável.

---

# ADR-002 — LLM Only Verbalizes

**Status:** Accepted

## Decisão

O LLM é responsável apenas por transformar decisões da arquitetura em linguagem natural.

## Consequências

- Prompts não substituem arquitetura.
- A inteligência continua pertencendo ao sistema.
- Mudanças de modelo (GPT, Claude, Gemini etc.) não alteram a lógica do negócio.

---

# ADR-003 — Data Layer First

**Status:** Accepted

## Decisão

Toda consulta deve utilizar prioritariamente o Data Layer da MIA.

Fallbacks para LLM ou fontes externas só devem ocorrer quando necessário.

## Consequências

- Respostas consistentes.
- Controle da qualidade das informações.
- Independência crescente de modelos externos.

---

# ADR-004 — Architecture Before Prompt

**Status:** Accepted

## Decisão

Sempre resolver problemas por arquitetura antes de recorrer a engenharia de prompt.

## Consequências

- Código mais previsível.
- Menor dependência de prompts complexos.
- Comportamento reproduzível.

---

# ADR-005 — Frontend Never Accesses the Core

**Status:** Accepted

## Decisão

O frontend nunca acessa diretamente o Core Cognitivo.

Toda comunicação deve ocorrer através do endpoint público da MIA.

Fluxo oficial:

Frontend

↓

/api/mia-chat

↓

Core Cognitivo

## Consequências

- Segurança.
- Isolamento.
- Facilidade de auditoria.
- Possibilidade de evolução da arquitetura sem alterar o frontend.

---

# ADR-006 — Layered Architecture

**Status:** Accepted

## Decisão

A arquitetura oficial da MIA segue a separação por camadas.

Fluxo oficial:

Data Layer

↓

Decision Engine

↓

Router

↓

Contracts

↓

LLM

↓

Response

## Consequências

Cada camada possui responsabilidade única.

---

# ADR-007 — Shared State is Request Scoped

**Status:** Accepted

## Decisão

Todo estado mutável pertencente a uma requisição deve ser isolado.

A implementação oficial utiliza AsyncLocalStorage.

## Consequências

- Compatibilidade com ambiente serverless.
- Sem vazamento entre requisições.
- Ownership claro do estado.

---

# ADR-008 — Security in Layers

**Status:** Accepted

## Decisão

A segurança da plataforma é construída em múltiplas camadas independentes.

Inclui:

- Perimeter Security
- Response Hardening
- Endpoint Lockdown
- Observability
- Shared State

## Consequências

Nenhuma camada isolada é responsável por toda a proteção do sistema.

---

# ADR-009 — Fail Closed

**Status:** Accepted

## Decisão

Na dúvida, a plataforma deve negar acesso.

## Consequências

- Endpoints internos permanecem protegidos.
- Configurações ausentes não expõem funcionalidades.
- Ambientes inseguros falham de forma controlada.

---

# ADR-010 — Documentation is Part of the Architecture

**Status:** Accepted

## Decisão

Toda decisão arquitetural relevante deve ser documentada oficialmente.

A documentação faz parte do produto.

## Consequências

- Facilidade de manutenção.
- Onboarding de novos desenvolvedores.
- Preservação do conhecimento arquitetural.

---

# ADR-011 — Backward Compatibility First

**Status:** Accepted

## Decisão

Novas implementações devem preservar o comportamento existente sempre que possível.

Refactors não podem introduzir regressões.

## Consequências

- Evolução incremental.
- Menor risco em produção.
- Maior estabilidade do MVP.

---

# ADR-012 — Auditability by Design

**Status:** Accepted

## Decisão

Toda arquitetura deve ser construída de forma auditável.

Sempre que possível:

- ownership claro;
- responsabilidades definidas;
- fluxo identificável;
- documentação atualizada.

## Consequências

A plataforma permanece compreensível mesmo após muitos ciclos de evolução.

---

# Resumo dos Princípios Permanentes

- MIA owns the intelligence.
- LLM only verbalizes.
- Data Layer First.
- Architecture before Prompt.
- Frontend never accesses the Core.
- Layered Architecture.
- Shared State via AsyncLocalStorage.
- Security in Layers.
- Fail Closed.
- Documentation is part of the Architecture.
- Backward Compatibility First.
- Auditability by Design.
- Analytics Identity Layer: eventos como fonte única (`ADR-013`).

---

---

# ADR-013 — Analytics Identity Layer

**Status:** Accepted (PATCH 3.5)

## Decisão

A identidade analítica da MIA é composta por quatro identificadores complementares (`visitor_id`, `session_id`, `conversation_id`, `user_id`) persistidos como colunas em `analytics_events`, com marco explícito `user_authenticated` para login verificado.

Toda métrica de retenção e engajamento futura será **derivada** desses eventos. Não se criam tabelas paralelas, snapshots ou caches de métricas calculadas.

## Consequências

- Fonte única: `public.analytics_events`.
- Merge visitor↔user: associação prospectiva — sem backfill.
- `user_id`: resolução server-side exclusiva; body HTTP ignorado.
- Documentação canônica: `docs/analytics/IDENTITY_LAYER.md`.

---

**Última atualização:** PATCH 3.5 (Identity Layer)

**Status:** Documento oficial da arquitetura da MIA.