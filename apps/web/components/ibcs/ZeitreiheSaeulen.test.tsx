import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ZeitreiheSaeulen } from './ZeitreiheSaeulen';

const TITEL = { wer: 'Titel 0416 684 21 Zuschüsse für den Sport', was: 'Mio. €', wann: '2014 bis 2027 Soll, Ist, ΔPL' };

describe('ZeitreiheSaeulen', () => {
  const punkte = [
    { jahr: 2024, soll: 300e6, ist: 290e6, sollSzenario: 'soll' as const, abweichung: -10e6 },
    { jahr: 2025, soll: 310e6, ist: 300e6, sollSzenario: 'soll' as const, abweichung: -10e6, markierung: 'ab 2025: Kapitel 0416' },
    { jahr: 2027, soll: 330e6, ist: null, sollSzenario: 'entwurf' as const },
  ];

  it('zeichnet Soll als Kontur, Ist gefüllt und kennzeichnet den Entwurf', () => {
    const html = renderToStaticMarkup(<ZeitreiheSaeulen id="z" titel={TITEL} punkte={punkte} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-labelledby="z-titel"');
    expect(html.match(/class="ibcs-ist"/g)).toHaveLength(2);
    expect(html).toContain('ibcs-entwurf');
    expect(html).toContain('2027 E');
    expect(html).toContain('ab 2025: Kapitel 0416');
  });

  it('bietet eine Tabellenalternative', () => {
    const html = renderToStaticMarkup(<ZeitreiheSaeulen id="z" titel={TITEL} punkte={punkte} />);
    expect(html).toContain('<table class="sr-only"');
    expect(html).toContain('<td>310,0</td>');
    expect(html).toContain('<td>n. v.</td>');
  });

  it('zeichnet negative Werte unterhalb der Nulllinie', () => {
    const html = renderToStaticMarkup(
      <ZeitreiheSaeulen id="n" titel={TITEL} punkte={[
        { jahr: 2025, soll: -50e6, ist: -40e6, sollSzenario: 'soll' },
        { jahr: 2026, soll: 100e6, ist: null, sollSzenario: 'soll' },
      ]} />,
    );
    expect(html).toContain('−50,0');
  });

  it('hält die Wertbeschriftung negativer Säulen von der Jahresbeschriftung fern', () => {
    const html = renderToStaticMarkup(
      <ZeitreiheSaeulen id="n" titel={TITEL} punkte={[
        { jahr: 2025, soll: -40e6, ist: -50e6, sollSzenario: 'soll' },
        { jahr: 2026, soll: 100e6, ist: null, sollSzenario: 'soll' },
      ]} />,
    );
    const yVon = (text: string) => Number(new RegExp(`<text[^>]*\\sy="([\\d.]+)"[^>]*>${text}</text>`).exec(html)?.[1]);
    expect(yVon('2025') - yVon('−50,0')).toBeGreaterThanOrEqual(10);
  });

  it('ergänzt die Tabelle um Haushaltsplan (XML) nur bei vorhandenen Werten', () => {
    expect(renderToStaticMarkup(<ZeitreiheSaeulen id="t" titel={TITEL} punkte={punkte} />)).not.toContain('Haushaltsplan (XML)');
    const mitPlan = punkte.map((p) => ({ ...p, haushaltsplan: 280e6 }));
    const html = renderToStaticMarkup(<ZeitreiheSaeulen id="t" titel={TITEL} punkte={mitPlan} />);
    expect(html).toContain('Haushaltsplan (XML)');
    expect(html).toContain('<td>280,0</td>');
  });

  it('nennt die Markierung in der Jahreszelle der Tabelle', () => {
    const html = renderToStaticMarkup(<ZeitreiheSaeulen id="t" titel={TITEL} punkte={punkte} />);
    expect(html).toContain('<th scope="row">2025 (ab 2025: Kapitel 0416)</th>');
  });

  it('richtet Markierungen in der rechten Hälfte rechtsbündig aus', () => {
    const html = renderToStaticMarkup(
      <ZeitreiheSaeulen id="m" titel={TITEL} punkte={[
        { jahr: 2024, soll: 1e6, ist: null, sollSzenario: 'soll' },
        { jahr: 2025, soll: 1e6, ist: null, sollSzenario: 'soll' },
        { jahr: 2026, soll: 1e6, ist: null, sollSzenario: 'soll', markierung: 'Wechsel' },
      ]} />,
    );
    expect(html).toMatch(/text-anchor="end"[^>]*>Wechsel</);
  });

  it('zeigt die Haushaltsplan-Linie nur, wenn übergeben', () => {
    expect(renderToStaticMarkup(<ZeitreiheSaeulen id="h" titel={TITEL} punkte={punkte} />)).not.toContain('ibcs-haushaltsplan');
    const mitPlan = punkte.map((p) => ({ ...p, haushaltsplan: 280e6 }));
    expect(renderToStaticMarkup(<ZeitreiheSaeulen id="h" titel={TITEL} punkte={mitPlan} />)).toContain('ibcs-haushaltsplan');
  });
});
