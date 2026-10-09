{{ config(severity='error', meta={'dq_id': 'DQ-02'}) }}
select jahr, titel_key, count(*) as anzahl
from {{ ref('fct_titel_jahr') }}
group by jahr, titel_key
having count(*) > 1
