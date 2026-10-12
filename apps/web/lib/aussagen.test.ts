import { describe, expect, it } from 'vitest';
import { kernaussagePlanIst, kernaussageStart } from './aussagen';

describe('Kernaussagen (faktisch, ohne Wertung)', () => {
  it('Start', () => {
    expect(kernaussageStart(2026, 524_540_138_000, 6276.1, 1_437_096_268, false)).toEqual({
      titel: 'Der Bund plant 2026 Ausgaben von 524,5 Mrd. €.',
      untertitel: 'Das sind 6.276 € je Einwohnerin und Einwohner oder 1,4 Mrd. € an jedem Tag des Jahres.',
    });
    expect(kernaussageStart(2027, 555_435_744_000, null, null, true)).toEqual({
      titel: 'Der Regierungsentwurf sieht für 2027 Ausgaben von 555,4 Mrd. € vor.',
      untertitel: null,
    });
  });

  it('Start ohne Kopfzahl', () => {
    expect(kernaussageStart(2026, null, 6276.1, 1_437_096_268, false)).toEqual({
      titel: 'Für 2026 liegen noch keine Zahlen vor.',
      untertitel: null,
    });
  });

  it('Plan und Wirklichkeit', () => {
    expect(kernaussagePlanIst(2025, 'ausgaben', -7_000_000_000)).toBe('2025 wurden 7,0 Mrd. € weniger ausgegeben als geplant.');
    expect(kernaussagePlanIst(2025, 'einnahmen', 3_200_000_000)).toBe('2025 wurden 3,2 Mrd. € mehr eingenommen als geplant.');
    expect(kernaussagePlanIst(2025, 'ausgaben', 0)).toBe('2025 entsprach das Ist genau dem Soll.');
    expect(kernaussagePlanIst(2026, 'ausgaben', null)).toBe('Für 2026 liegt noch kein Ist vor.');
  });
});
