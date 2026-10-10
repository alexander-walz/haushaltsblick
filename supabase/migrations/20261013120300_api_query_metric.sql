-- Plan 4: eine generische Abfragefunktion für Dashboard und Agent (Konzept Abschnitt 10).
-- SQL entsteht nur aus Positivlisten (Bezeichner mit %I); Filterwerte gehen als Parameter $3 hinein.
create function api.query_metric(
  p_metrics    text[],
  p_group_by   text[]  default '{}',
  p_filters    jsonb   default '{}',
  p_order_by   text    default null,
  p_absteigend boolean default true,
  p_limit      integer default 50,
  p_version    bigint  default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  c_dims constant text[] := array['jahr', 'konto', 'einzelplan_nr', 'kapitel_nr', 'titelgruppe_nr', 'titel_key',
    'hauptfunktion', 'oberfunktion', 'fkt', 'hauptgruppe', 'obergruppe', 'gruppierung_nr',
    'flexibilisiert', 'haushaltsstand', 'soll_quelle'];
  c_texte constant jsonb := '{"einzelplan_nr": "einzelplan_text", "kapitel_nr": "kapitel_text",
    "titelgruppe_nr": "titelgruppe_text", "titel_key": "titel_text", "hauptfunktion": "hauptfunktion_text",
    "oberfunktion": "oberfunktion_text", "fkt": "funktion_text", "hauptgruppe": "hauptgruppe_text",
    "obergruppe": "obergruppe_text", "gruppierung_nr": "gruppierung_text"}';
  -- Für den Vorjahresvergleich nicht gleichsetzen: Jahr und Konto stehen in der Join-Bedingung, Stand und Quelle wechseln je Jahr.
  c_ohne_vj_join constant text[] := array['jahr', 'konto', 'haushaltsstand', 'soll_quelle'];
  c_ist constant text[] := array['ist', 'abweichung', 'abweichung_rel', 'ist_quote', 'ist_anteil', 'ist_pro_kopf',
    'ist_pro_tag', 'ist_vj_abs', 'ist_vj_rel'];
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  v_sem bigint := semantic.semantik_von(v);
  v_eingabe jsonb := coalesce(p_filters, '{}'::jsonb);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_metrics text[];
  v_dims text[];
  v_filter jsonb := '{}'::jsonb;
  v_key text;
  v_wert jsonb;
  v_where text := '';
  v_where_vj text := '';
  v_m text;
  v_d text;
  v_ausdruck text;
  v_liste text;
  v_sel_basis text[] := array[]::text[];
  v_group_basis text[] := array['h.jahr', 'h.konto'];
  v_sel_final text[] := array[]::text[];
  v_group_final text[] := array[]::text[];
  v_order text[] := array[]::text[];
  v_join_vj text := 'vj.b_jahr = b.b_jahr - 1 and vj.b_konto = b.b_konto';
  v_braucht_vj boolean;
  v_braucht_gesamt boolean;
  v_braucht_ew boolean;
  v_basis text;
  v_sql text;
  v_zeilen jsonb;
  v_gesamt bigint;
  v_ist_fehlt boolean;
  v_xml_soll boolean;
  v_entwurf boolean;
  v_max_jahr integer;
  v_ew_jahr integer;
  v_hinweise text[] := array[]::text[];
