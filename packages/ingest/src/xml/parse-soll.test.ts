import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leseXmlDatei } from './parse-soll';
import { FIXTURE_2026, nurKapitel, nurTitel, sammle, titelAus } from './test-hilfen';
import { XmlVertragsFehler } from './typen';

const fixtureText = () => readFileSync(FIXTURE_2026, 'utf8');

describe('parseSollXml mit dem Auszug 2026', () => {
  it('liest alle Titel und Kapitel', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(nurTitel(zeilen)).toHaveLength(8);
    expect(nurKapitel(zeilen).map((k) => k.kapitelNr).sort()).toEqual(['0101', '0411', '0415', '0618', '6002', '6092']);
  });

  it('liefert vollständige Stammdaten je Titel', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '0101', '68101')).toEqual({
      art: 'titel',
      jahr: 2026,
      einzelplanNr: '01',
      einzelplanText: 'Bundespräsident und Bundespräsidialamt',
      kapitelNr: '0101',
      kapitelText: 'Bundespräsident',
      anlageZuKapitelNr: null,
      konto: 'ausgaben',
      kontoBlock: 1,
      ausgabeartText: 'Zuweisungen und Zuschüsse (ohne Investitionen)',
      titelgruppeNr: null,
      titelgruppeText: null,
      titelNr: '68101',
      titelText: 'Übernahme von Patenschaften, Ausgaben aus besonderer Veranlassung und besondere Bewilligungen.',
      flexibilisiert: false,
      fkt: '011',
      seite: 6,
      sollTsdEur: 1348,
      xmlPfad: '/haushalt[2026]/einzelplan[01]/kapitel[0101]/ausgaben[1]/einnahmen-ausgaben-art[1]/titel[68101]',
      zeilenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('trennt mehrere <ausgaben>-Blöcke je Kapitel', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    const flex = titelAus(zeilen, '0101', '42101');
    expect(flex).toMatchObject({ kontoBlock: 2, ausgabeartText: null, flexibilisiert: true, sollTsdEur: 277 });
    expect(flex.xmlPfad).toBe('/haushalt[2026]/einzelplan[01]/kapitel[0101]/ausgaben[2]/titel[42101]');
  });

  it('liest Titelgruppen direkt unter <einnahmen>', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '0411', '11957')).toMatchObject({
      konto: 'einnahmen',
      titelgruppeNr: '57',
      titelgruppeText: 'Versorgung der Beamtinnen und Beamten sowie der Richterinnen und Richter',
      ausgabeartText: null,
    });
  });

  it('übernimmt negative Soll-Werte', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '0411', '97201').sollTsdEur).toBe(-168);
  });

  it('meldet entfallene Kapitel, auch mit leerem <ausgaben/>', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    const entfallen = nurKapitel(zeilen).filter((k) => k.entfallen).map((k) => [k.kapitelNr, k.anzahlTitel]);
    expect(entfallen).toEqual([['0415', 0], ['0618', 0]]);
  });

  it('kennzeichnet Titel und Kapitel in Anlagen', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '6092', '13203')).toMatchObject({
      einzelplanNr: '60',
      anlageZuKapitelNr: '6002',
      xmlPfad: '/haushalt[2026]/einzelplan[60]/kapitel[6002]/anlage[1]/kapitel[6092]/einnahmen[1]/einnahmen-ausgaben-art[1]/titel[13203]',
    });
    expect(titelAus(zeilen, '6002', '09201').anlageZuKapitelNr).toBeNull();
    const kapitel = nurKapitel(zeilen);
    expect(kapitel.find((k) => k.kapitelNr === '6092')).toMatchObject({ anlageZuKapitelNr: '6002', anzahlTitel: 2, entfallen: false });
    expect(kapitel.find((k) => k.kapitelNr === '6002')).toMatchObject({ anlageZuKapitelNr: null, anzahlTitel: 1 });
  });

  it('bewahrt Umlaute, Paragrafenzeichen und geschützte Leerzeichen', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '0101', '38103').titelText).toBe('Verrechnungseinnahmen gemäß § 61 BHO');
  });

  it('liefert gleiche Hashes für gleichen Inhalt und einen anderen bei geänderter Zahl', async () => {
    const original = await sammle([fixtureText()]);
    const geaendert = await sammle([fixtureText().replace('wert="1348"', 'wert="1349"')]);
    for (const t of nurTitel(original)) {
      const gegenstueck = titelAus(geaendert, t.kapitelNr, t.titelNr);
      if (t.titelNr === '68101') expect(gegenstueck.zeilenHash).not.toBe(t.zeilenHash);
      else expect(gegenstueck.zeilenHash).toBe(t.zeilenHash);
    }
  });

  it('liefert dasselbe Ergebnis bei beliebig zerteilter Eingabe', async () => {
    const text = fixtureText();
    const stuecke = text.match(/[\s\S]{1,7}/g) ?? [];
    expect(await sammle(stuecke)).toEqual(await sammle([text]));
  });
});

