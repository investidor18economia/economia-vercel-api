# Authenticated Identity — `user_id` (PATCH 3.3)

Identidade autenticada no Analytics Teilor/MIA.

---

## 1. Objetivo

Consolidar `user_id` como camada de identidade **autenticada** no Analytics, sem quebrar o uso anônimo e sem permitir que o navegador declare a conta de outra pessoa.

`user_id` complementa — não substitui — `visitor_id`, `session_id` e `conversation_id`.

---

## 2. Fonte oficial

| Atributo | Valor |
|----------|-------|
| **Provedor de conta** | MVP Teilor — registro por e-mail via `/api/register-user` |
| **Identificador imutável** | `public.users.id` (`uuid`, PK) |
| **Sessão** | Token HMAC emitido pelo servidor (`lib/miaUserSessionToken.js`, PATCH 12D) |
| **Não utilizado** | Supabase Auth (`auth.users`), OAuth de usuário final, e-mail como ID analítico |

O token é enviado pelo frontend em `Authorization: Bearer …` (ou `x-mia-session-token`) nos requests de Analytics quando o usuário está logado.

---

## 3. Hierarquia

```text
visitor_id       → navegador/origem (localStorage)
session_id       → aba/sessão (sessionStorage)
conversation_id  → thread do chat (memória MIAChat)
user_id          → conta autenticada (servidor, nullable)
```

---

## 4. Estado anônimo

Antes do login (ou após logout):

```text
user_id = NULL
```

Válido para todos os eventos públicos permitidos, incluindo `session_started`, perguntas, recomendações, cliques, favoritos e alertas conforme produto.

---

## 5. Estado autenticado

Quando `/api/analytics/track` recebe um token de sessão MIA válido:

```text
user_id = public.users.id   (UUID verificado)
```

Resolução exclusivamente server-side (`lib/miaAnalyticsAuth.js` → `resolveAnalyticsTrackInsertUserId`).

Qualquer `user_id` no body HTTP é **ignorado**.

---

## 6. Login

Fluxo real:

1. Usuário informa nome + e-mail no popup (`MIAChat.jsx`).
2. `POST /api/register-user` cria ou recupera linha em `public.users` e devolve `session_token`.
3. Token + usuário persistidos em `localStorage` (`mia_user`).
4. Eventos subsequentes enviam o token no header; a API grava `user_id` oficial.
5. `visitor_id` e `session_id` permanecem conforme ciclo real; `conversation_id` segue o ref in-memory do chat.

Não há backfill de eventos anteriores ao login.

---

## 7. Logout

Ação **Sair da conta** no menu (drawer → CONTA):

- Remove `mia_user` do `localStorage`;
- Limpa estado React do usuário;
- Eventos posteriores voltam a `user_id = NULL`.

Limpar cache local também remove a sessão (`mia_user`) e zera o usuário em memória.

---

## 8. Troca de conta

Cenário: login U1 → logout → login U2 no mesmo navegador.

- Eventos de U1 usam U1 enquanto o token U1 estiver ativo.
- Após logout: `NULL`.
- Eventos de U2 usam U2.
- O mesmo `visitor_id` pode legitimamente aparecer com U1 e U2 em momentos diferentes.
- Nenhum histórico anônimo ou de U1 é reatribuído a U2 automaticamente.

---

## 9. Merge

**Estratégia A — associação prospectiva** (implementada):

| Aspecto | Política |
|---------|----------|
| Eventos antes do login | Permanecem `user_id = NULL` |
| Eventos após login | Recebem `user_id` autenticado |
| Tabela de vínculo dedicada | **Não criada** neste patch |
| Relação visitor ↔ user | Observada implicitamente nos eventos autenticados (`visitor_id` + `user_id`) |

Sem backfill, sem reescrita histórica, sem deduplicação cross-device.

---

## 10. Retroatividade

**Não existe backfill** de `user_id` em eventos históricos neste patch.

---

## 11. Relação visitor ↔ user

Cardinalidade real:

```text
um user_id     → vários visitor_id (dispositivos, storage limpo)
um visitor_id  → vários user_id ao longo do tempo (contas diferentes)
```

Não se presume propriedade permanente de um navegador por uma pessoa.

---

## 12. Eventos (16)

| Evento | Origem legítima de `user_id` |
|--------|------------------------------|
| `session_started` | Token válido no track → UUID; senão `NULL` |
| `mia_question_sent` | Idem |
| `mia_recommendation_shown` | Idem |
| `offer_click` | Idem |
| `favorite_created` | Idem |
| `price_alert_created` | Idem |
| `price_drop_email_attempted` | `alert.user_id` server-side se UUID |
| `price_drop_email_sent` | Idem |
| `price_drop_email_failed` | Idem |
| `price_drop_email_skipped` | Idem |
| `price_drop_email_test_sent` | `NULL` (teste controlado) |
| `price_drop_email_test_failed` | `NULL` |
| `price_drop_email_test_skipped` | `NULL` |
| `price_drop_email_e2e_sent` | `NULL` (E2E controlado) |
| `price_drop_email_e2e_failed` | `NULL` |
| `price_drop_email_e2e_skipped` | `NULL` |

Eventos públicos (6 primeiros): resolução via token no `/api/analytics/track`.

---

## 13. Server-side

Eventos de e-mail usam `alert.user_id` já validado no fluxo de alertas (`price_alerts.user_id`), inseridos diretamente via `service_role` — **não** passam pelo track público.

Não se infere usuário por e-mail no Analytics.

---

## 14. Segurança

| Risco | Mitigação |
|-------|-----------|
| Spoofing de `user_id` no body | Ignorado; só token verificado |
| Token no payload analítico | Proibido; só header HTTP |
| `service_role` no frontend | Não utilizado |
| RLS `analytics_events` | Habilitado; insert via backend |
| Impersonação cross-user | `requireUserSession` nos endpoints de escrita |

---

## 15. Privacidade

Armazenado: `user_id` (UUID pseudônimo interno), `visitor_id`, `session_id`, `conversation_id`, metadados operacionais.

**Não** armazenado em metadata: e-mail, nome, telefone, tokens, senhas, credenciais.

---

## 16. Limitações

- Login MVP: e-mail + nome, sem verificação de e-mail ou senha.
- `session_started` em reload com usuário já logado depende do token estar presente no momento do mount (token restaurado de `localStorage`).
- Sem logout server-side de token (expiração por TTL HMAC); logout local remove credencial do browser.

---

## 17. Fora do escopo

- Cross-device identity graph / CDP
- Merge funcional de favoritos/alertas anônimos
- Supabase Auth migration
- PATCH 3.4 (Retenção / DAU / cohorts)

---

## 18. Referências

| Documento | Conteúdo |
|-----------|----------|
| [VISITOR_ID.md](./VISITOR_ID.md) | Identidade anônima persistente |
| [SESSION_ID.md](./SESSION_ID.md) | Sessão de aba |
| [CONVERSATION_ID.md](./CONVERSATION_ID.md) | Thread do chat |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | 16 eventos |
| [contracts/EVENT_FIELD_SPECIFICATION.md](./contracts/EVENT_FIELD_SPECIFICATION.md) | Campo `user_id` |
| [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) | Coluna física |
| `lib/miaAnalyticsAuth.js` | Resolução server-side |
| `lib/miaUserSessionToken.js` | Emissão/verificação de token |

---

*PATCH 3.3 — Authenticated Identity*
