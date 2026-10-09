-- DQ-01 und DQ-07 gelten nur für Jahre mit identischem Stand: gleiche Gesamtsumme und kein Nachtragshaushalt.
-- Befund 09.10.2026: Der 1. Nachtrag 2016 verschob 3,5 Mrd. € von Einzelplan 32 nach 60 bei gleicher Gesamtsumme.
update ops.dq_check
set beschreibung = 'Jeder Einzelplan des API-Solls ist in der XML vorhanden (nur Jahre mit gleicher Summe und ohne Nachtragshaushalt)'
where check_id = 'DQ-01';
update ops.dq_check
set beschreibung = 'Einzelplansummen XML gleich API-Soll (nur Jahre mit gleicher Summe und ohne Nachtragshaushalt)'
where check_id = 'DQ-07';
