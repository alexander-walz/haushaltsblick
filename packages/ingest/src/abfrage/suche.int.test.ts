import { describe, expect, it } from 'vitest';
import type { Sql } from '../db/client';
import { imRollback } from '../db/test-hilfen';
import { leereMart, veroeffentlicheTitel, type TestTitel } from './testdaten';

const MRD = 1e9;

const TITEL: TestTitel[] = [
  { jahr: 2024, titelKey: '140153201', soll: 100 * MRD, einzelplanText: 'Bundesministerium der Verteidigung', kapitelText: 'Bundeswehr', titelText: 'Beschaffung von Flugzeugen', fkt: '032', funktionText: 'Deutsche Verteidigungsstreitkräfte' },
  { jahr: 2024, titelKey: '060168421', soll: 50 * MRD, einzelplanText: 'Bundesministerium des Innern', kapitelText: 'Bundespolizei', titelText: 'Zuschüsse an die Bundespolizei', fkt: '042', funktionText: 'Polizei' },
  { jahr: 2022, titelKey: '110168101', soll: 20 * MRD, einzelplanText: 'Bundesministerium für Arbeit und Soziales', titelText: 'Arbeitslosengeld II', fkt: '251', funktionText: 'Arbeitslosengeld II nach dem SGB II' },
  { jahr: 2024, titelKey: '110168101', soll: 26 * MRD, einzelplanText: 'Bundesministerium für Arbeit und Soziales', titelText: 'Bürgergeld', fkt: '251', funktionText: 'Arbeitslosengeld II nach dem SGB II' },
  { jahr: 2026, titelKey: '140153201', soll: 150 * MRD, einzelplanText: 'Bundesministerium der Verteidigung', titelText: 'Beschaffung von Flugzeugen', fkt: '032' },
];

type Treffer = { typ: string; konto: string; schluessel: string; bezeichnung: string; soll_eur: number; aehnlichkeit: number; treffer: string; filter: Record<string, string> };
type Suche = { version: number; semantik_version: number; jahr: number; suchbegriff: string; treffer: Treffer[] };

async function suche(tx: Sql, q: string, opt: { jahr?: number; typ?: string; limit?: number; version?: number } = {}): Promise<Suche> {
  const [z] = await tx`
    select api.search_entities(${q}, ${opt.jahr ?? null}::integer, ${opt.typ ?? null}::text, ${opt.limit ?? 20}::integer, ${opt.version ?? null}::bigint) as r`;
  return z!.r as Suche;
}

async function mitTestdaten(fn: (tx: Sql, version: number) => Promise<void>): Promise<void> {
  await imRollback(async (tx) => {
    await leereMart(tx);
    const version = await veroeffentlicheTitel(tx, TITEL);
    await fn(tx, version);
  });
}

describe('api.search_entities', () => {
  it('findet den Einzelplan über ein Synonym', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Bundeswehr', { jahr: 2024 });
      expect(r.jahr).toBe(2024);
      expect(r.treffer[0]).toEqual({
        typ: 'einzelplan', konto: 'ausgaben', schluessel: '14', bezeichnung: 'Bundesministerium der Verteidigung',
        soll_eur: 100 * MRD, aehnlichkeit: 1, treffer: 'synonym', filter: { einzelplan_nr: '14', konto: 'ausgaben' },
      });
    }));

  it('findet ein Synonym auch innerhalb einer Frage', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Was gibt der Bund für die Bundeswehr aus?', { jahr: 2024 });
      expect(r.treffer[0]).toMatchObject({ typ: 'einzelplan', schluessel: '14', treffer: 'synonym' });
    }));

  it('findet Titel über ähnliche Wörter', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Flugzeuge', { jahr: 2024 });
      expect(r.treffer).toContainEqual(expect.objectContaining({ typ: 'titel', schluessel: '140153201', treffer: 'text' }));
    }));

  it('findet ein Kapitel über seine Nummer', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, '1401', { jahr: 2024 });
      expect(r.treffer[0]).toMatchObject({ typ: 'kapitel', schluessel: '1401', treffer: 'schluessel', aehnlichkeit: 1 });
    }));

  it('beachtet den Gültigkeitszeitraum eines Synonyms', () =>
    mitTestdaten(async (tx) => {
      const frueher = await suche(tx, 'Hartz IV', { jahr: 2022 });
      expect(frueher.treffer).toContainEqual(expect.objectContaining({ typ: 'funktion', schluessel: '251', treffer: 'synonym' }));
      const spaeter = await suche(tx, 'Hartz IV', { jahr: 2024 });
      expect(spaeter.treffer.filter((t) => t.treffer === 'synonym')).toEqual([]);
    }));

  it('schränkt auf einen Typ ein', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Verteidigung', { jahr: 2024, typ: 'einzelplan' });
      expect(r.treffer.length).toBeGreaterThan(0);
      expect(r.treffer.every((t) => t.typ === 'einzelplan')).toBe(true);
      expect(r.treffer.map((t) => t.schluessel)).toContain('14');
    }));

  it('nimmt ohne Jahr das jüngste Jahr bis zum laufenden Kalenderjahr', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Flugzeuge');
      expect(r.jahr).toBe(Math.min(2026, new Date().getFullYear()));
    }));

  it('begrenzt die Treffer', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Bundesministerium', { jahr: 2024, limit: 1 });
      expect(r.treffer).toHaveLength(1);
    }));

  it('Synonyme der alten Version gelten für die alte Version', () =>
    mitTestdaten(async (tx, v1) => {
      await tx`delete from core.semantik_synonyme where begriff = 'Bundeswehr'`;
      const v2 = await veroeffentlicheTitel(tx, TITEL);
      const alt = await suche(tx, 'Bundeswehr', { jahr: 2024, version: v1 });
      const neu = await suche(tx, 'Bundeswehr', { jahr: 2024, version: v2 });
      expect(alt.treffer[0]).toMatchObject({ typ: 'einzelplan', schluessel: '14', treffer: 'synonym' });
      expect(neu.treffer.filter((t) => t.treffer === 'synonym' && t.schluessel === '14')).toEqual([]);
      expect(neu.semantik_version).not.toBe(alt.semantik_version);
    }));

  it('lehnt zu kurze Suchbegriffe ab', () =>
    mitTestdaten(async (tx) => {
      await expect(suche(tx, ' x ')).rejects.toThrow(/zu kurz/);
    }));

  it('lehnt unbekannte Typen ab', () =>
    mitTestdaten(async (tx) => {
      await expect(suche(tx, 'Bundeswehr', { typ: 'ressort' })).rejects.toThrow(/Unbekannter Typ: ressort/);
    }));

  it('darf von anon ausgeführt werden', () =>
    mitTestdaten(async (tx) => {
      await tx`set local role anon`;
      const r = await suche(tx, 'Polizei', { jahr: 2024 });
      expect(r.treffer.length).toBeGreaterThan(0);
    }));
});
