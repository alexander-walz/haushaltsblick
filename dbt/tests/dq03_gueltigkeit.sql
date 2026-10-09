{{ config(severity='error', meta={'dq_id': 'DQ-03'}) }}
select jahr, konto, titel_key, titel_nr, kapitel_nr, einzelplan_nr, fkt
from {{ ref('dim_titel') }}
where titel_nr !~ '^[0-9]{5}$' or kapitel_nr !~ '^[0-9]{4}$' or left(kapitel_nr, 2) <> einzelplan_nr
   or fkt is null or fkt !~ '^[0-9]{3}$' or titel_key <> kapitel_nr || titel_nr
