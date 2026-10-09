import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ApiVertragsFehler, pruefeApiAntwort } from './schema';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/api/${name}.json`, import.meta.url)), 'utf8'));

const URL_X = 'https://www.bundeshaushalt.de/internalapi/budgetData?year=2024';

describe('pruefeApiAntwort mit echten Antworten', () => {
  it.each(['wurzel_ist_2024_ausgaben', 'ep04_ist_2024_ausgaben', 'kap0411_ist_2024_ausgaben', 'kap0411_soll_2024_ausgaben'])(
    'akzeptiert %s ohne Warnungen',
    (name) => {
      const { warnungen } = pruefeApiAntwort(fixture(name), URL_X);
      expect(warnungen).toEqual([]);
    },
  );

  it('liest Wurzel, Ebene und Kinder', () => {
    const { antwort } = pruefeApiAntwort(fixture('wurzel_ist_2024_ausgaben'), URL_X);
    expect(antwort.meta).toMatchObject({ year: 2024, quota: 'actual', account: 'expenses', levelCur: 0, levelMax: 3, entity: 'Budget' });
    expect(antwort.detail.value).toBe(474753727609.58);
    expect(antwort.children.length).toBeGreaterThan(20);
  });

  it('liefert für Kapitel die Titel als Kinder', () => {
    const { antwort } = pruefeApiAntwort(fixture('kap0411_ist_2024_ausgaben'), URL_X);
    expect(antwort.meta.levelCur).toBe(2);
    expect(antwort.children.every((k) => /^0411\d{5}$/.test(k.id))).toBe(true);
  });
});

describe('pruefeApiAntwort bei Abweichungen', () => {
  const basis = () => structuredClone(fixture('kap0411_ist_2024_ausgaben')) as Record<string, any>;

  it('meldet unbekannte Felder als Warnung', () => {
    const json = basis();
    json.meta.neuesFeld = 1;
    json.children[0].waehrung = 'EUR';
    json.extra = true;
    expect(pruefeApiAntwort(json, URL_X).warnungen).toEqual([
      'Unbekanntes Feld extra',
      'Unbekanntes Feld meta.neuesFeld',
      'Unbekanntes Feld children[].waehrung',
    ]);
  });

  it('wirft ApiVertragsFehler bei fehlendem Pflichtfeld', () => {
    const json = basis();
    delete json.meta.timestamp;
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(ApiVertragsFehler);
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(/meta\.timestamp/);
  });

  it('wirft ApiVertragsFehler bei falschem Typ und nennt die URL', () => {
    const json = basis();
    json.children[0].value = '61346498.79';
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(`(bei ${URL_X})`);
  });

  it('wirft ApiVertragsFehler bei ungültiger Kind-ID', () => {
    const json = basis();
    json.children[0].id = '0411-1';
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(ApiVertragsFehler);
  });

  it('wirft ApiVertragsFehler, wenn die Antwort kein Objekt ist', () => {
    expect(() => pruefeApiAntwort(null, URL_X)).toThrow(ApiVertragsFehler);
  });
});

describe('pruefeApiAntwort für Funktions- und Gruppierungssicht', () => {
  const basis = () => structuredClone(fixture('kap0411_ist_2024_ausgaben')) as Record<string, any>;

  it('akzeptiert unit function und group mit levelMax 4 und F-/G-Codes', () => {
    for (const [unit, entity, id] of [['function', 'Function', 'F-322'], ['group', 'Group', 'G-684']] as const) {
      const json = basis();
      json.meta.unit = unit;
      json.meta.entity = entity;
      json.meta.levelMax = 4;
      json.children[0].id = id;
      expect(pruefeApiAntwort(json, URL_X).warnungen).toEqual([]);
    }
  });

  it('lehnt unbekannte Sichten ab', () => {
    const json = basis();
    json.meta.unit = 'region';
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(ApiVertragsFehler);
  });
});
