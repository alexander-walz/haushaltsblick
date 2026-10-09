select s.jahr, s.konto, s.sicht, s.code, s.ebene, {{ bereinige_text('s.label') }} as label, s.betrag_eur
from {{ source('raw', 'api_systematik') }} s
join {{ ref('stg_systematik_laeufe') }} l on l.run_id = s.run_id
