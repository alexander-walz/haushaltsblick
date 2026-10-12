import { describe, expect, it } from 'vitest';
import { heute } from './zeit';

describe('heute', () => {
  it('nimmt HB_HEUTE, wenn gesetzt', () => {
    expect(heute({ HB_HEUTE: '2026-10-12' }).toISOString().slice(0, 10)).toBe('2026-10-12');
  });

  it('nimmt sonst das aktuelle Datum', () => {
    const vorher = Date.now();
    expect(heute({}).getTime()).toBeGreaterThanOrEqual(vorher - 1000);
  });

  it('lehnt ein ungültiges Datum ab', () => {
    expect(() => heute({ HB_HEUTE: '12.10.2026' })).toThrow(/HB_HEUTE/);
  });
});
