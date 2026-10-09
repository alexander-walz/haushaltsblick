with api as (
  select jahr, konto, label, betrag_eur
  from {{ ref('stg_api_knoten') }}
  where ebene = 'gesamt' and quote = 'soll'
),
xml as (
  select jahr, konto, sum(soll_eur) as betrag_eur
  from {{ ref('stg_soll_titel') }}
  where not ist_anlage
  group by jahr, konto
),
schluessel as (
  select jahr, konto from api union select jahr, konto from xml
)
select
  s.jahr,
  s.konto,
  a.label as stand_text,
  case
    when a.label is null then 'nur Haushaltsplan-XML'
    when a.label ilike '%entwurf%' then 'Regierungsentwurf'
    when a.label ilike '%nachtragshaushalt%' then 'Gesetz inkl. Nachtragshaushalt'
    when a.label ~ '^Sollwerte des Haushaltsjahres \d{4}' or a.label ~ '^Haushaltsjahr \d{4} \(Soll\)' then 'Gesetz'
    -- Unbekannte Labels nicht still als Gesetz werten; DQ-14 meldet sie.
    else 'unbekannt'
  end as stand,
  coalesce((select max(m[1]::int) from regexp_matches(coalesce(a.label, ''), '(\d+)\. Nachtrag', 'g') as m), 0) as anzahl_nachtraege,
  a.betrag_eur as soll_api_eur,
  x.betrag_eur as soll_xml_eur,
  (x.betrag_eur - a.betrag_eur)::numeric(18,2) as differenz_xml_api_eur
from schluessel s
left join api a on a.jahr = s.jahr and a.konto = s.konto
left join xml x on x.jahr = s.jahr and x.konto = s.konto
