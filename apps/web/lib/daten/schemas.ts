import { z } from 'zod';

const Konto = z.enum(['ausgaben', 'einnahmen']);
const Fundstelle = z.object({ url: z.string(), seite: z.number(), dokument: z.string() }).nullable();

export const DatenstandSchema = z.object({
  version: z.number(),
  veroeffentlicht_am: z.string(),
  ist_aktuell: z.boolean(),
  semantik_version: z.number().nullable(),
  ampel: z.enum(['green', 'yellow', 'red']),
  score: z.number(),
  zeilen: z.number(),
  pruefungen: z.array(z.object({
    check_id: z.string(),
    status: z.enum(['pass', 'warn', 'fail']),
    failures: z.number(),
    schwere: z.enum(['error', 'warn']),
    beschreibung: z.string(),
  })),
  jahre: z.array(z.object({
    jahr: z.number(),
    konto: Konto,
    haushaltsstand: z.string().nullable(),
    soll_quelle: z.string().nullable(),
    ist_verfuegbar: z.boolean(),
    titel: z.number(),
  })),
});

const Wert = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const QueryMetricSchema = z.object({
  version: z.number(),
  semantik_version: z.number(),
  vorlage: z.string(),
  einheiten: z.record(z.string(), z.string()).nullable(),
  zeilen: z.array(z.record(z.string(), Wert)),
  zeilen_gesamt: z.number(),
  hinweise: z.array(z.string()),
});

export const TrefferSchema = z.object({
  typ: z.enum(['einzelplan', 'funktion', 'oberfunktion', 'hauptfunktion', 'kapitel', 'gruppierung', 'obergruppe', 'hauptgruppe', 'titel']),
  konto: Konto,
  schluessel: z.string(),
  bezeichnung: z.string().nullable(),
  soll_eur: z.number().nullable(),
  aehnlichkeit: z.number(),
  treffer: z.enum(['schluessel', 'synonym', 'text']),
  filter: z.record(z.string(), z.string()),
});

export const SucheSchema = z.object({
  version: z.number(),
  semantik_version: z.number(),
  jahr: z.number(),
  suchbegriff: z.string(),
  treffer: z.array(TrefferSchema),
});

const Text = z.string().nullable();

export const TitelDetailSchema = z.object({
  version: z.number(),
  titel: z.looseObject({
    jahr: z.number(), konto: Konto, titel_key: z.string(),
    einzelplan_nr: Text, einzelplan_text: Text, kapitel_nr: Text, kapitel_text: Text, titel_nr: Text, titel_text: Text,
    titelgruppe_nr: Text, titelgruppe_text: Text, fkt: Text, funktion_text: Text, gruppierung_nr: Text, gruppierung_text: Text,
    flexibilisiert: z.boolean().nullable(), haushaltsstand: Text, soll_quelle: Text,
  }),
  fundstelle: Fundstelle,
  zeitreihe: z.array(z.object({
    jahr: z.number(), titel_key: z.string(), verknuepfung: z.enum(['ausgangspunkt', 'gleich', 'nachgefuehrt']),
    einzelplan_nr: Text, kapitel_nr: Text, titel_text: Text,
    soll_eur: z.number().nullable(), soll_quelle: Text, soll_xml_eur: z.number().nullable(),
    ist_eur: z.number().nullable(), ist_verfuegbar: z.boolean().nullable(), abweichung_eur: z.number().nullable(),
    ist_quote: z.number().nullable(), haushaltsstand: Text, fundstelle: Fundstelle,
  })),
  hinweise: z.array(z.string()),
});

export const KennzahlenSchema = z.object({
  version: z.number(),
  semantik_version: z.number(),
  kennzahlen: z.array(z.object({
    kennzahl_id: z.string(), name: z.string(), definition: z.string(), formel: z.string(),
    einheit: z.string(), braucht_jahr: z.boolean(),
  })),
  wirkungsrichtung: z.array(z.object({
    regel_id: z.string(), konto: Konto, typ: z.string(), schluessel: z.string().nullable(),
    richtung: z.enum(['anstieg_positiv', 'anstieg_negativ', 'neutral']), begruendung: z.string(),
  })),
});

export const GlossarSchema = z.object({
  version: z.number(),
  semantik_version: z.number(),
  eintraege: z.array(z.object({ begriff: z.string(), erklaerung: z.string(), beispiel: z.string().nullable() })),
});

export type Datenstand = z.infer<typeof DatenstandSchema>;
export type QueryMetric = z.infer<typeof QueryMetricSchema>;
export type Zeile = QueryMetric['zeilen'][number];
export type Suche = z.infer<typeof SucheSchema>;
export type Treffer = z.infer<typeof TrefferSchema>;
export type TitelDetail = z.infer<typeof TitelDetailSchema>;
export type Kennzahlen = z.infer<typeof KennzahlenSchema>;
export type Glossar = z.infer<typeof GlossarSchema>;
