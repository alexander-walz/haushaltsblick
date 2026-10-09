# Befund Soll-Ingest 2012 bis 2026

Erstlauf vom 08.10.2026 gegen Git-SHA dc9f207 (Arbeitsbaum sauber), Pipeline-Version 0.1.0, Laufzeit 14 s für alle 15 Jahre (Abruf, Parsen und Laden, gemessen mit `SECONDS` der Shell). Vor dem Erstlauf wurde die lokale Datenbank mit `pnpm db:reset` neu aufgebaut. Dabei wurden 2012 bis 2014, 2016 bis 2021, 2025 und 2026 geladen; 2015 und 2022 bis 2024 kamen in Quarantäne (siehe Abweichung 3). Nach der Korrektur (Commit 20e5846, ohne `db:reset`) wurden diese vier Jahre in zwei weiteren Aufrufen nachgeladen.

Kurzfassung: Alle 15 Jahre 2012 bis 2026 sind geladen (Status `succeeded`), 2027 ist nicht veröffentlicht. Alle Jahre sind ausgeglichen (Einnahmen gleich Ausgaben, Anlagen getrennt). Die beiden aus Task 8 bekannten Abweichungen (`flexibilisiert` fehlt, `seite="-"`) und die dritte, im Erstlauf entdeckte (Titeltext in mehreren `<text>`-Segmenten, 2015 und 2022 bis 2024) sind behandelt; Details unten.

## Bericht der CLI
Erstlauf: `INGEST_USER_AGENT="Haushaltsblick/0.1 (privates Open-Data-Projekt; Kontakt folgt)" pnpm --filter @hb/ingest start --jahre 2012-2026`, Exit-Code 1 wegen der Quarantäne von vier Jahren. Rohbericht: `data/raw/bericht-2012-2026.md`.

| Jahr | Status | Titel | Ausgaben Soll (Mrd. €) | Anlagen Ausgaben (Mrd. €) | Ausgeglichen | Hinweis |
| --- | --- | --- | --- | --- | --- | --- |
| 2012 | succeeded | 6428 | 306,2 | 0,0 | ja |  |
| 2013 | succeeded | 6225 | 302,0 | 0,0 | ja |  |
| 2014 | succeeded | 5794 | 296,5 | 0,0 | ja |  |
| 2015 | quarantined |  |  |  |  | Mehr als ein <text> in <titel> (bei /haushalt[2015]/einzelplan[09]/kapitel[0903]/ausgaben[1]/titelgruppe[02]/titel[66122]) |
| 2016 | succeeded | 5967 | 316,9 | 0,0 | ja |  |
| 2017 | succeeded | 6090 | 329,1 | 0,0 | ja |  |
| 2018 | succeeded | 6111 | 343,6 | 0,0 | ja |  |
| 2019 | succeeded | 6171 | 356,4 | 0,0 | ja |  |
| 2020 | succeeded | 6307 | 362,0 | 0,0 | ja |  |
| 2021 | succeeded | 6413 | 498,6 | 0,0 | ja |  |
| 2022 | quarantined |  |  |  |  | Mehr als ein <text> in <titel> (bei /haushalt[2022]/einzelplan[12]/kapitel[1201]/ausgaben[1]/titelgruppe[02]/titel[68424]) |
| 2023 | quarantined |  |  |  |  | Mehr als ein <text> in <titel> (bei /haushalt[2023]/einzelplan[12]/kapitel[1201]/ausgaben[1]/titelgruppe[02]/titel[68424]) |
| 2024 | quarantined |  |  |  |  | Mehr als ein <text> in <titel> (bei /haushalt[2024]/einzelplan[12]/kapitel[1201]/ausgaben[1]/titelgruppe[02]/titel[68424]) |
| 2025 | succeeded | 6975 | 539,2 | 0,0 | ja |  |
| 2026 | succeeded | 6995 | 524,5 | 34,8 | ja |  |

Nachladen nach der Korrektur, zwei Aufrufe mit demselben `INGEST_USER_AGENT`, je einmal (Exit-Code 0). Rohberichte: `data/raw/bericht-2015.md`, `data/raw/bericht-2022-2024.md`.

