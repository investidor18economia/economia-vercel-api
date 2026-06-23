select
  count(*) filter (where event_name = 'session_started') as sessoes_iniciadas,
  count(*) filter (where event_name = 'mia_question_sent') as perguntas_recebidas,
  count(*) filter (where event_name = 'mia_recommendation_shown') as recomendacoes_mostradas,
  count(*) filter (where event_name = 'offer_click') as cliques_em_oferta,
  count(*) filter (where event_name = 'favorite_created') as favoritos_criados,
  count(*) filter (where event_name = 'price_alert_created') as alertas_criados,
  count(distinct session_id) as sessoes_unicas
from analytics_events;