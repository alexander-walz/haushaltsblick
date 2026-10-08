# Befund Soll-Ingest 2012 bis 2026

Lauf vom 08.10.2026 gegen Git-SHA dc9f207 (Arbeitsbaum sauber), Pipeline-Version 0.1.0, Laufzeit 14 s für alle 15 Jahre (Abruf, Parsen und Laden, gemessen mit `SECONDS` der Shell). Vor dem Lauf wurde die lokale Datenbank mit `pnpm db:reset` neu aufgebaut, daher wurden 2012 bis 2026 in einem Lauf geladen.

Kurzfassung: 11 von 15 Jahren sind geladen (2012 bis 2014, 2016 bis 2021, 2025, 2026). Die beiden aus Task 8 bekannten Abweichungen (`flexibilisiert` fehlt, `seite="-"`) sind behandelt. Dabei zeigte sich eine dritte, bisher nicht erfasste Abweichung, die 2015, 2022, 2023 und 2024 in Quarantäne hält (mehrere `<text>` in einem `<titel>`). Der Parser wurde dafür bewusst nicht weiter gelockert. 2027 gehörte nicht zu diesem Lauf (Datei noch nicht veröffentlicht, siehe Task 8).

## Bericht der CLI
Aufruf: `INGEST_USER_AGENT="Haushaltsblick/0.1 (privates Open-Data-Projekt; Kontakt folgt)" pnpm --filter @hb/ingest start --jahre 2012-2026`. Exit-Code 1 wegen der Quarantäne von vier Jahren. Rohbericht: `data/raw/bericht-2012-2026.md`.

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

## Titel und Summen je Jahr und Konto
Nur Läufe mit Status `succeeded` (Beträge in Tausend Euro). Abfrage:

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
 2025 | ausgaben  |  5752 |    539249440 |             |       27
 2025 | einnahmen |  1223 |    539249440 |             |       10
 2026 | ausgaben  |  5755 |    524540138 |    34803623 |       25
 2026 | einnahmen |  1240 |    524540138 |    34803623 |       15
(22 rows)
```

Einnahmen und Ausgaben stimmen in jedem geladenen Jahr überein. 2026 entspricht weiterhin den Kontrollwerten (524.540.138 Tsd. € Haushalt, 34.803.623 Tsd. € Anlagen, 5755 + 1240 = 6995 Titel).

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

Außer 2026 (Kapitel 6092, KTF) enthält kein geladenes Jahr eine Anlage. Für die vier Quarantäne-Jahre ist das nicht beurteilbar.

## Abweichungen vom Datenvertrag und ihre Behandlung
Belegt per Abfrage nach dem Neuladen (nur `succeeded`):

```sql
select jahr, count(*) filter (where flexibilisiert is null) as flex_null, count(*) filter (where seite is null) as seite_null from raw.soll_titel t join ops.load_run l using (run_id) where l.status = 'succeeded' group by 1 order by 1;
```

```
jahr | flex_null | seite_null 
------+-----------+------------
 2012 |       974 |          0
 2013 |       975 |          0
 2014 |       957 |          0
 2016 |      1136 |          7
 2017 |      1153 |          8
 2018 |      1152 |          6
 2019 |      1156 |          5
 2020 |      1162 |          2
 2021 |      1158 |          0
 2025 |         0 |          0
 2026 |         0 |          0
(11 rows)
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
 2016 | einnahmen |      1136
 2017 | einnahmen |      1153
 2018 | einnahmen |      1152
 2019 | einnahmen |      1156
 2020 | einnahmen |      1162
 2021 | einnahmen |      1158
