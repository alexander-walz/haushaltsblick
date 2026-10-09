-- internalapi von bundeshaushalt.de: Soll und Ist je Titel (Roadmap E7)
insert into ops.source_registry values (
  'SRC_PORTAL_API',
  'Bundeshaushalt digital, internalapi budgetData (Soll und Ist je Titel)',
  'https://www.bundeshaushalt.de/internalapi/budgetData?year={jahr}&account={account}&quota={quota}&unit=single&id={id}',
  false,
  'Amtliches Werk, Quellenvermerk "Bundesministerium der Finanzen, bundeshaushalt.de"',
  'contracts/src_portal_api.yaml'
);

-- Ein Crawl je Lauf: Jahr, Konto, Quote, Stand der Quelle und Archiv der Rohantworten
create table raw.api_abruf (
  run_id           uuid primary key references ops.load_run on delete cascade,
  jahr             integer not null,
  konto            text not null check (konto in ('einnahmen', 'ausgaben')),
  quote            text not null check (quote in ('soll', 'ist')),
  quelle_timestamp bigint not null,
  modify_date      text not null,
  anfragen         integer not null check (anfragen > 0),
  ablage_uri       text not null,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  warnungen        jsonb not null default '[]'
);
create index on raw.api_abruf (jahr, konto, quote);

-- Summen je Ebene (gesamt, Einzelplan, Kapitel) für Abgleiche
create table raw.api_knoten (
  run_id     uuid not null references ops.load_run on delete cascade,
  jahr       integer not null,
  konto      text not null check (konto in ('einnahmen', 'ausgaben')),
  quote      text not null check (quote in ('soll', 'ist')),
  ebene      text not null check (ebene in ('gesamt', 'einzelplan', 'kapitel')),
  knoten_id  text not null,
  label      text not null,
  betrag_eur numeric(18,2) not null,
  primary key (run_id, ebene, knoten_id)
);

-- Titel mit Betrag ungleich 0 (die API lässt Titel mit Wert 0 weg)
create table raw.api_titel (
  run_id        uuid not null references ops.load_run on delete cascade,
  jahr          integer not null,
  konto         text not null check (konto in ('einnahmen', 'ausgaben')),
  quote         text not null check (quote in ('soll', 'ist')),
  einzelplan_nr text not null,
  kapitel_nr    text not null,
  titel_nr      text not null,
  titel_key     text generated always as (kapitel_nr || titel_nr) stored,
  fkt           text not null,
  label         text not null,
  betrag_eur    numeric(18,2) not null,
  primary key (run_id, kapitel_nr, titel_nr)
);

alter table raw.api_abruf enable row level security;
alter table raw.api_knoten enable row level security;
alter table raw.api_titel enable row level security;
revoke all on all tables in schema raw, ops from anon, authenticated;
