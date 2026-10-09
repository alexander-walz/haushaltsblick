{{ config(severity='warn', meta={'dq_id': 'DQ-18'}) }}
-- Speicherbudget: Supabase Free erlaubt 500 MB, gewarnt wird ab 400 MB.
select current_database() as datenbank, pg_size_pretty(pg_database_size(current_database())) as groesse
where pg_database_size(current_database()) > 400 * 1024 * 1024
