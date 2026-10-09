-- Systematik (Funktionen, Gruppierungen) je Jahr aus der internalapi (Roadmap E15)
create table raw.api_systematik_abruf (
  run_id           uuid primary key references ops.load_run on delete cascade,
  jahr             integer not null,
  konto            text not null check (konto in ('einnahmen', 'ausgaben')),
  sicht            text not null check (sicht in ('funktion', 'gruppierung')),
  quelle_timestamp bigint not null,
  anfragen         integer not null check (anfragen > 0),
  ablage_uri       text not null,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  warnungen        jsonb not null default '[]'
);
create index on raw.api_systematik_abruf (jahr, konto, sicht);

create table raw.api_systematik (
  run_id     uuid not null references ops.load_run on delete cascade,
  jahr       integer not null,
  konto      text not null check (konto in ('einnahmen', 'ausgaben')),
  sicht      text not null check (sicht in ('funktion', 'gruppierung')),
  code       text not null check (code ~ '^[0-9]{1,3}$'),
  ebene      integer not null check (ebene between 1 and 3),
  label      text not null,
  betrag_eur numeric(18,2) not null,
  primary key (run_id, code)
);

alter table raw.api_systematik_abruf enable row level security;
alter table raw.api_systematik enable row level security;

-- Katalog der Qualitätsprüfungen (Konzept Abschnitt 9, erweitert)
create table ops.dq_check (
  check_id     text primary key,
  dimension    text not null,
  beschreibung text not null,
  schwere      text not null check (schwere in ('error', 'warn'))
);
insert into ops.dq_check values
  ('DQ-01', 'Vollständigkeit', 'Jeder Einzelplan des API-Solls ist in der XML vorhanden (nur Jahre mit identischem Stand)', 'error'),
  ('DQ-02', 'Eindeutigkeit', 'Titelschlüssel je Jahr eindeutig im Mart', 'error'),
  ('DQ-03', 'Gültigkeit', 'Titel 5-, Kapitel 4-stellig mit Einzelplan als Präfix, Funktion 3-stellig', 'error'),
  ('DQ-04', 'Referenzielle Integrität', 'Jede Funktionskennziffer hat eine Bezeichnung', 'warn'),
  ('DQ-05', 'Referenzielle Integrität', 'Jede Gruppierungsnummer hat eine Bezeichnung', 'warn'),
  ('DQ-06', 'Konsistenz', 'Hauptgruppe 0 bis 3 nur in Einnahmen, 4 bis 9 nur in Ausgaben', 'warn'),
  ('DQ-07', 'Abgleich', 'Einzelplansummen XML gleich API-Soll (nur Jahre mit identischem Stand)', 'error'),
  ('DQ-08', 'Abgleich', 'API-Soll: Einnahmen gleich Ausgaben je Jahr', 'error'),
  ('DQ-09', 'Abgleich', 'Summen entsprechen den gepflegten Kontrollsummen', 'error'),
  ('DQ-10', 'Aktualität', 'Letzter Ladelauf je Quelle jünger als 8 Tage', 'warn'),
  ('DQ-11', 'Plausibilität', 'Anzahl Titel je Jahr und Konto weicht höchstens 15 % vom Vorjahr ab', 'warn'),
  ('DQ-12', 'Schema', 'Letzter Lauf je Schlüssel weder fehlgeschlagen noch in Quarantäne', 'warn'),
  ('DQ-13', 'Vollständigkeit', 'Ist für alle Jahre bis zum Vorvorjahr in beiden Konten geladen', 'error'),
  ('DQ-14', 'Abgleich', 'Unterschied XML- zu API-Soll nur bei Nachtrag oder Entwurf', 'warn'),
  ('DQ-15', 'Abgleich', 'API-Ist: Einnahmen gleich Ausgaben je Jahr', 'error'),
  ('DQ-16', 'Konsistenz', 'Mart-Summen je Jahr und Konto gleich der API-Wurzel (Soll und Ist)', 'error');

create table ops.dq_lauf (
  dq_lauf_id       bigint generated always as identity primary key,
  erstellt_am      timestamptz not null default now(),
  git_sha          text not null,
  dbt_manifest_sha text not null,
  ampel            text not null check (ampel in ('green', 'yellow', 'red')),
  score            numeric(5,2) not null
);

create table ops.dq_ergebnis (
  dq_lauf_id bigint not null references ops.dq_lauf on delete cascade,
  check_id   text not null references ops.dq_check,
  status     text not null check (status in ('pass', 'warn', 'fail')),
  failures   integer not null default 0,
  details    jsonb not null default '[]',
  primary key (dq_lauf_id, check_id)
);

