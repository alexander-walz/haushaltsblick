{{ config(severity='error', meta={'dq_id': 'DQ-01'}) }}
-- Nur Jahre mit identischem Stand: gleiche Gesamtsumme UND kein Nachtragshaushalt im API-Label.
-- Ein Nachtrag kann Mittel zwischen Einzelplänen verschieben, ohne die Summe zu ändern (2016: 3,5 Mrd. € von EP 32 nach EP 60).
-- Nur Jahre, in denen XML und API denselben Stand zeigen
with gleich as (select jahr, konto from {{ ref('dim_haushaltsstand') }} where differenz_xml_api_eur = 0 and anzahl_nachtraege = 0),
knoten as (select * from {{ ref('stg_api_knoten') }}),
soll_titel as (select * from {{ ref('stg_soll_titel') }})
select k.jahr, k.konto, k.knoten_id as einzelplan_nr
from knoten k
join gleich g on g.jahr = k.jahr and g.konto = k.konto
where k.ebene = 'einzelplan' and k.quote = 'soll'
  and not exists (
    select 1 from soll_titel t
    where t.jahr = k.jahr and t.konto = k.konto and t.einzelplan_nr = k.knoten_id and not t.ist_anlage)
