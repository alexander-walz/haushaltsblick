# Plan 5: Web-App und IBCS-Dashboards – Design

Stand: 12.10.2026. Ergebnis des Brainstormings mit Alexander. Grundlage sind `docs/KONZEPT.md` (Abschnitte 10 und 13) und die Roadmap `docs/superpowers/plans/2026-10-08-00-roadmap.md` (E1, E3, E13, E14, E16, E18 bis E20). Wo dieses Dokument vom Konzept abweicht, gilt dieses Dokument. Die Abweichungen werden mit Plan 5 ins Konzept übernommen.

## 1. Ziel und Erfolgskriterien

Die Web-App ist das Aushängeschild von Haushaltsblick. Sie soll Besucherinnen und Besucher überzeugen und begeistern und zum Hinterfragen der Bundesmittel einladen, ohne politisch zu werten (E13). Alle Berichte und Dashboards folgen durchgängig den International Business Communication Standards (IBCS).

**Zielgruppe, geschichtet:**
- Die Startseite spricht interessierte Bürgerinnen und Bürger an: eine klare Aussage, greifbare Maßstäbe, wenig Fachsprache.
- Jede Zahl führt mit einem Klick in eine vollwertige IBCS-Ansicht für Fachpublikum (Controlling, Verwaltung, Journalismus).

**Erfolgskriterien:**
1. Ein Besucher versteht in zehn Sekunden, worum es geht und wie groß der Haushalt ist.
2. Ein Besucher findet „seinen“ Titel in höchstens drei Schritten (Suche oder Drilldown).
3. Plan gegen Wirklichkeit ist sichtbar, ohne dass die App bewertet. Wo sie färbt, folgt sie einer dokumentierten Regel (E21).
4. Jede Ansicht hält die IBCS-Checkliste in Abschnitt 5.4 ein.
5. Jede Zahl stammt aus einer Funktion im Schema `api`. Die App rechnet selbst nichts.
6. Die Seiten sind auch ohne JavaScript lesbar und erfüllen WCAG 2.2 AA.

## 2. Umfang

**In Plan 5:**

| Seite | Route | Zielgruppe |
| --- | --- | --- |
| Start | `/` | alle |
| Explorer | `/explorer` | geschichtet |
| Plan und Wirklichkeit | `/plan-und-ist` | geschichtet |
| Titelsteckbrief | `/titel/[jahr]/[titelKey]` | Fachpublikum |
| Suche | Kopf jeder Seite | alle |
| Datenqualität | `/datenqualitaet` | Fachpublikum |
| Methodik | `/methodik` | alle |
| Impressum, Datenschutz | `/impressum`, `/datenschutz` | Pflicht |

Dazu kommen drei kleine, additive Backend-Ergänzungen (Abschnitt 7).

**Nicht in Plan 5:**
- KI-Chat (Plan 6) und Antwortbelege (Plan 7).
- Ausbaustufen nach Plan 8, in dieser Reihenfolge vorgemerkt: Wasserfall-Vergleich zweier Jahre, Sankey Einzelplan zu Hauptgruppe, „Fundstück der Woche“.
- Treemap und Sunburst: IBCS empfiehlt für Strukturen sortierte Balken.
- Verlauf der Qualitätsläufe auf der Seite Datenqualität. Das bräuchte eine neue API-Funktion und kommt erst, wenn jemand danach fragt.

## 3. Entscheidungen

### E21 Wirkungsfarben nur, wo fachlich eindeutig

IBCS färbt Abweichungen nach ihrer Wirkung. Im Bundeshaushalt ist „mehr ausgegeben als geplant“ aber in der Regel keine neutrale Größe, sondern eine politische Frage. Deshalb sind Abweichungen grundsätzlich neutral (grau, mit Vorzeichen). Wirkungsfarben gibt es nur nach einer festen, dokumentierten Liste:

