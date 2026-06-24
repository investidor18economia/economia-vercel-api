-- PATCH 9b — Permissions for price_alert_delivery_logs
-- MIA / EconomIA — executar manualmente no Supabase SQL Editor
--
-- Pré-requisito: docs/alerts/price-alert-delivery-logs.sql (PATCH 9)
--
-- Contexto do backend atual:
--   lib/supabaseClient.js usa SUPABASE_SERVICE_ROLE_KEY
--   → papel PostgreSQL: service_role (bypassa RLS no Supabase)
--
-- Erro alvo: permission denied for table price_alert_delivery_logs (SQLSTATE 42501)
--
-- Regras deste patch:
--   • Não apaga dados
--   • Não dropa tabela
--   • Não altera colunas
--   • Não altera outras tabelas
--   • Idempotente (pode rodar mais de uma vez)

-- ─────────────────────────────────────────────────────────────
-- 1. Garantir acesso ao schema public (service_role)
-- ─────────────────────────────────────────────────────────────

grant usage on schema public to service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. Permissões de tabela para o backend (service_role)
-- ─────────────────────────────────────────────────────────────

grant select, insert on table public.price_alert_delivery_logs to service_role;

-- ─────────────────────────────────────────────────────────────
-- 3. Endurecimento: clientes browser não acessam audit logs
-- ─────────────────────────────────────────────────────────────
--
-- RISCO se o backend usar NEXT_PUBLIC_SUPABASE_ANON_KEY em vez de
-- SUPABASE_SERVICE_ROLE_KEY: inserts continuarão negados (correto).
-- Corrija a env var nas APIs Vercel — nunca exponha service_role no frontend.

revoke all on table public.price_alert_delivery_logs from anon, authenticated;
revoke insert, update, delete, truncate on table public.price_alert_delivery_logs from public;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS somente nesta tabela (service_role bypassa RLS no Supabase)
-- ─────────────────────────────────────────────────────────────
--
-- Sem policies para anon/authenticated → PostgREST não expõe linhas.
-- Não desabilita RLS globalmente; afeta apenas price_alert_delivery_logs.

alter table public.price_alert_delivery_logs enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 5. Validação (descomente após rodar o patch e testar o cron)
-- ─────────────────────────────────────────────────────────────

-- select event_type, source, reason, created_at
-- from public.price_alert_delivery_logs
-- order by created_at desc
-- limit 10;
