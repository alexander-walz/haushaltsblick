{{ config(severity='warn', meta={'dq_id': 'DQ-10'}) }}
select source_id, max(finished_at) as letzter_lauf
from {{ source('ops', 'load_run') }}
where status in ('succeeded', 'skipped') and params ->> 'datei' is null
group by source_id
having max(finished_at) < now() - interval '8 days'