| Bereich | Wirkungsrichtung | Begründung |
| --- | --- | --- |
| Einnahmen ohne Kreditaufnahme, Rücklagenentnahme und globale Posten, Ist gegenüber Soll | Anstieg positiv (grün) | Mehreinnahmen gegenüber dem Plan verbessern den Haushaltsvollzug. Das ist haushaltsrechtlich eindeutig. |
| Kreditaufnahme (Einnahmen, Obergruppe 32), Ist gegenüber Soll | Anstieg negativ (rot) | Mehr Schulden als geplant verschlechtern den Haushaltsvollzug. |
| Rücklagenentnahme (Einnahmen, Obergruppe 35) und Globale Mehr-/Mindereinnahmen (Obergruppe 37) | neutral | Weniger Entnahme schont Reserven, fehlt aber als Deckung; globale Posten sind Planungstechnik. Gut oder schlecht ist nicht eindeutig (Entscheidung Alexander, 12.10.2026). |
| Zinsausgaben (Funktion 830), Ist gegenüber Soll | Anstieg negativ (rot) | Zinsen sind Kosten der Verschuldung ohne eigenen Leistungsgehalt. |
| alle übrigen Ausgaben | neutral | Mehr oder weniger Ausgaben sind eine politische Frage. |
| Globale Minderausgabe | neutral | Sie ist eine Planungstechnik. |
| Vergleiche Jahr gegen Jahr (Vorjahr) | immer neutral | Wachstum eines Etats ist eine Entwicklung, keine Abweichung von einem Plan. |

**Regeln dazu:**
- Eine Gruppe, die Titel mit verschiedenen Wirkungsrichtungen enthält, ist neutral. Ein Beispiel ist ein Einzelplan mit Zinsen und anderen Ausgaben, ein anderes die Einnahmen insgesamt mit Steuern und Krediten.
- Die Regeln liegen versioniert in der Datenbank (Seed `semantik_wirkungsrichtung`, Abschnitt 7.1), nicht im Code der App.
- Die Methodikseite zeigt die Tabelle mit Begründung. Jede gefärbte Abweichung verweist auf ihre Regel.
- Farbe trägt nie allein: Jede Abweichung hat ein Vorzeichen.

E21 kommt mit Plan 5 in die Roadmap.

### E22 Eigene IBCS-Diagrammkomponenten statt Diagrammbibliothek

Die Diagramme sind eigene React-Komponenten, die als SVG auf dem Server gerendert werden. Für die Maßstäbe dient `d3-scale`. Apache ECharts entfällt in Plan 5.

Begründung: Volle Kontrolle über IBCS-Details, die Bibliotheken nicht bieten:
- Szenario-Notation,
- einheitliche Skalierung über Diagramme,
- Skalierungsmarker,
- Beschriftung am Element,
- Farbregel nach E21.

Außerdem sind die Seiten schnell und zugänglich. Für Sankey und Treemap in den Ausbaustufen wird neu entschieden.

### E23 Startseite: Kernaussage zuerst

Die Startseite beginnt mit einem sachlichen Satz und greifbaren Maßstäben, darunter folgt sofort ein IBCS-Strukturdiagramm. Fragen sind der zweite Einstieg. Alexander hat diese Variante im Entwurf gewählt (Variante A gegenüber „Fragen zuerst“).

## 4. Architektur

**App und Werkzeuge**
- `apps/web`: Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4, lucide-react.
- Keine schwere UI-Bibliothek.
- `d3-scale` und `d3-array` für Maßstäbe, Zod für die Prüfung der API-Antworten.

**Rendern auf dem Server**
- Seiten und Diagramme sind Server Components, ausgeliefert als HTML mit SVG.
- Client-Komponenten nur für Suche, Filterwechsel und Aufklappen.

**Zustand in der URL**
- Jede Ansicht hat eine teilbare Adresse, z. B. `/explorer?jahr=2025&konto=ausgaben&einzelplan=14`.
- Ungültige Parameter führen zur nächstgelegenen gültigen Ansicht mit Hinweis, nie zu einem Fehler.

**Datenzugriff**
- Das Modul `apps/web/lib/daten` (nur Server) ruft die Funktionen im Schema `api` über die Data API mit `fetch` auf: `POST /rest/v1/rpc/<funktion>` mit den Kopfzeilen `apikey` und `Content-Profile: api`.
- Kein supabase-js.
- Jede Antwort wird mit einem Zod-Schema geprüft. Bei Abweichung zeigt die Seite einen Fehlerzustand mit Hinweis statt Zahlen.

