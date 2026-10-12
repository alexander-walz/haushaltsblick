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

  it('zeigt die Haushaltsplan-Linie nur, wenn übergeben', () => {
    expect(renderToStaticMarkup(<ZeitreiheSaeulen id="h" titel={TITEL} punkte={punkte} />)).not.toContain('ibcs-haushaltsplan');
    const mitPlan = punkte.map((p) => ({ ...p, haushaltsplan: 280e6 }));
    expect(renderToStaticMarkup(<ZeitreiheSaeulen id="h" titel={TITEL} punkte={mitPlan} />)).toContain('ibcs-haushaltsplan');
  });
});
