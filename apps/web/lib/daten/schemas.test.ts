import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DatenstandSchema, GlossarSchema, KennzahlenSchema, QueryMetricSchema, SucheSchema, TitelDetailSchema } from './schemas';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), 'utf8'));

describe('Schemas gegen echte API-Antworten', () => {
  it('Datenstand', () => {
    const d = DatenstandSchema.parse(fixture('datenstand'));
    expect(d.jahre.length).toBeGreaterThan(20);
  });
  it('query_metric', () => {
    const q = QueryMetricSchema.parse(fixture('query_metric'));
    expect(q.zeilen).toHaveLength(3);
  });
  it('search_entities', () => {
    expect(SucheSchema.parse(fixture('suche')).treffer[0]?.schluessel).toBe('14');
  });
  it('get_titel_detail', () => {
    expect(TitelDetailSchema.parse(fixture('titel_detail')).titel.titel_key).toBe('041668421');
  });
  it('list_kennzahlen', () => {
    expect(KennzahlenSchema.parse(fixture('kennzahlen')).kennzahlen).toHaveLength(17);
  });
  it('list_kennzahlen mit neutraler Wirkungsregel', () => {
    const regel = { regel_id: 'ruecklagenentnahme', konto: 'einnahmen', typ: 'obergruppe', schluessel: '35', richtung: 'neutral', begruendung: 'Nicht eindeutig.' };
    const k = KennzahlenSchema.parse({ ...(fixture('kennzahlen') as object), wirkungsrichtung: [regel] });
    expect(k.wirkungsrichtung[0]!.richtung).toBe('neutral');
  });
  it('get_glossar', () => {
    expect(GlossarSchema.parse(fixture('glossar')).eintraege.length).toBeGreaterThan(0);
  });
  it('lehnt eine unbekannte Ampel ab', () => {
    const d = { ...(fixture('datenstand') as object), ampel: 'blau' };
    expect(DatenstandSchema.safeParse(d).success).toBe(false);
  });
});