**Eine Version je Seite**
- Eine Seite fragt zuerst `get_dataset_status` ab und übergibt allen weiteren Aufrufen dieselbe `p_version`.
- Damit zeigt eine Seite nie Zahlen aus zwei Versionen.

**Cache**
- Antworten werden mit dem Tag `datenstand` gecacht.
- Nach jeder Veröffentlichung ruft der Workflow `ingest` `POST /api/revalidate` mit dem Geheimnis `REVALIDATE_TOKEN` auf.
- Ohne Aufruf läuft der Cache nach 24 Stunden ab.

**Suche im Browser**
- Die Suche ruft einen eigenen Route Handler `/api/suche` auf.
- Er leitet an `search_entities` weiter, begrenzt die Eingabe, cacht und drosselt.
- Der Browser spricht nie direkt mit der Datenbank.

**Betrieb**
- Vercel Hobby, mit dem GitHub-Repository verbunden: Vorschau je Pull Request, `main` ist live.
- Umgebungsvariablen: `HB_API_URL`, `HB_API_KEY` (Publishable Key, nur serverseitig genutzt), `REVALIDATE_TOKEN`.

**Strukturgrenzen**

```text
apps/web/
  app/                      Seiten (Routen aus Abschnitt 2), /api/suche, /api/revalidate
  components/ibcs/          Diagramm- und Tabellenkomponenten (Abschnitt 5)
  components/ui/            Kopf, Suche, Filterleiste, Datenstand, Fußnoten, Fehlerzustände
  lib/daten/                API-Aufrufe, Zod-Schemas, Version je Seite
  lib/ibcs/                 Regelwerk: Notation, Skalierung, Titel, Farbregel, Formatierung
```

`lib/ibcs` ist reine Logik ohne React und vollständig per Unit-Test prüfbar. Die Komponenten in `components/ibcs` bekommen fertige, geprüfte Daten und treffen keine fachlichen Entscheidungen.

## 5. IBCS-Regelwerk

### 5.1 Szenario-Notation

| Datenwert | IBCS | Darstellung | Beschriftung |
| --- | --- | --- | --- |
| Ist | AC | dunkel gefüllt | „Ist“ |
| Soll, maßgeblich (inkl. Nachträge, E14) | PL | Kontur, ungefüllt | „Soll“ |
| Regierungsentwurf | PL, Version „Entwurf“ | Kontur, mit Kennzeichnung | „Entwurf“ |
| Soll laut Haushaltsplan (XML) | PL, Version „Haushaltsplan“ | Kontur gestrichelt, nur im Titelsteckbrief | „Haushaltsplan“ |
| Ist des Vorjahres | PY | hellgrau gefüllt | „Ist Vorjahr“ |
| Soll des Vorjahres | PL der Vorperiode | hellgraue Kontur | „Soll Vorjahr“ |

**Notation des Vorjahres:** PY bedeutet in IBCS Ist des Vorjahres. Der Vergleich „Soll gegen Soll des Vorjahres“ bekommt deshalb eine eigene Notation und die Abweichung heißt „Δ Soll Vorjahr“.

### 5.2 Perioden und Standardjahre

- Szenarien werden nur für dieselbe Periode verglichen.
- Überblick und Explorer zeigen standardmäßig das laufende Haushaltsjahr (Soll).
- „Plan und Wirklichkeit“ zeigt standardmäßig das letzte abgeschlossene Jahr mit Ist (derzeit 2025).
- Der Regierungsentwurf erscheint nur auf ausdrückliche Wahl und immer gekennzeichnet.
- Welche Jahre ein Ist haben, liest die App aus `get_dataset_status.jahre` (`ist_verfuegbar`), nicht aus dem Kalender.

### 5.3 Darstellungsregeln

