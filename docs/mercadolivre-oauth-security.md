# Mercado Livre OAuth Security (PATCH 05J.4)

## Scope

This document covers the isolated Mercado Livre OAuth flow used by the commercial runtime preparation path. It does **not** change the Commercial Runtime, Priority Engine, adapters, or MIA cognition.

Routes:

- `GET /api/auth/mercadolivre/start`
- `GET /api/auth/mercadolivre/callback`

Registered redirect URI (unchanged):

`https://economia-ai.vercel.app/api/auth/mercadolivre/callback`

Application: **MIA Teilor** (Mercado Livre Developers).

---

## Current flow

1. Operator opens `/api/auth/mercadolivre/start`.
2. Server validates OAuth env + state secret.
3. Server generates cryptographically random `state`.
4. Server stores a signed proof in an **HttpOnly** cookie (`mia_ml_oauth_state`).
5. Browser is redirected to Mercado Livre authorization.
6. Mercado Livre redirects back to `/api/auth/mercadolivre/callback?code=...&state=...`.
7. Callback validates `state` **before** exchanging `code`.
8. Callback exchanges `authorization_code` server-side.
9. Callback attempts secure persistence hook.
10. Callback returns a **sanitized** response with booleans only.

---

## State protection

- Generated with `crypto.randomBytes(32)`.
- Signed with HMAC-SHA256 using `MERCADOLIVRE_OAUTH_STATE_SECRET`.
- Stored in an HttpOnly cookie (`Path=/api/auth/mercadolivre`).
- Max age: **10 minutes**.
- Single use: cookie is cleared on callback (success or failure).
- Missing/invalid/expired/reused state blocks token exchange.

Required env:

- `MERCADOLIVRE_OAUTH_STATE_SECRET` (minimum 16 characters, server-only)

Do **not** reuse `MERCADOLIVRE_CLIENT_SECRET` as the state secret.

---

## Cookie policy

| Attribute | Value |
|-----------|-------|
| HttpOnly | yes |
| Secure | yes in production / Vercel |
| SameSite | Lax |
| Path | `/api/auth/mercadolivre` |
| Max-Age | 600 seconds |

The cookie never contains access tokens, refresh tokens, or client secrets.

---

## Tokens never return to the browser

The callback **must not** return:

- `access_token`
- `refresh_token`
- `client_secret`
- `Authorization`
- raw provider token payloads

Allowed success response (example shape):

```json
{
  "ok": true,
  "authorizationCompleted": true,
  "accessTokenReceived": true,
  "refreshTokenReceived": true,
  "expiresInReceived": true,
  "tokenTypeReceived": true,
  "tokenPersistenceStatus": "not_configured",
  "nextStep": "Configure secure token persistence before using the integration."
}
```

No secret values are included.

---

## Why copying tokens from the browser is unsafe

- Browser responses can be cached, screenshotted, forwarded, or logged by extensions.
- Tokens in JSON responses leak through support channels and chat.
- Revoked or exposed tokens must be rotated manually in Mercado Livre Developers.
- The MIA commercial runtime expects server-side secrets, not client-visible credentials.

**Never share tokens in chat, prints, logs, or tickets.**

---

## Token persistence status

PATCH **05J.5** implements secure persistence via **Provider Credential Vault**.

See: `docs/provider-credential-vault.md`

When persistence is enabled (`MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED=true`) and configured:

- tokens are encrypted with AES-256-GCM before Supabase upsert;
- callback returns `tokenPersistenceStatus: "persisted"`;
- browser still receives **no secret values**.

When persistence is **not** enabled:

- default status remains **`not_configured`**;
- callback honestly reports that tokens were **not** persisted;
- **do not repeat OAuth** until vault env + migration are ready.

When persistence **fails** after token exchange:

- callback returns safe error (`token_persistence_failed`);
- tokens are **not** returned to the browser;
- operator must fix vault config and repeat OAuth.

When persistence is **enabled but misconfigured** (05J.5.1 fail-fast):

- callback returns safe error (`token_persistence_configuration_invalid` / `token_persistence_failed`);
- validation runs **before** encrypt/persist;
- tokens are **not** returned to the browser.

PATCH **05J.5.1** hardening: consolidated sanitizer, strict encryption key validation, no plaintext token cache. See `docs/provider-credential-vault.md` § Security hardening.

Migration (manual): `docs/commercial/provider-credentials.sql`

---

## Required environment variables

| Variable | Purpose |
|----------|---------|
| `MERCADOLIVRE_CLIENT_ID` | OAuth app id |
| `MERCADOLIVRE_CLIENT_SECRET` | OAuth app secret (server only) |
| `MERCADOLIVRE_REDIRECT_URI` | Must match ML Developers panel |
| `MERCADOLIVRE_OAUTH_STATE_SECRET` | HMAC secret for OAuth state cookie |
| `MERCADOLIVRE_SITE_ID` | Site id (default `MLB`) |
| `MERCADOLIVRE_ACCESS_TOKEN` | Runtime bearer (server env only, after secure persistence exists) |

Optional metadata (recommended after persistence exists):

- `MERCADOLIVRE_REFRESH_TOKEN`
- `MERCADOLIVRE_TOKEN_ISSUED_AT`
- `MERCADOLIVRE_TOKEN_EXPIRES_IN`
- `MERCADOLIVRE_TOKEN_EXPIRES_AT`

Never commit real values.

---

## Revocation procedure

If tokens were exposed:

1. Revoke authorization in Mercado Livre Developers for **MIA Teilor**.
2. Rotate `MERCADOLIVRE_CLIENT_SECRET` if compromise is suspected.
3. Rotate `MERCADOLIVRE_OAUTH_STATE_SECRET`.
4. Remove old `MERCADOLIVRE_ACCESS_TOKEN` / refresh values from all environments.
5. Implement secure persistence **before** repeating OAuth.

---

## Checklist before repeating OAuth

- [ ] Previous exposed tokens revoked in ML Developers.
- [ ] `MERCADOLIVRE_OAUTH_STATE_SECRET` configured in local + Vercel.
- [ ] Redirect URI unchanged and matches ML panel exactly.
- [ ] Secure persistence strategy chosen and implemented.
- [ ] No expectation of copying tokens from browser JSON.
- [ ] Commercial probe uses server env only (never browser response).
- [ ] Apify monthly limit respected (no Apify fallback during ML OAuth work).

---

## Error codes (safe)

- `oauth_state_missing`
- `oauth_state_invalid`
- `oauth_state_expired`
- `oauth_state_reused`
- `authorization_code_missing`
- `token_exchange_failed`
- `token_persistence_not_configured`
- `oauth_configuration_incomplete`
- `oauth_denied`

Errors never include raw provider bodies, authorization codes, or secrets.
