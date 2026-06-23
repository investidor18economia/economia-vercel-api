select
  date(created_at) as dia,
  count(distinct session_id) as usuarios_ativos,
  count(*) filter (where event_name = 'mia_question_sent') as perguntas,
  count(*) filter (where event_name = 'mia_recommendation_shown') as recomendacoes,
  count(*) filter (where event_name = 'offer_click') as cliques
from analytics_events
where session_id is not null
group by dia
order by dia desc;