- **Titelblock nach WER, WAS, WANN** über jedem Diagramm und jeder Tabelle. Beispiel: „Bund, Ausgaben nach Einzelplänen | Mrd. € | 2025 Soll, Ist, ΔPL“.
- **Skalierung:** gleiche Ebene, gleicher Maßstab. Diagramme gleicher Einheit auf einer Seite teilen den Maßstab. Weicht eine Ansicht bewusst ab, etwa beim Drilldown auf ein Kapitel, zeigt ein Skalierungsmarker das an.
- **Ausreißer:** Sehr große relative Abweichungen bei kleiner Basis werden abgeschnitten und markiert. Eine relative Abweichung bei Basis 0 ist nicht definiert und erscheint als „–“ mit Fußnote.
- **Negative Werte** (z. B. Globale Minderausgabe, EU-Eigenmittel) werden in allen Balken- und Säulenkomponenten links bzw. unterhalb der Nulllinie dargestellt.
- **Beschriftung am Element, keine Legende.**
- **Zahlen:** `de-DE` mit `tabular-nums`. Mrd. € mit einer Nachkommastelle, darunter Mio. €, Prozent mit einer Nachkommastelle, Quoten-Abweichungen in Prozentpunkten.
- **Abweichungen:** absolut als Abweichungsbalken, relativ als Nadeln (Pins). Farbe nach E21, immer mit Vorzeichen.
- **Fußnoten:** Alle `hinweise` der API erscheinen unter dem Diagramm. Bei Zeitreihen steht immer „Beträge nominal“.
- **Datenstand** (Version, Datum, Ampel) steht auf jeder Seite.
- **Farbe:** Magenta `#EC008C` nur für Auswahl und Hervorhebung, nie als Datenfarbe. Sonst Anthrazit und Graustufen, dazu Grün und Rot nur nach E21. Dunkelmodus über CSS-Variablen.
- **Keine KPI-Kacheln, Tachos, 3D oder Kreisdiagramme.**
- **Texte:** keine Gedankenstriche, Halbgeviert- und Geviertstriche, in UI-Texten. Das Minuszeichen ist `−` (U+2212).

### 5.4 IBCS-Checkliste je Ansicht

Diese Checkliste ist der Review-Maßstab. Sie lehnt sich an die Regeln des IBCS-Datenstruktur-Agenten an (UNIFY, STRUCTURE, CHECK).

1. Titelblock mit WER, WAS (Einheit und Skalierung), WANN (Periode und Szenarien) vorhanden.
2. Szenario-Notation nach 5.1; Szenarien nur für dieselbe Periode verglichen.
3. Gleiche Einheit, gleicher Maßstab; Abweichungen davon mit Skalierungsmarker.
4. Nicht-additive Kennzahlen (Quoten, Anteile) werden nie gestapelt oder summiert.
5. Abweichungsfarbe nach E21 mit Vorzeichen; Vorjahresvergleich neutral.
6. Zeit horizontal, Struktur vertikal; Strukturen sortiert, sofern keine fachliche Reihenfolge gilt.
7. Hinweise der API und „nominal“ als Fußnote; Datenstand sichtbar.
8. Tabellenalternative und Textzusammenfassung vorhanden.
9. Keine Zahl im Code berechnet. Erlaubt sind nur Formatierung und Maßstabsberechnung für die Darstellung.

### 5.5 Komponenten

| Komponente | Zweck |
| --- | --- |
| `Titelblock` | WER, WAS, WANN |
| `Strukturbalken` | horizontale, sortierte Balken mit Szenario-Überlagerung (Ist gefüllt, Soll als Kontur) |
| `Abweichungsbalken` | absolute Abweichung um eine Nulllinie, Farbe nach E21 |
| `Nadeln` | relative Abweichung, mit Abschneiden von Ausreißern |
| `ZeitreiheSaeulen` | bis 16 Jahre, Szenario-Notation, Entwurfsjahr gekennzeichnet, darunter Abweichungsbalken je Jahr |
| `IbcsTabelle` | Spalten Soll, Ist, eingebetteter Szenario-Balken, ΔPL als Balken und Zahl, ΔPL %, Summenzeile; mobil auf Kernspalten zusammenklappbar |
| `Fussnoten`, `Datenstand`, `Skalierungsmarker` | Begleitelemente |

## 6. Seiten

### 6.1 Start `/` (E23)

