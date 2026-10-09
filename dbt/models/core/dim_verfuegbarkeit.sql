select
  t.jahr,
  t.konto,
  exists (select 1 from {{ ref('stg_api_laeufe') }} l where l.jahr = t.jahr and l.konto = t.konto and l.quote = 'soll') as soll_api_geladen,
  exists (select 1 from {{ ref('stg_api_laeufe') }} l where l.jahr = t.jahr and l.konto = t.konto and l.quote = 'ist') as ist_geladen,
  exists (select 1 from {{ ref('stg_soll_laeufe') }} l where l.jahr = t.jahr) as xml_geladen
from (select distinct jahr, konto from {{ ref('dim_titel') }}) t
