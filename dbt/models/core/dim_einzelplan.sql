with api as (
  select distinct on (jahr, knoten_id) jahr, knoten_id as einzelplan_nr, label
  from {{ ref('stg_api_knoten') }}
  where ebene = 'einzelplan'
  order by jahr, knoten_id, quote desc  -- soll vor ist
),
xml as (
  select distinct on (jahr, einzelplan_nr) jahr, einzelplan_nr, einzelplan_text
  from {{ ref('stg_soll_kapitel') }}
  where anlage_zu_kapitel_nr is null
  order by jahr, einzelplan_nr
)
select coalesce(a.jahr, x.jahr) as jahr,
       coalesce(a.einzelplan_nr, x.einzelplan_nr) as einzelplan_nr,
       coalesce(a.label, x.einzelplan_text) as einzelplan_text
from api a
full join xml x on x.jahr = a.jahr and x.einzelplan_nr = a.einzelplan_nr
