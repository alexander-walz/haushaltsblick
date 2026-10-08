import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { SaxesParser } from 'saxes';
import type { Konto } from '@hb/shared';
import { XmlVertragsFehler, type SollKapitel, type SollTitel, type SollZeile } from './typen';

const ELEMENTE = new Set([
  'haushalt', 'einzelplan', 'kapitel', 'anlage', 'text', 'einnahmen', 'ausgaben',
  'einnahmen-ausgaben-art', 'titelgruppe', 'titel', 'soll',
]);

const ERLAUBTE_ATTRIBUTE: Record<string, readonly string[]> = {
  haushalt: ['jahr', 'xmlns:xsi'],
  einzelplan: ['nr'],
  kapitel: ['nr'],
  titelgruppe: ['nr'],
  titel: ['nr', 'flexibilisiert', 'fkt', 'seite'],
  soll: ['wert'],
};

/** Erlaubte Eltern je Element laut Datenvertrag (schema.pfad). */
const ERLAUBTE_ELTERN: Record<string, readonly string[]> = {
  haushalt: [],
  einzelplan: ['haushalt'],
  kapitel: ['einzelplan', 'anlage'],
  anlage: ['kapitel'],
  text: ['einzelplan', 'kapitel', 'einnahmen-ausgaben-art', 'titelgruppe', 'titel'],
  einnahmen: ['kapitel'],
  ausgaben: ['kapitel'],
  'einnahmen-ausgaben-art': ['einnahmen', 'ausgaben'],
  titelgruppe: ['einnahmen', 'ausgaben'],
  titel: ['einnahmen', 'ausgaben', 'einnahmen-ausgaben-art', 'titelgruppe'],
  soll: ['titel'],
};

type Rahmen = {
  name: string;
  attrs: Record<string, string>;
  /** Position unter gleichnamigen Geschwistern, ab 1. */
  pos: number;
  /** Pfadsegment, z. B. kapitel[0411] oder ausgaben[2]. */
  segment: string;
  kinder: Map<string, number>;
  /** Inhalt des direkten <text>-Kinds. */
  text?: string;
  /** Nur bei <titel>: unbeschnittene, verkettete <text>-Segmente. */
  textRoh?: string;
  /** Nur bei <titel>: Rohwert aus <soll wert>. */
  soll?: string;
  /** Nur bei <kapitel>: Anzahl direkt zugeordneter Titel. */
  anzahlTitel: number;
};

export function leseXmlDatei(pfad: string): AsyncIterable<string> {
  return createReadStream(pfad, { encoding: 'utf8' });
}

/**
 * Streaming-Parser für die Haushaltsplan-XML. Liefert Titel und Kapitel in Dokumentreihenfolge
 * (Kapitel beim schließenden Tag) und wirft XmlVertragsFehler bei jeder Abweichung vom Datenvertrag.
 */
