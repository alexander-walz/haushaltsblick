import { describe, expect, it } from 'vitest';
import { wann } from './titel';

describe('Titelblock', () => {
  it('baut den WANN-Teil', () => {
    expect(wann(2025, ['Soll', 'Ist', 'ΔPL'])).toBe('2025 Soll, Ist, ΔPL');
    expect(wann(2026, [])).toBe('2026');
  });
});
