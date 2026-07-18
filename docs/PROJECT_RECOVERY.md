# PROJECT_RECOVERY

> Documento oficial de recuperação do projeto MIA.
>
> Este documento define a localização oficial do projeto, a política de Git, backups e o procedimento padrão para restaurar o ambiente de desenvolvimento.
>
> Alterações neste documento devem ocorrer apenas quando a infraestrutura oficial do projeto mudar.

---

# Objetivo

Garantir que o projeto possa ser recuperado rapidamente em caso de:

- troca de computador;
- formatação do sistema;
- perda de arquivos;
- corrupção do ambiente;
- sincronização incorreta;
- erro humano.

---

# Localização Oficial do Projeto

O desenvolvimento da MIA deve ocorrer **exclusivamente** na pasta oficial do projeto.

Exemplo:

```text
C:\(PROJETOS) MIA TEILOR OFICIAL\Teilor-MIA
```

Esta é considerada a única cópia oficial para desenvolvimento.

---

# Regra de Ouro

**Nunca desenvolver dentro do OneDrive.**

O OneDrive pode:

- duplicar arquivos;
- criar conflitos;
- alterar datas de modificação;
- causar problemas com Git;
- sincronizar arquivos parcialmente.

Ele pode ser utilizado apenas para armazenar backups, nunca como ambiente de desenvolvimento.

---

# Repositório Oficial

Repositório GitHub:

```text
https://github.com/investidor18economia/economia-vercel-api.git
```

Branch oficial:

```text
master
```

Toda alteração permanente deve passar pelo Git.

---

# Política de Git

Antes de iniciar qualquer desenvolvimento:

```bash
git pull origin master
```

Após concluir um patch:

```bash
git status
```

Adicionar apenas os arquivos necessários:

```bash
git add <arquivo>
```

Criar commit descritivo:

```bash
git commit -m "Descrição objetiva da alteração"
```

Enviar para o repositório:

```bash
git push origin master
```

**Nunca utilizar:**

```bash
git add .
```

Sem verificar cuidadosamente o que será enviado.

---

# Política de Backups

Além do GitHub, manter periodicamente um backup completo da pasta oficial do projeto.

Exemplo:

```text
MIA - BACKUP 2026-07-12
```

O backup deve ser armazenado em local diferente da pasta de desenvolvimento.

---

# Documentos Mestres

Sempre preservar os documentos principais do projeto.

Arquivos essenciais:

```text
mia_architecture.md
mia_engineering_rules.md
mia_roadmap.md
```

Também fazem parte da documentação oficial:

```text
docs/architecture/
```

e todos os documentos de arquitetura criados após o Bloco 12.

---

# Recuperação em Novo Computador

Procedimento recomendado:

1. Instalar Git.

2. Instalar Node.js.

3. Clonar o repositório oficial.

```bash
git clone <repositório>
```

4. Restaurar o arquivo `.env.local`.

5. Instalar dependências.

```bash
npm install
```

6. Executar:

```bash
npm run build
```

7. Confirmar que não existem erros.

8. Executar localmente.

```bash
npm run dev
```

9. Validar os principais endpoints.

10. Continuar o desenvolvimento.

---

# Recuperação após Erro

Caso ocorram alterações inesperadas:

1. Interromper novas modificações.

2. Verificar:

```bash
git status
```

3. Identificar os arquivos alterados.

4. Comparar com o GitHub.

5. Restaurar apenas os arquivos necessários.

Evitar soluções drásticas antes de entender a causa do problema.

---

# Boas Práticas

Sempre:

- trabalhar na pasta oficial;
- manter commits pequenos;
- concluir um patch por vez;
- validar antes do push;
- manter documentação atualizada;
- preservar a arquitetura oficial.

---

# Objetivo Permanente

A recuperação do projeto deve ser um processo previsível, rápido e seguro.

Nenhuma etapa crítica deve depender exclusivamente da memória do desenvolvedor.

---
---

# Disaster Recovery Checklist

> Checklist oficial para recuperação da MIA em caso de indisponibilidade, perda de ambiente, falha de deploy, corrupção de dados ou troca de infraestrutura.
>
> Este procedimento deve ser executado com calma, registrando o resultado de cada etapa.
>
> Não realizar alterações aleatórias antes de identificar a origem do problema.

