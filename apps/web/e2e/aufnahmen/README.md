# Aufnahmen für die Ende-zu-Ende-Tests

Die JSON-Dateien sind aufgezeichnete Antworten der Data API, benannt nach dem Hash des Anfragepfads (siehe `../fixture-api.mjs`).

Von Hand ergänzt: `1be9940bea3bd552a8a482db.json` (`list_kennzahlen`). Die Produktion kannte bei der Aufnahme die Migration aus Task 1 noch nicht und lieferte kein Feld `wirkungsrichtung`. Es wurde aus `dbt/seeds/semantik_wirkungsrichtung.csv` in der Struktur von `api.list_kennzahlen` ergänzt. Die `query_metric`-Antworten blieben unverändert; die App behandelt fehlende Wirkungsrichtung als neutral.

Nach dem Rollout von Task 1 in der Produktion neu aufnehmen (`HB_AUFNAHME_QUELLE` und `HB_AUFNAHME_KEY` setzen, `pnpm test:e2e`) und diese Datei dann nicht mehr von Hand pflegen.
