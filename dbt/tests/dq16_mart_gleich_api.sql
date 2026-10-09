{{ config(severity='error', meta={'dq_id': 'DQ-16'}) }}
-- Von der API-Wurzel aus: fehlt die Mart-Summe für Jahr und Konto, ist das eine Verletzung.
with mart as (
  select jahr, konto,
         sum(soll_eur) filter (where soll_quelle = 'api') as soll,
         sum(ist_eur) as ist
  from {{ ref('fct_titel_jahr') }}
  group by jahr, konto
)
select a.jahr, a.konto, a.quote, a.betrag_eur as api_eur, m.soll as mart_soll_eur, m.ist as mart_ist_eur
from {{ ref('stg_api_knoten') }} a
left join mart m on m.jahr = a.jahr and m.konto = a.konto
where a.ebene = 'gesamt'
  and ((a.quote = 'soll' and m.soll is distinct from a.betrag_eur) or (a.quote = 'ist' and m.ist is distinct from a.betrag_eur))
