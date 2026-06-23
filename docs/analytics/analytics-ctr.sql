select
  count(*) filter (where event_name = 'mia_recommendation_shown') as recomendacoes,
  count(*) filter (where event_name = 'offer_click') as cliques,
  round(
    (
      count(*) filter (where event_name = 'offer_click')::numeric
      / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0)
    ) * 100,
    2
  ) as ctr_percentual
from analytics_events;