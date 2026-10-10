-- Semantik an die Datenversion binden (Roadmap E3): Die Seeds core.semantik_* werden bei jeder
-- Veröffentlichung als unveränderliche semantik_version abgelegt, neu nur bei geändertem Inhalt.
create table semantic.semantik_version (
  semantik_version_id bigint generated always as identity primary key,
  erstellt_am         timestamptz not null default now(),
  inhalt_hash         text not null unique
);

create table semantic.kennzahl (
  semantik_version_id bigint not null references semantic.semantik_version,
  kennzahl_id         text not null,
  name                text not null,
  definition          text not null,
  formel              text not null,
  einheit             text not null check (einheit in ('EUR', 'Anteil', 'Anzahl')),
  braucht_jahr        boolean not null,
  reihenfolge         integer not null,
  primary key (semantik_version_id, kennzahl_id)
);

create table semantic.synonym (
  semantik_version_id bigint not null references semantic.semantik_version,
  begriff             text not null,
  typ                 text not null check (typ in ('einzelplan', 'funktion', 'oberfunktion', 'hauptfunktion', 'gruppierung', 'obergruppe', 'hauptgruppe')),
  schluessel          text not null,
  konto               text not null check (konto in ('einnahmen', 'ausgaben')),
  jahr_von            integer not null,
  jahr_bis            integer,
  primary key (semantik_version_id, begriff, typ, schluessel, konto, jahr_von)
);

create table semantic.glossar (
  semantik_version_id bigint not null references semantic.semantik_version,
  begriff             text not null,
  erklaerung          text not null,
  beispiel            text,
  primary key (semantik_version_id, begriff)
);

create table semantic.einwohner (
  semantik_version_id bigint not null references semantic.semantik_version,
  jahr                integer not null,
  einwohner           bigint not null check (einwohner > 0),
  stichtag            date not null,
  quelle              text not null,
  hinweis             text,
  primary key (semantik_version_id, jahr)
);

alter table semantic.semantik_version enable row level security;
alter table semantic.kennzahl enable row level security;
alter table semantic.synonym enable row level security;
alter table semantic.glossar enable row level security;
alter table semantic.einwohner enable row level security;
revoke all on all tables in schema semantic from anon, authenticated;
alter default privileges in schema semantic revoke all on tables from anon, authenticated;

-- Versionen vor Plan 4 bleiben ohne Semantik (null).
alter table ops.dataset_version add column semantik_version_id bigint references semantic.semantik_version;

-- Legt den Inhalt der Seeds als Semantik-Version ab oder liefert die bestehende Version mit gleichem Inhalt.
create function ops.sichere_semantik()
returns bigint
language plpgsql
as $$
declare
  v_hash text;
  v_id   bigint;
begin
  if to_regclass('core.semantik_kennzahlen') is null or to_regclass('core.semantik_synonyme') is null
     or to_regclass('core.semantik_glossar') is null or to_regclass('core.semantik_einwohner') is null then
    raise exception 'Semantik-Seeds fehlen in core (zuerst pnpm dbt seed ausführen)';
  end if;

  select md5(concat_ws('|',
    (select string_agg(k::text, ';' order by k.kennzahl_id) from core.semantik_kennzahlen k),
    (select string_agg(s::text, ';' order by s.begriff, s.typ, s.schluessel, s.konto, s.jahr_von) from core.semantik_synonyme s),
    (select string_agg(g::text, ';' order by g.begriff) from core.semantik_glossar g),
    (select string_agg(e::text, ';' order by e.jahr) from core.semantik_einwohner e)))
  into v_hash;

  select sv.semantik_version_id into v_id from semantic.semantik_version sv where sv.inhalt_hash = v_hash;
  if v_id is not null then return v_id; end if;

  insert into semantic.semantik_version (inhalt_hash) values (v_hash) returning semantik_version_id into v_id;
  insert into semantic.kennzahl (semantik_version_id, kennzahl_id, name, definition, formel, einheit, braucht_jahr, reihenfolge)
    select v_id, k.kennzahl_id, k.name, k.definition, k.formel, k.einheit, k.braucht_jahr, k.reihenfolge from core.semantik_kennzahlen k;
  insert into semantic.synonym (semantik_version_id, begriff, typ, schluessel, konto, jahr_von, jahr_bis)
    select v_id, s.begriff, s.typ, s.schluessel, s.konto, s.jahr_von, s.jahr_bis from core.semantik_synonyme s;
  insert into semantic.glossar (semantik_version_id, begriff, erklaerung, beispiel)
    select v_id, g.begriff, g.erklaerung, g.beispiel from core.semantik_glossar g;
  insert into semantic.einwohner (semantik_version_id, jahr, einwohner, stichtag, quelle, hinweis)
    select v_id, e.jahr, e.einwohner, e.stichtag, e.quelle, e.hinweis from core.semantik_einwohner e;
  return v_id;
end $$;

revoke execute on function ops.sichere_semantik() from public;

-- Wie 20261010120000, zusätzlich mit Semantik-Version (create or replace behält die Rechte).
create or replace function ops.veroeffentliche_version(p_dq_lauf_id bigint)
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

  insert into ops.dataset_version (dq_lauf_id, zeilen_neu, zeilen_geschlossen, zeilen_gesamt, semantik_version_id)
  values (p_dq_lauf_id, 0, 0, 0, ops.sichere_semantik()) returning ops.dataset_version.version_id into v_version;

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
