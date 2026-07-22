-- PATCH 3.3A.1 — Distributed auth abuse protection (Postgres-backed rate limits + atomic RPC).
-- Additive, idempotent, no destructive data operations.

begin;

create table if not exists public.mia_auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  blocked_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mia_auth_rate_limits_scope_key_window_unique
    unique (scope, key_hash, window_started_at)
);

comment on table public.mia_auth_rate_limits is
  'Distributed auth rate-limit counters (PATCH 3.3A.1). Stores hashed keys only — no raw email/IP.';

create index if not exists idx_mia_auth_rate_limits_scope_window
  on public.mia_auth_rate_limits (scope, window_started_at);

alter table public.mia_auth_rate_limits enable row level security;

revoke all on table public.mia_auth_rate_limits from anon, authenticated, public;
grant select, insert, update, delete on table public.mia_auth_rate_limits to service_role;

alter table public.mia_auth_challenges
  add column if not exists delivery_sent_at timestamptz null;

alter table public.mia_auth_challenges
  add column if not exists delivery_failed_at timestamptz null;

comment on column public.mia_auth_challenges.delivery_sent_at is
  'Set after OTP email delivery succeeds (PATCH 3.3A.1). Verification requires this timestamp.';

comment on column public.mia_auth_challenges.delivery_failed_at is
  'Set when OTP email delivery fails; challenge is invalidated (PATCH 3.3A.1).';

create or replace function public.mia_auth_consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_max_requests integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_epoch bigint := floor(extract(epoch from v_now))::bigint;
  v_window_start timestamptz := to_timestamp((v_epoch / p_window_seconds) * p_window_seconds);
  v_count integer;
  v_retry_after integer;
begin
  if p_scope is null or btrim(p_scope) = '' or p_key_hash is null or btrim(p_key_hash) = '' then
    return jsonb_build_object(
      'allowed', false,
      'reason_code', 'auth_rate_limit_invalid',
      'retry_after_seconds', 60
    );
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 or p_max_requests is null or p_max_requests <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason_code', 'auth_rate_limit_invalid',
      'retry_after_seconds', 60
    );
  end if;

  insert into public.mia_auth_rate_limits as rl (
    scope,
    key_hash,
    window_started_at,
    request_count
  ) values (
    p_scope,
    p_key_hash,
    v_window_start,
    1
  )
  on conflict on constraint mia_auth_rate_limits_scope_key_window_unique
  do update set
    request_count = rl.request_count + 1,
    updated_at = v_now
  returning request_count into v_count;

  if v_count > p_max_requests then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))
    );
    return jsonb_build_object(
      'allowed', false,
      'scope', p_scope,
      'reason_code', 'auth_rate_limited',
      'retry_after_seconds', v_retry_after
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'retry_after_seconds', 0
  );
end;
$$;