- `pnpm --filter @hb/ingest start --jahre 2015`
- `pnpm --filter @hb/ingest start --jahre 2022-2024`

| Jahr | Status | Titel | Ausgaben Soll (Mrd. €) | Anlagen Ausgaben (Mrd. €) | Ausgeglichen | Hinweis |
| --- | --- | --- | --- | --- | --- | --- |
| 2015 | succeeded | 5818 | 299,1 | 0,0 | ja |  |
| 2022 | succeeded | 6654 | 495,8 | 0,0 | ja |  |
| 2023 | succeeded | 6679 | 476,3 | 0,0 | ja |  |
| 2024 | succeeded | 6768 | 476,8 | 0,0 | ja |  |

Laufstatus der vier Jahre in `ops.load_run` (die Quarantäne aus dem Erstlauf bleibt als Historie erhalten):

```
  source_id   | jahr |   status    |          started_at           
--------------+------+-------------+-------------------------------
 SRC_SOLL_XML | 2015 | quarantined | 2026-10-08 14:54:07.090694+00
 SRC_SOLL_XML | 2022 | quarantined | 2026-10-08 14:54:13.84466+00
 SRC_SOLL_XML | 2023 | quarantined | 2026-10-08 14:54:14.533514+00
 SRC_SOLL_XML | 2024 | quarantined | 2026-10-08 14:54:15.225463+00
 SRC_SOLL_XML | 2015 | succeeded   | 2026-10-08 17:42:41.808352+00
 SRC_SOLL_XML | 2022 | succeeded   | 2026-10-08 17:42:43.184542+00
 SRC_SOLL_XML | 2023 | succeeded   | 2026-10-08 17:42:44.300044+00
 SRC_SOLL_XML | 2024 | succeeded   | 2026-10-08 17:42:45.298898+00
(8 rows)
```

## Titel und Summen je Jahr und Konto
Nur Läufe mit Status `succeeded`, jetzt alle 15 Jahre (Beträge in Tausend Euro). Abfrage:

```sql
select t.jahr, t.konto, count(*) as titel, sum(t.soll_tsd_eur) filter (where t.anlage_zu_kapitel_nr is null) as haushalt_tsd, sum(t.soll_tsd_eur) filter (where t.anlage_zu_kapitel_nr is not null) as anlagen_tsd, count(*) filter (where t.soll_tsd_eur < 0) as negative from raw.soll_titel t join ops.load_run l using (run_id) where l.status = 'succeeded' group by 1,2 order by 1,2;
```

```
 jahr |   konto   | titel | haushalt_tsd | anlagen_tsd | negative 
------+-----------+-------+--------------+-------------+----------
 2012 | ausgaben  |  5454 |    306200000 |             |        8
 2012 | einnahmen |   974 |    306200000 |             |       10
 2013 | ausgaben  |  5250 |    302000000 |             |        8
 2013 | einnahmen |   975 |    302000000 |             |       11
 2014 | ausgaben  |  4837 |    296500000 |             |        9
 2014 | einnahmen |   957 |    296500000 |             |        7
 2015 | ausgaben  |  4859 |    299100000 |             |        9
 2015 | einnahmen |   959 |    299100000 |             |        9
 2016 | ausgaben  |  4831 |    316900000 |             |       18
 2016 | einnahmen |  1136 |    316900000 |             |        7
 2017 | ausgaben  |  4937 |    329100000 |             |       18
 2017 | einnahmen |  1153 |    329100000 |             |       15
 2018 | ausgaben  |  4959 |    343600000 |             |       19
 2018 | einnahmen |  1152 |    343600000 |             |        8
 2019 | ausgaben  |  5015 |    356400000 |             |       22
 2019 | einnahmen |  1156 |    356400000 |             |       12
 2020 | ausgaben  |  5145 |    362000000 |             |       33
 2020 | einnahmen |  1162 |    362000000 |             |       12
 2021 | ausgaben  |  5255 |    498620000 |             |       36
 2021 | einnahmen |  1158 |    498620000 |             |       12
 2022 | ausgaben  |  5463 |    495791475 |             |       36
 2022 | einnahmen |  1191 |    495791475 |             |       14
 2023 | ausgaben  |  5485 |    476290763 |             |       32
 2023 | einnahmen |  1194 |    476290763 |             |       12
 2024 | ausgaben  |  5558 |    476807656 |             |       30
 2024 | einnahmen |  1210 |    476807656 |             |       11
 2025 | ausgaben  |  5752 |    539249440 |             |       27
 2025 | einnahmen |  1223 |    539249440 |             |       10
 2026 | ausgaben  |  5755 |    524540138 |    34803623 |       25
 2026 | einnahmen |  1240 |    524540138 |    34803623 |       15
(30 rows)
```

