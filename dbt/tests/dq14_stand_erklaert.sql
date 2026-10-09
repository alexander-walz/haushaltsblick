{{ config(severity='warn', meta={'dq_id': 'DQ-14'}) }}
select jahr, konto, stand, stand_text, soll_xml_eur, soll_api_eur, differenz_xml_api_eur
from {{ ref('dim_haushaltsstand') }}
where differenz_xml_api_eur <> 0 and anzahl_nachtraege = 0 and stand <> 'Regierungsentwurf'
