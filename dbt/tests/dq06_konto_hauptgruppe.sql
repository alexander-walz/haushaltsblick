{{ config(severity='warn', meta={'dq_id': 'DQ-06'}) }}
select jahr, konto, titel_key, hauptgruppe
from {{ ref('fct_titel_jahr') }}
where (konto = 'einnahmen' and hauptgruppe not in ('0', '1', '2', '3'))
   or (konto = 'ausgaben' and hauptgruppe in ('0', '1', '2', '3'))
