with je_code as (
  select distinct on (jahr, code) jahr, code, label
  from {{ ref('stg_api_systematik') }}
  where sicht = 'gruppierung'
  order by jahr, code, konto
),
bedarf as (
  select distinct jahr, left(titel_nr, 3) as gruppierung_nr
  from {{ ref('dim_titel') }}
  where titel_nr is not null
)
select
  b.jahr,
  b.gruppierung_nr,
  g.label as gruppierung_text,
  g.jahr as gruppierung_text_jahr,
  left(b.gruppierung_nr, 2) as obergruppe,
  o.label as obergruppe_text,
  left(b.gruppierung_nr, 1) as hauptgruppe,
  h.label as hauptgruppe_text
from bedarf b
left join lateral (
  select jahr, label from je_code where code = b.gruppierung_nr order by abs(jahr - b.jahr), jahr desc limit 1
) g on true
left join lateral (
  select label from je_code where code = left(b.gruppierung_nr, 2) order by abs(jahr - b.jahr), jahr desc limit 1
) o on true
left join lateral (
  select label from je_code where code = left(b.gruppierung_nr, 1) order by abs(jahr - b.jahr), jahr desc limit 1
) h on true
