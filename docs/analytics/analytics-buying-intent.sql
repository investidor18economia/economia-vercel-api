select
  count(*) filter (where event_name = 'offer_click') as cliques_em_oferta,
  count(*) filter (where event_name = 'favorite_created') as favoritos,
  count(*) filter (where event_name = 'price_alert_created') as alertas,
  count(*) filter (
    where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
  ) as sinais_fortes_de_compra
from analytics_events;