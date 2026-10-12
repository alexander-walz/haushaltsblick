import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Fussnoten } from './Fussnoten';
import { Strukturbalken } from './Strukturbalken';
import { Titelblock } from './Titelblock';

const TITEL = { wer: 'Bund, Ausgaben nach Einzelplänen', was: 'Mrd. €', wann: '2026 Soll, Δ Soll Vorjahr' };

describe('Titelblock und Fußnoten', () => {
  it('zeigt WER, WAS und WANN', () => {
    const html = renderToStaticMarkup(<Titelblock {...TITEL} />);
    expect(html).toContain('Bund, Ausgaben nach Einzelplänen');
    expect(html).toContain('Mrd. € | 2026 Soll, Δ Soll Vorjahr');
  });

  it('zeigt Hinweise und den Hinweis auf nominale Beträge', () => {
    const html = renderToStaticMarkup(<Fussnoten hinweise={['Ist liegt nur für abgeschlossene Jahre vor.']} nominal />);
    expect(html).toContain('Ist liegt nur für abgeschlossene Jahre vor.');
    expect(html).toContain('Beträge nominal');
  });

  it('rendert ohne Hinweise nichts', () => {
    expect(renderToStaticMarkup(<Fussnoten hinweise={[]} />)).toBe('');
  });
});

describe('Strukturbalken', () => {
  const zeilen = [
    { schluessel: '11', bezeichnung: '11 Arbeit und Soziales', href: '/explorer?einzelplan=11', soll: 197_341_040_000, delta: 7_000_000_000 },
    { schluessel: '60', bezeichnung: '60 Allgemeine Finanzverwaltung', soll: -2_800_000_000, delta: -500_000_000 },
  ];

  it('ist eine Tabelle mit Titel, Werten und Vorzeichen', () => {
    const html = renderToStaticMarkup(<Strukturbalken id="ep" titel={TITEL} zeilen={zeilen} deltaBeschriftung="Δ Soll Vorjahr" />);
    expect(html).toContain('<figure');
    expect(html).toContain('<figcaption');
    expect(html).toContain('<table');
    expect(html).toContain('<th scope="row"');
    expect(html).toContain('href="/explorer?einzelplan=11"');
    expect(html).toContain('197,3');
    expect(html).toContain('−2,8');
    expect(html).toContain('+7,0');
    expect(html).toContain('−0,5');
  });

  it('zeigt Ist nur, wenn vorhanden', () => {
    expect(renderToStaticMarkup(<Strukturbalken id="a" titel={TITEL} zeilen={zeilen} />)).not.toContain('>Ist<');
    const mitIst = [{ schluessel: '14', bezeichnung: '14', soll: 62.3e9, ist: 59.5e9 }];
    expect(renderToStaticMarkup(<Strukturbalken id="b" titel={TITEL} zeilen={mitIst} />)).toContain('>Ist<');
  });

  it('verweist auf weitere Zeilen', () => {
    const html = renderToStaticMarkup(<Strukturbalken id="c" titel={TITEL} zeilen={zeilen} weitere={{ anzahl: 19, href: '/explorer' }} />);
    expect(html).toContain('19 weitere');
  });

  it('verkraftet eine leere Liste', () => {
    expect(renderToStaticMarkup(<Strukturbalken id="d" titel={TITEL} zeilen={[]} />)).toContain('Keine Daten');
  });
});
