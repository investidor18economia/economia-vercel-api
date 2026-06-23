select
  category,
  count(*) as total_perguntas
from analytics_events
where event_name = 'mia_question_sent'
  and category is not null
group by category
order by total_perguntas desc;