- Kopf: Marke „Haushaltsblick“, Navigation (Explorer, Plan und Wirklichkeit, Methodik), Suche.
- Kernaussage als Überschrift, rein faktisch. Beispiel: „Der Bund plant 2026 Ausgaben von 524,5 Mrd. €.“ Darunter je Kopf und je Tag, z. B. „Das sind 6.276 € je Einwohnerin und Einwohner oder 1,4 Mrd. € an jedem Tag des Jahres.“ Weist die API auf eine fortgeschriebene Einwohnerzahl hin, steht das als Fußnote.
- `Strukturbalken` der Einzelpläne des laufenden Jahres (Soll) mit Δ Soll Vorjahr, die größten sechs plus „weitere“; jede Zeile führt in den Explorer.
- „Fragen, die die Daten beantworten“: zwei bis vier Fragen aus einer festen Liste. Jede ist eine konkrete Abfrage mit fertiger Antwortansicht, etwa:
  - „Wofür gibt der Bund mehr aus: Verteidigung oder Hochschulen?“
  - „Wie genau wurde der Plan 2025 eingehalten?“

  Die Auswahl wechselt täglich deterministisch nach Datum.
- Fußzeile: Datenstand, Quelle, „Beträge nominal“.

### 6.2 Explorer `/explorer`

- Filter: Jahr, Konto (Ausgaben, Einnahmen), Sicht (nach Ressorts, nach Aufgaben).
- Ebenen der Ressortsicht: Bund › Einzelplan › Kapitel › Titel. Bei der Aufgabensicht: Hauptfunktion › Oberfunktion › Funktion › Titel. Brotkrumen zeigen die Ebene, der WER-Teil des Titels folgt ihr.
- Inhalt: `IbcsTabelle`. Für Jahre mit Ist sind die Spalten Soll, Ist, ΔPL als Balken und ΔPL %. Für Jahre ohne Ist sind es Soll, Δ Soll Vorjahr und Anteil.
- Eine Zeile führt eine Ebene tiefer, ein Titel in den Steckbrief.

### 6.3 Plan und Wirklichkeit `/plan-und-ist`

- Standardjahr: letztes abgeschlossenes Jahr.
- Kernaussage, faktisch, z. B. „2025 wurden 7,0 Mrd. € weniger ausgegeben als geplant.“
- Ebene wählbar: Einzelplan, Kapitel, Titel.
- Nebeneinander:
  - `Abweichungsbalken` (ΔPL absolut, größte Abweichungen nach Betrag);
  - `Nadeln` (ΔPL %) für dieselben Zeilen, wahlweise sortiert nach relativer Abweichung.

  So fallen auch kleine Etats mit großer relativer Abweichung auf.
- Konto wählbar. Bei Einnahmen gelten die Wirkungsfarben nach E21.
- Jede Zeile führt in den Explorer bzw. in den Steckbrief.

### 6.4 Titelsteckbrief `/titel/[jahr]/[titelKey]`

- Daten aus `get_titel_detail` mit ausdrücklichem Jahr.
- `ZeitreiheSaeulen` 2012 bis heute:
  - Ist gefüllt, Soll als Kontur, Entwurf gekennzeichnet, darunter ΔPL je Jahr.
  - Wahlweise Soll laut Haushaltsplan (gestrichelt).
- Ressortwechsel (Verknüpfung „nachgefuehrt“) werden in der Zeitreihe vermerkt, z. B. „ab 2026 Einzelplan 04“. Endet die Kette an einer Lücke, steht das als Fußnote.
- Stammdaten:
  - Einzelplan, Kapitel, Titelgruppe, Funktion, Gruppierung;
  - Flexibilisierung („nicht anwendbar“ bei Einnahmen);
  - Haushaltsstand.
- Fundstelle als Link auf die PDF-Seite; fehlt sie, wird das begründet.
- Fußnoten aus `hinweise`, darunter „Rechtlich verbindlich ist ausschließlich der veröffentlichte Haushaltsplan“.

### 6.5 Suche

- Eingabefeld im Kopf jeder Seite, Vorschläge ab zwei Zeichen mit Verzögerung beim Tippen.
- Treffer mit Typ, Bezeichnung und Soll.
- Synonymtreffer gekennzeichnet, z. B. „Bundeswehr → Einzelplan 14“.
- Ein Treffer führt in den Explorer mit dem Filter aus `treffer.filter` oder, bei einem Titel, in den Steckbrief.
- Ohne JavaScript gibt es eine Ergebnisseite `/suche?q=…`.

### 6.6 Datenqualität `/datenqualitaet`

- Ampel und Score.
- Nicht bestandene Prüfungen mit Beschreibung und verständlicher Erklärung.
- Tabelle je Jahr und Konto: Haushaltsstand, Soll-Quelle, Ist verfügbar, Anzahl Titel.
- Version und Veröffentlichungsdatum.

