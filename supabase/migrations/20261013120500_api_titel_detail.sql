-- Plan 4: Titeldetail mit Zeitreihe über Ressortwechsel (Roadmap E10, zur Abfragezeit statt als Tabelle) und Fundstelle.

-- Seite im PDF des Einzelplans; die Seitenzahl der XML entspricht dem PDF-Link der internalapi (Stichprobe 2024).
create function semantic.fundstelle(p_jahr integer, p_einzelplan_nr text, p_seite integer)
returns jsonb
language sql
immutable
as $$
  select case when p_seite is not null and p_einzelplan_nr ~ '^[0-9]{2}$' then jsonb_build_object(
    'url', format('https://www.bundeshaushalt.de/static/daten/%s/soll/epl%s.pdf#page=%s', p_jahr, p_einzelplan_nr, p_seite),
    'seite', p_seite,
    'dokument', format('Haushaltsplan %s, Einzelplan %s', p_jahr, p_einzelplan_nr)) end
$$;

-- Zeitreihe eines Titels: gleicher Schlüssel im Nachbarjahr, sonst genau ein Kandidat mit gleicher Titelnummer
-- und gleichem normierten Text, dessen Schlüssel im Ausgangsjahr fehlt (und umgekehrt). Sonst endet die Kette.
create function semantic.titel_kette(p_version bigint, p_konto text, p_titel_key text, p_jahr integer)
returns table (jahr integer, titel_key text, verknuepfung text)
language plpgsql
stable
as $$
#variable_conflict use_column
declare
  v_nr       text;
  v_start    text;
  v_text     text;
  v_key      text;
  v_jahr     integer;
  v_richtung integer;
  v_naechst  text;
  v_kand     text[];
  v_rueck    integer;
begin
  select h.titel_nr, semantic.normtext(h.titel_text) into v_nr, v_start
  from semantic.stand(p_version) h
  where h.konto = p_konto and h.titel_key = p_titel_key and h.jahr = p_jahr;
  if v_nr is null then return; end if;

  jahr := p_jahr; titel_key := p_titel_key; verknuepfung := 'ausgangspunkt';
  return next;

  foreach v_richtung in array array[-1, 1] loop
    v_key := p_titel_key;
    v_jahr := p_jahr;
    v_text := v_start;
    loop
      select semantic.normtext(h.titel_text) into v_naechst
      from semantic.stand(p_version) h
      where h.konto = p_konto and h.jahr = v_jahr + v_richtung and h.titel_key = v_key;
      if found then
        v_jahr := v_jahr + v_richtung;
        v_text := v_naechst;
        jahr := v_jahr; titel_key := v_key; verknuepfung := 'gleich';
        return next;
        continue;
      end if;

      select array_agg(n.titel_key) into v_kand
      from semantic.stand(p_version) n
      where n.konto = p_konto and n.jahr = v_jahr + v_richtung and n.titel_nr = v_nr
        and semantic.normtext(n.titel_text) = v_text
        and not exists (select 1 from semantic.stand(p_version) a
                        where a.konto = p_konto and a.jahr = v_jahr and a.titel_key = n.titel_key);
      exit when coalesce(cardinality(v_kand), 0) <> 1;

      select count(*) into v_rueck
      from semantic.stand(p_version) a
      where a.konto = p_konto and a.jahr = v_jahr and a.titel_nr = v_nr
        and semantic.normtext(a.titel_text) = v_text
        and not exists (select 1 from semantic.stand(p_version) n
                        where n.konto = p_konto and n.jahr = v_jahr + v_richtung and n.titel_key = a.titel_key);
      exit when v_rueck <> 1;

      v_jahr := v_jahr + v_richtung;
      v_key := v_kand[1];
      jahr := v_jahr; titel_key := v_key; verknuepfung := 'nachgefuehrt';
      return next;
    end loop;
  end loop;
end $$;

create function api.get_titel_detail(p_titel_key text, p_jahr integer default null, p_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  t mart.fct_titel_jahr_hist;
  v_zeitreihe jsonb;
  v_nachgefuehrt boolean;
  v_hinweise text[] := array['Rechtlich verbindlich ist ausschließlich der veröffentlichte Haushaltsplan. Die Fundstelle verweist auf den ursprünglichen Haushaltsplan ohne Nachträge.'];
begin
  if p_titel_key is null or p_titel_key !~ '^[0-9]{9}$' then
    raise exception 'Titelschlüssel muss neunstellig sein (Kapitel und Titelnummer ohne Leerzeichen)' using errcode = '22023';
  end if;

  select * into t
  from semantic.stand(v.version_id) h
  where h.titel_key = p_titel_key and (p_jahr is null or h.jahr = p_jahr)
  order by h.jahr desc, h.konto
  limit 1;
  if not found then
    raise exception 'Titel % im Jahr % nicht gefunden', p_titel_key, coalesce(p_jahr::text, 'beliebig') using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'jahr', h.jahr, 'titel_key', h.titel_key, 'verknuepfung', k.verknuepfung,
           'einzelplan_nr', h.einzelplan_nr, 'kapitel_nr', h.kapitel_nr, 'titel_text', h.titel_text,
           'soll_eur', h.soll_eur, 'soll_quelle', h.soll_quelle, 'soll_xml_eur', h.soll_xml_eur,
           'ist_eur', h.ist_eur, 'ist_verfuegbar', h.ist_verfuegbar, 'abweichung_eur', h.abweichung_eur,
           'ist_quote', h.ist_quote, 'haushaltsstand', h.haushaltsstand,
           'fundstelle', semantic.fundstelle(h.jahr, h.einzelplan_nr, h.seite)) order by h.jahr), '[]'::jsonb),
         bool_or(k.verknuepfung = 'nachgefuehrt')
  into v_zeitreihe, v_nachgefuehrt
  from semantic.titel_kette(v.version_id, t.konto, t.titel_key, t.jahr) k
  join semantic.stand(v.version_id) h on h.jahr = k.jahr and h.konto = t.konto and h.titel_key = k.titel_key;

  if v_nachgefuehrt then
    v_hinweise := array_append(v_hinweise, 'Die Zeitreihe verbindet Jahre mit anderem Titelschlüssel, wenn Titelnummer und Bezeichnung übereinstimmen und die Zuordnung eindeutig ist, zum Beispiel nach einem Ressortwechsel.');
  end if;

  return jsonb_build_object(
    'version', v.version_id,
    'titel', to_jsonb(t) - 'zeilen_hash' - 'gueltig_ab_version' - 'gueltig_bis_version',
    'fundstelle', semantic.fundstelle(t.jahr, t.einzelplan_nr, t.seite),
    'zeitreihe', v_zeitreihe,
    'hinweise', to_jsonb(v_hinweise));
end $$;

revoke all on function api.get_titel_detail(text, integer, bigint) from public;
grant execute on function api.get_titel_detail(text, integer, bigint) to anon, authenticated, service_role;
revoke all on function semantic.fundstelle(integer, text, integer), semantic.titel_kette(bigint, text, text, integer) from public;
