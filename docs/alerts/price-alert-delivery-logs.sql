-- PATCH 9 — Price Alert Delivery Audit Logs
-- MIA / EconomIA — executar manualmente no Supabase SQL Editor
-- Não remove colunas, não apaga dados.

-- ─────────────────────────────────────────────────────────────
-- 1. Tabela de logs de entrega de alertas
-- ─────────────────────────────────────────────────────────────

create table if not exists public.price_alert_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  alert_id uuid null,
  user_id text null,
  event_type text not null,
  severity text default 'info',
  source text null,
  mode text null,
  product_name text null,
  normalized_product_key text null,
  target_price numeric null,
  found_price numeric null,
  found_source text null,
  found_url text null,
  email_sent boolean default false,
  resend_result_id text null,
  reason text null,
  error_code text null,
  error_message text null,
  metadata jsonb default '{}'::jsonb
);

-- ─────────────────────────────────────────────────────────────
-- 2. Índices de consulta operacional
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_price_alert_delivery_logs_created_at
  on public.price_alert_delivery_logs (created_at desc);

create index if not exists idx_price_alert_delivery_logs_alert_id
  on public.price_alert_delivery_logs (alert_id);

create index if not exists idx_price_alert_delivery_logs_user_id
  on public.price_alert_delivery_logs (user_id);

create index if not exists idx_price_alert_delivery_logs_event_type
  on public.price_alert_delivery_logs (event_type);

create index if not exists idx_price_alert_delivery_logs_source
  on public.price_alert_delivery_logs (source);

create index if not exists idx_price_alert_delivery_logs_severity
  on public.price_alert_delivery_logs (severity);

-- ─────────────────────────────────────────────────────────────
-- 3. Consulta útil — últimos eventos por alerta (somente leitura)
-- ─────────────────────────────────────────────────────────────

-- select *
-- from public.price_alert_delivery_logs
-- where alert_id = 'UUID-DO-ALERTA'
-- order by created_at desc
-- limit 50;
