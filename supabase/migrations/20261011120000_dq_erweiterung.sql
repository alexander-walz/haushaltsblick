-- Final-Review Plan 3: neue Prüfungen, Protokoll des dbt-Aufrufs, Ausführungsrechte (additiv)

-- DQ-17: XML-Soll wird nie gegen API-Ist verglichen; dafür muss das API-Soll vollständig sein.
-- DQ-18: Speicherbudget der Datenbank (Supabase Free: 500 MB).
insert into ops.dq_check values
  ('DQ-17', 'Vollständigkeit', 'API-Soll für jedes Jahr und Konto mit Ist sowie für alle Jahre ab dq13_ab_jahr bis zum laufenden Jahr geladen', 'error'),
  ('DQ-18', 'Betrieb', 'Datenbankgröße unter 400 MB (Supabase Free: 500 MB)', 'warn');

-- Wie dbt aufgerufen wurde (args aus run_results.json und invocation_id); gesetzte vars kennzeichnen Testläufe.
alter table ops.dq_lauf add column dbt_aufruf jsonb not null default '{}';

-- Veröffentlichen und Aufräumen nur durch den Eigentümer (Pipeline), nicht durch beliebige Rollen.
revoke execute on function ops.veroeffentliche_version(bigint), ops.raeume_raw_auf() from public;