-- Veröffentlichte Datenversionen (Roadmap E16), fortlaufend nummeriert
create table ops.dataset_version (
  version_id         bigint generated always as identity primary key,
  erstellt_am        timestamptz not null default now(),
  dq_lauf_id         bigint not null unique references ops.dq_lauf,
  zeilen_neu         integer not null,
  zeilen_geschlossen integer not null,
  zeilen_gesamt      integer not null,
  is_current         boolean not null default false
);
create unique index dataset_version_ein_aktueller on ops.dataset_version (is_current) where is_current;

-- Historie des Marts: Spalten exakt wie mart.fct_titel_jahr (dbt) plus Gültigkeit
create table mart.fct_titel_jahr_hist (
  jahr                 integer not null,
  konto                text not null,
  titel_key            text not null,
  einzelplan_nr        text,
  einzelplan_text      text,
  kapitel_nr           text,
  kapitel_text         text,
  titel_nr             text,
  titel_text           text,
  titelgruppe_nr       text,
  titelgruppe_text     text,
  ausgabeart_text      text,
  flexibilisiert       boolean,
  seite                integer,
  fkt                  text,
  funktion_text        text,
  oberfunktion         text,
  oberfunktion_text    text,
  hauptfunktion        text,
  hauptfunktion_text   text,
  gruppierung_nr       text,
  gruppierung_text     text,
  obergruppe           text,
  obergruppe_text      text,
  hauptgruppe          text,
  hauptgruppe_text     text,
  soll_eur             numeric(18,2),
  soll_quelle          text,
  soll_xml_eur         numeric(18,2),
  ist_eur              numeric(18,2),
  ist_verfuegbar       boolean,
  abweichung_eur       numeric(18,2),
  ist_quote            numeric,
  haushaltsstand       text,
  im_haushaltsplan_xml boolean,
  zeilen_hash          text not null,
  gueltig_ab_version   bigint not null references ops.dataset_version,
  gueltig_bis_version  bigint references ops.dataset_version,
  primary key (jahr, konto, titel_key, gueltig_ab_version)
);
create index fct_titel_jahr_hist_offen on mart.fct_titel_jahr_hist (jahr, konto, titel_key) where gueltig_bis_version is null;

alter table ops.dq_check enable row level security;
alter table ops.dq_lauf enable row level security;
alter table ops.dq_ergebnis enable row level security;
alter table ops.dataset_version enable row level security;

revoke all on schema core, mart from anon, authenticated;
revoke all on all tables in schema raw, ops, mart from anon, authenticated;
alter default privileges in schema core, mart revoke all on tables from anon, authenticated;

-- Veröffentlicht den aktuellen Inhalt von mart.fct_titel_jahr als neue Version (nie bei roter Ampel)
create function ops.veroeffentliche_version(p_dq_lauf_id bigint)
returns table (version_id bigint, zeilen_neu integer, zeilen_geschlossen integer, zeilen_gesamt integer)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_ampel text;
  v_version bigint;
  v_neu integer;
  v_geschlossen integer;
  v_gesamt integer;
