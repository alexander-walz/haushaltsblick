{{ config(severity='error', meta={'dq_id': 'DQ-09'}) }}
with summen as (
  select jahr, konto,
         case when bool_and(soll_quelle = 'api') then sum(soll_eur) end as soll,
         sum(ist_eur) as ist
  from {{ ref('fct_titel_jahr') }}
  group by jahr, konto
)
select k.jahr, k.konto, k.wertart, k.betrag_eur as kontrollwert, s.soll, s.ist
from {{ ref('kontrollsummen') }} k
join summen s on s.jahr = k.jahr and s.konto = k.konto
where (k.wertart = 'soll' and s.soll is not null and s.soll <> k.betrag_eur)
   or (k.wertart = 'ist' and s.ist is not null and s.ist <> k.betrag_eur)
