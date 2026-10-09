select t.jahr, t.konto, t.quote, t.einzelplan_nr, t.kapitel_nr, t.titel_nr, t.titel_key, t.fkt,
       {{ bereinige_text('t.label') }} as label, t.betrag_eur
from {{ source('raw', 'api_titel') }} t
join {{ ref('stg_api_laeufe') }} l on l.run_id = t.run_id
