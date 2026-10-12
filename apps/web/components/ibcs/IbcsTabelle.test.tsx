import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IbcsTabelle } from './IbcsTabelle';

const TITEL = { wer: 'Bund, Ausgaben nach Einzelplänen', was: 'Mrd. €', wann: '2025 Soll, Ist, ΔPL' };

describe('IbcsTabelle', () => {
  const zeilen = [
    { schluessel: '11', bezeichnung: '11 Arbeit und Soziales', href: '/x', soll: 190.3e9, ist: 189.6e9, abweichung: -0.8e9, abweichungRel: -0.004, wirkung: 'neutral' as const },
    { schluessel: '60', bezeichnung: '60 Allg. Finanzverwaltung', soll: 46.8e9, ist: 43.2e9, abweichung: -3.5e9, abweichungRel: -0.076, wirkung: 'neutral' as const },
  ];
  const summe = { schluessel: 'summe', bezeichnung: 'Ausgaben gesamt', soll: 502.5e9, ist: 495.5e9, abweichung: -7e9, abweichungRel: -0.014 };

  it('zeigt Plan gegen Ist mit Summenzeile', () => {
    const html = renderToStaticMarkup(<IbcsTabelle id="t" titel={TITEL} modus="plan_ist" zeilen={zeilen} summe={summe} />);
    expect(html).toContain('<thead');
    expect(html).toContain('>Soll<');
    expect(html).toContain('>Ist<');
    expect(html).toContain('ΔPL %');
    expect(html).toContain('<tfoot');
    expect(html).toContain('Ausgaben gesamt');
    expect(html).toContain('502,5');
    expect(html).toContain('−7,0');
    expect(html).toContain('−7,6 %');
    expect(html).toContain('hidden sm:table-cell');
  });

  it('zeigt im Soll-Modus Δ Soll Vorjahr und Anteil, ungefärbt', () => {
    const html = renderToStaticMarkup(
      <IbcsTabelle id="s" titel={{ ...TITEL, wann: '2026 Soll, Δ Soll Vorjahr, Anteil' }} modus="soll" zeilen={[
        { schluessel: '14', bezeichnung: '14 Verteidigung', soll: 82.7e9, deltaVj: 20.4e9, anteil: 0.157638, wirkung: 'anstieg_negativ' },
      ]} />,
    );
    expect(html).toContain('Δ Soll Vorjahr');
    expect(html).toContain('+20,4');
    expect(html).toContain('15,8 %');
    expect(html).not.toContain('ibcs-neg');
    expect(html).not.toContain('>Ist<');
  });

  it('verkraftet eine leere Auswahl', () => {
    expect(renderToStaticMarkup(<IbcsTabelle id="l" titel={TITEL} modus="plan_ist" zeilen={[]} />)).toContain('Keine Daten');
  });
});
