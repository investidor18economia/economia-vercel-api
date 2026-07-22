# Email Identity Policy — PATCH 3.3A.1

Política oficial de normalização e unicidade de e-mail para autenticação.

---

## 1. Normalização oficial

Fonte de verdade: **backend + banco** (`public.mia_normalize_auth_email`).

```text
String(email)
→ trim (btrim)
→ lowercase
→ validação básica (@ e . presentes, max 254)
```

### Não aplicar

- remoção de `+alias`
- remoção de pontos (Gmail)
- canonicalização por domínio
- transformação Unicode agressiva

Aliases `user+tag@domain` e `first.last@domain` permanecem distintos.

---

## 2. Colunas

| Coluna | Uso |
|--------|-----|
| `email` | Valor legível (normalizado na criação pós-OTP) |
| `email_normalized` | Identidade canônica + unicidade |

Lookup de login: `email_normalized`.

---

## 3. Unicidade

```sql
CREATE UNIQUE INDEX idx_users_email_normalized_unique
ON public.users (email_normalized)
WHERE email_normalized IS NOT NULL;
```

Expressão idêntica à função `mia_normalize_auth_email`.

---

## 4. Preflight obrigatório

Antes de migration remota:

```bash
npm run audit:mia:auth:email-preflight
```

Verifica: total, nulos, vazios, espaços, maiúsculas, duplicações exatas e normalizadas.

Se houver colisão normalizada:

```text
PATCH 3.3A.1 INTERROMPIDO — DUPLICAÇÃO DE IDENTIDADE
```

Nenhuma correção automática. Plano separado necessário.

---

## 5. Backfill

Migration `20260722161000`:

```sql
UPDATE users SET email_normalized = mia_normalize_auth_email(email)
WHERE email_normalized IS NULL AND email IS NOT NULL;
```

Falha com exceção se colisões normalizadas existirem.

---

## 6. Frontend

`normalizeAuthEmail` em `lib/miaAuthEmailNormalize.js` espelha backend para UX.

Decisões de segurança usam sempre valor re-normalizado no servidor.

---

## 7. Privacidade

Preflight e logs mascaram e-mails (`ab***@d***.com`).

---

*PATCH 3.3A.1 — Email Identity Policy*
