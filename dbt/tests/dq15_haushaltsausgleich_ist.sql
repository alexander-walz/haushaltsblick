{{ config(severity='error', meta={'dq_id': 'DQ-15'}) }}
select jahr, min(betrag_eur) as kleiner, max(betrag_eur) as groesser
from {{ ref('stg_api_knoten') }}
where ebene = 'gesamt' and quote = 'ist'
group by jahr
having count(*) = 2 and min(betrag_eur) <> max(betrag_eur)
