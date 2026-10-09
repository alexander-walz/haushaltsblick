select k.jahr, k.konto, k.quote, k.ebene, k.knoten_id,
       case when k.ebene = 'gesamt' then {{ bereinige_text('k.label') }}
            else {{ bereinige_text("regexp_replace(k.label, '^\d+\s+', '')") }} end as label,
       k.betrag_eur
from {{ source('raw', 'api_knoten') }} k
join {{ ref('stg_api_laeufe') }} l on l.run_id = k.run_id
