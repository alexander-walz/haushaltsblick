-- Maßgeblicher XML-Lauf je Jahr: letzter erfolgreicher Netzlauf (keine Testläufe aus lokalen Dateien)
with datei as (select * from {{ source('raw', 'source_file') }}),
lauf as (select * from {{ source('ops', 'load_run') }})
select distinct on (f.jahr) f.run_id, f.jahr, l.started_at
from datei f
join lauf l on l.run_id = f.run_id
where f.source_id = 'SRC_SOLL_XML' and l.status = 'succeeded' and l.params ->> 'datei' is null
order by f.jahr, l.started_at desc, f.fetched_at desc
