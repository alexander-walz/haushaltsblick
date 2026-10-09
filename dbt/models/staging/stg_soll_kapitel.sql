select
  k.jahr,
  k.einzelplan_nr,
  {{ bereinige_text('k.einzelplan_text') }} as einzelplan_text,
  k.kapitel_nr,
  {{ bereinige_text('k.kapitel_text') }} as kapitel_text,
  k.anlage_zu_kapitel_nr,
  k.entfallen,
  k.anzahl_titel
from {{ source('raw', 'soll_kapitel') }} k
join {{ ref('stg_soll_laeufe') }} l on l.run_id = k.run_id
