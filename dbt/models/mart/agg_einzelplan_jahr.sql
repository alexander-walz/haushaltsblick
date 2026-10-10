{{ config(materialized='view') }}
-- View statt Tabelle (Plan 4): Arbeitsrelation, wird nie ausgeliefert und spart Speicher.
select
  jahr, konto, einzelplan_nr, max(einzelplan_text) as einzelplan_text,
  count(*) as anzahl_titel,
  sum(soll_eur)::numeric(18,2) as soll_eur,
  sum(soll_xml_eur)::numeric(18,2) as soll_xml_eur,
  sum(ist_eur)::numeric(18,2) as ist_eur,
  round(sum(soll_eur) / nullif(sum(sum(soll_eur)) over (partition by jahr, konto), 0), 6) as anteil_soll
from {{ ref('fct_titel_jahr') }}
group by jahr, konto, einzelplan_nr
