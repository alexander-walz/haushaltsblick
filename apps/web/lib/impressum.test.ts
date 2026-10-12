import { describe, expect, it } from 'vitest';
import { impressum } from './impressum';

describe('impressum', () => {
  it('liest die Angaben aus der Umgebung', () => {
    expect(impressum({ HB_IMPRESSUM_NAME: 'Erika Muster', HB_IMPRESSUM_ANSCHRIFT: 'Musterweg 1|12345 Musterstadt', HB_IMPRESSUM_KONTAKT: 'kontakt@example.org' }))
      .toEqual({ name: 'Erika Muster', anschrift: ['Musterweg 1', '12345 Musterstadt'], kontakt: 'kontakt@example.org' });
  });
  it('liefert null, wenn etwas fehlt', () => {
    expect(impressum({ HB_IMPRESSUM_NAME: 'Erika Muster' })).toBeNull();
  });
});
