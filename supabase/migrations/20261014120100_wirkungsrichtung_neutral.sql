-- Plan 5 (E21): Regeln dürfen eine Obergruppe ausdrücklich neutral stellen (Rücklagenentnahme 35, Globale Mehr-/Mindereinnahmen 37).
-- Die spezifischere Regel (rang 1) schlägt die Kontoregel „einnahmen“ (rang 2); neutral färbt nie.
alter table semantic.wirkungsrichtung drop constraint wirkungsrichtung_richtung_check;
alter table semantic.wirkungsrichtung add constraint wirkungsrichtung_richtung_check
  check (richtung in ('anstieg_positiv', 'anstieg_negativ', 'neutral'));