---

## 1. Interromper alterações

Antes de tentar corrigir o problema:

- não iniciar novos patches;
- não realizar refactors;
- não alterar várias configurações ao mesmo tempo;
- não apagar arquivos ou ambientes;
- registrar quando o problema começou;
- registrar qual foi a última alteração realizada.

Informações iniciais:

```text
Data e hora:

Responsável:

Problema observado:

Último commit conhecido como estável:

Último deploy conhecido como estável:

Serviços afetados:
```

---

## 2. Verificar o repositório GitHub

Confirmar:

- repositório oficial acessível;
- branch oficial disponível;
- último commit correto no GitHub;
- arquivos importantes presentes;
- nenhum segredo enviado ao repositório.

Repositório oficial:

```text
https://github.com/investidor18economia/economia-vercel-api.git
```

Branch oficial:

```text
master
```

Comandos de verificação:

```bash
git status
git branch
git remote -v
git log --oneline -10
```

Não usar:

```bash
git reset --hard
```

antes de confirmar que nenhuma alteração local importante será perdida.

Resultado:

```text
[ ] Repositório acessível
[ ] Branch master confirmada
[ ] Último commit identificado
[ ] Estado local verificado
[ ] Nenhum arquivo importante será perdido
```

---

## 3. Restaurar o código da aplicação

Quando for necessário restaurar em uma nova pasta ou computador:

```bash
git clone https://github.com/investidor18economia/economia-vercel-api.git
```

Entrar na pasta:

```bash
cd economia-vercel-api
```

Confirmar a branch:

```bash
git checkout master
git pull origin master
```

Instalar as dependências:

```bash
npm install
```

Resultado:

```text
[ ] Repositório clonado
[ ] Branch correta
[ ] Dependências instaladas
[ ] Código restaurado
```

---

## 4. Restaurar as variáveis de ambiente

As variáveis secretas não devem depender apenas da memória do desenvolvedor.

Verificar os ambientes:

```text
Local
Vercel Development
Vercel Preview
Vercel Production
```

Confirmar as categorias de variáveis necessárias:

```text
OpenAI
Supabase
Vercel
Resend
SerpAPI
Mercado Livre
Apify
Analytics
Cron
HMAC / sessão
API_SHARED_KEY
Vault / criptografia
URLs públicas
Feature flags
```

Regras:

- nunca copiar valores secretos para documentos versionados;
- nunca salvar tokens diretamente no GitHub;
- restaurar valores a partir de um cofre ou backup seguro;
- verificar cada ambiente separadamente;
- não assumir que Production, Preview e Development possuem os mesmos valores.

Resultado:

```text
[ ] .env.local restaurado
[ ] Variáveis de Development verificadas
[ ] Variáveis de Preview verificadas
[ ] Variáveis de Production verificadas
[ ] Nenhum segredo exposto no Git
```

---

## 5. Verificar o Supabase

Confirmar:

- projeto correto;
- banco acessível;
- tabelas existentes;
- migrations aplicadas;
- políticas RLS;
- funções e triggers;
- dados essenciais;
- chaves de conexão;
- backups disponíveis.

Itens mínimos:

```text
[ ] Projeto Supabase acessível
[ ] Banco responde
[ ] Tabelas principais existem
[ ] analytics_events disponível
[ ] Data Layer disponível
[ ] Favoritos disponíveis
[ ] Alertas de preço disponíveis
[ ] Políticas RLS verificadas
[ ] Service Role protegida
[ ] Backup mais recente identificado
```

Antes de restaurar um backup:

1. identificar o horário da falha;
2. verificar qual informação poderá ser perdida;
3. confirmar o backup correto;
4. evitar restaurar diretamente sobre produção sem análise;
5. registrar o procedimento executado.

Não executar comandos destrutivos sem confirmação.

---

## 6. Validar o domínio

Domínio oficial:

```text
teilor.com.br
```

Confirmar:

```text
[ ] Domínio registrado e ativo
[ ] DNS aponta para a Vercel
[ ] Certificado HTTPS válido
[ ] Redirecionamento correto
[ ] Site abre sem alertas de segurança
[ ] URLs públicas usam o domínio oficial
```

Também verificar:

