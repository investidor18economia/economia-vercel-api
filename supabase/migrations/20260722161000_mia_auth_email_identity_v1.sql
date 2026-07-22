-- PATCH 3.3A.1 — Official normalized email identity for public.users.
-- Requires preflight audit before remote apply. Additive only.

begin;

create or replace function public.mia_normalize_auth_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when p_email is null or btrim(p_email) = '' then null
    when length(btrim(p_email)) > 254 then null
    when position('@' in btrim(p_email)) = 0 then null
    when position('.' in btrim(p_email)) = 0 then null
    else lower(btrim(p_email))
  end;
$$;

comment on function public.mia_normalize_auth_email(text) is
  'Official auth email normalization (PATCH 3.3A.1): trim + lowercase + basic format guard.';

alter table public.users
  add column if not exists email_normalized text;

comment on column public.users.email_normalized is
  'Canonical identity email (trim + lowercase). Source of truth for uniqueness (PATCH 3.3A.1).';

update public.users
set email_normalized = public.mia_normalize_auth_email(email)
where email_normalized is null
  and email is not null;

do $guard$
declare
  v_collision_count integer;
begin
  select count(*)
  into v_collision_count
  from (
    select email_normalized
    from public.users
    where email_normalized is not null
    group by email_normalized
    having count(*) > 1
  ) collisions;

  if v_collision_count > 0 then
    raise exception 'mia_auth_email_identity_collision: normalized email duplicates exist (% groups)', v_collision_count;
  end if;
end $guard$;

create unique index if not exists idx_users_email_normalized_unique
  on public.users (email_normalized)
  where email_normalized is not null;

create index if not exists idx_users_email_normalized_lookup
  on public.users (email_normalized);

commit;
