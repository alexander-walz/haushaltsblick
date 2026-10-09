{{ config(severity='warn', meta={'dq_id': 'DQ-12'}) }}
with letzte as (
  select distinct on (source_id, params ->> 'jahr', params ->> 'konto', params ->> 'quote', params ->> 'sicht')
         source_id, params ->> 'jahr' as jahr, params ->> 'konto' as konto, params ->> 'quote' as quote,
         params ->> 'sicht' as sicht, status, error
  from {{ source('ops', 'load_run') }}
  where params ->> 'datei' is null
  order by source_id, params ->> 'jahr', params ->> 'konto', params ->> 'quote', params ->> 'sicht', started_at desc
)
select * from letzte where status in ('failed', 'quarantined')
