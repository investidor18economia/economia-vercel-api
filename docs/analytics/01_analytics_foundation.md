# Analytics Foundation
## Documento Mestre Oficial
### Teilor / MIA

Versão: 1.0

Status:
Documento oficial da arquitetura do Analytics.

---

# Objetivo

Este documento define a visão, os princípios arquiteturais e as regras permanentes do Analytics da Teilor.

Todo patch, alteração, refatoração ou expansão do Analytics deverá respeitar obrigatoriamente este documento.

Nenhuma decisão futura poderá contradizer estas regras sem atualização oficial desta documentação.

---

# Filosofia

O Analytics da Teilor não existe apenas para contar eventos.

Ele existe para responder perguntas reais sobre o negócio.

Cada evento armazenado deve ser capaz de gerar conhecimento útil para:

- evolução da MIA;
- evolução do Data Layer;
- evolução do produto;
- crescimento da empresa;
- tomada de decisão;
- investidores;
- fundadores.

Nosso objetivo nunca será possuir "muitos dados".

Nosso objetivo é possuir dados confiáveis.

---

# Objetivos do Analytics

O Analytics deverá responder perguntas como:

- Quantas pessoas utilizam a MIA?
- Quantas realmente retornam?
- Quanto tempo permanecem?
- Quais perguntas fazem?
- Quais categorias pesquisam?
- Quais recomendações geram mais conversão?
- Quais produtos geram mais interesse?
- Quais providers possuem melhor qualidade?
- Quanto dinheiro ajudamos os usuários a economizar?
- Quanto arrependimento evitamos?
- Como a qualidade das recomendações evolui ao longo do tempo?

O Analytics deve ajudar tanto o produto quanto o negócio.

---

# Princípios Arquiteturais

## 1. O Analytics nunca interfere na experiência da MIA

A experiência do usuário possui prioridade absoluta.

Caso o Analytics falhe:

- a conversa continua;
- a recomendação continua;
- a aplicação continua.

Analytics sempre será uma camada secundária.

---

## 2. Fire and Forget

O envio dos eventos nunca poderá bloquear:

- respostas;
- recomendações;
- renderização;
- navegação.

Se o Analytics estiver indisponível:

- registrar erro;
- continuar normalmente.

---

## 3. Dados confiáveis acima de quantidade

É preferível possuir:

100 eventos corretos

do que

100.000 eventos inconsistentes.

---

## 4. Semântica acima da implementação

Cada entidade possui um significado único.

Nunca reutilizar campos para finalidades diferentes.

Exemplo:

session_id

sempre representa uma sessão.

Nunca um usuário.

Nunca um visitante.

Nunca um dispositivo.

---

## 5. Toda métrica deve possuir definição oficial

Não podem existir métricas ambíguas.

Cada métrica deve possuir:

- definição;
- origem;
- fórmula;
- limitações.

---

## 6. Arquitetura antes dos dashboards

Primeiro:

dados corretos.

Depois:

consultas.

Depois:

dashboards.

Nunca o contrário.

---

## 7. Analytics é um produto

O Analytics não é um conjunto de tabelas.

Ele é um produto interno da Teilor.

Ele deverá evoluir continuamente.

---

# Escalabilidade

O Analytics deve funcionar corretamente para:

10 usuários.

100 usuários.

1.000 usuários.

10.000 usuários.

100.000 usuários.

1 milhão de usuários.

10 milhões de usuários.

Nenhuma decisão arquitetural poderá limitar esse crescimento.

---

# Entidades Oficiais

O Analytics é organizado em entidades.

Cada entidade possui responsabilidade única.

## Visitor

Representa um visitante persistente.

Não depende de login.

Permanece entre diferentes sessões.

---

## Session

Representa uma sessão de navegação.

Inicia quando o usuário abre a aplicação.

Termina quando essa sessão é encerrada.

Uma Visitor pode possuir diversas Sessions.

---

## Conversation

Representa uma conversa completa com a MIA.

Uma Session pode conter várias Conversations.

---

## Turn

Representa um par:

Pergunta

↓

Resposta

Uma Conversation possui diversos Turns.

---

## Event

Representa qualquer ação registrada.

Exemplos:

- pergunta enviada;
- clique;
- favorito;
- alerta;
- resposta gerada.

---

## User

Representa um usuário autenticado.

Nem todo Visitor será um User.

---

# Hierarquia Oficial

Visitor

↓

Session

↓

Conversation

↓

Turn

↓

Event

Quando existir autenticação:

Visitor

↓

User

↓

Session

↓

Conversation

↓

Turn

↓

Event

Essa hierarquia não deverá ser alterada sem justificativa arquitetural.

---

# O que o Analytics NÃO deve fazer

Nunca:

- alterar recomendações;
- alterar ranking;
- alterar comportamento da MIA;
- alterar decisões da IA.

O Analytics apenas observa.

Nunca decide.

---

# Integração com a Arquitetura da MIA

O Analytics faz parte da arquitetura oficial.

Fluxo simplificado:

Usuário

↓

Interface

↓

MIA

↓

Decision Engine

↓

Resposta

↓

Analytics

Analytics sempre ocorre após o processamento principal.

---

# Fonte da Verdade

A fonte oficial das informações continua sendo:

Data Layer

↓

Decision Engine

↓

Resposta

Analytics nunca substitui essas camadas.

Analytics apenas registra.

---

# Neutralidade

O Analytics deve medir a realidade.

Jamais tentar produzir números "bonitos".

Toda métrica deve refletir exatamente o comportamento observado.

---

# Compatibilidade

Todo patch deve preservar compatibilidade com:

- eventos existentes;
- dashboards existentes;
- consultas existentes;

sempre que possível.

Quando uma quebra for inevitável:

- documentar;
- versionar;
- justificar.

---

# Segurança

Eventos nunca devem conter:

- senhas;
- tokens;
- segredos;
- chaves privadas;
- informações sensíveis desnecessárias.

Logs devem ser sanitizados.

---

# Privacidade

O Analytics deve respeitar:

LGPD.

Dados pessoais somente quando estritamente necessários.

Sempre preferir identificadores técnicos.

---

# Evolução

O Analytics foi projetado para crescer.

Novas entidades.

Novos dashboards.

Novos eventos.

Novas métricas.

Tudo deve ser adicionado sem necessidade de reescrever a arquitetura.

---

# Regra dos Patches

Cada patch possui escopo único.

Nunca resolver problemas de outro patch.

Nunca expandir escopo sem necessidade.

Mudanças pequenas.

Mudanças seguras.

Mudanças auditáveis.

---

# Fluxo Oficial de Implementação

Todo patch deverá seguir obrigatoriamente:

1. Auditoria

2. Implementação

3. Auditoria pós-implementação

4. Testes unitários

5. Testes de integração

6. Endpoint local

7. Regressões

8. Deploy

9. Validação em produção

10. Conversa real pela interface da MIA

11. Aprovação final

Somente após todas essas etapas um patch poderá ser considerado concluído.

---

# Regra Permanente

A arquitetura possui prioridade absoluta.

Sempre que existir conflito entre:

rapidez

e

arquitetura,

a arquitetura vence.

Sempre.

---

# Documento Relacionado

Este documento deve ser utilizado em conjunto com:

- mia_engineering_rules.md
- mia_architecture.md
- mia_roadmap.md
- 02_analytics_roadmap.md
- 03_analytics_specification.md