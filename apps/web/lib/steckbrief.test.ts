import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TitelDetailSchema } from './daten/schemas';
import { flexibilisiertText, luecke, sichereFundstelle, zeitpunkte } from './steckbrief';

const detail = TitelDetailSchema.parse(JSON.parse(readFileSync(new URL('./daten/__fixtures__/titel_detail.json', import.meta.url), 'utf8')));

describe('Steckbrief', () => {
  it('baut Zeitpunkte mit Markierung beim Ressortwechsel', () => {
    const p = zeitpunkte(detail, false);
    expect(p.length).toBe(detail.zeitreihe.length);
    const wechsel = p.filter((x) => x.markierung);
    expect(wechsel.length).toBeGreaterThanOrEqual(1);
    expect(wechsel[0]!.markierung).toMatch(/^ab \d{4}: Kapitel \d{4}$/);
    expect(p.every((x) => x.haushaltsplan === undefined)).toBe(true);
  });

  it('zeigt Ist nur, wenn verfügbar, und kennzeichnet den Entwurf', () => {
    const p = zeitpunkte(detail, true);
    const letzter = p.at(-1)!;
    expect(letzter.ist).toBeNull();
    expect(p.some((x) => x.sollSzenario === 'entwurf')).toBe(true);
    expect(p.some((x) => x.haushaltsplan !== undefined)).toBe(true);
  });

  it('erklärt Flexibilisierung und Lücken', () => {
    expect(flexibilisiertText(null)).toBe('nicht anwendbar');
    expect(flexibilisiertText(true)).toBe('ja');
    expect(flexibilisiertText(false)).toBe('nein');
    expect(luecke(detail, 2012)).toMatch(/^Für Jahre vor \d{4}/);
    expect(luecke({ ...detail, zeitreihe: detail.zeitreihe.map((z, i) => ({ ...z, jahr: 2012 + i })) }, 2012)).toBeNull();
  });

  it('zeigt kein Ist, wenn es nicht verfügbar ist, auch bei gesetztem Wert', () => {
    const kopie = structuredClone(detail);
    kopie.zeitreihe[0] = { ...kopie.zeitreihe[0]!, ist_verfuegbar: false, ist_eur: 123 };
    expect(zeitpunkte(kopie, false)[0]!.ist).toBeNull();
  });

  it('verlinkt Fundstellen nur auf https://www.bundeshaushalt.de', () => {
    expect(sichereFundstelle('https://www.bundeshaushalt.de/static/daten/2026/soll/epl04.pdf')).toBe('https://www.bundeshaushalt.de/static/daten/2026/soll/epl04.pdf');
    expect(sichereFundstelle('javascript:alert(1)')).toBeNull();
    expect(sichereFundstelle('https://example.org/x.pdf')).toBeNull();
    expect(sichereFundstelle('http://www.bundeshaushalt.de/x.pdf')).toBeNull();
    expect(sichereFundstelle('kein url')).toBeNull();
  });
});
