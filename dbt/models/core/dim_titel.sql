{{ config(materialized='view') }}
-- View statt Tabelle (Plan 4): Arbeitsrelation, wird nie ausgeliefert und spart Speicher.
with xml as (
  select * from {{ ref('stg_soll_titel') }} where not ist_anlage
),
api as (
  select jahr, konto, titel_key,
         min(einzelplan_nr) as einzelplan_nr,
         min(kapitel_nr) as kapitel_nr,
         min(titel_nr) as titel_nr,
         (array_agg(fkt order by quote desc))[1] as fkt,
         (array_agg(label order by quote desc))[1] as label
  from {{ ref('stg_api_titel') }}
  group by jahr, konto, titel_key
),
schluessel as (
  select jahr, konto, titel_key from xml
  union
  select jahr, konto, titel_key from api
)
select
  s.jahr,
  s.konto,
  s.titel_key,
  coalesce(a.einzelplan_nr, x.einzelplan_nr) as einzelplan_nr,
  coalesce(a.kapitel_nr, x.kapitel_nr) as kapitel_nr,
  coalesce(a.titel_nr, x.titel_nr) as titel_nr,
  coalesce(a.label, x.titel_text) as titel_text,
  x.titelgruppe_nr,
  x.titelgruppe_text,
  x.ausgabeart_text,
  x.flexibilisiert,
  x.seite,
  coalesce(a.fkt, x.fkt) as fkt,
  x.titel_key is not null as im_haushaltsplan_xml
from schluessel s
left join xml x on x.jahr = s.jahr and x.konto = s.konto and x.titel_key = s.titel_key
left join api a on a.jahr = s.jahr and a.konto = s.konto and a.titel_key = s.titel_key
