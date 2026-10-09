with titel as (select * from {{ source('raw', 'soll_titel') }}),
lauf as (select * from {{ ref('stg_soll_laeufe') }})
select
  t.jahr,
  t.konto,
  t.einzelplan_nr,
  {{ bereinige_text('t.einzelplan_text') }} as einzelplan_text,
  t.kapitel_nr,
  {{ bereinige_text('t.kapitel_text') }} as kapitel_text,
  t.anlage_zu_kapitel_nr,
  t.anlage_zu_kapitel_nr is not null as ist_anlage,
  {{ bereinige_text('t.ausgabeart_text') }} as ausgabeart_text,
  t.titelgruppe_nr,
  {{ bereinige_text('t.titelgruppe_text') }} as titelgruppe_text,
  t.titel_nr,
  t.titel_key,
  {{ bereinige_text('t.titel_text') }} as titel_text,
  t.flexibilisiert,
  t.fkt,
  t.seite,
  t.soll_eur,
  t.run_id
from titel t
join lauf l on l.run_id = t.run_id
