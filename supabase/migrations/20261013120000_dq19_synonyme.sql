-- Plan 4: Synonyme der Semantik müssen in ihrem Gültigkeitszeitraum auf vorhandene Schlüssel zeigen.
insert into ops.dq_check values
  ('DQ-19', 'Semantik', 'Jedes Synonym trifft in jedem Jahr seines Gültigkeitszeitraums mindestens einen Titel', 'warn');
