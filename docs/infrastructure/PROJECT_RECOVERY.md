# PROJECT_RECOVERY — Recuperação Oficial do Projeto MIA

> **Documento mais importante da infraestrutura.**  
> Descreve como recuperar completamente o projeto Teilor-MIA após troca de máquina, desastre ou erro humano.  
> **Estado refletido:** pós-SUPABASE-07B (produção reconciliada, histórico remoto sincronizado).

---

## Índice

1. [Objetivo](#1-objetivo)
2. [Estrutura oficial](#2-estrutura-oficial)
3. [Em caso de troca de computador](#3-em-caso-de-troca-de-computador)
4. [Em caso de desastre](#4-em-caso-de-desastre)
5. [Fluxo correto de desenvolvimento](#5-fluxo-correto-de-desenvolvimento)
6. [Regras permanentes](#6-regras-permanentes)
7. [Checklist de recuperação](#7-checklist-de-recuperação)
8. [Lições aprendidas](#8-lições-aprendidas)
9. [Referências cruzadas](#9-referências-cruzadas)

---

## 1. Objetivo

Garantir que o projeto possa ser **recuperado por completo** em cenários como:

- troca ou formatação de computador;
- perda de arquivos locais;
- corrupção de ambiente (Docker, Node, CLI);
- sincronização incorreta (OneDrive, cópias duplicadas);
- necessidade de reconstruir ambiente local idêntico ao oficial;
- incidente em produção (com decisão explícita do operador).

Este documento **não substitui** auditoria antes de qualquer escrita remota. Para operações Supabase, consulte [SUPABASE_OPERATIONS.md](./SUPABASE_OPERATIONS.md).

---

## 2. Estrutura oficial

### 2.1 Pasta oficial de desenvolvimento

```text
C:\(PROJETOS) MIA TEILOR OFICIAL\Teilor-MIA
```

Esta é a **única** cópia oficial para desenvolvimento ativo.

**Nunca desenvolver dentro do OneDrive** (ou Google Drive / Dropbox). Sincronização em nuvem pode corromper Git, `.env.local`, backups e `supabase/.temp/`.

### 2.2 GitHub

| Item | Valor |
|------|-------|
| Repositório | `https://github.com/investidor18economia/economia-vercel-api.git` |
| Branch principal | `master` |
| Fonte de verdade | código, migrations, documentação versionada |

### 2.3 Supabase (PostgreSQL)

| Item | Valor |
|------|-------|
| Projeto | Teilor-MIA |
| Project ref | `xzijmzqsquasrtnkotrw` |
| Região | `sa-east-1` |
| PostgreSQL | 17.x |
| Migrations oficiais | `supabase/migrations/` (10 arquivos) |
| Histórico remoto | **sincronizado** (10 local = 10 remote) |

Ver detalhes: [SUPABASE_ARCHITECTURE.md](./SUPABASE_ARCHITECTURE.md), [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md).

### 2.4 Vercel (aplicação)

| Item | Valor |
|------|-------|
| Produção | [https://economia-ai.vercel.app](https://economia-ai.vercel.app) |
| Runtime | Node.js 22.x (Serverless) |
| Variáveis | configuradas no painel Vercel (não versionadas) |

### 2.5 Domínio e app

- Interface pública: `/app-mia`
- API perímetro: `/api/mia-chat`, `/api/analytics/track`, `/api/health`, `/api/ready`

### 2.6 Data Layer (catálogo)

Tabelas de especificações em Supabase `public`:

- `phone_specs`, `notebook_specs`, `product_specs`

Usadas pelo core cognitivo e runtime comercial. Políticas de leitura documentadas em [SUPABASE_ARCHITECTURE.md](./SUPABASE_ARCHITECTURE.md).

### 2.7 Artefatos locais não versionados

| Caminho | Papel |
|---------|-------|
| `.env.local` | Secrets locais — **nunca commitar** |
| `supabase/.temp/` | Backups, auditorias, dumps — **gitignored** |
| `node_modules/` | Dependências npm |

---

## 3. Em caso de troca de computador

### 3.1 Pré-requisitos

Instalar, nesta ordem recomendada:

1. **Git**
2. **Node.js 22.x** (LTS compatível com Vercel)
3. **Docker Desktop** (com WSL2 no Windows)
4. **WSL2** (Ubuntu recomendado — requisito do Docker Desktop no Windows)
5. **Supabase CLI** via projeto: `npm install` (devDependency `supabase@2.109.1`)

### 3.2 Passo a passo

```powershell
# 1. Clonar repositório oficial
git clone https://github.com/investidor18economia/economia-vercel-api.git
cd economia-vercel-api
# Renomear/mover para pasta oficial se necessário:
# C:\(PROJETOS) MIA TEILOR OFICIAL\Teilor-MIA

# 2. Instalar dependências
npm install

# 3. Configurar ambiente
# Copiar .env.local de local seguro (NÃO do Git)
# Ver checklist de variáveis em docs/architecture/SECURITY_MODEL.md

# 4. Iniciar Docker Desktop e aguardar engine ativa
docker version

# 5. Iniciar Supabase local
npx supabase start

# 6. Validar fundação local
npx supabase status
npx supabase migration list --local
npx supabase db reset

# 7. Testes oficiais Supabase
npm run test:mia:supabase:foundation
npm run test:mia:analytics:storage-schema
npm run test:mia:supabase:baseline

# 8. Build
npm run build

# 9. Desenvolvimento
npm run dev
# http://localhost:3000
```

### 3.3 Vincular CLI ao remoto (somente se necessário)

```powershell
npx supabase login
npx supabase link --project-ref xzijmzqsquasrtnkotrw
npx supabase migration list --linked
```

**Hard stop:** confirmar project ref `xzijmzqsquasrtnkotrw` antes de qualquer operação remota.

---

## 4. Em caso de desastre

### 4.1 Quando usar Git

| Cenário | Usar Git |
|---------|----------|
| Recuperar código, migrations, docs | ✅ |
| Restaurar lógica da aplicação | ✅ |
| Recuperar **dados** de produção | ❌ |
| Restaurar **schema remoto** sozinho | ❌ (Git + processo Supabase) |

Git é a fonte de verdade do **repositório**, não do banco remoto.

### 4.2 Quando usar backup lógico

| Cenário | Usar backup lógico |
|---------|-------------------|
| Incidente em produção com perda de dados | ✅ (com decisão explícita) |
| Proteção antes de escrita remota | ✅ |
| Substituir Git | ❌ |
| Versionar no repositório | ❌ **proibido** |

Backup oficial manual (SUPABASE-07A):

```text
supabase/.temp/backups/SUPABASE-07A/
├── roles.sql
├── schema-public.sql
└── data-public.sql   ← pode conter dados sensíveis (ex.: provider_credentials)
```

Política completa: [BACKUP_POLICY.md](./BACKUP_POLICY.md).

### 4.3 Quando usar migration repair

| Cenário | Usar repair |
|---------|-------------|
| Objetos **já existem** fisicamente em produção | ✅ (após equivalência comprovada) |
| Histórico remoto desincronizado do Git | ✅ (controlado, um timestamp por vez) |
| Aplicar SQL de uma migration | ❌ — repair **não executa SQL** |
| Corrigir drift estrutural | ❌ — usar migration corretiva + execução real |

Ver: [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md).

### 4.4 Quando usar restore manual

Restore manual (psql / Supabase restore / novo projeto Pro) é procedimento de **incidente**:

- exige aprovação explícita do operador;
- **não** automatizar após falha de migration;
- preferir **forward-fix** quando possível.

No plano **Free**, restore via Dashboard **não está disponível**. Ver [BACKUP_POLICY.md](./BACKUP_POLICY.md).

### 4.5 Quando **nunca** usar db push sem auditoria

```text
❌ npx supabase db push
```

**Proibido** sem:

1. testes locais verdes;
2. preflight read-only em produção;
3. backup lógico validado;
4. classificação migration por migration (repair vs execução real);
5. autorização explícita do operador.

Motivo: histórico remoto vazio + migrations com tratamentos diferentes (Analytics execução real vs baseline repair) tornam `db push` um batch cego perigoso.

---

## 5. Fluxo correto de desenvolvimento

```text
Git (pull / branch)
        ↓
Docker (engine ativa)
        ↓
Supabase Local (start / db reset)
        ↓
Testes (foundation, analytics, baseline, build)
        ↓
Produção (somente com auditoria + backup + autorização)
        ↓
Validação Interface (conversa real / smoke tests)
        ↓
Conclusão (documentação se necessário)
```

Fluxo detalhado para **nova migration**:

```text
Nova migration
        ↓
Implementação local (supabase/migrations/)
        ↓
Testes (npm run test:mia:supabase:*)
        ↓
db reset (1–2 ciclos)
        ↓
Build (npm run build)
        ↓
Auditoria (preflight read-only remoto)
        ↓
Produção (execução controlada — ver SUPABASE_OPERATIONS)
        ↓
Validação Interface
        ↓
Conclusão
```

---

## 6. Regras permanentes

### Nunca

- desenvolver fora da pasta oficial;
- desenvolver dentro do OneDrive (ou pasta sincronizada);
- alterar produção manualmente no Dashboard SQL Editor sem processo;
- editar migrations **já aplicadas** (criar nova migration corretiva);
- executar `db push` sem auditoria completa;
- versionar `.env.local`, backups, tokens ou dumps completos;
- assumir que `migration repair` corrige estrutura ou dados;
- remover backups lógicos sem substituto validado.

### Sempre

- confirmar project ref antes de operação remota;
- manter `supabase/migrations/` como única fonte executável;
- executar testes locais antes e depois de mudanças estruturais;
- documentar operações remotas em `supabase/planning/` quando aplicável.

---

## 7. Checklist de recuperação

### 7.1 Ambiente novo (máquina limpa)

- [ ] Git instalado
- [ ] Node.js 22.x instalado
- [ ] Docker Desktop + WSL2 ativos
- [ ] Repositório clonado na pasta oficial
- [ ] `npm install` concluído
- [ ] `.env.local` restaurado de local seguro (não Git)
- [ ] `npx supabase start` OK
- [ ] `npx supabase db reset` aplica 10 migrations
- [ ] Foundation 20/20
- [ ] Analytics 100/100
- [ ] Baseline 78/78
- [ ] `npm run build` OK
- [ ] `npm run dev` OK

### 7.2 Antes de qualquer escrita remota

- [ ] Project ref = `xzijmzqsquasrtnkotrw`
- [ ] Backup lógico existe, tamanho > 0, hash validado
- [ ] Backup **não** em pasta sincronizada publicamente
- [ ] Preflight read-only executado
- [ ] Plano de repair vs execução real documentado
- [ ] Operador aprovou explicitamente

### 7.3 Pós-incidente

- [ ] Estado registrado (migration list, contagens agregadas)
- [ ] Forward-fix ou restore decidido explicitamente
- [ ] Smoke tests e validação interface
- [ ] Documentação atualizada se procedimento mudou

---

## 8. Lições aprendidas

Registro oficial do roadmap Supabase (2026):

| Lição | Detalhe |
|-------|---------|
| **Baseline** | Produção MVP existia sem histórico CLI; baseline documentou estado físico sem reexecutar SQL cegamente. |
| **Backup** | Plano Free não oferece PITR nem backup gerenciado; backup lógico manual é proteção obrigatória antes de escrita. |
| **Auditoria** | Preflight read-only + classificação A/B/C/D/E evitou execução destrutiva. |
| **Repair ≠ migration** | `repair --status applied` só altera histórico; não cria tabelas, RLS ou índices. |
| **db push** | Batch de 10 migrations com tratamentos diferentes é inaceitável sem gates individuais. |
| **Validação interface** | API saudável não substitui conversa real; smoke via `/api/mia-chat` e interface confirmam regressão funcional. |
| **Analytics** | Schema (53000) e Security (53001) são migrations distintas; segurança exige execução real, não só repair. |
| **Timestamps** | Analytics anteriores ao baseline cronologicamente; ordem de execução local ≠ ordem conceitual — ambas documentadas. |
| **Índices legados** | Coexistência de índices legados e oficiais é aceitável; remoção fica para patch futuro opcional. |

Histórico completo: [CHANGELOG_SUPABASE.md](./CHANGELOG_SUPABASE.md).

---

## 9. Referências cruzadas

| Documento | Conteúdo |
|-----------|----------|
| [SUPABASE_OPERATIONS.md](./SUPABASE_OPERATIONS.md) | Comandos operacionais |
| [SUPABASE_ARCHITECTURE.md](./SUPABASE_ARCHITECTURE.md) | Arquitetura local/remota |
| [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) | As 10 migrations oficiais |
| [BACKUP_POLICY.md](./BACKUP_POLICY.md) | Política de backup |
| [CHANGELOG_SUPABASE.md](./CHANGELOG_SUPABASE.md) | Cronologia do roadmap |
| `supabase/planning/SUPABASE-07B-execution-report.md` | Evidência da reconciliação |
| `docs/analytics/ANALYTICS_SCHEMA.md` | Contrato Analytics Storage v1 |

---

*Última consolidação: SUPABASE-08 — Documentação Oficial + PROJECT_RECOVERY.*
