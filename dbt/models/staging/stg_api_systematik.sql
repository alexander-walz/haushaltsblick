with systematik as (select * from {{ source('raw', 'api_systematik') }}),
lauf as (select * from {{ ref('stg_systematik_laeufe') }})
select s.jahr, s.konto, s.sicht, s.code, s.ebene, {{ bereinige_text('s.label') }} as label, s.betrag_eur
from systematik s
join lauf l on l.run_id = s.run_id