(9 rows)
```

1. **`flexibilisiert` fehlt (2012 bis 2024, ausschließlich Einnahmetitel).** Je Jahr 957 bis 1162 Titel in den geladenen Jahren (2012: 974, 2013: 975, 2014: 957, 2016: 1136, 2017: 1153, 2018: 1152, 2019: 1156, 2020: 1162, 2021: 1158). Der Controller-Scan nannte 957 bis 1210 über alle 13 Jahre; die Spitze liegt in den noch nicht geladenen Jahren. Alle Ausgabetitel tragen das Attribut. Behandlung: Einnahmetitel ohne Attribut erhalten `flexibilisiert = null` (nicht anwendbar, die Flexibilisierung betrifft nur Ausgaben). Fehlt es an einem Ausgabetitel, bleibt das ein Vertragsfehler (`flexibilisiert fehlt an Ausgabetitel <nr>`). Ein Wert außer `ja`/`nein` bleibt ebenfalls ein Fehler. Die Spalte `raw.soll_titel.flexibilisiert` ist dafür nullable (Migration `20261008130000_flexibilisiert_optional.sql`).
2. **`seite="-"` (2016 bis 2020).** 7 Titel 2016, 8 in 2017, 6 in 2018, 5 in 2019, 2 in 2020 (siehe `seite_null` oben; die Controller-Spanne von 2 bis 8 passt). Bedeutung: keine Seitenangabe. Behandlung: `seite = null`. Andere nicht numerische Werte bleiben ein Vertragsfehler (`Seite ungültig: <wert>`).
3. **Neu: mehrere `<text>` in einem `<titel>` (2015, 2022, 2023, 2024; nicht behoben).** Der Parser erlaubt genau ein `<text>` je Element und meldet sonst `Mehr als ein <text> in <titel>`. In den vier Jahren ist ein Titel mit chemischer Formel betroffen: Der Text wird an der tiefgestellten 2 in „CO₂“ in mehrere `<text>`-Elemente zerlegt.
   - 2015: Titel 66122 in Kapitel 0903 („... Gebäudesanierungsprogramm der KfW-Bankengruppe - Abwicklung“): drei `<text>` („...\"CO“, „2“, „-Gebäudesanierungsprogramm...“). Ein zweiter Titel in 2015 ist ebenfalls betroffen (Zählung per Skript: 2 Titel; Nummer nicht erfasst).
   - 2022, 2023, 2024: je ein Titel, 68424 in Kapitel 1201 („Zuschüsse zur Förderung energieeffizienter und/oder CO₂-armer Nutzfahrzeuge“): drei `<text>` („...CO“, „2“, „-armer Nutzfahrzeuge“).
   - Alle anderen Jahre (2012 bis 2014, 2016 bis 2021, 2025, 2026): kein Titel betroffen (Zählung der `<titel>`-Elemente mit mehr als einem `<text>` per Skript über die Rohdateien).
   - Diese Abweichung war im Controller-Scan nicht enthalten. Wahrscheinlich war sie bisher von den Abweichungen 1 und 2 verdeckt, die der Parser früher in der Datei meldet (nicht eigens geprüft).

## Auffälligkeiten
- Doppelte Titelschlüssel je Jahr: keine (Abfrage lieferte 0 Zeilen für alle geladenen Jahre).
- Jahre ohne Haushaltsausgleich (ohne Anlagen): keine unter den 11 geladenen Jahren, alle sind ausgeglichen (Spalte „Ausgeglichen“ = ja). Für 2015 und 2022 bis 2024 nicht beurteilbar.
- Auffällig: Ausgaben Soll 2021 498,6 Mrd. € gegenüber 362,0 Mrd. € in 2020; die Einnahmen stimmen mit den Ausgaben überein, ein Parserfehler ist daher unwahrscheinlich, die fachliche Ursache wurde nicht geprüft.
- Größe `raw.soll_titel` für die 11 geladenen Jahre: 38 MB (inklusive Indizes), also rund 3,5 MB je Jahr. Hochrechnung auf 15 Jahre: rund 52 MB.
- Negative Soll-Werte je Jahr stehen in der Summentabelle (Spalte `negative`), sie sind legitim (globale Minderausgaben).
- `data/raw/soll` enthält die Rohdateien aller 15 Jahre.

## Folgerungen für Plan 2 und 3
- Folgetask nötig für die Quarantäne von 2015 und 2022 bis 2024. Fachliche Entscheidung: mehrere `<text>`-Elemente je Titel zusammenführen (Konkatenation in Dokumentreihenfolge ohne Trennzeichen ergibt „CO2“) oder bewusst weiterhin ablehnen. Vorgehen: Fixture-Ausschnitt aus 2015 Kapitel 0903 und 2022 Kapitel 1201, roter Parser-Test, danach Datenvertrag und Konzept anpassen. Danach vorab alle 15 Dateien mit einem Skript vollständig scannen, weil der Parser nur die erste Abweichung je Datei meldet.
- Bis dahin sind Zeitreihen lückenhaft: 2015 fehlt, ebenso 2022 bis 2024. Vergleiche über 2021 hinaus gehen nur zwischen 2021 und 2025/2026.
- `flexibilisiert` ist nullable: Abfragen und Dimensionen (`core.dim_titel`) müssen null als „nicht anwendbar“ behandeln und dürfen es nicht als „nein“ zählen. `seite` ist ebenfalls optional.
- DQ-Prüfung: Die Kontrollsumme je Jahr (Haushaltsausgleich, Anlagen getrennt) funktioniert in allen 11 geladenen Jahren und dient auch für die Nachladung als Abnahme.
- Anlagen: 2026 enthält 34,8 Mrd. € in Kapitel 6092 (KTF). Summen immer getrennt nach `anlage_zu_kapitel_nr is null`.
- Speicherbudget: 15 Jahre belegen hochgerechnet rund 52 MB und passen sicher in das Kontingent.
- Die Kontaktadresse im User-Agent fehlt noch (Platzhalter „Kontakt folgt“), vor Veröffentlichung des Repositories nachtragen.
