{{ config(materialized='view') }}
-- View statt Tabelle (Plan 4): Arbeitsrelation, wird nie ausgeliefert und spart Speicher.
select jahr, konto, titel_key, quote as wertart, betrag_eur, 'SRC_PORTAL_API' as source_id
from {{ ref('stg_api_titel') }}
union all
select jahr, konto, titel_key, 'soll_xml' as wertart, soll_eur as betrag_eur, 'SRC_SOLL_XML' as source_id
from {{ ref('stg_soll_titel') }}
where not ist_anlage
