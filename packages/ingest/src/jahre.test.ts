import { describe, expect, it } from 'vitest';
import { parseJahre } from './jahre';

const HEUTE = new Date('2026-10-08T12:00:00Z');

describe('parseJahre', () => {
  it('liefert für "alle" 2012 bis zum Folgejahr', () => {
    const jahre = parseJahre('alle', HEUTE);
    expect(jahre[0]).toBe(2012);
    expect(jahre.at(-1)).toBe(2027);
    expect(jahre).toHaveLength(16);
  });

  it('liest Bereiche und einzelne Jahre', () => {
    expect(parseJahre('2024-2026', HEUTE)).toEqual([2024, 2025, 2026]);
    expect(parseJahre('2025', HEUTE)).toEqual([2025]);
  });

  it.each(['2026-2024', '2011', '2028', 'abc', '2024-'])('lehnt "%s" ab', (angabe) => {
    expect(() => parseJahre(angabe, HEUTE)).toThrow(/Jahr/);
  });
});