Einnahmen und Ausgaben stimmen in jedem Jahr überein, auch in den nachgeladenen: 2015 299.100.000, 2022 495.791.475, 2023 476.290.763, 2024 476.807.656 Tsd. € (jeweils ohne Anlagen). Der Haushaltsausgleich ist damit auch für 2015 und 2022 bis 2024 gegeben. 2026 entspricht weiterhin den Kontrollwerten (524.540.138 Tsd. € Haushalt, 34.803.623 Tsd. € Anlagen, 5755 + 1240 = 6995 Titel).

## Anlagen je Jahr
```sql
select k.jahr, k.kapitel_nr, k.anlage_zu_kapitel_nr, k.kapitel_text, k.anzahl_titel from raw.soll_kapitel k join ops.load_run l using (run_id) where l.status='succeeded' and k.anlage_zu_kapitel_nr is not null order by 1,2;
```

```
 jahr | kapitel_nr | anlage_zu_kapitel_nr |                            kapitel_text                             | anzahl_titel 
------+------------+----------------------+---------------------------------------------------------------------+--------------
 2026 | 6092       | 6002                 | Anlage 3 Wirtschaftsplan des Klima- und Transformationsfonds (6092) |           79
(1 row)
```

Außer 2026 (Kapitel 6092, KTF) enthält kein Jahr eine Anlage, auch 2015 und 2022 bis 2024 nicht.

## Abweichungen vom Datenvertrag und ihre Behandlung
Belegt per Abfrage über alle 15 Jahre (nur `succeeded`):

```sql
select jahr, count(*) filter (where flexibilisiert is null) as flex_null, count(*) filter (where seite is null) as seite_null from raw.soll_titel t join ops.load_run l using (run_id) where l.status = 'succeeded' group by 1 order by 1;
```

```
 jahr | flex_null | seite_null 
------+-----------+------------
 2012 |       974 |          0
 2013 |       975 |          0
 2014 |       957 |          0
 2015 |       959 |          0
 2016 |      1136 |          7
 2017 |      1153 |          8
 2018 |      1152 |          6
 2019 |      1156 |          5
 2020 |      1162 |          2
 2021 |      1158 |          0
 2022 |      1191 |          0
 2023 |      1194 |          0
 2024 |      1210 |          0
 2025 |         0 |          0
 2026 |         0 |          0
(15 rows)
```

Aufteilung der `flexibilisiert`-Nullwerte nach Konto:

```sql
select jahr, konto, count(*) filter (where flexibilisiert is null) as flex_null from raw.soll_titel t join ops.load_run l using (run_id) where l.status = 'succeeded' group by 1,2 having count(*) filter (where flexibilisiert is null) > 0 order by 1,2;
```

```
 jahr |   konto   | flex_null 
------+-----------+-----------
 2012 | einnahmen |       974
 2013 | einnahmen |       975
 2014 | einnahmen |       957
 2015 | einnahmen |       959
 2016 | einnahmen |      1136
 2017 | einnahmen |      1153
 2018 | einnahmen |      1152
 2019 | einnahmen |      1156
 2020 | einnahmen |      1162
 2021 | einnahmen |      1158
 2022 | einnahmen |      1191
 2023 | einnahmen |      1194
 2024 | einnahmen |      1210
(13 rows)
```