export async function* parseSollXml(quelle: Iterable<string> | AsyncIterable<string>): AsyncGenerator<SollZeile> {
  const parser = new SaxesParser();
  const stack: Rahmen[] = [];
  const fertig: SollZeile[] = [];
  let jahr = 0;
  let textPuffer = '';

  const pfad = () => '/' + stack.map((r) => r.segment).join('/');
  const verletze = (meldung: string): never => {
    throw new XmlVertragsFehler(meldung, pfad());
  };
  const pruefe = (wert: string | undefined, muster: RegExp, feld: string): string =>
    wert !== undefined && muster.test(wert) ? wert : verletze(`${feld} ungültig: ${String(wert)}`);
  const finde = (name: string) => stack.findLast((r) => r.name === name);
  const anlageZuKapitelNr = (): string | null => {
    const i = stack.findLastIndex((r) => r.name === 'anlage');
    return i < 0 ? null : (stack.slice(0, i).findLast((r) => r.name === 'kapitel')?.attrs.nr ?? null);
  };

  function baueTitel(r: Rahmen): SollTitel {
    const ep = finde('einzelplan') ?? verletze('<titel> außerhalb von <einzelplan>');
    const kap = finde('kapitel') ?? verletze('<titel> außerhalb von <kapitel>');
    const kontoRahmen =
      stack.findLast((s) => s.name === 'einnahmen' || s.name === 'ausgaben') ??
      verletze('<titel> außerhalb von <einnahmen>/<ausgaben>');
    const soll = r.soll ?? verletze(`Titel ${r.attrs.nr} ohne <soll>`);
    kap.anzahlTitel += 1;
    const tg = finde('titelgruppe');
    const ohneHash: Omit<SollTitel, 'zeilenHash'> = {
      art: 'titel',
      jahr,
      einzelplanNr: ep.attrs.nr!,
      einzelplanText: ep.text ?? '',
      kapitelNr: kap.attrs.nr!,
      kapitelText: kap.text ?? '',
      anlageZuKapitelNr: anlageZuKapitelNr(),
      konto: kontoRahmen.name as Konto,
      kontoBlock: kontoRahmen.pos,
      ausgabeartText: finde('einnahmen-ausgaben-art')?.text ?? null,
      titelgruppeNr: tg?.attrs.nr ?? null,
      titelgruppeText: tg?.text ?? null,
      titelNr: r.attrs.nr!,
      titelText: r.text ?? '',
      flexibilisiert: r.attrs.flexibilisiert === undefined ? null : r.attrs.flexibilisiert === 'ja',
      fkt: r.attrs.fkt!,
      seite: r.attrs.seite === undefined || r.attrs.seite === '-' ? null : Number(r.attrs.seite),
      sollTsdEur: Number(soll),
      xmlPfad: `${pfad()}/${r.segment}`,
    };
    const zeilenHash = createHash('sha256').update(JSON.stringify(ohneHash)).digest('hex');
    return { ...ohneHash, zeilenHash };
  }

  function baueKapitel(r: Rahmen): SollKapitel {
    const ep = finde('einzelplan') ?? verletze('<kapitel> außerhalb von <einzelplan>');
    return {
      art: 'kapitel',
      jahr,
      einzelplanNr: ep.attrs.nr!,
      einzelplanText: ep.text ?? '',
      kapitelNr: r.attrs.nr!,
      kapitelText: r.text ?? '',
      anlageZuKapitelNr: anlageZuKapitelNr(),
      anzahlTitel: r.anzahlTitel,
      entfallen: r.anzahlTitel === 0,
      xmlPfad: `${pfad()}/${r.segment}`,
    };
  }

  parser.on('error', (e) => {
    throw new XmlVertragsFehler(`XML-Syntaxfehler: ${e.message}`, pfad());
  });

  parser.on('opentag', (tag) => {
    if (!ELEMENTE.has(tag.name)) verletze(`Unbekanntes Element <${tag.name}>`);
    const attrs = tag.attributes as Record<string, string>;
    const eltern = stack.at(-1);
    const erlaubt = ERLAUBTE_ATTRIBUTE[tag.name] ?? [];
    for (const a of Object.keys(attrs)) {
      if (!erlaubt.includes(a)) verletze(`Unbekanntes Attribut ${a} an <${tag.name}>`);
    }
    if (!eltern && tag.name !== 'haushalt') verletze(`<${tag.name}> nicht erlaubt als Wurzel`);
    const pos = (eltern?.kinder.get(tag.name) ?? 0) + 1;
    eltern?.kinder.set(tag.name, pos);

    switch (tag.name) {
      case 'haushalt':
        jahr = Number(pruefe(attrs.jahr, /^\d{4}$/, 'Haushaltsjahr'));
        break;
      case 'einzelplan':
        pruefe(attrs.nr, /^\d{2}$/, 'Einzelplannummer');
        break;
      case 'kapitel': {
        const nr = pruefe(attrs.nr, /^\d{4}$/, 'Kapitelnummer');
        const ep = finde('einzelplan')?.attrs.nr ?? verletze('<kapitel> außerhalb von <einzelplan>');
        if (!nr.startsWith(ep)) verletze(`Kapitelnummer ungültig: ${nr} passt nicht zu Einzelplan ${ep}`);
        break;
      }
      case 'titel':
        pruefe(attrs.nr, /^\d{5}$/, 'Titelnummer');
        pruefe(attrs.fkt, /^\d{3}$/, 'Funktionskennziffer');
        if (attrs.flexibilisiert !== undefined) pruefe(attrs.flexibilisiert, /^(ja|nein)$/, 'flexibilisiert');
        else if (finde('ausgaben')) verletze(`flexibilisiert fehlt an Ausgabetitel ${attrs.nr}`);
        if (attrs.seite !== undefined) pruefe(attrs.seite, /^(\d+|-)$/, 'Seite');
        if (!finde('einnahmen') && !finde('ausgaben')) verletze('<titel> außerhalb von <einnahmen>/<ausgaben>');
        break;
      case 'soll':
        if (eltern?.name !== 'titel') return verletze('<soll> außerhalb von <titel>');
        if (eltern.soll !== undefined) verletze(`Titel ${eltern.attrs.nr} hat mehr als ein <soll>`);
        eltern.soll = pruefe(attrs.wert, /^-?\d+$/, 'Soll-Wert');
        if (!Number.isSafeInteger(Number(eltern.soll))) verletze(`Soll-Wert ungültig: ${eltern.soll}`);
        break;
      case 'text':
        textPuffer = '';
        break;
    }

    if (eltern && !ERLAUBTE_ELTERN[tag.name]!.includes(eltern.name)) {
      verletze(`<${tag.name}> nicht erlaubt in <${eltern.name}>`);
    }

    const kennung = tag.name === 'haushalt' ? attrs.jahr : (attrs.nr ?? String(pos));
    stack.push({ name: tag.name, attrs, pos, segment: `${tag.name}[${kennung}]`, kinder: new Map(), anzahlTitel: 0 });
  });

  parser.on('text', (t) => {
    if (stack.at(-1)?.name === 'text') textPuffer += t;
    else if (t.trim() !== '') verletze(`Unerwarteter Text: ${t.trim().slice(0, 40)}`);
  });

  parser.on('closetag', (tag) => {
    const r = stack.pop()!;
    if (tag.name === 'text') {
      const eltern = stack.at(-1);
      if (eltern) {
        if (eltern.name === 'titel') {
          // Tiefgestellte Zeichen (CO2) zerlegen den Titeltext in mehrere Segmente.
          eltern.textRoh = (eltern.textRoh ?? '') + textPuffer;
          eltern.text = eltern.textRoh.trim();
        } else {
          if (eltern.text !== undefined) verletze(`Mehr als ein <text> in <${eltern.name}>`);
          eltern.text = textPuffer.trim();
        }
      }
    } else if (tag.name === 'titel') {
      fertig.push(baueTitel(r));
    } else if (tag.name === 'kapitel') {
      fertig.push(baueKapitel(r));
    }
  });

  for await (const stueck of quelle) {
    parser.write(stueck);
    yield* fertig.splice(0);
  }
  parser.close();
  if (jahr === 0) throw new XmlVertragsFehler('Kein <haushalt>-Element gefunden', '/');
  yield* fertig.splice(0);
}
