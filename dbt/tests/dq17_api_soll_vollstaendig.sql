{{ config(severity='error', meta={'dq_id': 'DQ-17'}) }}
-- API-Soll muss geladen sein (a) für jedes Jahr und Konto mit API-Ist, damit nie XML-Soll gegen API-Ist
-- verglichen wird, und (b) für alle Jahre ab dq13_ab_jahr bis zum Folgejahr in beiden Konten.
with soll as (
  select jahr, konto from {{ ref('stg_api_laeufe') }} where quote = 'soll'
),
erwartet as (
  select jahr, konto, 'Ist ohne API-Soll' as grund
  from {{ ref('stg_api_laeufe') }}
  where quote = 'ist'
  union
  select j.jahr, k.konto, 'API-Soll fehlt' as grund
  from generate_series({{ var('dq13_ab_jahr') }}, extract(year from now())::int + 1) as j(jahr)
  cross join (values ('ausgaben'), ('einnahmen')) as k(konto)
)
select e.jahr, e.konto, e.grund
from erwartet e
where not exists (select 1 from soll s where s.jahr = e.jahr and s.konto = e.konto)
