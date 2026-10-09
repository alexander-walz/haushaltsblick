{{ config(severity='error', meta={'dq_id': 'DQ-13'}) }}
select j.jahr, k.konto
from generate_series({{ var('dq13_ab_jahr') }}, extract(year from now())::int - 2) as j(jahr)
cross join (values ('ausgaben'), ('einnahmen')) as k(konto)
where not exists (
  select 1 from {{ ref('stg_api_laeufe') }} l where l.jahr = j.jahr and l.konto = k.konto and l.quote = 'ist')
