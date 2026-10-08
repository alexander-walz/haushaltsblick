-- Flexibilisierung betrifft nur Ausgaben. Die Jahrgänge 2012 bis 2024 führen das Attribut an
-- Einnahmetiteln nicht; dort bedeutet null "nicht anwendbar".
alter table raw.soll_titel alter column flexibilisiert drop not null;
