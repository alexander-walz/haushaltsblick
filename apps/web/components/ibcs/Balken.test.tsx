import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AbweichungsBalken, Nadel, SzenarioBalken } from './Balken';

const rects = (html: string) => [...html.matchAll(/<rect x="([\d.]+)"[^>]*width="([\d.]+)"[^>]*class="([^"]+)"/g)]
  .map((m) => ({ x: Number(m[1]), breite: Number(m[2]), klasse: m[3] }));

describe('Balken-Primitive', () => {
  it('zeichnet Soll als Kontur und Ist gefüllt', () => {
    const html = renderToStaticMarkup(<SzenarioBalken soll={80} ist={60} masstab={{ min: 0, max: 100 }} />);
    expect(rects(html)).toEqual([
      { x: 0, breite: 80, klasse: 'ibcs-soll' },
      { x: 0, breite: 60, klasse: 'ibcs-ist' },
    ]);
    expect(html).toContain('aria-hidden="true"');
  });

  it('zeichnet negative Werte links der Nulllinie', () => {
    const html = renderToStaticMarkup(<SzenarioBalken soll={-20} masstab={{ min: -50, max: 50 }} />);
    expect(rects(html)).toEqual([{ x: 30, breite: 20, klasse: 'ibcs-soll' }]);
    expect(html).toContain('x1="50"');
  });

  it('kennzeichnet den Entwurf', () => {
    expect(renderToStaticMarkup(<SzenarioBalken soll={10} masstab={{ min: 0, max: 10 }} sollSzenario="entwurf" />)).toContain('ibcs-entwurf');
  });

  it('färbt Abweichungen nach Vorgabe', () => {
    const html = renderToStaticMarkup(<AbweichungsBalken wert={-5} masstab={{ min: -10, max: 10 }} farbe="negativ" />);
    expect(rects(html)).toEqual([{ x: 25, breite: 25, klasse: 'ibcs-neg' }]);
  });

  it('lässt fehlende Werte leer', () => {
    const html = renderToStaticMarkup(<AbweichungsBalken wert={null} masstab={{ min: -10, max: 10 }} farbe="neutral" />);
    expect(rects(html)).toEqual([]);
  });

  it('kappt Nadeln und markiert sie', () => {
    const html = renderToStaticMarkup(<Nadel wert={2.5} masstab={{ min: -1, max: 1 }} farbe="neutral" />);
    expect(html).toContain('ibcs-gekappt');
  });
});