1. **`flexibilisiert` fehlt (2012 bis 2024, ausschließlich Einnahmetitel).** Je Jahr 957 bis 1210 Titel (siehe oben, die Spanne passt zum Controller-Scan). Alle Ausgabetitel tragen das Attribut. Behandlung: Einnahmetitel ohne Attribut erhalten `flexibilisiert = null` (nicht anwendbar, die Flexibilisierung betrifft nur Ausgaben). Fehlt es an einem Ausgabetitel, bleibt das ein Vertragsfehler (`flexibilisiert fehlt an Ausgabetitel <nr>`). Ein Wert außer `ja`/`nein` bleibt ebenfalls ein Fehler. Die Spalte `raw.soll_titel.flexibilisiert` ist dafür nullable (Migration `20261008130000_flexibilisiert_optional.sql`).
2. **`seite="-"` (2016 bis 2020).** 7 Titel 2016, 8 in 2017, 6 in 2018, 5 in 2019, 2 in 2020 (siehe `seite_null` oben). Bedeutung: keine Seitenangabe. Behandlung: `seite = null`. Andere nicht numerische Werte bleiben ein Vertragsfehler (`Seite ungültig: <wert>`).
3. **Titeltext in mehreren `<text>`-Segmenten (2015, 2022, 2023, 2024; behoben).** Die tiefgestellte 2 in „CO₂“ zerlegt den Titeltext in mehrere direkt aufeinanderfolgende `<text>`-Elemente („...CO“, „2“, „-armer ...“). Der Parser erlaubte zunächst genau ein `<text>` je Element und stellte die vier Jahre mit `Mehr als ein <text> in <titel>` in Quarantäne. Ein Skript-Scan aller 15 Rohdateien ergab genau 5 betroffene Titel, ausschließlich `<titel>`:
   - 2015, Kapitel 0903: Titel 66122 und Titel 89121 (beide „CO2-Gebäudesanierungsprogramm“ der KfW-Bankengruppe, Abwicklung).
   - 2022, 2023, 2024, Kapitel 1201: je Titel 68424 („Zuschüsse zur Förderung energieeffizienter und/oder CO2-armer Nutzfahrzeuge“).
   - Alle anderen Jahre: kein Titel betroffen.

   Behandlung (Commit 20e5846): Nur bei `<titel>` werden mehrere `<text>`-Kinder in Dokumentreihenfolge ohne Trennzeichen verkettet. Segmente werden nicht einzeln getrimmt (Leerzeichen an Segmentgrenzen bleiben), nur der Gesamttext wird an den Enden getrimmt. Bei allen anderen Elementen (einzelplan, kapitel, einnahmen-ausgaben-art, titelgruppe) bleibt ein zweites `<text>` ein Vertragsfehler. Der Rohtext wird sonst nicht bereinigt. Belegabfrage (nur `succeeded`):

```sql
select jahr, kapitel_nr, titel_nr, titel_text from raw.soll_titel t join ops.load_run l using (run_id) where l.status = 'succeeded' and titel_text like '%CO2%' and jahr in (2015, 2022, 2023, 2024) order by 1, 2, 3;
```

```
 jahr | kapitel_nr | titel_nr |                                               titel_text                                                
------+------------+----------+---------------------------------------------------------------------------------------------------------
 2015 | 0903       | 66122    | Förderung von Maßnahmen zur                                                                            +
      |            |          | energetischen Gebäudesanierung "CO2-Gebäudesanierungsprogramm" der KfW-                                +
      |            |          | Bankengruppe - Abwicklung
 2015 | 0903       | 89121    | Zuschüsse für Investitionen im Rahmen                                                                  +
      |            |          | des Programms zur energetischen Gebäudesanierung "CO2-Gebäudesanierungsprogramm" der KfW-Bankengruppe -+
      |            |          | Abwicklung
 2022 | 1201       | 68424    | Zuschüsse zur Förderung                                                                                +
      |            |          | energieeffizienter und/oder CO2-armer Nutzfahrzeuge
 2023 | 1201       | 68424    | Zuschüsse zur Förderung energieeffizienter und/oder CO2-armer Nutzfahrzeuge
 2024 | 1201       | 68424    | Zuschüsse zur Förderung energieeffizienter und/oder CO2-armer Nutzfahrzeuge
(5 rows)
```

