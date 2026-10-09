with api as (
  select distinct on (jahr, knoten_id) jahr, knoten_id as kapitel_nr, label
  from {{ ref('stg_api_knoten') }}
  where ebene = 'kapitel'
  order by jahr, knoten_id, quote desc
),
xml as (
  select jahr, kapitel_nr, kapitel_text
  from {{ ref('stg_soll_kapitel') }}
  where anlage_zu_kapitel_nr is null
)
select coalesce(a.jahr, x.jahr) as jahr,
       coalesce(a.kapitel_nr, x.kapitel_nr) as kapitel_nr,
       left(coalesce(a.kapitel_nr, x.kapitel_nr), 2) as einzelplan_nr,
       coalesce(a.label, x.kapitel_text) as kapitel_text
from api a
full join xml x on x.jahr = a.jahr and x.kapitel_nr = a.kapitel_nr
