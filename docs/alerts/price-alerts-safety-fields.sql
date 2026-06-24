-- PATCH 2 — Price Alerts Table Safety Fields
-- MIA / EconomIA — executar manualmente no Supabase SQL Editor
-- Não remove colunas, não apaga dados, não aplica unique constraint automaticamente.

-- ─────────────────────────────────────────────────────────────
-- 1. Campos de segurança, anti-spam e auditoria
-- ─────────────────────────────────────────────────────────────

alter table public.price_alerts
  add column if not exists normalized_product_key text;

alter table public.price_alerts
  add column if not exists monitoring_scope text default 'trusted_sources';

alter table public.price_alerts
  add column if not exists original_product_url text;

alter table public.price_alerts
  add column if not exists original_source text;

alter table public.price_alerts
  add column if not exists last_checked_at timestamptz;

alter table public.price_alerts
  add column if not exists last_checked_price numeric;

alter table public.price_alerts
  add column if not exists last_found_price numeric;

alter table public.price_alerts
  add column if not exists last_found_url text;

alter table public.price_alerts
  add column if not exists last_found_source text;

alter table public.price_alerts
  add column if not exists last_alert_sent_at timestamptz;

alter table public.price_alerts
  add column if not exists last_alert_sent_price numeric;

alter table public.price_alerts
  add column if not exists last_alert_sent_url text;

alter table public.price_alerts
  add column if not exists last_alert_status text;

alter table public.price_alerts
  add column if not exists last_alert_error text;

alter table public.price_alerts
  add column if not exists check_count integer default 0;

alter table public.price_alerts
  add column if not exists email_send_count integer default 0;

alter table public.price_alerts
  add column if not exists created_reason text default 'user_monitor_button';

-- Backfill leve para linhas antigas (opcional, idempotente)
update public.price_alerts
set
  monitoring_scope = coalesce(monitoring_scope, 'trusted_sources'),
  created_reason = coalesce(created_reason, 'user_monitor_button'),
  check_count = coalesce(check_count, 0),
  email_send_count = coalesce(email_send_count, 0),
  normalized_product_key = coalesce(
    normalized_product_key,
    lower(
      regexp_replace(
        regexp_replace(
          translate(
            trim(product_name),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
            'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
          ),
          '[^a-zA-Z0-9\s+.-]',
          ' ',
          'g'
        ),
        '\s+',
        ' ',
        'g'
      )
    )
  )
where normalized_product_key is null
  and product_name is not null
  and trim(product_name) <> '';

-- ─────────────────────────────────────────────────────────────
-- 2. Índices (sem unique constraint neste patch)
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_price_alerts_user_id
  on public.price_alerts (user_id);

create index if not exists idx_price_alerts_normalized_product_key
  on public.price_alerts (normalized_product_key);

create index if not exists idx_price_alerts_is_active
  on public.price_alerts (is_active);

create index if not exists idx_price_alerts_last_checked_at
  on public.price_alerts (last_checked_at);

create index if not exists idx_price_alerts_user_product_active
  on public.price_alerts (user_id, normalized_product_key, is_active);

-- ─────────────────────────────────────────────────────────────
-- 3. Auditoria: duplicados ativos (rodar após migration)
-- ─────────────────────────────────────────────────────────────

-- select
--   user_id,
--   normalized_product_key,
--   count(*) as active_count,
--   array_agg(id order by created_at) as alert_ids
-- from public.price_alerts
-- where is_active = true
--   and normalized_product_key is not null
--   and trim(normalized_product_key) <> ''
-- group by user_id, normalized_product_key
-- having count(*) > 1
-- order by active_count desc;

-- ─────────────────────────────────────────────────────────────
-- 4. SUGESTÃO FUTURA (NÃO EXECUTAR NESTE PATCH)
-- Unique parcial: 1 alerta ativo por usuário por produto normalizado
-- ─────────────────────────────────────────────────────────────

-- create unique index if not exists uq_price_alerts_user_product_active
--   on public.price_alerts (user_id, normalized_product_key)
--   where is_active = true
--     and normalized_product_key is not null
--     and trim(normalized_product_key) <> '';
