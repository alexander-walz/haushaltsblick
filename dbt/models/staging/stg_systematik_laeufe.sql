with abruf as (select * from {{ source('raw', 'api_systematik_abruf') }}),
lauf as (select * from {{ source('ops', 'load_run') }})
select distinct on (s.jahr, s.konto, s.sicht) s.run_id, s.jahr, s.konto, s.sicht
from abruf s
join lauf l on l.run_id = s.run_id
where l.status = 'succeeded'
order by s.jahr, s.konto, s.sicht, l.started_at desc, s.quelle_timestamp desc