```text
MIA_PUBLIC_APP_URL
NEXT_PUBLIC_APP_URL
URLs de callback OAuth
URLs usadas nos emails
URLs de frontend e API
```

Enquanto o domínio oficial ainda não estiver configurado, registrar a URL provisória utilizada.

---

## 7. Validar a Vercel

Confirmar:

- projeto correto;
- repositório conectado;
- branch de produção correta;
- variáveis de ambiente;
- histórico de deploys;
- último deploy estável;
- domínio;
- logs de erro.

Checklist:

```text
[ ] Projeto correto na Vercel
[ ] Repositório correto conectado
[ ] Branch master configurada
[ ] Último deploy identificado
[ ] Variáveis de Production verificadas
[ ] Variáveis de Preview verificadas
[ ] Variáveis de Development verificadas
[ ] Domínio configurado
[ ] Logs analisados
```

Quando o problema tiver começado após um deploy:

1. comparar o deploy atual com o último estável;
2. identificar o commit de cada deploy;
3. verificar logs;
4. fazer rollback somente após identificar o deploy correto;
5. validar produção depois do rollback.

---

## 8. Executar build local

Executar:

```bash
npm run build
```

O build deve terminar sem erros.

Depois:

```bash
npm run dev
```

Validar a aplicação localmente.

Resultado:

```text
[ ] Dependências instaladas
[ ] Build compilado com sucesso
[ ] Servidor local iniciado
[ ] Aplicação abre localmente
[ ] Nenhum erro crítico no terminal
```

---

## 9. Validar endpoints essenciais

Testar no ambiente recuperado:

```text
/api/health
/api/ready
/api/mia-chat
/api/analytics
```

Também validar que endpoints internos ou administrativos permanecem bloqueados sem credencial.

Resultado esperado:

```text
[ ] /api/health responde corretamente
[ ] /api/ready responde corretamente
[ ] /api/mia-chat responde corretamente
[ ] requestId está presente
[ ] correlationId está presente quando aplicável
[ ] /api/analytics funciona
[ ] Endpoint de cron permanece protegido
[ ] Core interno permanece protegido
[ ] Endpoints administrativos permanecem protegidos
```

---

## 10. Validar OpenAI

Confirmar:

```text
[ ] API key válida
[ ] Modelo configurado
[ ] Limite ou saldo disponível
[ ] Chamadas funcionando
[ ] Erros tratados corretamente
[ ] Nenhuma chave exposta no frontend
```

Executar uma pergunta real para a MIA e verificar:

- resposta recebida;
- tempo de resposta;
- ausência de erro 401, 403, 429 ou 500;
- preservação do pipeline cognitivo;
- resposta sem informações internas.

---

## 11. Validar Supabase Data Layer

Executar uma consulta de produto conhecido.

Confirmar:

```text
[ ] Produto encontrado
[ ] Aliases funcionando
[ ] Reasoning fields disponíveis
[ ] Preços e especificações acessíveis
[ ] Decision Engine recebe os dados esperados
[ ] Nenhum acesso direto indevido pelo frontend
```

---

## 12. Validar provedores comerciais

Validar separadamente cada provider habilitado.

### Google Shopping / SerpAPI

```text
[ ] Chave disponível
[ ] Limite disponível
[ ] Feature flag correta
[ ] Busca executada somente quando permitida
[ ] Cost Guard funcionando
[ ] Cache funcionando
```

### Mercado Livre

```text
[ ] OAuth configurado
[ ] Redirect URI correta
[ ] Vault acessível
[ ] Credencial disponível
[ ] Refresh token funcionando
[ ] Provider habilitado somente se estiver pronto
[ ] Falhas retornam reason codes controlados
```

### Apify

```text
[ ] Token válido
[ ] Actor correto
[ ] Limites de custo verificados
[ ] Feature flag correta
[ ] Chamadas desnecessárias bloqueadas
```

### Supabase Cache

```text
[ ] Cache acessível
[ ] Dados válidos
[ ] TTL funcionando
[ ] Fallback funcionando
```

Não ativar um provider apenas para fazer o checklist passar.

Providers indisponíveis devem permanecer desabilitados de maneira segura.

---

## 13. Validar Resend e alertas de preço

Confirmar:

