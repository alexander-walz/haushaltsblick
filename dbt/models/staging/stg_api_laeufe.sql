-- Maßgeblicher API-Lauf je Jahr, Konto und Quote
with abruf as (select * from {{ source('raw', 'api_abruf') }}),
lauf as (select * from {{ source('ops', 'load_run') }})
select distinct on (a.jahr, a.konto, a.quote) a.run_id, a.jahr, a.konto, a.quote, a.modify_date, l.started_at
from abruf a
join lauf l on l.run_id = a.run_id
where l.status = 'succeeded'
order by a.jahr, a.konto, a.quote, l.started_at desc, a.quelle_timestamp desc
