-- Plan 4: Grundlagen der Abfrageschicht. Nach außen sichtbar sind nur Funktionen im Schema api.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

do $$
begin
  if (select e.extnamespace::regnamespace::text from pg_extension e where e.extname = 'pg_trgm') <> 'extensions'
     or (select e.extnamespace::regnamespace::text from pg_extension e where e.extname = 'unaccent') <> 'extensions' then
    raise exception 'pg_trgm und unaccent müssen im Schema extensions liegen (search_path der api-Funktionen)';
  end if;
end $$;

-- Funktionen sind in Postgres standardmäßig für PUBLIC ausführbar, deshalb entzieht jede Funktion in api und semantic
-- das Recht ausdrücklich mit revoke. Ein Test wacht darüber.
grant usage on schema api to anon, authenticated, service_role;

-- Für die Titel-Lineage (Task 7): Titel gleicher Nummer über die Jahre.
create index fct_titel_jahr_hist_titel_nr on mart.fct_titel_jahr_hist (titel_nr, konto, jahr);

-- Vergleichstext für Suche und Lineage: klein, ohne Akzente, nur Buchstaben a bis z, Ziffern und einfache Leerzeichen.
-- unaccent mit ausdrücklichem Wörterbuch, weil die Ein-Argument-Form das Wörterbuch über den search_path sucht.
create function semantic.normtext(p text)
returns text
language sql
stable
as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Alle Zeilen der Historie, die in einer Datenversion gelten (Roadmap E16). Einfache SQL-Funktion, damit Postgres sie einbettet.
create function semantic.stand(p_version bigint)
returns setof mart.fct_titel_jahr_hist
language sql
stable
as $$
  select * from mart.fct_titel_jahr_hist h
  where h.gueltig_ab_version <= p_version and (h.gueltig_bis_version is null or h.gueltig_bis_version > p_version)
$$;

create function semantic.version_oder_aktuell(p_version bigint)
returns ops.dataset_version
language plpgsql
stable
as $$
declare
  v ops.dataset_version;
begin
  if p_version is null then
    select * into v from ops.dataset_version d where d.is_current;
    if not found then raise exception 'Noch keine Datenversion veröffentlicht'; end if;
  else
    select * into v from ops.dataset_version d where d.version_id = p_version;
    if not found then raise exception 'Unbekannte Datenversion %', p_version using errcode = '22023'; end if;
  end if;
  return v;
end $$;

create function semantic.semantik_von(p_version ops.dataset_version)
returns bigint
language plpgsql
stable
as $$
begin
  if p_version.semantik_version_id is null then
    raise exception 'Datenversion % ist mit keiner Semantik verknüpft (vor Plan 4 veröffentlicht)', p_version.version_id using errcode = '22023';
  end if;
  return p_version.semantik_version_id;
end $$;

-- Datenstand: Version, Ampel, nicht bestandene Prüfungen, Jahre mit Haushaltsstand und Verfügbarkeit des Ist.
create function api.get_dataset_status(p_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  l ops.dq_lauf;
begin
  select * into l from ops.dq_lauf q where q.dq_lauf_id = v.dq_lauf_id;
  return jsonb_build_object(
    'version', v.version_id,
    'veroeffentlicht_am', v.erstellt_am,
    'ist_aktuell', v.is_current,
    'semantik_version', v.semantik_version_id,
    'ampel', l.ampel,
    'score', l.score,
    'zeilen', v.zeilen_gesamt,
    'pruefungen', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'check_id', e.check_id, 'status', e.status, 'failures', e.failures,
               'schwere', c.schwere, 'beschreibung', c.beschreibung) order by e.check_id), '[]'::jsonb)
      from ops.dq_ergebnis e join ops.dq_check c on c.check_id = e.check_id
      where e.dq_lauf_id = v.dq_lauf_id and e.status <> 'pass'),
    'jahre', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'jahr', j.jahr, 'konto', j.konto, 'haushaltsstand', j.haushaltsstand, 'soll_quelle', j.soll_quelle,
               'ist_verfuegbar', j.ist_verfuegbar, 'titel', j.titel) order by j.jahr, j.konto), '[]'::jsonb)
      from (
        select s.jahr, s.konto, min(s.haushaltsstand) as haushaltsstand, min(s.soll_quelle) as soll_quelle,
               bool_and(s.ist_verfuegbar) as ist_verfuegbar, count(*) as titel
        from semantic.stand(v.version_id) s
        group by s.jahr, s.konto) j));
end $$;

create function api.list_kennzahlen(p_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  v_sem bigint := semantic.semantik_von(v);
begin
  return jsonb_build_object(
    'version', v.version_id,
    'semantik_version', v_sem,
    'kennzahlen', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'kennzahl_id', k.kennzahl_id, 'name', k.name, 'definition', k.definition, 'formel', k.formel,
               'einheit', k.einheit, 'braucht_jahr', k.braucht_jahr) order by k.reihenfolge), '[]'::jsonb)
      from semantic.kennzahl k where k.semantik_version_id = v_sem));
end $$;

create function api.get_glossar(p_begriff text default null, p_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, pg_temp
as $$
declare
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  v_sem bigint := semantic.semantik_von(v);
  v_q text := semantic.normtext(p_begriff);
begin
  return jsonb_build_object(
    'version', v.version_id,
    'semantik_version', v_sem,
    'eintraege', (
      select coalesce(jsonb_agg(jsonb_build_object('begriff', g.begriff, 'erklaerung', g.erklaerung, 'beispiel', g.beispiel)
                                order by g.rang desc, g.begriff), '[]'::jsonb)
      from (
        select gl.begriff, gl.erklaerung, gl.beispiel,
               case when v_q = '' then 0
                    else greatest(similarity(semantic.normtext(gl.begriff), v_q), word_similarity(v_q, semantic.normtext(gl.begriff))) end as rang
        from semantic.glossar gl
        where gl.semantik_version_id = v_sem) g
      where v_q = '' or g.rang >= 0.4));
end $$;

revoke all on function api.get_dataset_status(bigint), api.list_kennzahlen(bigint), api.get_glossar(text, bigint) from public;
grant execute on function api.get_dataset_status(bigint), api.list_kennzahlen(bigint), api.get_glossar(text, bigint)
  to anon, authenticated, service_role;
revoke all on function semantic.normtext(text), semantic.stand(bigint), semantic.version_oder_aktuell(bigint),
  semantic.semantik_von(ops.dataset_version) from public;
