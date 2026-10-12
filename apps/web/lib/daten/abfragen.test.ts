import { describe, expect, it } from 'vitest';
import { frage, suche } from './abfragen';

const KONFIG = { url: 'https://api.test', key: 'k' };

function mitAufzeichnung(body: unknown) {
  const optionen: RequestInit[] = [];
  const abruf = async (_url: RequestInfo | URL, init?: RequestInit) => {
    optionen.push(init ?? {});
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { optionen, abruf: abruf as typeof fetch };
}

describe('Abfragen', () => {
  it('cacht die Suche nicht, weil jede freie Eingabe sonst einen Cache-Eintrag anlegt', async () => {
    const a = mitAufzeichnung({ version: 1, semantik_version: 1, jahr: 2026, suchbegriff: 'x', treffer: [] });
    await suche('x', { version: 1 }, { konfig: KONFIG, abruf: a.abruf });
    expect(a.optionen[0]?.cache).toBe('no-store');
    expect((a.optionen[0] as { next?: unknown }).next).toBeUndefined();
  });

  it('cacht Kennzahlabfragen mit dem Tag des Datenstands', async () => {
    const a = mitAufzeichnung({ version: 1, semantik_version: 1, vorlage: 'v', einheiten: null, zeilen: [], zeilen_gesamt: 0, hinweise: [] });
    await frage({ kennzahlen: ['soll'] }, 1, { konfig: KONFIG, abruf: a.abruf });
    expect(a.optionen[0]?.cache).toBe('force-cache');
  });
});
