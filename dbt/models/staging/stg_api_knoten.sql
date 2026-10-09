with knoten as (select * from {{ source('raw', 'api_knoten') }}),
lauf as (select * from {{ ref('stg_api_laeufe') }})
select k.jahr, k.konto, k.quote, k.ebene, k.knoten_id,
       case when k.ebene = 'gesamt' then {{ bereinige_text('k.label') }}
            else {{ bereinige_text("regexp_replace(k.label, '^\d+\s+', '')") }} end as label,
       k.betrag_eur
from knoten k
join lauf l on l.run_id = k.run_id