### 6.7 Methodik `/methodik`

- Quellen und Lizenzhinweis.
- Kennzahlen (`list_kennzahlen`) und Glossar (`get_glossar`).
- Szenario-Notation (5.1) und Farbregeln nach E21 mit Begründung.
- „Was die Daten nicht sagen“: keine Wirkung, keine Bewertung, nominale Beträge, Haushaltsstände. Mit Verweis auf Haushaltsrechnung und Bundesrechnungshof.
- Erläuterung von Datenstand und Ampel.

### 6.8 Impressum und Datenschutz

- Pflichtangaben mit Alexanders Anschrift; Alexander liefert sie vor dem Livegang.
- Datenschutz: keine Cookies, keine Analyse-Werkzeuge, Hosting bei Vercel, Datenbank bei Supabase in Frankfurt.
- Livegang erst, wenn beide Seiten stehen.

### 6.9 Fehler- und Randzustände

- **API nicht erreichbar oder Zeitlimit überschritten:** Fehlerseite mit Erklärung und Link auf die Datenqualität. Keine Teilzahlen.
- **Leeres Ergebnis:** Hinweis aus der API („Keine Zeilen für diese Auswahl“).
- **Jahr ohne Ist bei „Plan und Wirklichkeit“:** Wechsel auf das letzte Jahr mit Ist, mit Hinweis.
- **Unbekannter Titel oder ungültiger Schlüssel:** 404-Seite mit Suche.

## 7. Backend-Ergänzungen

### 7.1 Wirkungsrichtung (E21)

- **Seed:** neuer Seed `dbt/seeds/semantik_wirkungsrichtung.csv` mit den Spalten `regel_id, konto, typ, schluessel, richtung, begruendung`:
  - `typ` ∈ {`konto`, `obergruppe`, `funktion`};
  - `richtung` ∈ {`anstieg_positiv`, `anstieg_negativ`, `neutral`}; `neutral` stellt eine Obergruppe ausdrücklich grau.
- **Versionierung:** Er wird wie die übrige Semantik versioniert (`ops.sichere_semantik`, neue Tabelle `semantic.wirkungsrichtung`).
- **Auflösung je Titel**, die spezifischste Regel gewinnt:
  1. Funktion 830 bei Ausgaben: negativ.
  2. Obergruppe 32 bei Einnahmen: negativ; Obergruppen 35 und 37 bei Einnahmen: neutral.
  3. übrige Einnahmen: positiv.
  4. sonst: neutral.
- **API:** `query_metric` liefert je Zeile `wirkungsrichtung` ∈ {`anstieg_positiv`, `anstieg_negativ`, `neutral`}. Eine Gruppe mit verschiedenen Richtungen ist `neutral`. Die Datenbank liefert die Richtung für Plan-gegen-Ist-Abweichungen. Vorjahreskennzahlen färbt die App nach E21 immer neutral; das ist eine feste Darstellungsregel in `lib/ibcs`, keine fachliche Berechnung.
- **Glossar:** neuer Eintrag „Wirkungsrichtung“.

### 7.2 Tempo der aktuellen Version

- **Befund:** `semantic.stand(v)` liest für jede Version die ganze Historie (`gueltig_ab <= v and (gueltig_bis is null or gueltig_bis > v)`). Beim Entwurf brach `query_metric` für Funktion 830 über alle Jahre in der Produktion mit HTTP 500 ab. Die größte Titelabfrage brauchte 2,6 s bei einem Limit von 3 s.
- **Maßnahme:** Ist `v` die aktuelle Version, filtert `semantic.stand` über den vorhandenen Teilindex `gueltig_bis_version is null`. Weitere Indizes nur nach Messung.
- **Messung:** vorher und nachher als anon über die Data API in der Produktion, mit festem Abfrageset (Kontrollwerte aus dem Befund Plan 4 und die Zinsabfrage). Ziel: jede Abfrage des Sets unter 1,5 s.

### 7.3 Cache-Auffrischung

