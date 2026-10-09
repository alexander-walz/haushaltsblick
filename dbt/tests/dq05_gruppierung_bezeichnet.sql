{{ config(severity='warn', meta={'dq_id': 'DQ-05'}) }}
select jahr, gruppierung_nr from {{ ref('dim_gruppierung') }} where gruppierung_text is null
