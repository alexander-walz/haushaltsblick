-- Ein Titel je Jahr und Konto mit maßgeblichem Soll (API, sonst XML), XML-Soll und Ist (Roadmap E14).
-- Spalten und Reihenfolge entsprechen mart.fct_titel_jahr_hist (Migration 20261010120000).
with betraege as (
  select jahr, konto, titel_key,
         sum(betrag_eur) filter (where wertart = 'soll') as soll_api,
         sum(betrag_eur) filter (where wertart = 'soll_xml') as soll_xml,
         sum(betrag_eur) filter (where wertart = 'ist') as ist
  from {{ ref('fct_betrag') }}
  group by jahr, konto, titel_key
),
werte as (
  select
    t.*,
    case when v.soll_api_geladen then coalesce(b.soll_api, 0) when v.xml_geladen then coalesce(b.soll_xml, 0) end::numeric(18,2) as soll_eur,
    case when v.soll_api_geladen then 'api' when v.xml_geladen then 'xml' end as soll_quelle,
    b.soll_xml::numeric(18,2) as soll_xml_eur,
    case when v.ist_geladen then coalesce(b.ist, 0) end::numeric(18,2) as ist_eur,
    v.ist_geladen as ist_verfuegbar
  from {{ ref('dim_titel') }} t
  join {{ ref('dim_verfuegbarkeit') }} v on v.jahr = t.jahr and v.konto = t.konto
  left join betraege b on b.jahr = t.jahr and b.konto = t.konto and b.titel_key = t.titel_key
),
zeilen as (
  select
    w.jahr, w.konto, w.titel_key,
    w.einzelplan_nr, e.einzelplan_text,
    w.kapitel_nr, k.kapitel_text,
    w.titel_nr, w.titel_text,
    w.titelgruppe_nr, w.titelgruppe_text, w.ausgabeart_text, w.flexibilisiert, w.seite,
    w.fkt, f.funktion_text, left(w.fkt, 2) as oberfunktion, f.oberfunktion_text, left(w.fkt, 1) as hauptfunktion, f.hauptfunktion_text,
    left(w.titel_nr, 3) as gruppierung_nr, g.gruppierung_text, left(w.titel_nr, 2) as obergruppe, g.obergruppe_text,
    left(w.titel_nr, 1) as hauptgruppe, g.hauptgruppe_text,
    w.soll_eur, w.soll_quelle, w.soll_xml_eur, w.ist_eur, w.ist_verfuegbar,
    (w.ist_eur - w.soll_eur)::numeric(18,2) as abweichung_eur,
    round(w.ist_eur / nullif(w.soll_eur, 0), 6) as ist_quote,
    h.stand as haushaltsstand,
    w.im_haushaltsplan_xml
  from werte w
  left join {{ ref('dim_einzelplan') }} e on e.jahr = w.jahr and e.einzelplan_nr = w.einzelplan_nr
  left join {{ ref('dim_kapitel') }} k on k.jahr = w.jahr and k.kapitel_nr = w.kapitel_nr
  left join {{ ref('dim_funktion') }} f on f.jahr = w.jahr and f.fkt = w.fkt
  left join {{ ref('dim_gruppierung') }} g on g.jahr = w.jahr and g.gruppierung_nr = left(w.titel_nr, 3)
  left join {{ ref('dim_haushaltsstand') }} h on h.jahr = w.jahr and h.konto = w.konto
)
select z.*, md5(z::text) as zeilen_hash
from zeilen z
