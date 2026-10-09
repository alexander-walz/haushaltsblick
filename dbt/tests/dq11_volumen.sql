{{ config(severity='warn', meta={'dq_id': 'DQ-11'}) }}
with n as (select jahr, konto, count(*) as anzahl from {{ ref('fct_titel_jahr') }} group by jahr, konto)
select a.jahr, a.konto, v.anzahl as vorjahr, a.anzahl
from n a join n v on v.konto = a.konto and v.jahr = a.jahr - 1
where abs(a.anzahl - v.anzahl)::numeric / v.anzahl > 0.15