describe('Datenvertrag', () => {
  const huelle = (inhalt: string, kapitelNr = '0101') =>
    `<?xml version="1.0" encoding="UTF-8"?><haushalt jahr="2026"><einzelplan nr="01"><text>EP</text>` +
    `<kapitel nr="${kapitelNr}"><text>K</text>${inhalt}</kapitel></einzelplan></haushalt>`;
  const titelXml = (attrs: string, soll = '<soll wert="1"/>') =>
    `<ausgaben><titel ${attrs}><text>T</text>${soll}</titel></ausgaben>`;

  it.each([
    ['unbekanntes Element', huelle('<verpflichtung/>'), /Unbekanntes Element <verpflichtung>/],
    ['Titelnummer vierstellig', huelle(titelXml('nr="6810" flexibilisiert="nein" fkt="011"')), /Titelnummer ungültig/],
    ['Funktionskennziffer fehlt', huelle(titelXml('nr="68101" flexibilisiert="nein"')), /Funktionskennziffer ungültig/],
    ['flexibilisiert unbekannt', huelle(titelXml('nr="68101" flexibilisiert="vielleicht" fkt="011"')), /flexibilisiert ungültig/],
    ['Soll nicht ganzzahlig', huelle(titelXml('nr="68101" flexibilisiert="nein" fkt="011"', '<soll wert="1.5"/>')), /Soll-Wert ungültig/],
    ['Titel ohne Soll', huelle(titelXml('nr="68101" flexibilisiert="nein" fkt="011"', '')), /Titel 68101 ohne <soll>/],
    ['Kapitel passt nicht zum Einzelplan', huelle('', '0201'), /Kapitelnummer ungültig: 0201 passt nicht zu Einzelplan 01/],
    ['Titel außerhalb von Einnahmen und Ausgaben', huelle('<titel nr="68101" flexibilisiert="nein" fkt="011"><text>T</text><soll wert="1"/></titel>'), /außerhalb von <einnahmen>/],
    ['Freitext zwischen Elementen', huelle('Hallo'), /Unerwarteter Text: Hallo/],
  ])('meldet %s als Vertragsfehler', async (_name, xml, meldung) => {
    const fehler = await sammle([xml]).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(XmlVertragsFehler);
    expect((fehler as Error).message).toMatch(meldung);
  });

  const titelMitText = (texte: string) =>
    huelle(`<ausgaben><titel nr="68101" flexibilisiert="nein" fkt="011">${texte}<soll wert="1"/></titel></ausgaben>`);

  it('verkettet mehrere <text>-Segmente eines Titels ohne Trennzeichen', async () => {
    const zeilen = await sammle([titelMitText('<text>Zuschüsse für CO</text><text>2</text><text>-arme Fahrzeuge</text>')]);
    expect(titelAus(zeilen, '0101', '68101').titelText).toBe('Zuschüsse für CO2-arme Fahrzeuge');
  });

  it('behält Leerzeichen an Segmentgrenzen und trimmt nur den Gesamttext', async () => {
    const zeilen = await sammle([titelMitText('<text> A </text><text>B </text>')]);
    expect(titelAus(zeilen, '0101', '68101').titelText).toBe('A B');
  });

  it('nennt den Pfad der Fundstelle', async () => {
    const fehler = (await sammle([huelle('<verpflichtung/>')]).catch((e: unknown) => e)) as XmlVertragsFehler;
    expect(fehler.pfad).toBe('/haushalt[2026]/einzelplan[01]/kapitel[0101]');
  });

  it('bricht bei abgeschnittener Datei mit XmlVertragsFehler ab', async () => {
    await expect(sammle(['<haushalt jahr="2026"><einzelplan nr="01">'])).rejects.toBeInstanceOf(XmlVertragsFehler);
  });

  it.each([
    ['zweites <soll> je Titel', huelle(titelXml('nr="68101" flexibilisiert="nein" fkt="011"', '<soll wert="1"/><soll wert="2"/>')), /Titel 68101 hat mehr als ein <soll>/],
    ['zweites <text> je Element', huelle('<text>Zwei</text>'), /Mehr als ein <text> in <kapitel>/],
    ['unbekanntes Attribut am Titel', huelle(titelXml('nr="68101" flexibilisiert="nein" fkt="011" extra="x"')), /Unbekanntes Attribut extra an <titel>/],
    ['Titelgruppe direkt unter Kapitel', huelle('<titelgruppe nr="57"/>'), /<titelgruppe> nicht erlaubt in <kapitel>/],
    ['Einnahmen direkt unter Einzelplan', '<haushalt jahr="2026"><einzelplan nr="01"><einnahmen/></einzelplan></haushalt>', /<einnahmen> nicht erlaubt in <einzelplan>/],
    ['fehlerhaftes XML', '<haushalt jahr="2026"><einzelplan nr="01"></haushalt>', /XML-Syntaxfehler/],
    ['riesiger Soll-Wert', huelle(titelXml('nr="68101" flexibilisiert="nein" fkt="011"', '<soll wert="99999999999999999999"/>')), /Soll-Wert ungültig: 99999999999999999999/],
    ['ungültige Seite', huelle(titelXml('nr="68101" flexibilisiert="nein" fkt="011" seite="12a"')), /Seite ungültig: 12a/],
    ['Dokument ohne <haushalt>', '<kapitel nr="0101"/>', /<kapitel> nicht erlaubt als Wurzel/],
  ])('meldet %s als Vertragsfehler', async (_name, xml, meldung) => {
    const fehler = await sammle([xml]).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(XmlVertragsFehler);
    expect((fehler as Error).message).toMatch(meldung);
  });
});

