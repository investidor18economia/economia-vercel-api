with production_resolution_events as (
  select *
  from analytics_events
  where event_name = 'data_layer_resolution'
    and not (
      category in ('price_alert_email_test', 'price_alert_e2e_test', 'data_layer_usage_test')
      or event_name like 'price_drop_email_test_%'
      or event_name like 'price_drop_email_e2e_%'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or (
        event_name = 'session_started'
        and coalesce(metadata->>'user_agent', '') = 'test-agent'
      )
    )
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_resolution_events
),
category_totals as (
  select
    coalesce(nullif(trim(category), ''), 'unknown') as categoria,
    count(*) as registros_total
  from production_resolution_events
  group by 1
),
category_classification as (
  select
    'cobertura_por_categoria'::text as tipo_analise,
    coalesce(nullif(trim(category), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'response_classification', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_resolution_events
  group by 2, 3
),
brand_classification as (
  select
    'cobertura_por_marca'::text as tipo_analise,
    coalesce(nullif(trim(product_brand), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'response_classification', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_resolution_events
  group by 2, 3
),
family_classification as (
  select
    'cobertura_por_familia'::text as tipo_analise,
    coalesce(nullif(trim(metadata->>'model_family'), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'response_classification', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_resolution_events
  group by 2, 3
),
combined as (
  select * from category_classification
  union all select * from brand_classification
  union all select * from family_classification
)
select
  c.tipo_analise,
  c.metrica,
  case
    when c.tipo_analise = 'cobertura_por_categoria' then 'category'
    when c.tipo_analise = 'cobertura_por_marca' then 'brand'
    else 'model_family'
  end as dimensao,
  c.dimensao_valor,
  c.valor_absoluto,
  round(
    c.valor_absoluto::numeric
    / nullif(
      case
        when c.tipo_analise = 'cobertura_por_categoria' then ct.registros_total
        else sum(c.valor_absoluto) over (partition by c.tipo_analise, c.dimensao_valor)
      end,
      0
    ),
    4
  ) as valor_relativo,
  case
    when c.tipo_analise = 'cobertura_por_categoria' then ct.registros_total
    else sum(c.valor_absoluto) over (partition by c.tipo_analise, c.dimensao_valor)
  end as registros_total,
  case
    when c.tipo_analise = 'cobertura_por_categoria' then 'consultas_por_categoria'
    when c.tipo_analise = 'cobertura_por_marca' then 'consultas_por_marca'
    else 'consultas_por_familia'
  end as referencia_denominador,
  case
    when c.tipo_analise = 'cobertura_por_categoria' then ct.registros_total > 0
    else sum(c.valor_absoluto) over (partition by c.tipo_analise, c.dimensao_valor) > 0
  end as amostra_analisavel,
  null::text as limitacao,
  rd.dia_referencia
from combined c
left join category_totals ct
  on c.tipo_analise = 'cobertura_por_categoria'
 and c.dimensao_valor = ct.categoria
cross join reference_day rd
order by c.tipo_analise, c.dimensao_valor, c.valor_absoluto desc;

