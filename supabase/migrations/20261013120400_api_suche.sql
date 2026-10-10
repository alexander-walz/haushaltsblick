-- Plan 4: Freitextsuche über Einzelpläne, Kapitel, Titel, Funktionen und Gruppierungen eines Jahres,
-- mit Synonymen der Semantik-Version und Trigramm-Ähnlichkeit (pg_trgm).
create or replace function api.search_entities(
  p_q       text,
  p_jahr    integer default null,
  p_typ     text    default null,
  p_limit   integer default 20,
  p_version bigint  default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, pg_temp
as $$
declare
  c_typen constant text[] := array['einzelplan', 'funktion', 'oberfunktion', 'hauptfunktion', 'kapitel',
    'gruppierung', 'obergruppe', 'hauptgruppe', 'titel'];
  c_filter constant jsonb := '{"einzelplan": "einzelplan_nr", "kapitel": "kapitel_nr", "titel": "titel_key",
    "funktion": "fkt", "oberfunktion": "oberfunktion", "hauptfunktion": "hauptfunktion",
    "gruppierung": "gruppierung_nr", "obergruppe": "obergruppe", "hauptgruppe": "hauptgruppe"}';
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  v_sem bigint := semantic.semantik_von(v);
  v_q text := semantic.normtext(p_q);
  v_schluessel text := regexp_replace(coalesce(p_q, ''), '\s', '', 'g');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_jahr integer;
  v_treffer jsonb;
begin
  if length(coalesce(p_q, '')) > 200 then
    raise exception 'Suchbegriff zu lang (höchstens 200 Zeichen)' using errcode = '22023';
  end if;
  if length(v_q) < 2 then
    raise exception 'Suchbegriff zu kurz (mindestens zwei Zeichen)' using errcode = '22023';
  end if;
  if p_typ is not null and not p_typ = any(c_typen) then
    raise exception 'Unbekannter Typ: % (erlaubt: %)', p_typ, array_to_string(c_typen, ', ') using errcode = '22023';
  end if;

  select coalesce(p_jahr, max(s.jahr) filter (where s.jahr <= extract(year from current_date)::integer), max(s.jahr))
  into v_jahr
  from semantic.stand(v.version_id) s;

  with stand as (
    select * from semantic.stand(v.version_id) s where s.jahr = v_jahr
  ),
  entitaeten as (
    select 'einzelplan' as typ, s.konto, s.einzelplan_nr as schluessel, max(s.einzelplan_text) as bezeichnung, sum(s.soll_eur) as soll
      from stand s group by s.konto, s.einzelplan_nr
    union all
    select 'kapitel', s.konto, s.kapitel_nr, max(s.kapitel_text), sum(s.soll_eur) from stand s group by s.konto, s.kapitel_nr
    union all
    select 'titel', s.konto, s.titel_key, max(s.titel_text), sum(s.soll_eur) from stand s group by s.konto, s.titel_key
    union all
    select 'funktion', s.konto, s.fkt, max(s.funktion_text), sum(s.soll_eur) from stand s where s.fkt is not null group by s.konto, s.fkt
    union all
    select 'oberfunktion', s.konto, s.oberfunktion, max(s.oberfunktion_text), sum(s.soll_eur)
      from stand s where s.oberfunktion is not null group by s.konto, s.oberfunktion
    union all
    select 'hauptfunktion', s.konto, s.hauptfunktion, max(s.hauptfunktion_text), sum(s.soll_eur)
      from stand s where s.hauptfunktion is not null group by s.konto, s.hauptfunktion
    union all
    select 'gruppierung', s.konto, s.gruppierung_nr, max(s.gruppierung_text), sum(s.soll_eur)
      from stand s where s.gruppierung_nr is not null group by s.konto, s.gruppierung_nr
    union all
    select 'obergruppe', s.konto, s.obergruppe, max(s.obergruppe_text), sum(s.soll_eur)
      from stand s where s.obergruppe is not null group by s.konto, s.obergruppe
    union all
    select 'hauptgruppe', s.konto, s.hauptgruppe, max(s.hauptgruppe_text), sum(s.soll_eur)
      from stand s where s.hauptgruppe is not null group by s.konto, s.hauptgruppe
  ),
  normiert as (
    select e.*, semantic.normtext(e.bezeichnung) as n
    from entitaeten e
    where p_typ is null or e.typ = p_typ
  ),
  synonyme as (
    select sy.typ, sy.konto, sy.schluessel,
           max(case
                 when semantic.normtext(sy.begriff) = v_q then 1.0
                 when (' ' || v_q || ' ') like ('% ' || semantic.normtext(sy.begriff) || ' %') then 0.95
                 when similarity(semantic.normtext(sy.begriff), v_q) >= 0.5 then round((similarity(semantic.normtext(sy.begriff), v_q) * 0.9)::numeric, 3)
               end) as wert
    from semantic.synonym sy
    where sy.semantik_version_id = v_sem
      and v_jahr >= sy.jahr_von and (sy.jahr_bis is null or v_jahr <= sy.jahr_bis)
    group by sy.typ, sy.konto, sy.schluessel
  ),
  bewertet as (
    select x.*,
           greatest(coalesce(x.w_schluessel, 0), coalesce(x.w_synonym, 0), coalesce(x.w_text, 0)) as aehnlichkeit,
           case when x.w_schluessel is not null then 'schluessel'
                when x.w_synonym is not null and x.w_synonym >= coalesce(x.w_text, 0) then 'synonym'
                else 'text' end as treffer
    from (
      select n.*,
             case when n.schluessel = v_schluessel then 1.0 end as w_schluessel,
             sy.wert as w_synonym,
             case when n.n = v_q then 1.0
                  else least(0.9, greatest(similarity(v_q, n.n), word_similarity(v_q, n.n),
                      case when n.n <> '' and position(v_q in n.n) > 0 then 0.8 else 0 end))::numeric
             end as w_text
      from normiert n
      left join synonyme sy on sy.typ = n.typ and sy.konto = n.konto and sy.schluessel = n.schluessel
    ) x
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'typ', r.typ, 'konto', r.konto, 'schluessel', r.schluessel, 'bezeichnung', r.bezeichnung,
           'soll_eur', r.soll, 'aehnlichkeit', round(r.aehnlichkeit, 3), 'treffer', r.treffer,
           'filter', jsonb_build_object(c_filter ->> r.typ, r.schluessel, 'konto', r.konto)) order by r.rang), '[]'::jsonb)
  into v_treffer
  from (
    select b.*, row_number() over (
             order by b.aehnlichkeit desc,
                      case b.treffer when 'schluessel' then 1 when 'synonym' then 2 else 3 end,
                      array_position(c_typen, b.typ), abs(b.soll) desc nulls last, b.schluessel) as rang
    from bewertet b
    where b.aehnlichkeit >= 0.35
    order by rang
    limit v_limit
  ) r;

  return jsonb_build_object(
    'version', v.version_id,
    'semantik_version', v_sem,
    'jahr', v_jahr,
    'suchbegriff', p_q,
    'treffer', v_treffer);
end $$;

revoke all on function api.search_entities(text, integer, text, integer, bigint) from public;
grant execute on function api.search_entities(text, integer, text, integer, bigint) to anon, authenticated, service_role;
