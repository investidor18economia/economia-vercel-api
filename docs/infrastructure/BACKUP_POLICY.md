# BACKUP_POLICY — Política Oficial de Backup

> Política de backup PostgreSQL Teilor-MIA (Supabase).  
> Consolidada após SUPABASE-07A, 07A.1 e 07B.

---

## Índice

1. [Contexto do plano](#1-contexto-do-plano)
2. [Backup oficial atual](#2-backup-oficial-atual)
3. [Como criar backup lógico](#3-como-criar-backup-lógico)
4. [Como validar](#4-como-validar)
5. [Como proteger](#5-como-proteger)
6. [Onde armazenar](#6-onde-armazenar)
7. [Verificação de hashes](#7-verificação-de-hashes)
8. [Restore e limitações](#8-restore-e-limitações)
9. [Dados sensíveis](#9-dados-sensíveis)
10. [Checklist](#10-checklist)
11. [Referências](#11-referências)

---

## 1. Contexto do plano

Validação manual **SUPABASE-07A.1** (Dashboard):

| Recurso | Plano Free (Teilor-MIA) |
|---------|-------------------------|
| Backups automáticos gerenciados | **Indisponíveis** |
| Retenção gerenciada | **Indisponível** |
| PITR | **Indisponível / desabilitado** |
| Download backup Dashboard | **Indisponível** |
| Restore via Dashboard | **Indisponível** |
| Restore para novo projeto | Exige plano Pro+ |

**Conclusão:** proteção operacional depende de **backup lógico manual** + Git (código/migrations).

---

## 2. Backup oficial atual

Backup de referência criado no **SUPABASE-07A** (pré-escrita 07B):

```text
supabase/.temp/backups/SUPABASE-07A/
├── roles.sql           (297 bytes)
├── schema-public.sql   (22.346 bytes)
└── data-public.sql     (745.514 bytes)
```

### Hashes SHA-256 oficiais (arquivo completo)

| Arquivo | SHA-256 |
|---------|---------|
| `roles.sql` | `25873CEC56A2CC6514E204F420231777F85C03DA818CAA7090CDCDFA89776ECD` |
| `schema-public.sql` | `92CBFB8A163159949E4A4111B98F47D4F3949E8AD1720CD60679B2255BA26CCA` |
| `data-public.sql` | `E3631732EE81E2A3E028BA4389F919B9BDB432E3B69882FFB865D19557F2F701` |

Revalidados intactos no **SUPABASE-07B** (gate pré-escrita).

---

## 3. Como criar backup lógico

**Pré-requisito:** CLI autenticada, project ref correto, operação **read-only** (dump).

```powershell
New-Item -ItemType Directory -Force -Path "supabase/.temp/backups/<NOME-CAMPAIGN>"

npx supabase db dump --linked -f supabase/.temp/backups/<NOME-CAMPAIGN>/roles.sql --role-only
npx supabase db dump --linked -f supabase/.temp/backups/<NOME-CAMPAIGN>/schema-public.sql --schema public
npx supabase db dump --linked -f supabase/.temp/backups/<NOME-CAMPAIGN>/data-public.sql --data-only --schema public
```

**Convenção de nome:** `SUPABASE-07A`, `PRE-MIGRATION-YYYYMMDD`, etc.

**Não** sobrescrever backup validado sem investigar hash divergente.

---

## 4. Como validar

```powershell
# Existência e tamanho
Get-ChildItem supabase/.temp/backups/<NOME-CAMPAIGN>

# Hash SHA-256
Get-FileHash supabase/.temp/backups/<NOME-CAMPAIGN>/*.sql -Algorithm SHA256

# Git ignore
git check-ignore -v supabase/.temp/backups/<NOME-CAMPAIGN>/data-public.sql
```

Critérios mínimos:

- [ ] três arquivos existem;
- [ ] tamanho > 0 cada;
- [ ] hash registrado em relatório de patch;
- [ ] pasta gitignored;
- [ ] **não** staged no Git (`git status`).

---

## 5. Como proteger

### Permitido

- armazenar em `supabase/.temp/backups/` (gitignored);
- cópia offline em mídia criptografada controlada pelo operador;
- backup de pasta completa do projeto **sem** `.env.local` em repositório.

### Proibido

- commit no Git;
- upload para GitHub / Gist / chat;
- pasta OneDrive / Google Drive / Dropbox **sincronizada publicamente**;
- enviar `data-public.sql` a serviços externos;
- abrir/reproduzir credenciais do dump em relatórios.

---

## 6. Onde armazenar

| Local | Uso |
|-------|-----|
| `supabase/.temp/backups/` | **Padrão operacional** (temporário, gitignored) |
| Mídia offline criptografada | Cópia de desastre (operador) |
| Supabase Storage | **Não** usar para dumps com secrets |

Documentação de `.temp`:

```text
supabase/.temp/  →  temporário, gitignored, não permanente
                    backups + auditorias + dumps de patch
```

Configurado em `supabase/.gitignore` e `.gitignore` raiz.

---

## 7. Verificação de hashes

Antes de **qualquer** escrita remota:

1. recalcular SHA-256 dos três arquivos;
2. comparar com hashes registrados no último patch aprovado;
3. se divergir → **hard stop** (investigar, não substituir silenciosamente).

PowerShell:

```powershell
Get-FileHash "supabase/.temp/backups/SUPABASE-07A/schema-public.sql" -Algorithm SHA256
```

---

## 8. Restore e limitações

### O que o backup cobre

- PostgreSQL: roles, schema `public`, data `public`

### O que **não** cobre

- Supabase Storage (objetos de bucket);
- configurações Vercel;
- secrets em `.env.local`;
- Auth users (parcialmente em data dump — tratar como sensível).

### Restore

- **Plano Free:** sem restore gerenciado; restore manual exige expertise + decisão explícita.
- **Nunca** restaurar automaticamente após falha de migration — preferir forward-fix.
- Restore total = **procedimento de incidente** documentado em [PROJECT_RECOVERY.md](./PROJECT_RECOVERY.md).

---

## 9. Dados sensíveis

⚠️ **`data-public.sql` pode conter:**

- registros de `provider_credentials` (payload cifrado + metadados);
- emails em `price_alerts`, `users`;
- eventos em `analytics_events`.

**Regras:**

- tratar todo dump como **confidencial**;
- nunca versionar;
- nunca colar em tickets ou chats;
- não inspecionar valores secretos desnecessariamente;
- hashes do **arquivo completo** podem ser registrados; hashes de secrets individuais — não.

---

## 10. Checklist

### Antes de operação remota

- [ ] Backup lógico criado ou revalidado
- [ ] Hashes conferidos
- [ ] Pasta gitignored confirmada
- [ ] Sem sincronização cloud pública
- [ ] Operador ciente de limitações do plano Free

### Periodicidade recomendada (operacional)

- antes de cada patch com escrita remota;
- após mudanças significativas de dados em produção;
- manter **pelo menos um** backup pós-reconciliação (SUPABASE-07A) preservado offline.

---

## 11. Referências

- [PROJECT_RECOVERY.md](./PROJECT_RECOVERY.md)
- [SUPABASE_OPERATIONS.md](./SUPABASE_OPERATIONS.md)
- `supabase/planning/SUPABASE-07A-reconciliation-plan.md`

---

*SUPABASE-08 — política de backup consolidada.*
