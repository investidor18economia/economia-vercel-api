# Provider Credential Vault (PATCH 05J.5)

## Objective

Server-only encrypted storage for third-party provider credentials (OAuth tokens first). Mercado Livre is the first consumer; the vault contract is provider-agnostic.

## Boundaries

| Layer | Responsibility |
|-------|----------------|
| `providerCredentialEncryption.js` | AES-256-GCM encrypt/decrypt |
| `providerCredentialVault.js` | Generic persist/read/revoke/metadata |
| `mercadolivreOAuthTokenPersistence.js` | Mercado Livre OAuth mapping |

The vault is **not** a commercial engine, HTTP client, OAuth engine, or frontend secret manager.

## Server-only rule

Modules under `lib/server/` and persistence consumers must **never** be imported from React client components.

Supabase access uses:

- `NEXT_PUBLIC_SUPABASE_URL` (URL only)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never `NEXT_PUBLIC_`)

Reuse: `lib/supabaseClient.js` (`getSupabaseAdminClient`).

## Encryption

- Algorithm: **AES-256-GCM**
- Key env: `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` (Base64 → exactly 32 bytes)
- Key version env: `PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION` (default `1`)
- IV: 12 random bytes per write (never reused)
- Auth tag: stored separately
- AAD binds: `providerId|environment|credentialVersion|keyVersion`

Encrypted blob payload (JSON before encryption):

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer"
}
```

The database stores **only** ciphertext, IV, auth tag, and metadata.

## Database

Table: `provider_credentials`

Unique key: `(provider_id, environment, credential_type)`

Migration file (manual apply):

`docs/commercial/provider-credentials.sql`

**Not applied remotely by the patch.**

RLS enabled; no policies for `anon` / `authenticated`; grants revoked from public roles; `service_role` only.

## Environment isolation

Resolved via `resolveProviderCredentialEnvironment()`:

| Context | Value |
|---------|-------|
| Vercel production | `production` |
| Vercel preview | `preview` |
| Vercel development | `development` |
| `NODE_ENV=test` | `test` |
| default local | `development` |

Production credentials cannot share a row with development (`environment` is part of the unique key).

## Mercado Livre persistence

| Field | Value |
|-------|-------|
| providerId | `mercadolivre_public` |
| credentialType | `oauth_tokens` |

Enable with:

`MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED=true`

Requires:

- valid encryption key
- Supabase service role configured
- migration applied

## Read path

`readMercadoLivreOAuthTokens()` — server-only, decrypts on demand, classifies:

- `active`
- `expiring_soon`
- `expired`
- `revoked`
- `missing`
- `decrypt_failed`
- `configuration_missing`

Skew env: `PROVIDER_CREDENTIAL_EXPIRY_SKEW_SECONDS` (default `300`).

## Temporary env fallback

`resolveMercadoLivreAccessTokenSource({ allowEnvFallback: true })`:

1. Vault primary when configured and active
2. `MERCADOLIVRE_ACCESS_TOKEN` env only when explicitly allowed

Diagnostics expose `envFallbackActive: true` — never silent dual sources.

**Remove env fallback after migration.**

## Revocation

`revokeMercadoLivreOAuthTokens()` marks `status = revoked` (internal only, no public endpoint).

## Key rotation (future)

Records store `encryption_key_version`. Unknown version → fail closed. Automatic rotation is **not** implemented in 05J.5.

## Required secrets (manual)

| Env | Purpose |
|-----|---------|
| `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` | AES-256 key (Base64, 32 bytes) |
| `PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION` | Current key version |
| `SUPABASE_SERVICE_ROLE_KEY` | Server DB access |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED` | Opt-in persistence |
| `MERCADOLIVRE_OAUTH_STATE_SECRET` | OAuth CSRF state (05J.4) |

Generate encryption key locally (do not commit output):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Manual rollout

1. Apply `docs/commercial/provider-credentials.sql` in Supabase SQL Editor
2. Generate and set `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` (local + Vercel, per environment)
3. Set `MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED=true`
4. Ensure `MERCADOLIVRE_OAUTH_STATE_SECRET` is configured
5. Redeploy
6. Run OAuth once (authorized) — tokens persist encrypted, browser receives booleans only

## Rollback

1. Set `MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED=false`
2. Revoke ML authorization in Developers panel
3. Optionally `update provider_credentials set status='revoked' ...`
4. Redeploy previous build if needed

Do **not** drop the table if ciphertext may be needed for audit.

## Incident response

1. Revoke provider authorization
2. Rotate `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` (future: re-encrypt rows)
3. Rotate `SUPABASE_SERVICE_ROLE_KEY` if exposed
4. Mark credentials revoked in vault
5. Never paste tokens in chat, logs, or tickets

## Future provider integration

1. Map provider OAuth fields in a thin adapter
2. Choose official `providerId` from registry
3. Call `persistProviderCredentials()` with `credentialType`
4. Read via `readProviderCredentials()` server-side only

Do not add provider HTTP logic to the vault.

## Security hardening (05J.5.1)

### Logging and diagnostics policy

- Never log, trace, or return: access/refresh tokens, authorization codes, client secrets, encryption keys, ciphertext, IV, auth tags, OAuth cookies, decrypted payloads, raw token endpoint responses.
- Use `sanitizeProviderSensitiveDiagnostics()` / `sanitizeProviderCredentialDiagnostics()` at vault boundaries.
- OAuth HTTP/log surfaces reuse the same sanitizer via `mercadolivreOAuthSanitization.js`.
- Safe diagnostics only: `providerId`, `environment`, `credentialType`, `readiness`, `status`, `reasonCode`, `expiresAt`, `issuedAt`, `credentialVersion`, `encryptionKeyVersion`, boolean `*Received` flags.
- No token prefixes, suffixes, or hashes in diagnostics.

### Fail-fast policy

- `assertProviderCredentialEncryptionReadiness()` — strict Base64, exact 32-byte key, valid key version; never exposes key material.
- `assertProviderCredentialVaultReadiness()` — encryption + Supabase service role (when persistence/read requires DB).
- When `MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED=true` but vault config is invalid, persistence fails **before** encrypt/write (`token_persistence_configuration_invalid`).
- When persistence is disabled, unrelated application paths are unaffected.

### Plaintext memory policy

- **No persistent plaintext token cache** in the vault (`PROVIDER_CREDENTIAL_VAULT_PLAINTEXT_CACHE_ENABLED = false`).
- Decrypt-on-demand only; credentials returned to authorized server-side callers in local scope.
- No integration with Universal Commercial Cache or request deduplication.
- **Node.js limitation:** strings are immutable; the runtime does not guarantee secure erasure or zeroization. Avoid extra copies, serialization, module-level retention, and long-lived closures. `Buffer.fill(0)` applies only to controlled buffers during crypto operations — not a guarantee of process memory cleanup.

### Residual risks

- Process memory may retain decrypted strings until GC.
- `service_role` or encryption key compromise bypasses vault protections.
- Supabase admin log in non-production (`[Supabase Admin] client ready`) logs role only — not credentials.


Protected against:

- anon/authenticated DB reads (RLS + revoke)
- browser exposure (no tokens in HTTP responses)
- log/tracer leaks (sanitized diagnostics)
- ciphertext tampering (GCM auth tag + AAD)
- cross-provider / cross-environment blob reuse (AAD + unique key)
- missing/invalid encryption key (fail closed)

Not absolute security — service role compromise + key compromise still exposes secrets.
