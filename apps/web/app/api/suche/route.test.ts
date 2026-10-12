import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../../lib/daten/__fixtures__/${name}.json`, import.meta.url), 'utf8'));

vi.mock('@/lib/daten/abfragen', () => ({
  ladeDatenstand: vi.fn(async () => fixture('datenstand')),
  suche: vi.fn(async () => fixture('suche')),
}));

const { GET } = await import('./route');

describe('GET /api/suche', () => {
  it('liefert Treffer mit Ziel-Link', async () => {
    const r = await GET(new Request('http://x/api/suche?q=Bundeswehr'));
    const daten = (await r.json()) as { treffer: { typ: string; typBezeichnung: string; href: string }[] };
    expect(daten.treffer[0]).toMatchObject({ typ: 'einzelplan', typBezeichnung: 'Einzelplan' });
    expect(daten.treffer[0]?.href).toMatch(/^\/explorer\?jahr=\d{4}&konto=ausgaben&sicht=ressort&einzelplan=14$/);
  });

  it('ignoriert zu kurze und zu lange Eingaben', async () => {
    expect(await (await GET(new Request('http://x/api/suche?q=a'))).json()).toEqual({ treffer: [] });
    expect(await (await GET(new Request(`http://x/api/suche?q=${'a'.repeat(201)}`))).json()).toEqual({ treffer: [] });
  });
});
