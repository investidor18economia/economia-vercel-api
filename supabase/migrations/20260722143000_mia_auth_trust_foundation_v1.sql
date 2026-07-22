-- PATCH 3.3A — Authentication trust foundation
-- Adds verified-user metadata and OTP challenge storage.
-- Additive, idempotent, no destructive data operations.

begin;

alter table public.users
  add column if not exists name text;

alter table public.users
  add column if not exists email_verified_at timestamptz;

comment on column public.users.name is
  'Display name captured during verified login (PATCH 3.3A). Not used as identity proof.';

comment on column public.users.email_verified_at is
  'Timestamp when email ownership was verified via OTP (PATCH 3.3A). NULL means never verified.';

-- Unique email identity deferred to PATCH 3.3A.1 (email_normalized + preflight).

create table if not exists public.mia_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  token_hash text not null,
  purpose text not null default 'login_otp',
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  pending_name text null,
  created_at timestamptz not null default now()
);

comment on table public.mia_auth_challenges is
  'Short-lived login OTP challenges (PATCH 3.3A). Stores only hashes — never plaintext codes.';

create index if not exists idx_mia_auth_challenges_email_created
  on public.mia_auth_challenges (email_normalized, created_at desc);

create index if not exists idx_mia_auth_challenges_active_expires
  on public.mia_auth_challenges (expires_at)
  where consumed_at is null;

alter table public.mia_auth_challenges enable row level security;

revoke all on table public.mia_auth_challenges from anon, authenticated, public;
grant select, insert, update on table public.mia_auth_challenges to service_role;

commit;
