# Befund: Semantik und Abfrageschicht (Plan 4, lokal)

## Kurzfassung

Abnahme der Abfragefunktionen im Schema `api` mit den Echtdaten aus Plan 3 (lokale Supabase-Instanz, 10.10.2026).

- **Datenversion:** Version 698, Ampel gelb, Score 89,74, 100.507 Zeilen (0 neue, 0 geschlossene). Die hohe Versionsnummer kommt von zurückgerollten Testläufen; Sequenzen rollen nicht zurück.
- **Testlauf:** dbt lief mit `pnpm dbt test --vars "{dq13_ab_jahr: 2023}"`, die Veröffentlichung mit `veroeffentliche --ohne-aufraeumen --testlauf`. Lokal sind API-Soll und API-Ist erst ab 2023 geladen; ohne die Variable schlagen DQ-13 und DQ-17 fehl (wie in Plan 3). Version 698 ist daher ein Testlauf, keine Produktionsversion.
- **Prüfungen:** 38 bestanden, 4 Warnungen (DQ-04 183, DQ-05 466, DQ-11 3, DQ-14 2), 0 Fehler. DQ-10 blieb grün. DQ-19 (Synonyme treffen Daten) besteht.
- **Semantik-Version:** 649 mit 17 Kennzahlen, 117 Synonymen, 20 Glossareinträgen und 14 Einwohnerzahlen.
- **Kontrollwerte:** alle getroffen. Jede Abfrage lief unter 1 s, die langsamste (Suche „Bundeswehr“) in 304 ms.

Quellen: `data/raw/p4-veroeffentlichung.md` (Version 698), `data/raw/p4-abnahme.md` (Kontrollabfragen mit Zeiten), `data/raw/p4-speicher-vorher.md`, `data/raw/p4-speicher-nachher.md` (Task 3).

## Kontrollwerte

| Abfrage | Erwartung | Ergebnis | Laufzeit |
| --- | --- | --- | --- |
| Ist 2024 Ausgaben | `474753727609.58` | `474753727609.58` | 82 ms |
| Soll 2024, 2026, 2027 | `476807656000.00`, `524540138000.00`, `555435744000.00`; Hinweis „Regierungsentwurf“ | gleiche Werte; Hinweis „Enthält den Regierungsentwurf: noch kein beschlossener Haushalt.“ | 81 ms |
| Größte Einzelpläne 2026 | `11` mit `197341040000.00`, dann `14` mit `82687312000.00`, dann `60` | `11` (Anteil 0,376217; 2.361,18 € je Kopf), `14` (0,157638; 989,35 €), `60` mit `47353984000.00`; Hinweise Einwohner fortgeschrieben und „3 von 26 Zeilen“ | 118 ms |
| Größte Abweichungen 2024 (Titel) | Ergebnis ohne Fehler | 320159501 Tilgung (8,49 Mrd. €), 600297201 Globale Minderausgabe, 110168112 Bürgergeld, 110163613, 300263251; 5 von 5564 Zeilen | 100 ms |
| Einzelplan 14 mit Vorjahr | Zeitreihe ohne Fehler | 16 Jahre 2012 bis 2027, 2012 ohne Vorjahr (null), 2026 +20,38 Mrd. € (+32,7 %); Hinweise Vorjahr je Schlüssel und Regierungsentwurf | 111 ms |
| Bundeswehr | Einzelplan `14`, `synonym` | Einzelplan `14`, `synonym`, Ähnlichkeit 1,000 | 304 ms |
| BAföG | Funktion `142`, `synonym` | Funktion `142`, `synonym`, 1,000 | 258 ms |
| Bürgergeld | Funktion `251`, `synonym` | Funktion `251`, `synonym`, 1,000 | 266 ms |
| Titel 041668421 | Jahre vor 2025 aus Einzelplan 06, soweit eindeutig | 14 Jahre 2014 bis 2027, 2014 bis 2025 aus `060168421` (Einzelplan 06), siehe unten | 5 ms |
| Datenstand | Version, Ampel, Prüfungen | Version 698, `yellow`, 89,74, Semantik-Version 649, `ist_aktuell` true | 51 ms |

Die Zeiten stammen aus `\timing` in psql als Rolle `postgres`. Das Rollenlimit von `anon` (3 s) wird mit großem Abstand eingehalten.

Lokal hat das Soll 2012 bis 2022 die Quelle XML (`soll_quelle = 'xml'`, Haushaltsstand „nur Haushaltsplan-XML“), und das Ist dieser Jahre ist nicht verfügbar. Abweichung und Ist-Quote bleiben dort leer.

## Suche und Lineage

**Treffer.** Alle drei Begriffe treffen an erster Stelle über das Synonym mit Ähnlichkeit 1,000. Danach folgen Texttreffer mit höchstens 0,9:

