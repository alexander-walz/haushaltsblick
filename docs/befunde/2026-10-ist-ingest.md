# Befund: erster Live-Lauf Ist-Ingest (09.10.2026)

## Kurzfassung

Der erste Live-Lauf des Workflows `ingest` gegen die Supabase-Datenbank (Frankfurt, Free) war erfolgreich.

- **Soll aus XML:** 2012 bis 2026 geladen. 2027 ist noch nicht als XML veröffentlicht.
- **Ist aus der internalapi:** 2012 bis 2025 geladen, Ausgaben und Einnahmen. 2026 und 2027 sind noch nicht verfügbar.
- **Soll-Entwurf 2027 aus der internalapi:** geladen.
- **Qualität:** Kein Lauf in Quarantäne, kein Fehler, keine Warnung zu unbekannten Feldern. Jede Ebene der API war centgenau die Summe ihrer Kinder.
- **Gegenprobe:** Ein zweiter Lauf direkt danach hat alles als „unverändert“ übersprungen, mit einer Anfrage je Jahr und Konto. Er dauerte 61 Sekunden und hat keine neuen Rohdateien erzeugt.

| Lauf | Run | Commit | Dauer |
| --- | --- | --- | --- |
| Erstlauf | [37928357507](https://github.com/alexander-walz/haushaltsblick/actions/runs/37928357507) | `ea1fed2` | 57 min (Migrationen 4 s, Soll 66 s, Ist 52 min, Entwurf 4 min, Upload 8 s) |
| Gegenprobe | [37934844489](https://github.com/alexander-walz/haushaltsblick/actions/runs/37934844489) | `ea1fed2` | 61 s |

Ein vorheriger Versuch ([37927847138](https://github.com/alexander-walz/haushaltsblick/actions/runs/37927847138)) scheiterte bei der Verbindung. Ursache war die direkte Datenbank-URL (`db.<projekt>.supabase.co`, nur IPv6) statt der URL des Session Poolers (IPv4). Das Secret wurde korrigiert; `docs/betrieb.md` beschreibt bereits den Session Pooler.

## Soll aus der XML-Datei

| Jahr | Status | Titel | Ausgaben Soll (Mrd. €) | Anlagen Ausgaben (Mrd. €) | Ausgeglichen |
| --- | --- | --- | --- | --- | --- |
| 2012 | succeeded | 6428 | 306,2 | 0,0 | ja |
| 2013 | succeeded | 6225 | 302,0 | 0,0 | ja |
| 2014 | succeeded | 5794 | 296,5 | 0,0 | ja |
| 2015 | succeeded | 5818 | 299,1 | 0,0 | ja |
| 2016 | succeeded | 5967 | 316,9 | 0,0 | ja |
| 2017 | succeeded | 6090 | 329,1 | 0,0 | ja |
| 2018 | succeeded | 6111 | 343,6 | 0,0 | ja |
| 2019 | succeeded | 6171 | 356,4 | 0,0 | ja |
| 2020 | succeeded | 6307 | 362,0 | 0,0 | ja |
| 2021 | succeeded | 6413 | 498,6 | 0,0 | ja |
| 2022 | succeeded | 6654 | 495,8 | 0,0 | ja |
| 2023 | succeeded | 6679 | 476,3 | 0,0 | ja |
| 2024 | succeeded | 6768 | 476,8 | 0,0 | ja |
| 2025 | succeeded | 6975 | 539,2 | 0,0 | ja |
| 2026 | succeeded | 6995 | 524,5 | 34,8 | ja |
| 2027 | skipped | | | | Datei noch nicht veröffentlicht |

## Ist und Entwurf aus der internalapi

Titel zählt nur Titel mit Betrag ungleich 0, weil die API Titel mit Wert 0 weglässt.

| Jahr | Ausgaben: Titel | Einnahmen: Titel | Summe Ist (Mrd. €) | Anfragen (Ausgaben + Einnahmen) |
| --- | --- | --- | --- | --- |
| 2012 | 4760 | 758 | 307,1 | 204 + 189 |
| 2013 | 4564 | 770 | 308,2 | 207 + 191 |
| 2014 | 4223 | 751 | 295,9 | 223 + 200 |
| 2015 | 4265 | 752 | 311,7 | 222 + 200 |
| 2016 | 4138 | 785 | 317,4 | 228 + 205 |
| 2017 | 4211 | 789 | 331,0 | 230 + 206 |
| 2018 | 4206 | 798 | 348,3 | 231 + 207 |
| 2019 | 4256 | 806 | 357,1 | 229 + 207 |
| 2020 | 4375 | 786 | 443,4 | 231 + 209 |
| 2021 | 4446 | 799 | 557,1 | 235 + 212 |
| 2022 | 4542 | 801 | 481,3 | 239 + 213 |
| 2023 | 4575 | 815 | 457,7 | 239 + 216 |
| 2024 | 4589 | 840 | 474,8 | 242 + 217 |
| 2025 | 4673 | 825 | 495,5 | 246 + 213 |
| 2026, 2027 | | | | nicht verfügbar (je 1 Anfrage) |
| **Entwurf 2027 (Soll)** | 4574 | 591 | 555,4 | 253 + 194 |

Insgesamt waren es 6.542 Anfragen mit höchstens 2 pro Sekunde.

## Rohdaten

Das Release [`rohdaten`](https://github.com/alexander-walz/haushaltsblick/releases/tag/rohdaten) enthält 45 Dateien mit zusammen 7,2 MB: 15 Soll-XML, 28 Ist-Crawls und 2 Entwurfs-Crawls. Alle sind gzip-komprimiert und haben inhaltsbasierte Namen.

## Auffälligkeiten

1. **Ist-Einnahmen und Ist-Ausgaben sind in jedem Jahr gleich**, weil die Einnahmen die Kreditaufnahme enthalten. Das bestätigt die Vollständigkeit beider Konten.
2. **Kontrollwert getroffen:** Ist 2024 Ausgaben ergibt 474,8 Mrd. €. Das entspricht dem Kontrollwert im Datenvertrag (474.753.727.609,58 €).
3. **Soll aus der XML weicht in 2020 und 2021 stark vom Ist ab** (362,0 zu 443,4 und 498,6 zu 557,1 Mrd. €). Die XML-Dateien bilden offenbar den ursprünglich veröffentlichten Haushaltsstand ab, nicht spätere Nachtragshaushalte. Ein Soll-Ist-Vergleich mit diesen Werten wäre irreführend. Das muss vor jeder Veröffentlichung von „Plan gegen Wirklichkeit“ geklärt werden (Plan 3 und 4).
4. **Soll 2025 aus der XML (539,2 Mrd. €) liegt deutlich über dem Ist 2025 (495,5 Mrd. €).** Ob die XML 2025 einen Entwurfsstand enthält, ist ungeklärt. Das ist mit dem Soll der internalapi für 2025 abzugleichen (DQ-14).
5. **Die Anlage KTF (6092) gibt es nur in der XML 2026**, nicht in der API. Das bestätigt die getrennte Behandlung von Anlagen (Roadmap E1).

## Folgerungen für Plan 3

- **DQ-14 umsetzen:** Soll aus XML ohne Anlagen gegen Soll aus der internalapi je Jahr und Konto vergleichen. Dafür braucht es einen Soll-Crawl der API je Jahr, mindestens die Wurzel (eine Anfrage).
- **Haushaltsstand einführen:** Entwurf, Gesetz, Nachtrag. Für Soll-Ist-Vergleiche den maßgeblichen Stand festlegen und in der Oberfläche benennen.
- **Fehlende Ist-Titel = 0:** Gilt für abgeschlossene Jahre, weil die API Titel mit Wert 0 weglässt.
- **Speicher beobachten:** Etwa 95.000 Soll-Titel und 78.000 API-Titel; die genaue Größe zeigt das Supabase-Dashboard (Database → Usage).
