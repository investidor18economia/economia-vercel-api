# Analytics Specification
## Documento Mestre Oficial
### Teilor / MIA

> **Estado atual do produto:** eventos e payloads vigentes estão em [Event Contract v1](./contracts/EVENT_CONTRACT.md) e [Analytics Storage Schema v1](./ANALYTICS_SCHEMA.md).  
> Este documento descreve **especificações futuras** além do v1 — não substitui o contrato oficial.

Versão: 1.0

Última atualização:
2026

Status:
Em desenvolvimento

Documento relacionado:

- 01_analytics_foundation.md
- 02_analytics_roadmap.md
- mia_architecture.md
- mia_engineering_rules.md
- mia_roadmap.md

---

# Objetivo

Este documento define as especificações oficiais do Analytics da Teilor.

Ele estabelece os contratos permanentes utilizados pela arquitetura.

Este documento não descreve como implementar cada patch.

As implementações pertencem aos prompts de cada patch.

---

# Entidades Oficiais

## visitor_id

Representa um visitante persistente.

Características:

- independe de login;
- permanece entre sessões;
- identifica o navegador/dispositivo de forma anônima;
- poderá futuramente participar de estratégias de retenção.

Nunca representa:

- usuário autenticado;
- sessão;
- conversa.

---

## session_id

Representa uma sessão de navegação.

Características:

- pertence a um único visitor;
- inicia quando uma nova sessão é criada;
- termina quando a sessão termina.

Nunca representa:

- visitante;
- usuário;
- dispositivo.

---

## conversation_id

Representa uma conversa completa com a MIA.

Características:

- pertence a uma sessão;
- agrupa perguntas e respostas;
- permite medir conversas completas.

---

## turn_id

Representa uma interação.

Exemplo:

Pergunta

↓

Resposta

Uma conversa possui diversos turns.

---

## event_id

Representa um único evento registrado.

Todo evento possui um identificador próprio.

---

## user_id

Representa um usuário autenticado.

Um mesmo visitor poderá futuramente ser associado a um user.

---

# Hierarquia Oficial

visitor

↓

session

↓

conversation

↓

turn

↓

event

Quando existir autenticação:

visitor

↓

user

↓

session

↓

conversation

↓

turn

↓

event

---

# Eventos

Todo evento deverá possuir um contrato oficial.

Os eventos devem ser:

- consistentes;
- versionáveis;
- documentados.

Nunca utilizar payloads diferentes para eventos equivalentes.

---

# Payload

Todo payload deverá seguir uma estrutura consistente.

Exemplo conceitual:

- identificação
- contexto
- timestamp
- propriedades do evento

Cada evento poderá possuir campos específicos.

---

# Convenções

IDs

Todos os identificadores devem possuir responsabilidade única.

Nomes

Utilizar nomenclatura consistente em todo o projeto.

Versionamento

Mudanças incompatíveis devem gerar nova versão do contrato.

---

# Banco de Dados

A estrutura deverá permitir evolução sem necessidade de remodelagem completa.

Novas métricas devem preferencialmente reutilizar a arquitetura existente.

Sempre evitar duplicação de dados.

---

# Dashboards

Os dashboards nunca serão fonte da verdade.

Eles apenas consomem os dados produzidos pelo Analytics.

---

# Métricas

Toda métrica deverá possuir:

- definição;
- origem;
- objetivo.

Nunca criar métricas sem significado de negócio.

---

# Crescimento

O Analytics deve suportar evolução contínua.

Novas entidades.

Novos eventos.

Novas métricas.

Novos dashboards.

Sem necessidade de reescrever a arquitetura.

---

# Compatibilidade

Sempre preservar compatibilidade quando possível.

Quando ocorrer quebra:

- documentar;
- justificar;
- versionar.

---

# Segurança

Nunca registrar:

- senhas;
- tokens;
- segredos;
- informações sensíveis desnecessárias.

Todos os logs devem ser sanitizados.

---

# Privacidade

Respeitar LGPD.

Sempre coletar apenas o necessário.

Preferir identificadores técnicos.

---

# Critérios de Aprovação

Um patch somente poderá ser considerado concluído quando:

- implementação concluída;
- auditoria aprovada;
- testes unitários aprovados;
- testes de integração aprovados;
- endpoint validado;
- regressões aprovadas;
- deploy realizado;
- validação em produção concluída;
- conversa real validada;
- documentação atualizada.

---

# Evolução

Este documento deverá evoluir conforme novas capacidades forem incorporadas ao Analytics.

As alterações deverão preservar compatibilidade arquitetural sempre que possível.

---

Fim do documento.