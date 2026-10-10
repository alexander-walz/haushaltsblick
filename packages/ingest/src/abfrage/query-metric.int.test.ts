import { describe, expect, it } from 'vitest';
import type { Sql } from '../db/client';
import { imRollback } from '../db/test-hilfen';
import { leereMart, veroeffentlicheTitel, type TestTitel } from './testdaten';

const MRD = 1e9;

// Zwei Ausgabetitel 2023 bis 2026 (2023 mit Soll aus der XML, 2026 ohne Ist) und ein Einnahmetitel 2024.
const TITEL: TestTitel[] = [
  { jahr: 2023, titelKey: '140153201', soll: 80 * MRD, ist: 85 * MRD, sollQuelle: 'xml', einzelplanText: 'Verteidigung', titelText: 'Beschaffung von Flugzeugen' },
  { jahr: 2024, titelKey: '140153201', soll: 100 * MRD, ist: 90 * MRD, einzelplanText: 'Verteidigung', titelText: 'Beschaffung von Flugzeugen' },
  { jahr: 2025, titelKey: '140153201', soll: 120 * MRD, ist: 110 * MRD, einzelplanText: 'Verteidigung', titelText: 'Beschaffung von Flugzeugen' },
  { jahr: 2026, titelKey: '140153201', soll: 150 * MRD, einzelplanText: 'Verteidigung', titelText: 'Beschaffung von Flugzeugen' },
  { jahr: 2024, titelKey: '060168421', soll: 50 * MRD, ist: 70 * MRD, einzelplanText: 'Inneres, Bau und Heimat', titelText: 'Zuschüsse an die Bundespolizei' },
  { jahr: 2025, titelKey: '060168421', soll: 40 * MRD, ist: 30 * MRD, einzelplanText: 'Inneres', titelText: 'Zuschüsse an die Bundespolizei' },
  { jahr: 2026, titelKey: '060168421', soll: 50 * MRD, einzelplanText: 'Inneres', titelText: 'Zuschüsse an die Bundespolizei' },
  { jahr: 2024, titelKey: '600101101', konto: 'einnahmen', soll: 150 * MRD, ist: 150 * MRD },
];

type Ergebnis = {
  version: number;
  semantik_version: number;
  vorlage: string;
  parameter: Record<string, unknown>;
  einheiten: Record<string, string>;
  zeilen: Record<string, unknown>[];
  zeilen_gesamt: number;
  hinweise: string[];
};

type Abfrage = {
  kennzahlen: string[];
  gruppierung?: string[];
  filter?: Record<string, unknown>;
  sortierung?: string | null;
  absteigend?: boolean;
  limit?: number;
  version?: number | null;
};

async function abfrage(tx: Sql, a: Abfrage): Promise<Ergebnis> {
  const filter = tx.json((a.filter ?? {}) as Parameters<Sql['json']>[0]);
  const [z] = await tx`
    select api.query_metric(${a.kennzahlen}::text[], ${a.gruppierung ?? []}::text[], ${filter}::jsonb,
      ${a.sortierung ?? null}::text, ${a.absteigend ?? true}::boolean, ${a.limit ?? 50}::integer, ${a.version ?? null}::bigint) as r`;
  return z!.r as Ergebnis;
}

async function mitTestdaten(fn: (tx: Sql, version: number) => Promise<void>): Promise<void> {
  await imRollback(async (tx) => {
    await leereMart(tx);
    const version = await veroeffentlicheTitel(tx, TITEL);
    await fn(tx, version);
  });
}

