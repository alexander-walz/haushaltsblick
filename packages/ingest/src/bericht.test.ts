import { describe, expect, it } from 'vitest';
import { formatiereBericht } from './bericht';

describe('formatiereBericht', () => {
  it('zeigt je Jahr Status, Titel, Summen in Mrd. € und Hinweise', () => {
    const bericht = formatiereBericht([
      {
        jahr: 2026,
        runId: 'r1',
        lokal: false,
        status: 'succeeded',
        zusammenfassung: {
          jahr: 2026,
          anzahlTitel: 6995,
          anzahlKapitel: 234,
          entfalleneKapitel: [],
          haushaltTsdEur: { einnahmen: 524540138, ausgaben: 524540138 },
          anlagenTsdEur: { einnahmen: 34803623, ausgaben: 34803623 },
          ausgeglichen: true,
        },
      },
      { jahr: 2027, runId: 'r2', lokal: false, status: 'skipped', hinweis: 'Datei noch nicht veröffentlicht' },
    ]);
    expect(bericht.split('\n')).toEqual([
      '| Jahr | Status | Titel | Ausgaben Soll (Mrd. €) | Anlagen Ausgaben (Mrd. €) | Ausgeglichen | Hinweis |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| 2026 | succeeded | 6995 | 524,5 | 34,8 | ja |  |',
      '| 2027 | skipped |  |  |  |  | Datei noch nicht veröffentlicht |',
    ]);
  });

  it('kennzeichnet Läufe aus lokalen Dateien im Hinweis', () => {
    const bericht = formatiereBericht([
      { jahr: 2026, runId: 'r1', status: 'succeeded', lokal: true },
      { jahr: 2025, runId: 'r2', status: 'skipped', lokal: true, hinweis: 'unverändert' },
    ]);
    expect(bericht.split('\n').slice(2)).toEqual([
      '| 2026 | succeeded |  |  |  |  | lokale Datei |',
      '| 2025 | skipped |  |  |  |  | unverändert; lokale Datei |',
    ]);
  });
});
