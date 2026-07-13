-- PATCH Comercial 05J.5 — Provider Credential Vault
-- MIA / EconomIA — executar manualmente no Supabase SQL Editor
--
-- Objetivo: armazenar credenciais de providers criptografadas (AES-256-GCM).
-- Nunca armazena access_token, refresh_token ou client_secret em plaintext.
--
-- Status: CRIADA LOCALMENTE — NÃO APLICADA REMOTAMENTE PELO PATCH

-- ─────────────────────────────────────────────────────────────
-- 1. Tabela provider_credentials
-- ─────────────────────────────────────────────────────────────

create table if not exists public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  environment text not null,
  credential_type text not null,
  encrypted_payload text not null,
  encryption_iv text not null,
  encryption_auth_tag text not null,
  encryption_key_version integer not null,
  credential_version integer not null default 1,
  issued_at timestamptz null,
  expires_at timestamptz null,
  scopes jsonb null,
  provider_account_id text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_credentials_unique_provider_env_type
    unique (provider_id, environment, credential_type)
);

comment on table public.provider_credentials is
  'Server-only encrypted provider credentials. Plaintext secrets are forbidden.';

-- ─────────────────────────────────────────────────────────────
-- 2. Índices
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_provider_credentials_provider_env
  on public.provider_credentials (provider_id, environment);

create index if not exists idx_provider_credentials_expires_at
  on public.provider_credentials (expires_at);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS + grants (fail closed for browser roles)
-- ─────────────────────────────────────────────────────────────

alter table public.provider_credentials enable row level security;

revoke all on table public.provider_credentials from anon, authenticated, public;
revoke all on table public.provider_credentials from authenticated;
revoke all on table public.provider_credentials from anon;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.provider_credentials to service_role;

-- No policies for anon/authenticated → PostgREST must not expose rows.

-- ─────────────────────────────────────────────────────────────
-- 4. Validação (descomente após aplicar)
-- ─────────────────────────────────────────────────────────────

-- select provider_id, environment, credential_type, status, credential_version, encryption_key_version, expires_at
-- from public.provider_credentials
-- order by updated_at desc
-- limit 5;