begin
  select l.ampel into v_ampel from ops.dq_lauf l where l.dq_lauf_id = p_dq_lauf_id;
  if v_ampel is null then raise exception 'Unbekannter DQ-Lauf %', p_dq_lauf_id; end if;
  if v_ampel = 'red' then raise exception 'Datenstand mit roter Ampel wird nicht veröffentlicht (DQ-Lauf %)', p_dq_lauf_id; end if;

  insert into ops.dataset_version (dq_lauf_id, zeilen_neu, zeilen_geschlossen, zeilen_gesamt)
  values (p_dq_lauf_id, 0, 0, 0) returning ops.dataset_version.version_id into v_version;

  update mart.fct_titel_jahr_hist h set gueltig_bis_version = v_version
  where h.gueltig_bis_version is null
    and not exists (
      select 1 from mart.fct_titel_jahr m
      where m.jahr = h.jahr and m.konto = h.konto and m.titel_key = h.titel_key and m.zeilen_hash = h.zeilen_hash);
  get diagnostics v_geschlossen = row_count;

  insert into mart.fct_titel_jahr_hist (
    jahr, konto, titel_key, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text, titel_nr, titel_text,
    titelgruppe_nr, titelgruppe_text, ausgabeart_text, flexibilisiert, seite, fkt, funktion_text, oberfunktion,
    oberfunktion_text, hauptfunktion, hauptfunktion_text, gruppierung_nr, gruppierung_text, obergruppe, obergruppe_text,
    hauptgruppe, hauptgruppe_text, soll_eur, soll_quelle, soll_xml_eur, ist_eur, ist_verfuegbar, abweichung_eur,
    ist_quote, haushaltsstand, im_haushaltsplan_xml, zeilen_hash, gueltig_ab_version)
  select
    m.jahr, m.konto, m.titel_key, m.einzelplan_nr, m.einzelplan_text, m.kapitel_nr, m.kapitel_text, m.titel_nr, m.titel_text,
    m.titelgruppe_nr, m.titelgruppe_text, m.ausgabeart_text, m.flexibilisiert, m.seite, m.fkt, m.funktion_text, m.oberfunktion,
    m.oberfunktion_text, m.hauptfunktion, m.hauptfunktion_text, m.gruppierung_nr, m.gruppierung_text, m.obergruppe, m.obergruppe_text,
    m.hauptgruppe, m.hauptgruppe_text, m.soll_eur, m.soll_quelle, m.soll_xml_eur, m.ist_eur, m.ist_verfuegbar, m.abweichung_eur,
    m.ist_quote, m.haushaltsstand, m.im_haushaltsplan_xml, m.zeilen_hash, v_version
  from mart.fct_titel_jahr m
  where not exists (
    select 1 from mart.fct_titel_jahr_hist h
    where h.gueltig_bis_version is null and h.jahr = m.jahr and h.konto = m.konto and h.titel_key = m.titel_key);
  get diagnostics v_neu = row_count;

  select count(*) into v_gesamt from mart.fct_titel_jahr_hist h where h.gueltig_bis_version is null;

  update ops.dataset_version d set is_current = false where d.is_current;
  update ops.dataset_version d
  set is_current = true, zeilen_neu = v_neu, zeilen_geschlossen = v_geschlossen, zeilen_gesamt = v_gesamt
  where d.version_id = v_version;

  return query select v_version, v_neu, v_geschlossen, v_gesamt;
end $$;

-- Behält in raw nur die maßgeblichen Läufe (Roadmap E17); ältere Rohdaten liegen im Release rohdaten
create function ops.raeume_raw_auf()
returns table (tabelle text, geloescht bigint)
language plpgsql
as $$
#variable_conflict use_column
declare
  n bigint;
begin
  create temporary table behalten_soll on commit drop as
    select distinct on (f.jahr) f.run_id
    from raw.source_file f join ops.load_run l on l.run_id = f.run_id
    where f.source_id = 'SRC_SOLL_XML' and l.status = 'succeeded' and l.params ->> 'datei' is null
    order by f.jahr, l.started_at desc, f.fetched_at desc;
  create temporary table behalten_api on commit drop as
    select distinct on (a.jahr, a.konto, a.quote) a.run_id
    from raw.api_abruf a join ops.load_run l on l.run_id = a.run_id
    where l.status = 'succeeded'
    order by a.jahr, a.konto, a.quote, l.started_at desc, a.quelle_timestamp desc;
  create temporary table behalten_systematik on commit drop as
    select distinct on (s.jahr, s.konto, s.sicht) s.run_id
    from raw.api_systematik_abruf s join ops.load_run l on l.run_id = s.run_id
    where l.status = 'succeeded'
    order by s.jahr, s.konto, s.sicht, l.started_at desc, s.quelle_timestamp desc;

  delete from raw.soll_titel t where t.run_id not in (select run_id from behalten_soll);
  get diagnostics n = row_count; tabelle := 'raw.soll_titel'; geloescht := n; return next;
  delete from raw.soll_kapitel t where t.run_id not in (select run_id from behalten_soll);
  get diagnostics n = row_count; tabelle := 'raw.soll_kapitel'; geloescht := n; return next;
  delete from raw.api_titel t where t.run_id not in (select run_id from behalten_api);
  get diagnostics n = row_count; tabelle := 'raw.api_titel'; geloescht := n; return next;
  delete from raw.api_knoten t where t.run_id not in (select run_id from behalten_api);
  get diagnostics n = row_count; tabelle := 'raw.api_knoten'; geloescht := n; return next;
  delete from raw.api_systematik t where t.run_id not in (select run_id from behalten_systematik);
  get diagnostics n = row_count; tabelle := 'raw.api_systematik'; geloescht := n; return next;

  drop table behalten_soll;
  drop table behalten_api;
  drop table behalten_systematik;
end $$;
