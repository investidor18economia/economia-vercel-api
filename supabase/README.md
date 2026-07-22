# Supabase — Teilor / MIA

## Roadmap de oficialização

| Etapa | Escopo | Status |
|-------|--------|--------|
| **SUPABASE-01** | CLI + fundação local (`config.toml`, migrations) | **Atual** |
| SUPABASE-02 | Vincular projeto remoto (`supabase link`) | Pendente |
| SUPABASE-03 | Reconciliar produção × migrations (baseline) | Pendente |
| SUPABASE-04 | Aplicar baseline Analytics em produção | Pendente |
| SUPABASE-05 | Validar produção pós-migration | Pendente |
| SUPABASE-06 | Auditoria final da fundação | Pendente |
| SUPABASE-07 | Atualizar documentação oficial + PROJECT_RECOVERY | Pendente |

---

## SUPABASE-01 — Fundação local (escopo atual)

### Objetivo

Estabelecer a fundação **local** oficial do Supabase no repositório, sem alterar produção.

### Fonte executável oficial

Toda migration estrutural deve existir **somente** em:

```text
supabase/migrations/
```

Convenção Supabase CLI:

```text
YYYYMMDDHHMMSS_descricao.sql
```

Ordem de aplicação = ordem lexicográfica do timestamp.

### Artefatos desta fundação

| Arquivo | Papel |
|---------|-------|
| `supabase/config.toml` | Configuração local oficial gerada por `supabase init` |
| `supabase/migrations/*.sql` | **Única fonte executável** de migrations |
| `supabase/seed.sql` | Seed local (vazio por padrão) |
| `supabase/.gitignore` | Ignora `.branches`, `.temp` e envs locais |
| `docs/analytics/ANALYTICS_SCHEMA.md` | Documentação canônica do Analytics Storage Schema v1 |
| `docs/**/**.sql` (legado) | Patches históricos manuais — **não duplicar** novas migrations |

### CLI oficial

Instalada como **devDependency** do projeto (reprodutível via `package-lock.json`):

```bash
npm run supabase:version
npx supabase --help
```

Preferir scripts npm ou `npx supabase` — evitar depender de instalação global.

### Comandos npm

```bash
npm run supabase:version
npm run test:mia:supabase:foundation
```

### Operações proibidas nesta etapa (SUPABASE-01)

- `supabase link`
- `supabase db push`
- `supabase db pull`
- `supabase migration repair`
- Qualquer alteração remota (RLS, grants, dados, tabelas)

Essas operações pertencem a **SUPABASE-02** em diante, sempre com autorização explícita.

### Desenvolvimento local futuro (não obrigatório no SUPABASE-01)

Quando Docker estiver disponível:

```bash
npx supabase start
npx supabase migration list --local
npx supabase db lint
npx supabase stop
```

### Legado (`docs/`)

Patches anteriores (alerts, commercial vault) usaram SQL manual em `docs/`.  
Novas alterações estruturais devem ir para `supabase/migrations/` apenas.

Reconciliação do legado → **SUPABASE-03**.

### Drift detection

| Mecanismo | Disponível |
|-----------|------------|
| Git history de `supabase/migrations/` | ✅ |
| `supabase migration list --linked` | ⏳ SUPABASE-02+ |
| `supabase db diff` | ⏳ link + shadow DB |
| Inspeção read-only SQL Editor | ✅ (produção) |
