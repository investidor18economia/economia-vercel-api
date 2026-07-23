-- PATCH 11.4 COMPLEMENT — period offset for remaining executive metrics RPCs
-- Categories: price_intelligence, savings, anti_regret, user_value

begin;

create or replace function public.mia_executive_metrics_price_intelligence(p_days integer default 30, p_offset_days integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and e.event_name = 'mia_price_intelligence'
      and coalesce(e.metadata->>'event_version', '') = '10.1.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  quality_map as (
    select
      case coalesce(metadata->>'price_quality', 'UNKNOWN')
        when 'HIGH' then 4
        when 'MEDIUM' then 3
        when 'LOW' then 2
        when 'INVALID' then 1
        else 0
      end as q_score,
      coalesce(metadata->>'price_confidence', 'UNKNOWN') as confidence
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'price_intelligence_events',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'events', (select count(*)::bigint from scoped),
    'average_price_quality_score', (select round(avg(q_score)::numeric, 2) from quality_map),
    'confidence_distribution', coalesce((
      select jsonb_object_agg(confidence, cnt)
      from (
        select confidence, count(*)::bigint as cnt
        from quality_map
        group by confidence
      ) t
    ), '{}'::jsonb)
  );
$$;

create or replace function public.mia_executive_metrics_savings(p_days integer default 30, p_offset_days integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and e.event_name = 'mia_savings_estimation'
      and coalesce(e.metadata->>'event_version', '') = '10.2.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  amounts as (
    select nullif(metadata->>'potential_savings_amount', '')::numeric as amt
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'savings_estimation_events',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'potential_savings_total', coalesce((select round(sum(amt), 2) from amounts where amt is not null and amt > 0), 0),
    'average_potential_savings', coalesce((select round(avg(amt), 2) from amounts where amt is not null and amt > 0), null),
    'opportunities_found', coalesce((select count(*)::bigint from amounts where amt is not null and amt > 0), 0)
  );
$$;

create or replace function public.mia_executive_metrics_anti_regret(p_days integer default 30, p_offset_days integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and e.event_name = 'mia_anti_regret_foundation'
      and coalesce(e.metadata->>'event_version', '') = '10.4.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  scores as (
    select
      nullif(metadata->>'anti_regret_score', '')::numeric as score,
      coalesce(metadata->>'anti_regret_confidence', 'UNKNOWN') as confidence
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'anti_regret_events',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'events', (select count(*)::bigint from scoped),
    'average_score', (select round(avg(score)::numeric, 2) from scores where score is not null),
    'confidence_distribution', coalesce((
      select jsonb_object_agg(confidence, cnt)
      from (
        select confidence, count(*)::bigint as cnt
        from scores
        group by confidence
      ) t
    ), '{}'::jsonb)
  );
$$;

create or replace function public.mia_executive_metrics_user_value(p_days integer default 30, p_offset_days integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1) + greatest(coalesce(p_offset_days, 0), 0))
      and e.created_at < now() - make_interval(days => greatest(coalesce(p_offset_days, 0), 0))
      and e.event_name = 'mia_user_value_outcome'
      and coalesce(e.metadata->>'event_version', '') = '10.5.0'
      and public.mia_analytics_production_scope(e.category, e.event_name, e.metadata)
  ),
  scores as (
    select
      nullif(metadata->>'user_value_score', '')::numeric as score,
      coalesce(metadata->>'value_status', 'UNKNOWN') as value_status
    from scoped
  )
  select jsonb_build_object(
    'grain', 'event',
    'denominator', 'user_value_outcome_events',
    'window_days', p_days,
    'offset_days', coalesce(p_offset_days, 0),
    'events', (select count(*)::bigint from scoped),
    'average_user_value', (select round(avg(score)::numeric, 2) from scores where score is not null),
    'value_status_distribution', coalesce((
      select jsonb_object_agg(value_status, cnt)
      from (
        select value_status, count(*)::bigint as cnt
        from scores
        group by value_status
      ) t
    ), '{}'::jsonb),
    'verified_value_amount_count', coalesce((
      select count(*)::bigint
      from scoped
      where nullif(metadata->>'verified_value_amount', '') is not null
    ), 0)
  );
$$;

grant execute on function public.mia_executive_metrics_price_intelligence(integer, integer) to service_role;
grant execute on function public.mia_executive_metrics_savings(integer, integer) to service_role;
grant execute on function public.mia_executive_metrics_anti_regret(integer, integer) to service_role;
grant execute on function public.mia_executive_metrics_user_value(integer, integer) to service_role;

commit;
