{{ config(severity='warn', meta={'dq_id': 'DQ-04'}) }}
select jahr, fkt from {{ ref('dim_funktion') }} where funktion_text is null