```text
[ ] RESEND_API_KEY válida
[ ] Remetente configurado
[ ] Domínio de email verificado
[ ] MIA_PUBLIC_APP_URL correta
[ ] Template renderiza corretamente
[ ] Logo e links funcionam
[ ] Anti-spam funcionando
[ ] Feature flag de envio real correta
```

Executar envio real somente para um email controlado de teste.

Resultado:

```text
[ ] Email recebido
[ ] Assunto correto
[ ] Conteúdo correto
[ ] Links corretos
[ ] Nenhum segredo exposto
[ ] Nenhum disparo duplicado
```

---

## 14. Validar Analytics

Confirmar os eventos essenciais:

```text
mia_question_sent
mia_recommendation_shown
offer_click
favorite_created
price_alert_created
session_started
```

Resultado:

```text
[ ] Eventos chegam ao Supabase
[ ] session_id funciona
[ ] user_id anônimo funciona quando aplicável
[ ] Nenhum dado sensível é enviado
[ ] Dashboards SQL continuam funcionando
[ ] Eventos não são duplicados indevidamente
```

---

## 15. Validar segurança

Confirmar:

```text
[ ] Core interno não está público
[ ] API_SHARED_KEY funciona
[ ] HMAC session funciona
[ ] Cron secrets funcionam
[ ] CORS está restrito
[ ] Rate limit está ativo
[ ] Allowlist está correta
[ ] Sanitização de resposta funciona
[ ] Sanitização de logs funciona
[ ] Dev/test endpoints estão bloqueados em produção
[ ] Sistema falha de forma fechada
```

Nunca considerar a recuperação concluída apenas porque a página inicial abriu.

---

## 16. Validar Shared State e observabilidade

Executar requisições simultâneas e confirmar:

```text
[ ] requestId diferente por requisição
[ ] Estado não vaza entre requisições
[ ] AsyncLocalStorage funciona
[ ] Logs preservam o contexto correto
[ ] Deduplicação ocorre apenas dentro do escopo correto
[ ] Caches continuam application-scoped quando planejado
```

---

## 17. Confirmar produção

Depois das validações locais:

1. enviar apenas alterações necessárias;
2. revisar o commit;
3. fazer push;
4. acompanhar o deploy;
5. executar smoke tests em produção.

Comandos:

```bash
git status
git diff
git add <arquivos específicos>
git commit -m "Recover production environment"
git push origin master
```

Nunca executar:

```bash
git add .
```

sem revisar os arquivos.

Checklist final de produção:

```text
[ ] Deploy concluído
[ ] Domínio abre
[ ] HTTPS válido
[ ] /api/health aprovado
[ ] /api/ready aprovado
[ ] MIA responde
[ ] Recomendação funciona
[ ] Analytics funciona
[ ] Endpoints internos estão protegidos
[ ] Logs não apresentam erro crítico
```

---

## 18. Registrar o incidente

Depois da recuperação, criar um registro contendo:

```text
Data:

Duração da indisponibilidade:

Problema:

Causa raiz:

Impacto:

Como foi identificado:

Como foi corrigido:

Dados perdidos:

Commit da correção:

Deploy da correção:

Ações preventivas:
```

Salvar o relatório em:

```text
docs/incidents/
```

Padrão de nome:

```text
YYYY-MM-DD_NOME_RESUMIDO_DO_INCIDENTE.md
```

Exemplo:

```text
2026-08-15_VERCEL_ENV_MISSING.md
```

---

## 19. Critério de recuperação concluída

A recuperação só pode ser considerada concluída quando:

```text
CÓDIGO                    ✅
GITHUB                    ✅
BUILD                     ✅
VERCEL                    ✅
DOMÍNIO                   ✅
SUPABASE                  ✅
OPENAI                    ✅
PROVIDERS                 ✅
RESEND                    ✅
ANALYTICS                 ✅
SEGURANÇA                 ✅
OBSERVABILIDADE           ✅
PRODUÇÃO                  ✅
INCIDENTE DOCUMENTADO     ✅
```

---

## Regra final

O objetivo do Disaster Recovery não é apenas colocar o site novamente no ar.

O objetivo é restaurar a plataforma com:

- integridade;
- segurança;
- rastreabilidade;
- dados preservados;
- comportamento validado;
- risco controlado.


**Última atualização:** Bloco 12

**Status:** Documento oficial de recuperação do projeto.