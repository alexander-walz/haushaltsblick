import { describe, expect, it } from 'vitest';
import type { Standardjahre } from './daten/jahre';
import { bezeichnung, brotkrumen, ebene, explorerHref, kindHref, leseParameter, trefferZiel } from './explorer';

const JAHRE: Standardjahre = { laufend: 2026, letztesMitIst: 2025, entwurf: 2027, alle: [2012, 2025, 2026, 2027] };

describe('leseParameter', () => {
  it('setzt Standardwerte', () => {
    expect(leseParameter({}, JAHRE)).toEqual({ param: { jahr: 2026, konto: 'ausgaben', sicht: 'ressort', pfad: {} }, hinweise: [] });
  });

  it('übernimmt einen gültigen Pfad', () => {
    const { param, hinweise } = leseParameter({ jahr: '2025', einzelplan: '14', kapitel: '1401' }, JAHRE);
    expect(param).toEqual({ jahr: 2025, konto: 'ausgaben', sicht: 'ressort', pfad: { einzelplan_nr: '14', kapitel_nr: '1401' } });
    expect(hinweise).toEqual([]);
  });

  it('korrigiert ein unbekanntes Jahr mit Hinweis', () => {
    const { param, hinweise } = leseParameter({ jahr: 'abc' }, JAHRE);
    expect(param.jahr).toBe(2026);
    expect(hinweise).toEqual(['Das Jahr „abc“ ist nicht verfügbar. Gezeigt wird 2026.']);
  });

  it('übernimmt Eingaben nur gekürzt in Hinweise', () => {
    const lang = 'Bitte rufen Sie sofort diese Nummer an, um Ihr Konto zu retten';
    expect(leseParameter({ jahr: lang }, JAHRE).hinweise).toEqual([`Das Jahr „${lang.slice(0, 39)}…“ ist nicht verfügbar. Gezeigt wird 2026.`]);
    expect(leseParameter({ einzelplan: lang }, JAHRE).hinweise).toEqual([`Die Auswahl „${lang.slice(0, 39)}…“ ist ungültig und wurde zurückgesetzt.`]);
  });

  it('verwirft ungültige oder unpassende Schlüssel und alles darunter', () => {
    const a = leseParameter({ einzelplan: '9x', kapitel: '1401' }, JAHRE);
    expect(a.param.pfad).toEqual({});
    expect(a.hinweise).toHaveLength(1);
    const b = leseParameter({ einzelplan: '14', kapitel: '0601' }, JAHRE);
    expect(b.param.pfad).toEqual({ einzelplan_nr: '14' });
    expect(b.hinweise).toEqual(['Die Auswahl „0601“ passt nicht zur übergeordneten Ebene und wurde zurückgesetzt.']);
  });

  it('zeigt Aufgaben nur für Ausgaben', () => {
    const { param, hinweise } = leseParameter({ konto: 'einnahmen', sicht: 'aufgabe' }, JAHRE);
    expect(param.sicht).toBe('ressort');
    expect(hinweise).toEqual(['Die Sicht nach Aufgaben gibt es nur für Ausgaben.']);
  });

  it('liest Arten und Aufgaben', () => {
    expect(leseParameter({ sicht: 'aufgabe', hauptfunktion: '8', oberfunktion: '83', funktion: '830' }, JAHRE).param.pfad)
      .toEqual({ hauptfunktion: '8', oberfunktion: '83', fkt: '830' });
    expect(leseParameter({ konto: 'einnahmen', sicht: 'art', hauptgruppe: '0' }, JAHRE).param.pfad).toEqual({ hauptgruppe: '0' });
  });
});

describe('Ebenen und Links', () => {
  it('bestimmt Gruppierung und Filter je Tiefe', () => {
    expect(ebene({ jahr: 2025, konto: 'ausgaben', sicht: 'ressort', pfad: {} }))
      .toEqual({ gruppierung: 'einzelplan_nr', filter: {}, tiefe: 0, letzte: false });
    expect(ebene({ jahr: 2025, konto: 'ausgaben', sicht: 'ressort', pfad: { einzelplan_nr: '14', kapitel_nr: '1401' } }))
      .toEqual({ gruppierung: 'titel_key', filter: { einzelplan_nr: '14', kapitel_nr: '1401' }, tiefe: 2, letzte: true });
  });

  it('baut Links in fester Reihenfolge', () => {
    const p = { jahr: 2025, konto: 'ausgaben' as const, sicht: 'ressort' as const, pfad: { einzelplan_nr: '14' } };
    expect(explorerHref(p)).toBe('/explorer?jahr=2025&konto=ausgaben&sicht=ressort&einzelplan=14');
    expect(kindHref(p, '1401')).toBe('/explorer?jahr=2025&konto=ausgaben&sicht=ressort&einzelplan=14&kapitel=1401');
    expect(kindHref({ ...p, pfad: { einzelplan_nr: '14', kapitel_nr: '1401' } }, '140155401')).toBe('/titel/2025/140155401');
  });

  it('baut Brotkrumen mit Bezeichnungen', () => {
    const p = { jahr: 2025, konto: 'ausgaben' as const, sicht: 'ressort' as const, pfad: { einzelplan_nr: '14', kapitel_nr: '1401' } };
    expect(brotkrumen(p, { einzelplan_text: 'Verteidigung', kapitel_text: null })).toEqual([
      { bezeichnung: 'Bund', href: '/explorer?jahr=2025&konto=ausgaben&sicht=ressort' },
      { bezeichnung: '14 Verteidigung', href: '/explorer?jahr=2025&konto=ausgaben&sicht=ressort&einzelplan=14' },
      { bezeichnung: '1401', href: '/explorer?jahr=2025&konto=ausgaben&sicht=ressort&einzelplan=14&kapitel=1401' },
    ]);
  });

  it('formatiert Bezeichnungen und Titelschlüssel', () => {
    expect(bezeichnung('einzelplan_nr', '14', 'Verteidigung')).toBe('14 Verteidigung');
    expect(bezeichnung('titel_key', '060168421', 'Zuschüsse')).toBe('0601 684 21 Zuschüsse');
    expect(bezeichnung('fkt', '830', null)).toBe('830');
  });

  it('führt Suchtreffer an die passende Stelle', () => {
    expect(trefferZiel({ typ: 'einzelplan', konto: 'ausgaben', schluessel: '14' }, 2026)).toBe('/explorer?jahr=2026&konto=ausgaben&sicht=ressort&einzelplan=14');
    expect(trefferZiel({ typ: 'kapitel', konto: 'ausgaben', schluessel: '1401' }, 2026)).toBe('/explorer?jahr=2026&konto=ausgaben&sicht=ressort&einzelplan=14&kapitel=1401');
    expect(trefferZiel({ typ: 'titel', konto: 'ausgaben', schluessel: '140155401' }, 2026)).toBe('/titel/2026/140155401');
    expect(trefferZiel({ typ: 'funktion', konto: 'ausgaben', schluessel: '142' }, 2026))
      .toBe('/explorer?jahr=2026&konto=ausgaben&sicht=aufgabe&hauptfunktion=1&oberfunktion=14&funktion=142');
    expect(trefferZiel({ typ: 'hauptgruppe', konto: 'einnahmen', schluessel: '0' }, 2026)).toBe('/explorer?jahr=2026&konto=einnahmen&sicht=art&hauptgruppe=0');
    expect(trefferZiel({ typ: 'obergruppe', konto: 'einnahmen', schluessel: '32' }, 2026)).toBe('/explorer?jahr=2026&konto=einnahmen&sicht=art&hauptgruppe=3&obergruppe=32');
  });
});