describe('Ältere Jahrgänge', () => {
  const huelle = (inhalt: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><haushalt jahr="2016"><einzelplan nr="01"><text>EP</text>` +
    `<kapitel nr="0101"><text>K</text>${inhalt}</kapitel></einzelplan></haushalt>`;
  const titel = (attrs: string) => `<titel ${attrs}><text>T</text><soll wert="1"/></titel>`;

  it('setzt flexibilisiert auf null bei Einnahmetiteln ohne Attribut', async () => {
    const zeilen = await sammle([huelle(`<einnahmen>${titel('nr="11101" fkt="011"')}</einnahmen>`)]);
    expect(zeilen.find((z) => z.art === 'titel')).toMatchObject({ konto: 'einnahmen', flexibilisiert: null });
  });

  it('meldet fehlendes flexibilisiert an Ausgabetiteln als Vertragsfehler', async () => {
    const fehler = await sammle([huelle(`<ausgaben>${titel('nr="68101" fkt="011"')}</ausgaben>`)]).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(XmlVertragsFehler);
    expect((fehler as Error).message).toMatch(/flexibilisiert fehlt an Ausgabetitel 68101/);
  });

  it('liest seite="-" als null', async () => {
    const zeilen = await sammle([huelle(`<ausgaben>${titel('nr="52501" flexibilisiert="ja" fkt="162" seite="-"')}</ausgaben>`)]);
    expect(zeilen.find((z) => z.art === 'titel')).toMatchObject({ seite: null, flexibilisiert: true });
  });

  it('meldet nicht-numerische Seite weiterhin als Vertragsfehler', async () => {
    const fehler = await sammle([huelle(`<ausgaben>${titel('nr="52501" flexibilisiert="ja" fkt="162" seite="x"')}</ausgaben>`)]).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(XmlVertragsFehler);
    expect((fehler as Error).message).toMatch(/Seite ungültig/);
  });
});
