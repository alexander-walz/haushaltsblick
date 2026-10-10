{{ config(materialized='view') }}
-- View statt Tabelle (Plan 4): Arbeitsrelation, wird nie ausgeliefert und spart Speicher.
select
  jahr, konto, hauptfunktion, max(hauptfunktion_text) as hauptfunktion_text,
  oberfunktion, max(oberfunktion_text) as oberfunktion_text,
  fkt, max(funktion_text) as funktion_text,
  sum(soll_eur)::numeric(18,2) as soll_eur,
  sum(ist_eur)::numeric(18,2) as ist_eur
from {{ ref('fct_titel_jahr') }}
group by jahr, konto, hauptfunktion, oberfunktion, fkt