describe('api.query_metric', () => {
  it('summiert das Soll je Jahr', () =>
    mitTestdaten(async (tx, version) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], gruppierung: ['jahr'], filter: { konto: 'ausgaben' } });
      expect(r.version).toBe(version);
      expect(r.vorlage).toBe('query_metric.v1');
      expect(r.einheiten).toEqual({ soll: 'EUR' });
      expect(r.zeilen).toEqual([
        { jahr: 2023, soll: 80 * MRD },
        { jahr: 2024, soll: 150 * MRD },
        { jahr: 2025, soll: 160 * MRD },
        { jahr: 2026, soll: 200 * MRD },
      ]);
      expect(r.parameter.filter).toEqual({ konto: ['ausgaben'] });
    }));

  it('zeigt fehlendes Ist als null, nie als 0', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['ist'], gruppierung: ['jahr'], filter: { konto: 'ausgaben' } });
      expect(r.zeilen).toEqual([
        { jahr: 2023, ist: 85 * MRD },
        { jahr: 2024, ist: 160 * MRD },
        { jahr: 2025, ist: 140 * MRD },
        { jahr: 2026, ist: null },
      ]);
      expect(r.hinweise.some((h) => h.includes('nie 0'))).toBe(true);
    }));

  it('Ist über verfügbare und nicht verfügbare Jahre bleibt null', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll', 'ist'], filter: { konto: 'ausgaben', jahr_von: 2025 } });
      expect(r.zeilen).toEqual([{ soll: 360 * MRD, ist: null }]);
    }));

  it('Abweichung nur mit Soll aus der internalapi', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['abweichung', 'abweichung_rel', 'ist_quote'], gruppierung: ['jahr'], filter: { konto: 'ausgaben' } });
      expect(r.zeilen).toEqual([
        { jahr: 2023, abweichung: null, abweichung_rel: null, ist_quote: null },
        { jahr: 2024, abweichung: 10 * MRD, abweichung_rel: 0.066667, ist_quote: 1.066667 },
        { jahr: 2025, abweichung: -20 * MRD, abweichung_rel: -0.125, ist_quote: 0.875 },
        { jahr: 2026, abweichung: null, abweichung_rel: null, ist_quote: null },
      ]);
      expect(r.hinweise.some((h) => h.includes('Haushaltsplan (XML)'))).toBe(true);
    }));

  it('bezieht den Anteil auf den ganzen Haushalt, auch bei Filter auf einen Einzelplan', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll_anteil', 'ist_anteil'], filter: { konto: 'ausgaben', jahr: 2024, einzelplan_nr: '14' } });
      expect(r.zeilen).toEqual([{ soll_anteil: 0.666667, ist_anteil: 0.5625 }]);
    }));

  it('rechnet je Kopf und je Tag, mit fortgeschriebener Einwohnerzahl', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll_pro_kopf', 'soll_pro_tag'], gruppierung: ['jahr'], filter: { konto: 'ausgaben', jahr: [2024, 2026] } });
      expect(r.zeilen).toEqual([
        { jahr: 2024, soll_pro_kopf: 1797.35, soll_pro_tag: 409836065.57 },
        { jahr: 2026, soll_pro_kopf: 2393, soll_pro_tag: 547945205.48 },
      ]);
      expect(r.hinweise.some((h) => h.includes('fortgeschrieben'))).toBe(true);
    }));

  it('vergleicht mit dem Vorjahr', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll_vj_abs', 'soll_vj_rel', 'ist_vj_abs'], gruppierung: ['jahr'], filter: { konto: 'ausgaben' } });
      expect(r.zeilen).toEqual([
        { jahr: 2023, soll_vj_abs: null, soll_vj_rel: null, ist_vj_abs: null },
        { jahr: 2024, soll_vj_abs: 70 * MRD, soll_vj_rel: 0.875, ist_vj_abs: 75 * MRD },
        { jahr: 2025, soll_vj_abs: 10 * MRD, soll_vj_rel: 0.066667, ist_vj_abs: -20 * MRD },
        { jahr: 2026, soll_vj_abs: 40 * MRD, soll_vj_rel: 0.25, ist_vj_abs: null },
      ]);
      expect(r.hinweise.some((h) => h.includes('Ressortwechsel'))).toBe(true);
    }));

  it('vergleicht mit dem Vorjahr auch bei Filter auf ein einzelnes Jahr', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll', 'soll_vj_abs'], gruppierung: ['einzelplan_nr'], filter: { konto: 'ausgaben', jahr: 2025 } });
      expect(r.zeilen).toEqual([
        { einzelplan_nr: '06', einzelplan_text: 'Inneres', soll: 40 * MRD, soll_vj_abs: -10 * MRD },
        { einzelplan_nr: '14', einzelplan_text: 'Verteidigung', soll: 120 * MRD, soll_vj_abs: 20 * MRD },
      ]);
    }));

  it('verknüpft das Vorjahr auch bei leerer Titelgruppe und leerem Flexibilisierungskennzeichen', () =>
    mitTestdaten(async (tx) => {
      const titel: TestTitel[] = [
        { jahr: 2024, titelKey: '140153201', soll: 100 * MRD, ist: 100 * MRD },
        { jahr: 2025, titelKey: '140153201', soll: 120 * MRD, ist: 120 * MRD },
        { jahr: 2024, titelKey: '140168401', soll: 10 * MRD, ist: 10 * MRD, titelgruppeNr: '01' },
        { jahr: 2025, titelKey: '140168401', soll: 15 * MRD, ist: 15 * MRD, titelgruppeNr: '01' },
      ];
      await veroeffentlicheTitel(tx, titel);
      const r = await abfrage(tx, { kennzahlen: ['soll', 'soll_vj_abs'], gruppierung: ['kapitel_nr', 'titelgruppe_nr'], filter: { konto: 'ausgaben', jahr: 2025 } });
      expect(r.zeilen).toEqual([
        { kapitel_nr: '1401', kapitel_text: 'Kapitel 1401', titelgruppe_nr: '01', titelgruppe_text: 'Titelgruppe 01', soll: 15 * MRD, soll_vj_abs: 5 * MRD },
        { kapitel_nr: '1401', kapitel_text: 'Kapitel 1401', titelgruppe_nr: null, titelgruppe_text: null, soll: 120 * MRD, soll_vj_abs: 20 * MRD },
      ]);
      const f = await abfrage(tx, { kennzahlen: ['soll', 'soll_vj_abs'], gruppierung: ['flexibilisiert'], filter: { konto: 'ausgaben', jahr: 2025 } });
      expect(f.zeilen).toEqual([{ flexibilisiert: null, soll: 135 * MRD, soll_vj_abs: 25 * MRD }]);
    }));

  it('nimmt die Bezeichnung aus dem jüngsten Jahr der Gruppe', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll', 'titel_anzahl'], gruppierung: ['einzelplan_nr'], filter: { konto: 'ausgaben' } });
      expect(r.zeilen).toEqual([
        { einzelplan_nr: '06', einzelplan_text: 'Inneres', soll: 140 * MRD, titel_anzahl: 3 },
        { einzelplan_nr: '14', einzelplan_text: 'Verteidigung', soll: 450 * MRD, titel_anzahl: 4 },
      ]);
    }));

  it('vergleicht mit dem Vorjahr auch bei Filter auf einen Jahresbereich', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll_vj_abs'], gruppierung: ['jahr'], filter: { konto: 'ausgaben', jahr_von: 2024, jahr_bis: 2025 } });
      expect(r.zeilen).toEqual([
        { jahr: 2024, soll_vj_abs: 70 * MRD },
        { jahr: 2025, soll_vj_abs: 10 * MRD },
      ]);
      const l = await abfrage(tx, { kennzahlen: ['soll_vj_abs'], gruppierung: ['jahr'], filter: { konto: 'ausgaben', jahr: [2024, 2026] } });
      expect(l.zeilen).toEqual([
        { jahr: 2024, soll_vj_abs: 70 * MRD },
        { jahr: 2026, soll_vj_abs: 40 * MRD },
      ]);
    }));

  it('vervielfacht beim Vorjahresvergleich nichts, wenn das Vorjahr mehrere Quellen hat', () =>
    mitTestdaten(async (tx) => {
      const titel = TITEL.map((t) => (t.jahr === 2024 && t.titelKey === '060168421' ? { ...t, sollQuelle: 'xml' as const } : t));
      await veroeffentlicheTitel(tx, titel);
      const r = await abfrage(tx, { kennzahlen: ['soll', 'soll_vj_abs'], gruppierung: ['soll_quelle'], filter: { konto: 'ausgaben', jahr: 2025 } });
      expect(r.zeilen).toEqual([{ soll_quelle: 'api', soll: 160 * MRD, soll_vj_abs: 10 * MRD }]);
    }));

  it('nimmt bei Gleichstand der Bezeichnung den alphabetisch ersten Text', () =>
    mitTestdaten(async (tx) => {
      const titel: TestTitel[] = [
        { jahr: 2024, titelKey: '140153201', soll: 1, ist: 1, einzelplanText: 'B-Text' },
        { jahr: 2024, titelKey: '140153202', soll: 1, ist: 1, einzelplanText: 'A-Text' },
      ];
      await veroeffentlicheTitel(tx, titel);
      const r = await abfrage(tx, { kennzahlen: ['soll'], gruppierung: ['einzelplan_nr'], filter: { konto: 'ausgaben' } });
      expect(r.zeilen).toEqual([{ einzelplan_nr: '14', einzelplan_text: 'A-Text', soll: 2 }]);
    }));

  it('behandelt doppelte Filterwerte als einen und null als absteigend', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: ['ausgaben', 'ausgaben'], jahr: 2024 } });
      expect(r.parameter.filter).toEqual({ konto: ['ausgaben'], jahr: [2024] });
      const [z] = await tx`select api.query_metric('{soll}'::text[], '{}'::text[], '{"konto":"ausgaben"}'::jsonb, null, null, 50, null) as r`;
      expect((z!.r as Ergebnis).parameter.absteigend).toBe(true);
    }));

  it('sortiert, begrenzt und nennt die Kürzung', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], gruppierung: ['titel_key'], filter: { konto: 'ausgaben', jahr: 2024 }, sortierung: 'soll', limit: 1 });
      expect(r.zeilen).toEqual([{ titel_key: '140153201', titel_text: 'Beschaffung von Flugzeugen', soll: 100 * MRD }]);
      expect(r.zeilen_gesamt).toBe(2);
      expect(r.hinweise).toContain('Ergebnis auf 1 von 2 Zeilen gekürzt.');
      const auf = await abfrage(tx, { kennzahlen: ['soll'], gruppierung: ['titel_key'], filter: { konto: 'ausgaben', jahr: 2024 }, sortierung: 'soll', absteigend: false });
      expect(auf.zeilen.map((z) => z.titel_key)).toEqual(['060168421', '140153201']);
    }));

  it('gruppiert nach Konto ohne Kontofilter', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], gruppierung: ['konto'], filter: { jahr: 2024 } });
      expect(r.zeilen).toEqual([
        { konto: 'ausgaben', soll: 150 * MRD },
        { konto: 'einnahmen', soll: 150 * MRD },
      ]);
    }));

  it('liefert eine frühere Version unverändert', () =>
    mitTestdaten(async (tx, v1) => {
      const geaendert = TITEL.map((t) => (t.jahr === 2024 && t.titelKey === '140153201' ? { ...t, soll: 101 * MRD } : t));
      const v2 = await veroeffentlicheTitel(tx, geaendert);
      const alt = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr: 2024 }, version: v1 });
      const neu = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr: 2024 } });
      expect(alt.version).toBe(v1);
      expect(alt.zeilen).toEqual([{ soll: 150 * MRD }]);
      expect(neu.version).toBe(v2);
      expect(neu.zeilen).toEqual([{ soll: 151 * MRD }]);
    }));

  it('liefert ohne Treffer keine Zeile', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr: 1999 } });
      expect(r.zeilen).toEqual([]);
      expect(r.zeilen_gesamt).toBe(0);
      expect(r.hinweise).toContain('Keine Zeilen für diese Auswahl.');
    }));

  it('Werte gehen als Parameter hinein', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', einzelplan_nr: ["14' or '1'='1"] } });
      expect(r.zeilen).toEqual([]);
      const [n] = await tx`select count(*)::int as n from mart.fct_titel_jahr_hist`;
      expect(n!.n).toBeGreaterThan(0);
    }));

  describe('lehnt unzulässige Eingaben ab', () => {
    const faelle: [string, Abfrage, RegExp][] = [
      ['ohne Kennzahl', { kennzahlen: [], filter: { konto: 'ausgaben' } }, /Mindestens eine Kennzahl/],
      ['unbekannte Kennzahl', { kennzahlen: ['cagr'], filter: { konto: 'ausgaben' } }, /Unbekannte Kennzahl: cagr/],
      ['Gruppierung mit SQL', { kennzahlen: ['soll'], gruppierung: ['jahr; drop table mart.fct_titel_jahr_hist'], filter: { konto: 'ausgaben' } }, /Unzulässige Gruppierung/],
      ['Filter auf unbekannte Spalte', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', titel_text: 'x' } }, /Unzulässiger Filter: titel_text/],
      ['verschachtelter Filterwert', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', einzelplan_nr: { a: 1 } } }, /einfacher Werte/],
      ['leere Filterliste', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', einzelplan_nr: [] } }, /einfacher Werte/],
      ['null als Filterwert', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', einzelplan_nr: null } }, /einfacher Werte/],
      ['Jahr als Text', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr_von: '2024' } }, /Jahreszahl/],
      ['Zahl für eine Textspalte', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', einzelplan_nr: 6 } }, /Filter einzelplan_nr braucht Text, z\. B\. "06"/],
      ['Zahl in einer Liste für eine Textspalte', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', kapitel_nr: ['1401', 1402] } }, /Filter kapitel_nr braucht Text/],
      ['Text als Jahr', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr: '2024' } }, /Filter jahr braucht eine Jahreszahl/],
      ['Text für flexibilisiert', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', flexibilisiert: 'true' } }, /Filter flexibilisiert braucht true oder false/],
      ['ohne Konto', { kennzahlen: ['soll'], gruppierung: ['jahr'] }, /Konto festlegen/],
      ['zwei Konten ohne Gruppierung', { kennzahlen: ['soll'], filter: { konto: ['ausgaben', 'einnahmen'] } }, /Konto festlegen/],
      ['je Kopf ohne einzelnes Jahr', { kennzahlen: ['soll_pro_kopf'], filter: { konto: 'ausgaben' } }, /einzelnes Jahr/],
      ['Titelgruppe ohne Kapitel gruppieren', { kennzahlen: ['soll'], gruppierung: ['titelgruppe_nr'], filter: { konto: 'ausgaben' } }, /Titelgruppe nur zusammen mit kapitel_nr/],
      ['Titelgruppe ohne Kapitel filtern', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', titelgruppe_nr: '01' } }, /nur zusammen mit Filter kapitel_nr/],
      ['Sortierung nach nicht angefragter Kennzahl', { kennzahlen: ['soll'], filter: { konto: 'ausgaben' }, sortierung: 'ist' }, /Sortierung nur nach/],
    ];
    for (const [name, a, fehler] of faelle) {
      it(name, () =>
        mitTestdaten(async (tx) => {
          await expect(abfrage(tx, a)).rejects.toThrow(fehler);
        }));
    }
  });

  it('kürzt zu große Limits auf 500', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben' }, limit: 100000 });
      expect(r.parameter.limit).toBe(500);
    }));

  it('darf von anon ausgeführt werden', () =>
    mitTestdaten(async (tx) => {
      await tx`set local role anon`;
      const r = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr: 2024 } });
      expect(r.zeilen).toEqual([{ soll: 150 * MRD }]);
    }));
});
