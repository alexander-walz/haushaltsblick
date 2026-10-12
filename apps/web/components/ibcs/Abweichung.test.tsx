import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Abweichungsbalken } from './Abweichungsbalken';
import { Nadeln } from './Nadeln';

const TITEL = { wer: 'Bund, Ausgaben nach Einzelplänen', was: 'Mrd. €', wann: '2025 ΔPL' };

describe('Abweichungsbalken', () => {
  it('zeigt Vorzeichen und färbt nur mit Wirkungsrichtung', () => {
    const html = renderToStaticMarkup(
      <Abweichungsbalken id="a" titel={TITEL} vergleich="plan" zeilen={[
        { schluessel: 'z', bezeichnung: 'Zinsen', wert: -2_200_000_000, wirkung: 'anstieg_negativ' },
        { schluessel: '14', bezeichnung: 'Verteidigung', wert: -2_800_000_000, wirkung: 'neutral' },
        { schluessel: '06', bezeichnung: 'Inneres', wert: 600_000_000 },
      ]} />,
    );
    expect(html).toContain('ibcs-pos');
    expect(html.match(/ibcs-neutral/g)).toHaveLength(2);
    expect(html).toContain('−2,2');
    expect(html).toContain('+0,6');
  });

  it('färbt Vorjahresvergleiche nie', () => {
    const html = renderToStaticMarkup(
      <Abweichungsbalken id="b" titel={TITEL} vergleich="vorjahr" zeilen={[{ schluessel: 'z', bezeichnung: 'Zinsen', wert: 3e9, wirkung: 'anstieg_negativ' }]} />,
    );
    expect(html).not.toContain('ibcs-neg');
    expect(html).toContain('ibcs-neutral');
  });

  it('zeigt fehlende Werte als n. v.', () => {
    const html = renderToStaticMarkup(<Abweichungsbalken id="c" titel={TITEL} vergleich="plan" zeilen={[{ schluessel: 'x', bezeichnung: 'X', wert: null }]} />);
    expect(html).toContain('n. v.');
  });
});

describe('Nadeln', () => {
  it('zeigt Prozent mit Vorzeichen und kennzeichnet gekappte Werte', () => {
    const html = renderToStaticMarkup(
      <Nadeln id="n" titel={{ ...TITEL, was: '%', wann: '2025 ΔPL %' }} vergleich="plan" zeilen={[
        { schluessel: 'a', bezeichnung: 'A', wert: -0.076 },
        { schluessel: 'b', bezeichnung: 'B', wert: 2.4 },
      ]} />,
    );
    expect(html).toContain('−7,6 %');
    expect(html).toContain('+240,0 %');
    expect(html).toContain('ibcs-gekappt');
    expect(html).toContain('über 100 %');
  });
});
