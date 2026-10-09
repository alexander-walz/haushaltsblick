with je_code as (
  select distinct on (jahr, code) jahr, code, label
  from {{ ref('stg_api_systematik') }}
  where sicht = 'funktion'
  order by jahr, code, konto
),
bedarf as (
  select distinct jahr, fkt from {{ ref('dim_titel') }} where fkt is not null
)
select
  b.jahr,
  b.fkt,
  f.label as funktion_text,
  f.jahr as funktion_text_jahr,
  left(b.fkt, 2) as oberfunktion,
  o.label as oberfunktion_text,
  left(b.fkt, 1) as hauptfunktion,
  h.label as hauptfunktion_text
from bedarf b
left join lateral (
  select jahr, label from je_code where code = b.fkt order by abs(jahr - b.jahr), jahr desc limit 1
) f on true
left join lateral (
  select label from je_code where code = left(b.fkt, 2) order by abs(jahr - b.jahr), jahr desc limit 1
) o on true
left join lateral (
  select label from je_code where code = left(b.fkt, 1) order by abs(jahr - b.jahr), jahr desc limit 1
) h on true
