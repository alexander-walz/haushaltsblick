-- Quellenregister
create table ops.source_registry (
  source_id      text primary key,
  bezeichnung    text not null,
  url_muster     text not null,
  offiziell      boolean not null,
  lizenz         text not null,
  vertrag_pfad   text not null
);

insert into ops.source_registry values (
  'SRC_SOLL_XML',
  'Haushaltsplan des Bundes (XML), Soll je Titel',
  'https://www.bundeshaushalt.de/static/daten/{jahr}/soll/haushalt_{jahr}.xml',
  true,
  'Amtliches Werk, Quellenvermerk "Bundesministerium der Finanzen, bundeshaushalt.de"',
  'contracts/src_soll_xml.yaml'
);

-- Ein Ladelauf je Quelle und Jahr
create table ops.load_run (
  run_id           uuid primary key default gen_random_uuid(),
  source_id        text not null references ops.source_registry,
  trigger          text not null check (trigger in ('schedule', 'manual', 'ci')),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'running'
                   check (status in ('running', 'succeeded', 'failed', 'quarantined', 'skipped')),
  git_sha          text not null,
  pipeline_version text not null,
  params           jsonb not null default '{}',
  rows_loaded      integer,
  error            text
);
create index on ops.load_run (source_id, started_at desc);

-- Metadaten der Rohdateien; die Datei selbst liegt unter ablage_uri (Roadmap E8)
create table raw.source_file (
  run_id        uuid not null references ops.load_run on delete cascade,
  source_id     text not null references ops.source_registry,
  jahr          integer not null,
  source_url    text not null,
  http_etag     text,
  last_modified text,
  fetched_at    timestamptz not null,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size     integer not null check (byte_size > 0),
  ablage_uri    text not null,
  primary key (run_id, source_url)
);
create index on raw.source_file (source_id, jahr, fetched_at desc);

-- Kapitel aus der XML-Datei, auch entfallene und Anlagen
create table raw.soll_kapitel (
  run_id               uuid not null references ops.load_run on delete cascade,
  jahr                 integer not null,
  einzelplan_nr        text not null,
  einzelplan_text      text not null,
  kapitel_nr           text not null,
  kapitel_text         text not null,
  anlage_zu_kapitel_nr text,
  anzahl_titel         integer not null,
  entfallen            boolean not null,
  xml_pfad             text not null,
  primary key (run_id, kapitel_nr)
);

-- Abgeflachte Titelzeilen; Eindeutigkeit prüft dbt (DQ-02), raw nimmt alles auf
create table raw.soll_titel (
  id                   bigint generated always as identity primary key,
  run_id               uuid not null references ops.load_run on delete cascade,
  jahr                 integer not null,
  einzelplan_nr        text not null,
  einzelplan_text      text not null,
  kapitel_nr           text not null,
  kapitel_text         text not null,
  anlage_zu_kapitel_nr text,
  konto                text not null check (konto in ('einnahmen', 'ausgaben')),
  konto_block          integer not null check (konto_block >= 1),
  ausgabeart_text      text,
  titelgruppe_nr       text,
  titelgruppe_text     text,
  titel_nr             text not null,
  titel_text           text not null,
  titel_key            text generated always as (kapitel_nr || titel_nr) stored,
  flexibilisiert       boolean not null,
  fkt                  text not null,
  seite                integer,
  soll_tsd_eur         numeric(18,0) not null,
  soll_eur             numeric(18,2) generated always as (soll_tsd_eur * 1000) stored,
  xml_pfad             text not null,
  zeilen_hash          text not null
);
create index on raw.soll_titel (run_id, jahr, kapitel_nr, titel_nr);

-- Kein Zugriff von außen: RLS ohne Policies, Rechte entzogen
alter table ops.source_registry enable row level security;
alter table ops.load_run enable row level security;
alter table raw.source_file enable row level security;
alter table raw.soll_kapitel enable row level security;
alter table raw.soll_titel enable row level security;

revoke all on all tables in schema raw, ops from anon, authenticated;
alter default privileges in schema raw, ops revoke all on tables from anon, authenticated;