- Neuer Schritt im Workflow `ingest` nach „Ampel und Veröffentlichung“, nur bei erfolgreicher Veröffentlichung: `curl -X POST "$HB_WEB_URL/api/revalidate" -H "Authorization: Bearer $REVALIDATE_TOKEN"`.
- Secrets `HB_WEB_URL` und `REVALIDATE_TOKEN`.
- Schlägt der Aufruf fehl, warnt der Bericht, der Lauf bleibt grün.

## 8. Tests

- **Unit-Tests (Vitest)** für `lib/ibcs`:
  - Formatierung, Skalierungswahl, gemeinsame Maßstäbe, Ausreißer;
  - Farbregel inklusive „Vorjahr immer neutral“, Titelblock, Szenario-Notation.
- **Unit-Tests** für `lib/daten`: Zod-Schemas gegen echte, als Fixture gespeicherte API-Antworten, dazu Fehlerfälle.
- **Render-Tests der Komponenten:**
  - negative Werte, leere Ergebnisse, ein einzelner Wert, Ausreißer;
  - Tabellenalternative und `aria-label`.
- **Ende-zu-Ende-Tests (Playwright)** gegen die gebaute App mit einer Fixture-API, einem kleinen Server mit gespeicherten Antworten:
  - Start, Drilldown, Suche, Steckbrief, Plan und Wirklichkeit, Fehlerzustände;
  - Bildvergleiche der Komponenten;
  - automatische Barrierefreiheitsprüfung mit axe.
- **CI:** `pnpm typecheck`, `pnpm test`, `pnpm test:int` und die Playwright-Tests. Backend-Ergänzungen wie bisher mit Integrationstests in `imRollback`.
- **Abnahme:**
  - Durchgang aller Seiten in der Vercel-Vorschau gegen die Produktion.
  - IBCS-Checkliste (5.4) je Ansicht.
  - Lighthouse: Leistung und Barrierefreiheit jeweils mindestens 90.

## 9. Betrieb und Aufgaben für Alexander

1. Vercel-Konto (Hobby) und Projekt anlegen, mit dem Repository verbinden, Root `apps/web`.
2. Umgebungsvariablen in Vercel setzen: `HB_API_URL`, `HB_API_KEY`, `REVALIDATE_TOKEN`.
3. GitHub-Secrets `HB_WEB_URL` und `REVALIDATE_TOKEN` für den Workflow.
4. Angaben für Impressum liefern. Eine eigene Domain ist optional.
5. Freigabe des Livegangs nach der Abnahme.

## 10. Offene Punkte aus Plan 4, die Plan 5 berührt

- `get_titel_detail` ohne Jahr landet auf dem Entwurf: Die App übergibt immer ein Jahr (6.4).
- Lineage endet stumm an Lücken: Fußnote im Steckbrief (6.4).
- Zahl als Filterwert für Textspalten: seit der Fixwelle Plan 4 ein Fehler 22023. Die App übergibt Schlüssel immer als Text.
- Suche: Rauschen bei der Schwelle 0,35 und einstellige Codes bleiben vorerst. Die App zeigt höchstens acht Vorschläge, Synonyme zuerst.
- Speicher und `work_mem`: durch 7.2 und den Cache entschärft. Eine Entscheidung zu `work_mem` nur, wenn die Messung in 7.2 das Ziel verfehlt.

## 11. Abweichungen bei der Umsetzung

Entscheidungen beim Planen:

1. **Spec 7.2, Tempo:** Messungen am 12.10.2026 in der Produktion zeigen einen kalten Datenbank-Cache als Ursache.
   - Die Zinsabfrage lief beim ersten Aufruf ins Zeitlimit, beim zweiten in 288 ms.
   - Ein Teilindex hilft nicht, weil alle Zeilen der Historie aktuell sind.
   - Statt Indexarbeit: Cache in Next.js, ein Wiederholungsversuch bei `57014` und Aufwärmen der Hauptseiten nach jeder Veröffentlichung.
