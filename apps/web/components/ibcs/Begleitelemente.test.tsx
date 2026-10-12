import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Abweichungsbalken } from './Abweichungsbalken';
import { FarbregelHinweis } from './FarbregelHinweis';
import { IbcsTabelle } from './IbcsTabelle';
import { Nadeln } from './Nadeln';
import { Skalierungsmarker } from './Skalierungsmarker';
import { Strukturbalken } from './Strukturbalken';
import { ZeitreiheSaeulen } from './ZeitreiheSaeulen';

const TITEL = { wer: 'Bund, Einnahmen nach Obergruppen', was: 'Mrd. €', wann: '2025 Soll, Ist, ΔPL' };
const REGEL = 'href="/methodik#farben"';

describe('Skalierungsmarker', () => {
  it('ist sichtbar beschriftet und erklärt sich für Screenreader und Maus', () => {
    const html = renderToStaticMarkup(<Skalierungsmarker />);
    expect(html).toContain('Eigener Maßstab');
    expect(html).toContain('title="');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('nicht mit anderen Diagrammen');
  });

  it('erscheint im Titelblock nur bei eigenem Maßstab', () => {
    const zeilen = [{ schluessel: '14', bezeichnung: '14 Verteidigung', soll: 82.7e9 }];
    expect(renderToStaticMarkup(<Strukturbalken id="s" titel={TITEL} zeilen={zeilen} eigenerMasstab />)).toContain('Eigener Maßstab');
    expect(renderToStaticMarkup(<Strukturbalken id="s" titel={TITEL} zeilen={zeilen} />)).not.toContain('Eigener Maßstab');
    expect(renderToStaticMarkup(<Abweichungsbalken id="a" titel={TITEL} vergleich="plan" zeilen={[]} eigenerMasstab />)).toContain('Eigener Maßstab');
    expect(renderToStaticMarkup(<ZeitreiheSaeulen id="z" titel={TITEL} punkte={[]} eigenerMasstab />)).toContain('Eigener Maßstab');
    expect(renderToStaticMarkup(<IbcsTabelle id="t" titel={TITEL} modus="soll" zeilen={[]} eigenerMasstab />)).toContain('Eigener Maßstab');
  });
});

describe('FarbregelHinweis (E21: jede gefärbte Abweichung verweist auf ihre Regel)', () => {
  it('verlinkt die Regel auf der Methodikseite', () => {
    const html = renderToStaticMarkup(<ul><FarbregelHinweis /></ul>);
    expect(html).toContain(REGEL);
    expect(html).toContain('Grün und Rot');
  });

  it('steht unter Abweichungsbalken und Nadeln nur, wenn eine Wirkungsfarbe vorkommt', () => {
    const farbig = [{ schluessel: '32', bezeichnung: 'Kredite', wert: 2e9, wirkung: 'anstieg_negativ' as const }];
    const grau = [{ schluessel: '14', bezeichnung: 'Verteidigung', wert: -2e9, wirkung: 'neutral' as const }];
    expect(renderToStaticMarkup(<Abweichungsbalken id="a" titel={TITEL} vergleich="plan" zeilen={farbig} />)).toContain(REGEL);
    expect(renderToStaticMarkup(<Abweichungsbalken id="a" titel={TITEL} vergleich="plan" zeilen={grau} />)).not.toContain(REGEL);
    expect(renderToStaticMarkup(<Abweichungsbalken id="a" titel={TITEL} vergleich="vorjahr" zeilen={farbig} />)).not.toContain(REGEL);
    expect(renderToStaticMarkup(<Nadeln id="n" titel={TITEL} vergleich="plan" zeilen={[{ ...farbig[0]!, wert: 0.1 }]} />)).toContain(REGEL);
    expect(renderToStaticMarkup(<Nadeln id="n" titel={TITEL} vergleich="plan" zeilen={grau} />)).not.toContain(REGEL);
  });

  it('steht unter der Tabelle nur im Plan-Ist-Modus mit Wirkungsfarbe', () => {
    const zeile = { schluessel: '01', bezeichnung: '01 Steuern', soll: 300e9, ist: 310e9, abweichung: 10e9, abweichungRel: 0.03, wirkung: 'anstieg_positiv' as const };
    expect(renderToStaticMarkup(<IbcsTabelle id="t" titel={TITEL} modus="plan_ist" zeilen={[zeile]} />)).toContain(REGEL);
    expect(renderToStaticMarkup(<IbcsTabelle id="t" titel={TITEL} modus="plan_ist" zeilen={[{ ...zeile, wirkung: 'neutral' }]} />)).not.toContain(REGEL);
    expect(renderToStaticMarkup(<IbcsTabelle id="t" titel={TITEL} modus="soll" zeilen={[{ ...zeile, deltaVj: 5e9 }]} />)).not.toContain(REGEL);
  });

  it('steht unter der Zeitreihe nur, wenn ΔPL gefärbt ist', () => {
    const punkte = [{ jahr: 2024, soll: 3e9, ist: 3.2e9, sollSzenario: 'soll' as const, abweichung: 0.2e9 }];
    expect(renderToStaticMarkup(<ZeitreiheSaeulen id="z" titel={TITEL} punkte={punkte} wirkung="anstieg_negativ" />)).toContain(REGEL);
    expect(renderToStaticMarkup(<ZeitreiheSaeulen id="z" titel={TITEL} punkte={punkte} />)).not.toContain(REGEL);
  });
});

describe('IbcsTabelle: Beschriftung und Vorzeichen', () => {
  it('beschriftet die Soll-Spalte im Entwurfsjahr als Entwurf', () => {
    const html = renderToStaticMarkup(<IbcsTabelle id="t" titel={TITEL} modus="soll" sollBeschriftung="Entwurf" zeilen={[{ schluessel: '14', bezeichnung: '14', soll: 1e9, deltaVj: 1e8 }]} />);
    expect(html).toContain('>Entwurf<');
    expect(html).toContain('Entwurf (Balken)');
    expect(html).toContain('Δ Soll Vorjahr');
    expect(html).not.toContain('>Soll<');
  });

  it('zeigt eine auf null gerundete, gefärbte Abweichung mit Vorzeichen', () => {
    const html = renderToStaticMarkup(<IbcsTabelle id="t" titel={TITEL} modus="plan_ist" zeilen={[
      { schluessel: '01', bezeichnung: '01', soll: 300e9, ist: 300e9, abweichung: 0, wirkung: 'anstieg_positiv' },
      { schluessel: '09', bezeichnung: '09', soll: 0.2e9, ist: 0.24e9, abweichung: 0.04e9, wirkung: 'anstieg_positiv' },
    ]} />);
    expect(html).toContain('ibcs-pos');
    expect(html).toContain('>+0,0<');
  });
});