- Bundeswehr: Funktionen 031 Bundeswehrverwaltung, 039 und 038 Versorgung (039 je einmal für Ausgaben und Einnahmen).
- BAföG: Titel 300268151 „BAföG - Studierende“, 300268150, 300267150, 300266150.
- Bürgergeld: Titel 110168112 „Bürgergeld“ mit 1,000 (exakt gleicher Text), danach Rauschen mit 0,600: Gruppierungen 431 und 421 (Bezüge der Bundespräsidentin) und Titel 062868401 (Zivile Verteidigung). Diese Fehltreffer zeigen, dass die Schwelle 0,35 zu niedrig ist.

**Lineage von 041668421.** Die Zeitreihe umfasst 14 Jahre (2014 bis 2027). Der Ressortwechsel des Sport-Titels liegt in den Echtdaten zwischen 2025 und 2026: 2014 bis 2025 heißt der Titel `060168421` (Einzelplan 06, Kapitel 0601), 2026 und 2027 `041668421` (Einzelplan 04, Kapitel 0416). Das Jahr 2025 trägt die Verknüpfung `nachgefuehrt`, die Jahre davor `gleich`. Der Wechsel wurde also erkannt. 2012 und 2013 fehlen: Dort hieß der Titel `060268411` „Für zentrale Maßnahmen auf dem Gebiet des Sports“ (Kapitel 0602, andere Titelnummer, anderer Text). Nach der Regel E18 wird das bewusst nicht verbunden; die Kette endet dort ohne Hinweis. Die Fundstelle ist für 2014 bis 2026 gesetzt (Seiten 14 bis 34), für 2027 null (Regierungsentwurf ohne XML).

**Abweichungen vom Plan, aus den Reviews entschieden:**

- `query_metric`, Vorjahr: Die Vorjahreswerte verdichten nur nach den Join-Schlüsseln. Filter und Gruppierung nach `haushaltsstand` und `soll_quelle` wirken nicht aufs Vorjahr.
- `query_metric`, Bezeichnung: Bei Gleichstand im selben Jahr gilt der alphabetisch erste Text.
- `query_metric`, Titelgruppe: `titelgruppe_nr` gibt es nur zusammen mit `kapitel_nr` (Gruppierung bzw. Filter).
- `query_metric`, Filter: Filterlisten werden dedupliziert, `p_absteigend` null bedeutet absteigend.
- `search_entities`: Texttreffer zählen höchstens 0,9 (1,0 nur bei exakt gleichem Text). Bei gleicher Ähnlichkeit gilt schluessel vor synonym vor text. Der Suchbegriff hat höchstens 200 Zeichen.
- Rechte: Default-Privilegien je Schema wirken in Postgres nicht (das Ausführungsrecht für PUBLIC ist global). Jede Funktion entzieht PUBLIC ausdrücklich das Ausführungsrecht, ein Wächtertest in `grundlagen.int.test.ts` prüft das.

## Speicher

| Messung | vorher | nachher |
| --- | --- | --- |
| `core.dim_titel` | 19 MB | View |
| `core.fct_betrag` | 11 MB | View |
| `mart.agg_gruppierung_jahr`, `agg_funktion_jahr`, `agg_einzelplan_jahr` | 760 kB, 752 kB, 136 kB | Views |
| `mart.fct_titel_jahr_hist` | 74 MB | 74 MB |
| `mart.fct_titel_jahr` | 63 MB | 63 MB |
| Datenbank gesamt (`pg_database_size`) | 305 MB | 274 MB |

Die Views sparen 31 MB (305 auf 274 MB, gut 6 % der 500 MB von Supabase Free).

## Anpassungen an Synonymen

Keine. Alle Synonym-Zeilen bestanden DQ-19 in Task 1 ohne Änderung; nichts wurde angepasst oder gestrichen.

## Folgerungen für Plan 5

- **Titeldetail ohne Jahr:** `get_titel_detail` wählt dann das jüngste Jahr, derzeit 2027 (Regierungsentwurf ohne XML). Die Fundstelle oben ist damit null. UI und Systemprompt müssen das kennen oder ein Jahr übergeben.
- **Suche nach Nummer:** Einstellige Hauptfunktionen und Hauptgruppen sind nicht über ihre Nummer auffindbar.
- **Suchschwelle:** Die Schwelle 0,35 lässt Rauschen durch (Beispiel „Bürgergeld“ mit 0,6 auf Bezüge der Bundespräsidentin). Schwelle anheben und an Echtdaten prüfen.
- **Lineage-Lücken:** Die Kette endet stumm an Lücken (21 Fälle in den Echtdaten). Ein Hinweis in `hinweise` fehlt.
- **Filter mit Zahl:** Eine Zahl als Filterwert für eine Textspalte (z. B. `"einzelplan_nr": 6`) liefert still ein leeres Ergebnis. Besser: als Fehler melden oder auf zwei Stellen normieren.
- **Vorjahr mit Stand oder Quelle:** Beim Vorjahresvergleich mit Gruppierung nach `soll_quelle` oder `haushaltsstand` wird ein Teil mit dem ganzen Vorjahr verglichen. Ein Hinweis fehlt.
- **Lokale Daten:** API-Soll, API-Ist und Systematik 2012 bis 2022 lokal nachladen, damit lokale Abnahmen ohne `dq13_ab_jahr` laufen.