create or replace function public.mia_auth_request_challenge(
  p_email_normalized text,
  p_email_key_hash text,
  p_origin_key_hash text,
  p_challenge_id uuid,
  p_token_hash text,
  p_pending_name text,
  p_expires_at timestamptz,
  p_window_seconds integer default 900,
  p_max_per_email integer default 3,
  p_max_per_origin integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email_limit jsonb;
  v_origin_limit jsonb;
begin
  if p_email_normalized is null or btrim(p_email_normalized) = '' then
    return jsonb_build_object('ok', false, 'reason_code', 'auth_invalid_email');
  end if;

  if p_challenge_id is null or p_token_hash is null or btrim(p_token_hash) = '' then
    return jsonb_build_object('ok', false, 'reason_code', 'internal_error');
  end if;

  if p_expires_at is null or p_expires_at <= v_now then
    return jsonb_build_object('ok', false, 'reason_code', 'internal_error');
  end if;

  perform pg_advisory_xact_lock(hashtext('mia_auth_req:' || p_email_normalized));

  v_email_limit := public.mia_auth_consume_rate_limit(
    'request_email',
    p_email_key_hash,
    p_window_seconds,
    p_max_per_email
  );

  if coalesce((v_email_limit ->> 'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'ok', false,
      'reason_code', 'auth_rate_limited',
      'scope', coalesce(v_email_limit ->> 'scope', 'email'),
      'retry_after_seconds', coalesce((v_email_limit ->> 'retry_after_seconds')::integer, 60)
    );
  end if;

  v_origin_limit := public.mia_auth_consume_rate_limit(
    'request_origin',
    p_origin_key_hash,
    p_window_seconds,
    p_max_per_origin
  );

  if coalesce((v_origin_limit ->> 'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'ok', false,
      'reason_code', 'auth_rate_limited',
      'scope', coalesce(v_origin_limit ->> 'scope', 'origin'),
      'retry_after_seconds', coalesce((v_origin_limit ->> 'retry_after_seconds')::integer, 60)
    );
  end if;

  update public.mia_auth_challenges
  set consumed_at = v_now
  where email_normalized = p_email_normalized
    and purpose = 'login_otp'
    and consumed_at is null;

  insert into public.mia_auth_challenges (
    id,
    email_normalized,
    token_hash,
    purpose,
    expires_at,
    attempt_count,
    max_attempts,
    pending_name
  ) values (
    p_challenge_id,
    p_email_normalized,
    p_token_hash,
    'login_otp',
    p_expires_at,
    0,
    5,
    nullif(btrim(coalesce(p_pending_name, '')), '')
  );

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id
  );
end;
$$;

create or replace function public.mia_auth_mark_challenge_delivered(
  p_challenge_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer;
begin
  update public.mia_auth_challenges
  set delivery_sent_at = v_now
  where id = p_challenge_id
    and consumed_at is null
    and delivery_failed_at is null
    and delivery_sent_at is null;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'reason_code', 'auth_challenge_not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mia_auth_mark_challenge_delivery_failed(
  p_challenge_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  update public.mia_auth_challenges
  set
    delivery_failed_at = v_now,
    consumed_at = coalesce(consumed_at, v_now)
  where id = p_challenge_id
    and consumed_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mia_auth_verify_challenge(
  p_challenge_id uuid,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.mia_auth_challenges%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_challenge_id is null then
    return jsonb_build_object('ok', false, 'reason_code', 'auth_challenge_not_found');
  end if;

  select *
  into v_challenge
  from public.mia_auth_challenges
  where id = p_challenge_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason_code', 'auth_challenge_not_found');
  end if;

  if v_challenge.consumed_at is not null then
    return jsonb_build_object('ok', false, 'reason_code', 'auth_challenge_consumed');
  end if;

  if v_challenge.expires_at <= v_now then
    return jsonb_build_object('ok', false, 'reason_code', 'auth_challenge_expired');
  end if;

  if v_challenge.delivery_failed_at is not null or v_challenge.delivery_sent_at is null then
    return jsonb_build_object('ok', false, 'reason_code', 'auth_challenge_delivery_failed');
  end if;

  if v_challenge.attempt_count >= v_challenge.max_attempts then
    return jsonb_build_object('ok', false, 'reason_code', 'auth_challenge_attempts_exceeded');
  end if;

  if p_code_hash is not null
     and btrim(p_code_hash) <> ''
     and v_challenge.token_hash = btrim(p_code_hash) then
    update public.mia_auth_challenges
    set consumed_at = v_now
    where id = p_challenge_id;

    return jsonb_build_object(
      'ok', true,
      'email_normalized', v_challenge.email_normalized,
      'pending_name', v_challenge.pending_name
    );
  end if;

  update public.mia_auth_challenges
  set attempt_count = attempt_count + 1
  where id = p_challenge_id;

  return jsonb_build_object('ok', false, 'reason_code', 'auth_code_invalid');
end;
$$;

revoke all on function public.mia_auth_consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.mia_auth_request_challenge(text, text, text, uuid, text, text, timestamptz, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.mia_auth_mark_challenge_delivered(uuid) from public, anon, authenticated;
revoke all on function public.mia_auth_mark_challenge_delivery_failed(uuid) from public, anon, authenticated;
revoke all on function public.mia_auth_verify_challenge(uuid, text) from public, anon, authenticated;

grant execute on function public.mia_auth_consume_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.mia_auth_request_challenge(text, text, text, uuid, text, text, timestamptz, integer, integer, integer) to service_role;
grant execute on function public.mia_auth_mark_challenge_delivered(uuid) to service_role;
grant execute on function public.mia_auth_mark_challenge_delivery_failed(uuid) to service_role;
grant execute on function public.mia_auth_verify_challenge(uuid, text) to service_role;

commit;
