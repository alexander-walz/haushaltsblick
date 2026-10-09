import { describe, expect, it } from 'vitest';
import { leseXmlDatei } from './parse-soll';
import { FIXTURE_2026, sammle, titelAus } from './test-hilfen';
import { fasseSollZusammen } from './zusammenfassung';

describe('fasseSollZusammen', () => {
  it('summiert den Gesamthaushalt ohne Anlagen und weist Anlagen getrennt aus', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(fasseSollZusammen(zeilen)).toEqual({
      jahr: 2026,
      anzahlTitel: 8,
      anzahlKapitel: 6,
      entfalleneKapitel: ['0415', '0618'],
      haushaltTsdEur: { einnahmen: 145016, ausgaben: 1457 },
      anlagenTsdEur: { einnahmen: 16713426, ausgaben: 6500000 },
      ausgeglichen: false,
    });
  });

  it('erkennt einen ausgeglichenen Haushalt', async () => {
    const xml =
      '<haushalt jahr="2026"><einzelplan nr="01"><text>EP</text><kapitel nr="0101"><text>K</text>' +
      '<einnahmen><titel nr="11901" flexibilisiert="nein" fkt="011"><text>E</text><soll wert="5"/></titel></einnahmen>' +
      '<ausgaben><titel nr="52901" flexibilisiert="nein" fkt="011"><text>A</text><soll wert="5"/></titel></ausgaben>' +
      '</kapitel></einzelplan></haushalt>';
    expect(fasseSollZusammen(await sammle([xml])).ausgeglichen).toBe(true);
  });

  it('lehnt leere Eingaben ab', () => {
    expect(() => fasseSollZusammen([])).toThrow('Keine Zeilen zum Zusammenfassen');
  });

  it('lehnt Zeilen aus mehreren Jahren ab', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    const gemischt = [...zeilen, { ...titelAus(zeilen, '0101', '68101'), jahr: 2025 }];
    expect(() => fasseSollZusammen(gemischt)).toThrow('Zeilen aus mehreren Haushaltsjahren');
  });

  // Abnahme gegen die echte Datei (Stand 08.10.2026). Aufruf:
  // HB_ECHTE_XML=<pfad zu haushalt_2026.xml> pnpm --filter @hb/ingest test
  const echteDatei = process.env.HB_ECHTE_XML;
  it.skipIf(!echteDatei)('stimmt für die echte Datei 2026 mit dem amtlichen Gesamtvolumen überein', async () => {
    const s = fasseSollZusammen(await sammle(leseXmlDatei(echteDatei!)));
    expect(s.anzahlTitel).toBe(6995);
    expect(s.haushaltTsdEur).toEqual({ einnahmen: 524540138, ausgaben: 524540138 });
    expect(s.anlagenTsdEur).toEqual({ einnahmen: 34803623, ausgaben: 34803623 });
    expect(s.entfalleneKapitel).toEqual(['0415', '0454', '0618', '1204', '1608']);
    expect(s.ausgeglichen).toBe(true);
  });
});
