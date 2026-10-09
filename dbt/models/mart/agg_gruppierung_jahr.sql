select
  jahr, konto, hauptgruppe, max(hauptgruppe_text) as hauptgruppe_text,
  obergruppe, max(obergruppe_text) as obergruppe_text,
  gruppierung_nr, max(gruppierung_text) as gruppierung_text,
  sum(soll_eur)::numeric(18,2) as soll_eur,
  sum(ist_eur)::numeric(18,2) as ist_eur
from {{ ref('fct_titel_jahr') }}
group by jahr, konto, hauptgruppe, obergruppe, gruppierung_nr
