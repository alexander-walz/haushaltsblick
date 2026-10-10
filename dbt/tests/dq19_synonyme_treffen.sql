{{ config(severity='warn', meta={'dq_id': 'DQ-19'}) }}
-- Jedes Synonym trifft in jedem Jahr seines Gültigkeitszeitraums, für das Daten des Kontos vorliegen, mindestens einen Titel.
with synonyme as (select * from {{ ref('semantik_synonyme') }}),
titel as (select * from {{ ref('fct_titel_jahr') }}),
jahre as (select konto, jahr from titel group by konto, jahr),
erwartet as (
  select s.begriff, s.typ, s.schluessel, s.konto, j.jahr
  from synonyme s
  join jahre j on j.konto = s.konto and j.jahr >= s.jahr_von and (s.jahr_bis is null or j.jahr <= s.jahr_bis)
)
select e.*
from erwartet e
where not exists (
  select 1 from titel t
  where t.jahr = e.jahr and t.konto = e.konto
    and case e.typ
          when 'einzelplan' then t.einzelplan_nr
          when 'funktion' then t.fkt
          when 'oberfunktion' then t.oberfunktion
          when 'hauptfunktion' then t.hauptfunktion
          when 'gruppierung' then t.gruppierung_nr
          when 'obergruppe' then t.obergruppe
          when 'hauptgruppe' then t.hauptgruppe
        end = e.schluessel
)
