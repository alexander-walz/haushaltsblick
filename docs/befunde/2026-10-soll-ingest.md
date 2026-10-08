# Befund Soll-Ingest 2012 bis 2027

Lauf vom 08.10.2026, Git-SHA ee2105b, Pipeline-Version 0.1.0.

Kurzfassung: Nur 2025 und 2026 wurden geladen. Die Jahre 2012 bis 2024 stehen in Quarantäne, weil der Parser das Attribut `flexibilisiert` an `<titel>` als Pflicht prüft, die älteren Dateien es aber bei einem Teil der Titel nicht enthalten. 2027 ist noch nicht veröffentlicht. Der Parser wurde bewusst nicht geändert.

## Bericht der CLI
Aufruf: `pnpm --filter @hb/ingest start --jahre alle`, User-Agent `Haushaltsblick/0.1 (privates Open-Data-Projekt; Kontakt folgt)`. Das Programm endete mit Exit-Code 1 (wegen der Quarantäne).

| Jahr | Status | Titel | Ausgaben Soll (Mrd. €) | Anlagen Ausgaben (Mrd. €) | Ausgeglichen | Hinweis |
| --- | --- | --- | --- | --- | --- | --- |
| 2012 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2012]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2013 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2013]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2014 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2014]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2015 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2015]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2016 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2016]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2017 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2017]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2018 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2018]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2019 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2019]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2020 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2020]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2021 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2021]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2022 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2022]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2023 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2023]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2024 | quarantined |  |  |  |  | flexibilisiert ungültig: undefined (bei /haushalt[2024]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1]) |
| 2025 | succeeded | 6975 | 539,2 | 0,0 | ja |  |
| 2026 | succeeded | 6995 | 524,5 | 34,8 | ja |  |
| 2027 | skipped |  |  |  |  | Datei noch nicht veröffentlicht |

Der Abnahmetest gegen die echte Datei 2026 (`zusammenfassung`) lief durch: 5 von 5 Tests bestanden, keiner übersprungen.

## Titel und Summen je Jahr und Konto
Nur Läufe mit Status `succeeded` (Beträge in Tausend Euro).

```
 jahr |   konto   | titel | haushalt_tsd | anlagen_tsd | negative 
------+-----------+-------+--------------+-------------+----------
 2025 | ausgaben  |  5752 |    539249440 |             |       27
 2025 | einnahmen |  1223 |    539249440 |             |       10
 2026 | ausgaben  |  5755 |    524540138 |    34803623 |       25
 2026 | einnahmen |  1240 |    524540138 |    34803623 |       15
(4 rows)
```

2026 stimmt mit den Kontrollwerten überein: 524.540.138 Tsd. € Haushalt, 34.803.623 Tsd. € Anlagen, 5755 + 1240 = 6995 Titel.

## Anlagen je Jahr
```
 jahr | kapitel_nr | anlage_zu_kapitel_nr |                            kapitel_text                             | anzahl_titel 
------+------------+----------------------+---------------------------------------------------------------------+--------------
 2026 | 6092       | 6002                 | Anlage 3 Wirtschaftsplan des Klima- und Transformationsfonds (6092) |           79
(1 row)
```

2025 enthält keine Anlage.

## Auffälligkeiten
- Quarantäne 2012 bis 2024 (13 Jahre), identische Meldung je Jahr, nur mit anderer Jahreszahl im Pfad. Beispiel 2012: `flexibilisiert ungültig: undefined (bei /haushalt[2012]/einzelplan[01]/kapitel[0101]/einnahmen[1]/einnahmen-ausgaben-art[1])`. Ursache laut Sichtprüfung der abgelegten Rohdateien: In 2012 bis 2024 fehlt das Attribut `flexibilisiert` bei einem Teil der Titel (zwischen etwa 960 und 1210 Titeln je Datei, gezählt über `<titel>`-Elemente ohne das Attribut), vor allem bei Titeln in Blöcken mit Ausgabeart und bei Einnahmetiteln wie `<titel nr="23201" fkt="187" seite="6">`. In 2025 und 2026 ist es immer vorhanden. Die Datenverträge (`contracts/src_soll_xml.yaml`) und `parse-soll.ts` verlangen `ja` oder `nein`.
- Doppelte Titelschlüssel je Jahr: keine (nur 2025 und 2026 geprüft, Abfrage lieferte 0 Zeilen).
- Jahre ohne Haushaltsausgleich (ohne Anlagen): keine unter den geladenen Jahren, 2025 und 2026 sind ausgeglichen (Einnahmen gleich Ausgaben). Für 2012 bis 2024 nicht beurteilbar.
- Größe raw.soll_titel für 2025 und 2026: 7472 kB (Gesamtrelation inkl. Indizes). Hochrechnung auf alle 15 Jahre bei ähnlicher Titelzahl: etwa 3,5 bis 4 MB je Jahr, also rund 50 bis 60 MB. Die Titelzahlen der älteren Jahre sind nicht geprüft. Die Rohdateien belegen lokal 20 MB in `data/raw/soll`.
- 2027: `skipped`, Datei noch nicht veröffentlicht (404).
- Negative Soll-Werte: 2025 27 (Ausgaben) und 10 (Einnahmen), 2026 25 und 15. Sie sind legitim.

## Folgerungen für Plan 2 und 3
- Quarantäne 2012 bis 2024: Folgetask nötig. Zuerst Fixture-Ausschnitt aus einer älteren Datei (zum Beispiel 2012, Kapitel 0101) und roter Parser-Test, dann Entscheidung, ob `flexibilisiert` optional wird. Offene fachliche Frage: Was bedeutet das fehlende Attribut (nein, unbekannt)? `raw.soll_titel.flexibilisiert` ist derzeit `not null`, bräuchte also einen Standardwert oder Nullbarkeit, und der Datenvertrag muss angepasst werden.
- Die Zeitreihen und Vergleiche in Plan 2 und 3 stehen erst nach diesem Folgetask auf 15 Jahren. Bis dahin sind nur 2025 und 2026 vergleichbar.
- DQ-Prüfung: Die Kontrollsumme je Jahr (Haushaltsausgleich, Anlagen getrennt) funktioniert für 2025 und 2026 und sollte für die älteren Jahre erst nach dem Parser-Fix als Abnahme dienen. Die Meldung `undefined` im Hinweis ist wenig hilfreich, die Meldung sollte den fehlenden Wert benennen.
- Anlagen: 2026 enthält 34,8 Mrd. € in Kapitel 6092 (KTF). Summen immer getrennt nach `anlage_zu_kapitel_nr is null`.
- Speicherbudget: Ein Jahr belegt rund 3,7 MB, also passen 15 Jahre mit rund 55 MB sicher in das Kontingent. Das ist eine Hochrechnung und nach dem Parser-Fix zu bestätigen.
- Die Kontaktadresse im User-Agent fehlt noch (Platzhalter „Kontakt folgt“), vor Veröffentlichung des Repositories nachtragen.
