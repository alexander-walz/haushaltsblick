select distinct on (s.jahr, s.konto, s.sicht) s.run_id, s.jahr, s.konto, s.sicht
from {{ source('raw', 'api_systematik_abruf') }} s
join {{ source('ops', 'load_run') }} l on l.run_id = s.run_id
where l.status = 'succeeded'
order by s.jahr, s.konto, s.sicht, l.started_at desc, s.quelle_timestamp desc
