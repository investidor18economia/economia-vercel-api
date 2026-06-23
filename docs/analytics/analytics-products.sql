select
  product_name,
  count(*) as total_recomendacoes
from analytics_events
where event_name = 'mia_recommendation_shown'
  and product_name is not null
group by product_name
order by total_recomendacoes desc
limit 20;

select
  product_name,
  count(*) as total_cliques
from analytics_events
where event_name = 'offer_click'
  and product_name is not null
group by product_name
order by total_cliques desc
limit 20;