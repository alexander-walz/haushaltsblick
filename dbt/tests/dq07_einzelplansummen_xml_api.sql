{{ config(severity='error', meta={'dq_id': 'DQ-07'}) }}
-- Nur Jahre mit identischem Stand: gleiche Gesamtsumme UND kein Nachtragshaushalt im API-Label.
-- Ein Nachtrag kann Mittel zwischen Einzelplänen verschieben, ohne die Summe zu ändern (2016: 3,5 Mrd. € von EP 32 nach EP 60).
with gleich as (select jahr, konto from {{ ref('dim_haushaltsstand') }} where differenz_xml_api_eur = 0 and anzahl_nachtraege = 0),
xml as (
  select jahr, konto, einzelplan_nr, sum(soll_eur) as betrag
  from {{ ref('stg_soll_titel') }} where not ist_anlage group by 1, 2, 3
),
api as (
  select jahr, konto, knoten_id as einzelplan_nr, betrag_eur as betrag
  from {{ ref('stg_api_knoten') }} where ebene = 'einzelplan' and quote = 'soll'
)
select coalesce(x.jahr, a.jahr) as jahr, coalesce(x.konto, a.konto) as konto,
       coalesce(x.einzelplan_nr, a.einzelplan_nr) as einzelplan_nr, x.betrag as xml_eur, a.betrag as api_eur
from xml x
full join api a on a.jahr = x.jahr and a.konto = x.konto and a.einzelplan_nr = x.einzelplan_nr
join gleich g on g.jahr = coalesce(x.jahr, a.jahr) and g.konto = coalesce(x.konto, a.konto)
where coalesce(x.betrag, 0) <> coalesce(a.betrag, 0)
