# Mercado Livre Developer Escalation — HTTP 403 on Keyword Search

**Project:** Teilor-MIA (MIA Commercial Runtime)  
**Date:** 2026-07-16  
**Environment:** production OAuth callback / Vault record in `production`  
**Internal app reference:** MIA Commercial Runtime — Mercado Livre Public Provider (`mercadolivre_public`)

---

## Summary

MIA integrates Mercado Livre via OAuth 2.0 with encrypted Provider Credential Vault storage. The commercial runtime, priority engine, budget, circuit breaker, cache, dedup, and fallback layers are verified correct.

After OAuth credential completion, we validate the access token against an authorized endpoint and re-test the commercial search path. We request Mercado Livre Developers confirmation on search permissions, app whitelist/certification, and supported endpoints.

---

## Architecture evidence (no secrets)

| Item | Status |
|------|--------|
| Credential source | Provider Credential Vault only |
| Legacy `MERCADOLIVRE_ACCESS_TOKEN` env | Not used operationally |
| OAuth callback | `/api/auth/mercadolivre/callback` |
| Token persistence | Encrypted Supabase `provider_credentials` |
| Refresh engine | Automatic via vault consumer |
| Commercial search endpoint used | `GET /sites/MLB/search?q={keyword}&limit=1` |
| Fallback on ML failure | Google Shopping (verified) |

---

## Vault metadata (sanitized)

| Field | Value |
|-------|-------|
| `provider_id` | `mercadolivre_public` |
| `credential_type` | `oauth_tokens` |
| `environment` (stored) | `production` |
| `status` | `active` |
| `credential_version` | `1` |
| `encryption_key_version` | `1` |
| `issued_at` | `2026-07-15T17:12:34.759Z` |
| `expires_at` | `2026-07-15T23:12:34.759Z` |
| `provider_account_id` | not recorded |
| `scopes` | not recorded |

**Local runtime note:** When `VERCEL_ENV` is unset locally, runtime defaults to Vault environment `development`. OAuth callback on Vercel production persists to `production`. Local validation requires `MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT=production` or completing OAuth in the same environment runtime reads.

---

## Test 1 — Token validation (authorized endpoint)

| Field | Value |
|-------|-------|
| Endpoint | `GET https://api.mercadolibre.com/users/me` |
| Method | GET |
| Authorization | Bearer (from Vault; not included in this report) |
| HTTP status | **200 OK** |
| Validation classification | `oauth_credential_valid` |

**Sanitized identity fields observed:**

- `userId`: `250468467`
- `siteId`: `MLB`
- `countryId`: `BR`

**Refresh evidence:** expired production credential refreshed successfully (`credential_version` 1 → 2).

---

## Test 2 — Restricted commercial keyword search

| Field | Value |
|-------|-------|
| Endpoint | `GET https://api.mercadolibre.com/sites/MLB/search?q=Galaxy%20S24&limit=1` |
| Method | GET |
| Authorization | Bearer present (Vault token, post-refresh) |
| HTTP status | **403 Forbidden** |
| Classification | `external_policy_restriction` |
| Sanitized body | `{"message":"forbidden","error":"forbidden","status":403,"cause":[]}` |
| `x-request-id` | `edafd3b5-3ff5-44be-bc8f-147fe7621094` |

**Conclusion:** Token is valid for `/users/me` but keyword site search remains blocked with Bearer attached.

---

## Official documentation divergence

Mercado Livre documentation (updated 2025-04-07) documents `/sites/{site_id}/search` for **seller-scoped** queries (`seller_id`, `nickname`) with Bearer token. Generic keyword search via `?q=` is no longer documented.

MIA commercial use case requires marketplace keyword discovery (e.g. "Galaxy S24"), not seller inventory listing.

---

## Objective questions for Mercado Livre Developers

1. Is `GET /sites/MLB/search?q={keyword}` still supported for third-party apps? If not, what is the supported replacement for keyword product discovery?
2. Does our application require **whitelist**, **certification**, or **partner approval** for search endpoints?
3. Is `/products/search?site_id=MLB&q={keyword}` the recommended catalog alternative? Which scopes and app permissions are required?
4. When `/users/me` succeeds but site keyword search returns 403, is that expected PolicyAgent behavior for non-certified apps?
5. Are `seller_id` or `nickname` mandatory for all search use cases?
6. Which scopes should be requested during OAuth authorization for commercial search?
7. Is there a sandbox vs production policy difference affecting search?

---

## Request

Please confirm applicable policy for our app and whether search can be enabled via configuration, certification, or alternative documented endpoints.

---

## Attachments available internally

- `scripts/test-mia-mercadolivre-http403-root-cause-audit.js` (05K.2)
- `scripts/test-mia-mercadolivre-oauth-credential-completion-audit.js` (05K.3)
- `scripts/run-mia-mercadolivre-oauth-credential-validation-probe.js` (sanitized JSON output)
- Probe output: `tmp/mercadolivre-oauth-credential-validation-probe.json`

**Not included in this report:** client secret, access token, refresh token, Authorization header, service role key, encryption key, ciphertext, IV, auth tag, cookies, OAuth authorization codes.
