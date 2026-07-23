-- PATCH 11.4 COMPLEMENT — drop legacy single-arg RPC overloads (avoid ambiguous function calls)

begin;

drop function if exists public.mia_executive_metrics_platform(integer);
drop function if exists public.mia_executive_metrics_conversation(integer);
drop function if exists public.mia_executive_metrics_recommendation(integer);
drop function if exists public.mia_executive_metrics_commerce(integer);
drop function if exists public.mia_executive_metrics_alerts(integer);
drop function if exists public.mia_executive_metrics_price_intelligence(integer);
drop function if exists public.mia_executive_metrics_savings(integer);
drop function if exists public.mia_executive_metrics_anti_regret(integer);
drop function if exists public.mia_executive_metrics_user_value(integer);

commit;