begin
  -- Kennzahlen: mindestens eine, ohne Dubletten, alle im Katalog der Semantik-Version
  if p_metrics is null or cardinality(p_metrics) = 0 then
    raise exception 'Mindestens eine Kennzahl angeben' using errcode = '22023';
  end if;
  select array_agg(x.m order by x.o) into v_metrics
  from (select u.m, min(u.o) as o from unnest(p_metrics) with ordinality as u(m, o) group by u.m) x;
  foreach v_m in array v_metrics loop
    if v_m is null or not exists (select 1 from semantic.kennzahl k where k.semantik_version_id = v_sem and k.kennzahl_id = v_m) then
      raise exception 'Unbekannte Kennzahl: %', coalesce(v_m, 'null') using errcode = '22023';
    end if;
  end loop;

  -- Gruppierungen aus der Positivliste
  select coalesce(array_agg(x.d order by x.o), array[]::text[]) into v_dims
  from (select u.d, min(u.o) as o from unnest(coalesce(p_group_by, array[]::text[])) with ordinality as u(d, o) group by u.d) x;
  foreach v_d in array v_dims loop
    if v_d is null or not v_d = any(c_dims) then
      raise exception 'Unzulässige Gruppierung: %', coalesce(v_d, 'null') using errcode = '22023';
    end if;
  end loop;

  -- Filter: Schlüssel aus der Positivliste, Werte als Liste einfacher Werte, eingesetzt nur über $3
  if jsonb_typeof(v_eingabe) <> 'object' then
    raise exception 'Filter müssen ein JSON-Objekt sein' using errcode = '22023';
  end if;
  for v_key, v_wert in select e.key, e.value from jsonb_each(v_eingabe) e loop
    if v_key in ('jahr_von', 'jahr_bis') then
      if jsonb_typeof(v_wert) <> 'number' or v_wert::text !~ '^[0-9]{4}$' then
        raise exception 'Filter % braucht eine Jahreszahl', v_key using errcode = '22023';
      end if;
      v_filter := v_filter || jsonb_build_object(v_key, v_wert);
      v_where := v_where || format(' and h.jahr %s ($3->>%L)::integer', case when v_key = 'jahr_von' then '>=' else '<=' end, v_key);
    elsif v_key = any(c_dims) then
      if jsonb_typeof(v_wert) <> 'array' then
        v_wert := jsonb_build_array(v_wert);
      end if;
      if jsonb_array_length(v_wert) = 0
         or exists (select 1 from jsonb_array_elements(v_wert) e where jsonb_typeof(e) not in ('string', 'number', 'boolean')) then
        raise exception 'Filter % braucht einen Wert oder eine Liste einfacher Werte', v_key using errcode = '22023';
      end if;
      v_filter := v_filter || jsonb_build_object(v_key, v_wert);
      v_where := v_where || format(' and h.%I::text = any(array(select jsonb_array_elements_text($3->%L)))', v_key, v_key);
      if v_key <> 'jahr' then
        v_where_vj := v_where_vj || format(' and h.%I::text = any(array(select jsonb_array_elements_text($3->%L)))', v_key, v_key);
      end if;
    else
      raise exception 'Unzulässiger Filter: %', v_key using errcode = '22023';
    end if;
  end loop;

  -- Konto und Jahr je Ergebniszeile
  if not ('konto' = any(v_dims) or (v_filter ? 'konto' and jsonb_array_length(v_filter -> 'konto') = 1)) then
    raise exception 'Konto festlegen: Filter konto (ausgaben oder einnahmen) oder Gruppierung nach konto' using errcode = '22023';
  end if;
  if not ('jahr' = any(v_dims) or (v_filter ? 'jahr' and jsonb_array_length(v_filter -> 'jahr') = 1)) then
    select string_agg(k.kennzahl_id, ', ' order by k.reihenfolge) into v_liste
    from semantic.kennzahl k
    where k.semantik_version_id = v_sem and k.kennzahl_id = any(v_metrics) and k.braucht_jahr;
    if v_liste is not null then
      raise exception 'Kennzahlen % brauchen ein einzelnes Jahr je Zeile: nach jahr gruppieren oder genau ein Jahr filtern', v_liste
        using errcode = '22023';
    end if;
  end if;

  if p_order_by is not null and not (p_order_by = any(v_metrics) or p_order_by = any(v_dims)) then
    raise exception 'Sortierung nur nach einer angefragten Kennzahl oder Gruppierung: %', p_order_by using errcode = '22023';
  end if;

  v_braucht_vj := v_metrics && array['soll_vj_abs', 'soll_vj_rel', 'ist_vj_abs', 'ist_vj_rel'];
  v_braucht_gesamt := v_metrics && array['soll_anteil', 'ist_anteil'];
  v_braucht_ew := v_metrics && array['soll_pro_kopf', 'ist_pro_kopf'];

  -- Stufe 1 (basis): je Gruppierung, Jahr und Konto. Stufe 2 (zeilen): je Gruppierung.
  foreach v_d in array v_dims loop
    v_sel_basis := v_sel_basis || format('h.%I as %I', v_d, v_d);
    v_group_basis := v_group_basis || format('h.%I', v_d);
    v_sel_final := v_sel_final || format('b.%I', v_d);
    v_group_final := v_group_final || format('b.%I', v_d);
    if c_texte ? v_d then
      v_sel_basis := v_sel_basis || format('max(h.%1$I) as %1$I', c_texte ->> v_d);
      v_sel_final := v_sel_final || format('(array_agg(b.%1$I order by b.b_jahr desc, b.%1$I))[1] as %1$I', c_texte ->> v_d);
    end if;
    if not v_d = any(c_ohne_vj_join) then
      v_join_vj := v_join_vj || format(' and vj.%1$I is not distinct from b.%1$I', v_d);
    end if;
  end loop;

  foreach v_m in array v_metrics loop
    v_ausdruck := case v_m
      when 'soll' then 'sum(b.soll)'
      when 'soll_xml' then 'sum(b.soll_xml)'
      when 'ist' then 'case when bool_and(b.ist_ok) then sum(b.ist) end'
      when 'abweichung' then 'case when bool_and(b.ist_ok and b.api_ok) then sum(b.abw) end'
      when 'abweichung_rel' then 'case when bool_and(b.ist_ok and b.api_ok) then round(sum(b.abw) / nullif(sum(b.soll), 0), 6) end'
      when 'ist_quote' then 'case when bool_and(b.ist_ok and b.api_ok) then round(sum(b.ist) / nullif(sum(b.soll), 0), 6) end'
      when 'soll_anteil' then 'round(sum(b.soll) / nullif(sum(g.soll_gesamt), 0), 6)'
      when 'ist_anteil' then 'case when bool_and(b.ist_ok and g.ist_ok_gesamt) then round(sum(b.ist) / nullif(sum(g.ist_gesamt), 0), 6) end'
      when 'soll_pro_kopf' then 'round(sum(b.soll) / nullif(max(ew.einwohner), 0), 2)'
      when 'ist_pro_kopf' then 'case when bool_and(b.ist_ok) then round(sum(b.ist) / nullif(max(ew.einwohner), 0), 2) end'
      when 'soll_pro_tag' then 'round(sum(b.soll) / max(extract(doy from make_date(b.b_jahr, 12, 31))), 2)'
      when 'ist_pro_tag' then 'case when bool_and(b.ist_ok) then round(sum(b.ist) / max(extract(doy from make_date(b.b_jahr, 12, 31))), 2) end'
      when 'soll_vj_abs' then 'sum(b.soll) - sum(vj.soll)'
      when 'soll_vj_rel' then 'round((sum(b.soll) - sum(vj.soll)) / nullif(sum(vj.soll), 0), 6)'
      when 'ist_vj_abs' then 'case when bool_and(b.ist_ok and vj.ist_ok) then sum(b.ist) - sum(vj.ist) end'
      when 'ist_vj_rel' then 'case when bool_and(b.ist_ok and vj.ist_ok) then round((sum(b.ist) - sum(vj.ist)) / nullif(sum(vj.ist), 0), 6) end'
      when 'titel_anzahl' then 'sum(b.n)'
    end;
    if v_ausdruck is null then
      raise exception 'Kennzahl % ist im Katalog, aber nicht umgesetzt', v_m;
    end if;
    v_sel_final := v_sel_final || (v_ausdruck || format(' as %I', v_m));
  end loop;

  if p_order_by is not null then
    v_order := v_order || format('f.%I %s nulls last', p_order_by, case when p_absteigend then 'desc' else 'asc' end);
  end if;
  foreach v_d in array v_dims loop
    v_order := v_order || format('f.%I', v_d);
  end loop;
  if cardinality(v_order) = 0 then
    v_order := array['null'];
  end if;

  v_basis := 'select ' || array_to_string(v_sel_basis || array[
      'h.jahr as b_jahr', 'h.konto as b_konto', 'sum(h.soll_eur) as soll', 'sum(h.soll_xml_eur) as soll_xml',
      'sum(h.ist_eur) as ist', 'bool_and(h.ist_verfuegbar) as ist_ok', 'bool_and(h.soll_quelle = ''api'') as api_ok',
      'sum(h.abweichung_eur) as abw', 'count(*) as n'], ', ')
    || ' from semantic.stand($1) h where true {where} group by ' || array_to_string(v_group_basis, ', ');

  v_sql := 'with basis as (' || replace(v_basis, '{where}', v_where) || ')'
    || case when v_braucht_vj then ', vorjahr as (' || replace(v_basis, '{where}', v_where_vj) || ')' else '' end
    || case when v_braucht_gesamt then
         ', gesamt as (select h.jahr as g_jahr, h.konto as g_konto, sum(h.soll_eur) as soll_gesamt, sum(h.ist_eur) as ist_gesamt,'
         || ' bool_and(h.ist_verfuegbar) as ist_ok_gesamt from semantic.stand($1) h group by h.jahr, h.konto)'
       else '' end
    || ', zeilen as (select ' || array_to_string(v_sel_final, ', ') || ' from basis b'
    || case when v_braucht_vj then ' left join vorjahr vj on ' || v_join_vj else '' end
    || case when v_braucht_gesamt then ' left join gesamt g on g.g_jahr = b.b_jahr and g.g_konto = b.b_konto' else '' end
    || case when v_braucht_ew then
         ' left join lateral (select e.einwohner from semantic.einwohner e where e.semantik_version_id = $2'
         || ' and e.jahr <= b.b_jahr order by e.jahr desc limit 1) ew on true'
       else '' end
    || case when cardinality(v_group_final) > 0 then ' group by ' || array_to_string(v_group_final, ', ') else '' end
    || ' having count(*) > 0)'
    || ' select coalesce(jsonb_agg(to_jsonb(r) - ''_nr'' - ''_gesamt'' order by r._nr), ''[]''::jsonb), coalesce(max(r._gesamt), 0)'
    || ' from (select f.*, row_number() over (order by ' || array_to_string(v_order, ', ') || ') as _nr,'
    || ' count(*) over () as _gesamt from zeilen f order by _nr limit ' || v_limit || ') r';

  execute v_sql into v_zeilen, v_gesamt using v.version_id, v_sem, v_filter;

  -- Hinweise zur Auswahl
  execute 'select bool_or(not h.ist_verfuegbar), bool_or(h.soll_quelle is distinct from ''api''),'
    || ' bool_or(h.haushaltsstand = ''Regierungsentwurf''), max(h.jahr) from semantic.stand($1) h where true' || v_where
    into v_ist_fehlt, v_xml_soll, v_entwurf, v_max_jahr
    using v.version_id, v_sem, v_filter;
  if v_metrics && c_ist and v_ist_fehlt then
    v_hinweise := array_append(v_hinweise, 'Ist liegt nur für abgeschlossene Jahre vor. Für die übrigen Jahre bleibt der Wert leer, nie 0.');
  end if;
  if v_metrics && array['abweichung', 'abweichung_rel', 'ist_quote'] and v_xml_soll then
    v_hinweise := array_append(v_hinweise, 'Abweichung und Ist-Quote gibt es nur mit maßgeblichem Soll aus der internalapi. Mit Soll aus dem Haushaltsplan (XML) bleiben sie leer.');
  end if;
  if v_braucht_ew then
    select max(e.jahr) into v_ew_jahr from semantic.einwohner e where e.semantik_version_id = v_sem;
    if v_max_jahr > v_ew_jahr then
      v_hinweise := array_append(v_hinweise, format('Einwohnerzahl für Jahre nach %s mit dem letzten verfügbaren Wert fortgeschrieben (Eurostat).', v_ew_jahr));
    end if;
  end if;
  if v_braucht_vj then
    v_hinweise := array_append(v_hinweise, 'Vorjahresvergleich je Schlüssel. Umbenennungen und Ressortwechsel sind nicht nachgeführt.');
  end if;
  if v_entwurf then
    v_hinweise := array_append(v_hinweise, 'Enthält den Regierungsentwurf: noch kein beschlossener Haushalt.');
  end if;
  if v_gesamt > v_limit then
    v_hinweise := array_append(v_hinweise, format('Ergebnis auf %s von %s Zeilen gekürzt.', v_limit, v_gesamt));
  end if;

  return jsonb_build_object(
    'version', v.version_id,
    'semantik_version', v_sem,
    'vorlage', 'query_metric.v1',
    'parameter', jsonb_build_object('kennzahlen', to_jsonb(v_metrics), 'gruppierung', to_jsonb(v_dims), 'filter', v_filter,
      'sortierung', p_order_by, 'absteigend', p_absteigend, 'limit', v_limit),
    'einheiten', (select jsonb_object_agg(k.kennzahl_id, k.einheit) from semantic.kennzahl k
                  where k.semantik_version_id = v_sem and k.kennzahl_id = any(v_metrics)),
    'zeilen', v_zeilen,
    'zeilen_gesamt', v_gesamt,
    'hinweise', to_jsonb(v_hinweise));
end $$;

revoke all on function api.query_metric(text[], text[], jsonb, text, boolean, integer, bigint) from public;
grant execute on function api.query_metric(text[], text[], jsonb, text, boolean, integer, bigint) to anon, authenticated, service_role;