Die Texte enthalten teils Zeilenumbrüche aus dem Quelltext (2015, 2022), in 2015 auch Silbentrennung („KfW-\nBankengruppe“). Das ist unveränderter Rohtext.

## Auffälligkeiten
- Doppelte Titelschlüssel je Jahr: keine (Abfrage lieferte 0 Zeilen für alle 15 Jahre).
- Jahre ohne Haushaltsausgleich (ohne Anlagen): keine, alle 15 Jahre sind ausgeglichen.
- Auffällig: Ausgaben Soll 2021 498,6 Mrd. € gegenüber 362,0 Mrd. € in 2020; die Einnahmen stimmen mit den Ausgaben überein, ein Parserfehler ist daher unwahrscheinlich, die fachliche Ursache wurde nicht geprüft.
- Größe `raw.soll_titel` für alle 15 Jahre: 53 MB (inklusive Indizes), rund 3,5 MB je Jahr.
- Negative Soll-Werte je Jahr stehen in der Summentabelle (Spalte `negative`), sie sind legitim (globale Minderausgaben).
- `data/raw/soll` enthält die Rohdateien aller 15 Jahre. 2027 ist nicht veröffentlicht.

## Folgerungen für Plan 2 und 3
- Plan 3 (`core`): Titeltexte bereinigen. Zeilenumbrüche, Silbentrennung wie „KfW-\nBankengruppe“ und unsichtbare Zeichen wie U+FEFF in `raw.soll_titel.titel_text` sind im Rohtext erhalten und müssen beim Aufbau von `core` normalisiert werden.
- Plan 3: Maßgeblicher Lauf je Jahr ist der letzte `succeeded`-Lauf mit `params->>'datei' is null`. Läufe mit `params.datei` sind Testläufe aus lokalen Dateien und gehören in keine Auswertung.
- Ausmaß von U+FEFF im Rohtext (nur `succeeded`-Läufe mit `params->>'datei' is null`). Abfrage je Jahr:
  ```sql
  select t.jahr,
         count(*) filter (where t.titel_text like '%' || chr(65279) || '%') as titel_mit_feff,
         count(*) as titel_gesamt
  from raw.soll_titel t join ops.load_run l using (run_id)
  where l.status = 'succeeded' and l.params->>'datei' is null
  group by t.jahr order by t.jahr;
  ```
  Ergebnis: 2012 und 2013: 0; 2014: 124; 2015: 127; 2016: 130; 2017: 132; 2018: 130; 2019: 132; 2020: 132; 2021: 132; 2022: 134; 2023: 133; 2024: 136; 2025 und 2026: 0. Dieselbe Prüfung über alle Jahre (`kapitel_text`, `ausgabeart_text`, `titelgruppe_text` jeweils mit `like '%' || chr(65279) || '%'`): 11 Kapitel-Zeilen, 0 Ausgabeart-Zeilen, 218 Titelgruppen-Zeilen betroffen. Normalisierung in `core` muss daher alle vier Textfelder behandeln.
- `trim()` entfernt U+FEFF und geschützte Leerzeichen (NBSP) an Textenden. Der Rohtext in `raw` ist dort nicht byte-genau; die gezählten Vorkommen stehen im Text, nicht an den Enden.
- Zeitreihen sind für 2012 bis 2026 vollständig. Beim Vergleich über Jahre beachten: Bezeichnungen und Zuschnitte wechseln.
- `flexibilisiert` ist nullable: Abfragen und Dimensionen (`core.dim_titel`) müssen null als „nicht anwendbar“ behandeln und dürfen es nicht als „nein“ zählen. `seite` ist ebenfalls optional.
- DQ-Prüfung: Die Kontrollsumme je Jahr (Haushaltsausgleich, Anlagen getrennt) funktioniert in allen 15 Jahren.
- Anlagen: 2026 enthält 34,8 Mrd. € in Kapitel 6092 (KTF). Summen immer getrennt nach `anlage_zu_kapitel_nr is null`.
- Speicherbudget: 15 Jahre belegen 53 MB und passen sicher in das Kontingent.
- Die Kontaktadresse im User-Agent fehlt noch (Platzhalter „Kontakt folgt“), vor Veröffentlichung des Repositories nachtragen.