2. **d3 entfällt:** Der Maßstab ist eine lineare Abbildung in zehn Zeilen (`lib/ibcs/skala.ts`).
3. **Explorer mit dritter Sicht „nach Arten“** (Hauptgruppe › Obergruppe › Gruppierung › Titel). Die Suche liefert für Synonyme wie „Steuern“ oder „Kredite“ Gruppierungen, die sonst ins Leere führen würden.
4. **Wirkungsregeln für die Methodik:** `list_kennzahlen` liefert zusätzlich die Wirkungsregeln, damit die Methodikseite sie aus der Datenbank zeigt.
5. **Titelsteckbrief:** Die Wirkungsrichtung kommt aus `query_metric` für den Titel des gewählten Jahres und gilt für die ganze Zeitreihe; die Titelnummer und damit die Obergruppe bleibt über die Lineage gleich.
6. **Ende-zu-Ende-Tests mit aufgezeichneten API-Antworten** statt Pixel-Snapshots. Schriftdarstellung unterscheidet sich je Betriebssystem, Pixelvergleiche wären unzuverlässig. Die Prüfung mit axe bleibt.
7. **Datenzugriff per GET** (`Accept-Profile: api`) statt POST, damit Next.js die Antworten cachen kann. Am 12.10.2026 gegen die Produktion geprüft.
8. **Soll als Kontur auch auf der Startseite:** Der Entwurf zeigte Soll vereinfacht gefüllt; IBCS verlangt die Kontur.
9. **Drosselung der Suche:** über eine Firewall-Regel bei Vercel (Betrieb), nicht im Code.
10. **Mobile Tabellen:** Nebenspalten werden unter 640 px ausgeblendet, nicht aufgeklappt.

Entscheidungen aus der Umsetzung:

11. **Akzentfarbe als Text:** eigenes Token `--hb-akzent-text` (`#d6007f` hell, `#ff5cb8` dunkel). Grund: Kontrast, gefunden mit axe.
12. **Scroll-Bereiche der Tabellen:** fokussierbar als Region (`tabIndex=0`, `role=region`, `aria-labelledby`).
13. **Aufnahme `list_kennzahlen`:** `wirkungsrichtung` ist von Hand ergänzt, bis Task 1 in Produktion läuft. Danach neu aufnehmen.
14. **Schrift:** wird beim Build über `next/font/google` geladen und zur Laufzeit selbst gehostet. Für Plan 6 erwägen: `next/font/local`, damit CI keinen Netzzugriff braucht.
15. **Wiederholversuch bei 57014:** sendet den Header `x-hb-versuch: 2`, weil Next identische GETs sonst zusammenfasst.
16. **Explorer:** dritte Sicht „art“ (Gruppierungen), siehe Punkt 3.

Entscheidungen aus der Abschlussrunde (Gesamtreview):

17. **Skalierungsmarker:** Komponente `components/ibcs/Skalierungsmarker.tsx`, gesetzt im Titelblock. Auf der Startseite ist der Einzelplan-Überblick der Bezugsmaßstab; jede Fragekarte skaliert für sich und trägt den Marker „Eigener Maßstab“. Im Explorer trägt jede Drilldown-Ebene unterhalb des Bundes den Marker, weil sie einen anderen Maßstab als die Ebene darüber hat.
18. **Verweis auf die Farbregel:** Jede Darstellung, die tatsächlich grün oder rot färbt, zeigt eine Fußnote mit Link auf `/methodik#farben` (`FarbregelHinweis` über `Fussnoten`). Neutrale Darstellungen bleiben ohne.
19. **Vorzeichen kleiner Abweichungen:** Die Tabelle behält eine Einheit (IBCS). Abweichungen, die in dieser Einheit auf null runden, erscheinen als „+0,0“ oder „−0,0“, damit neben einem farbigen Balken immer ein Vorzeichen steht.
20. **Suche ohne Datencache:** `search_entities` läuft mit `cache: 'no-store'`, weil sonst jede freie Eingabe einen Cache-Eintrag anlegt.
21. **Zeitlimit je Versuch 15 s** ohne `AbortSignal`: Next.js schaltet für Aufrufe mit `signal` die Deduplizierung je Anfrage ab. Das Zeitlimit begrenzt Abruf und Lesen der Antwort und führt zur eigenen Fehlerseite.
22. **Obergruppen 35 und 37 neutral:** Nach der Entscheidung von Alexander am 12.10.2026 färben Rücklagenentnahme und Globale Mehr-/Mindereinnahmen nicht mehr als Einnahmen. Dafür erlaubt `semantic.wirkungsrichtung` die Richtung `neutral` (Migration `20261014120100_wirkungsrichtung_neutral.sql`).
