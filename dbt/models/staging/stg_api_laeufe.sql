-- Maßgeblicher API-Lauf je Jahr, Konto und Quote
select distinct on (a.jahr, a.konto, a.quote) a.run_id, a.jahr, a.konto, a.quote, a.modify_date, l.started_at
from {{ source('raw', 'api_abruf') }} a
join {{ source('ops', 'load_run') }} l on l.run_id = a.run_id
where l.status = 'succeeded'
order by a.jahr, a.konto, a.quote, l.started_at desc, a.quelle_timestamp desc
