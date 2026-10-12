import type { Metadata } from 'next';
import { Abweichungsbalken } from '@/components/ibcs/Abweichungsbalken';
import { Nadeln } from '@/components/ibcs/Nadeln';
import { Hinweisbox } from '@/components/ui/Hinweisbox';
import { JahrAuswahl } from '@/components/ui/JahrAuswahl';
import { Umschalter } from '@/components/ui/Umschalter';
import { kernaussagePlanIst } from '@/lib/aussagen';
import { frage, ladeDatenstand } from '@/lib/daten/abfragen';
import { standardjahre } from '@/lib/daten/jahre';
import { bezeichnung, TEXTSPALTE, trefferZiel } from '@/lib/explorer';
import { wirkungAus } from '@/lib/ibcs/farbe';
import { betragMitEinheit, einheitFuer } from '@/lib/ibcs/format';
import { wann } from '@/lib/ibcs/titel';
import { EBENE_DIM, groessteAbweichungen, lesePlanIstParameter, type PlanIstEbene } from '@/lib/plan-ist';
import type { SuchParameter } from '@/lib/seite';
import { text, zahl } from '@/lib/werte';
import { heute } from '@/lib/zeit';

export const metadata: Metadata = { title: 'Plan und Wirklichkeit' };

const EBENEN: readonly { wert: PlanIstEbene; text: string; mehrzahl: string }[] = [
  { wert: 'einzelplan', text: 'Einzelpläne', mehrzahl: 'Einzelplänen' },
  { wert: 'kapitel', text: 'Kapitel', mehrzahl: 'Kapiteln' },
  { wert: 'titel', text: 'Titel', mehrzahl: 'Titeln' },
];
const TYP: Record<PlanIstEbene, string> = { einzelplan: 'einzelplan', kapitel: 'kapitel', titel: 'titel' };

export default async function PlanUndIst({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const sp = await searchParams;
  const stand = await ladeDatenstand();
  const jahre = standardjahre(stand, heute());
  const p = lesePlanIstParameter(sp, stand, jahre);
  const v = stand.version;
  const dim = EBENE_DIM[p.ebene];
  const filter = { konto: p.konto, jahr: p.jahr };
  const basis = { kennzahlen: ['soll', 'ist', 'abweichung', 'abweichung_rel'], gruppierung: [dim], filter, sortierung: p.sortierung, limit: 10 };
  const [gesamt, oben, unten] = await Promise.all([
    frage({ kennzahlen: ['soll', 'ist', 'abweichung'], filter }, v),
    frage({ ...basis, absteigend: true }, v),
    frage({ ...basis, absteigend: false }, v),
  ]);
  const g = gesamt.zeilen[0];
  const auswahl = groessteAbweichungen([...oben.zeilen, ...unten.zeilen], dim, p.sortierung, 12);
  const zeilen = auswahl.map((z) => {
    const s = text(z, dim) ?? '';
    return {
      schluessel: s,
      bezeichnung: bezeichnung(dim, s, text(z, TEXTSPALTE[dim]!)),
      href: trefferZiel({ typ: TYP[p.ebene], konto: p.konto, schluessel: s }, p.jahr),
      abs: zahl(z, 'abweichung'),
      rel: zahl(z, 'abweichung_rel'),
      wirkung: wirkungAus(z.wirkungsrichtung),
    };
  });
  const e = einheitFuer(zeilen.map((z) => z.abs));
  const ebeneText = EBENEN.find((x) => x.wert === p.ebene)!.mehrzahl;
  const kontoText = p.konto === 'ausgaben' ? 'Ausgaben' : 'Einnahmen';
  const link = (aenderung: Record<string, string>) => {
    const q = new URLSearchParams({ jahr: String(p.jahr), konto: p.konto, ebene: p.ebene, sortierung: p.sortierung === 'abweichung_rel' ? 'relativ' : 'betrag', ...aenderung });
    return `/plan-und-ist?${q.toString()}`;
  };
  const mitIst = jahre.alle.filter((j) => stand.jahre.some((x) => x.jahr === j && x.konto === p.konto && x.ist_verfuegbar));
  const wer = `Bund, ${kontoText} nach ${ebeneText}`;

  return (
    <>
      <h1 className="text-2xl font-bold">{kernaussagePlanIst(p.jahr, p.konto, zahl(g, 'abweichung'))}</h1>
      <p className="mt-1 text-[var(--hb-gedaempft)]">
        Soll {betragMitEinheit(zahl(g, 'soll'))}, Ist {betragMitEinheit(zahl(g, 'ist'))}. Wo lagen Plan und Wirklichkeit am weitesten auseinander?
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <JahrAuswahl jahre={mitIst} aktiv={p.jahr} ziel="/plan-und-ist" versteckt={{ konto: p.konto, ebene: p.ebene }} />
        <Umschalter beschriftung="Konto" aktiv={p.konto} optionen={[
          { wert: 'ausgaben', text: 'Ausgaben', href: link({ konto: 'ausgaben' }) },
          { wert: 'einnahmen', text: 'Einnahmen', href: link({ konto: 'einnahmen' }) },
        ]} />
        <Umschalter beschriftung="Ebene" aktiv={p.ebene} optionen={EBENEN.map((x) => ({ wert: x.wert, text: x.text, href: link({ ebene: x.wert }) }))} />
        <Umschalter beschriftung="Sortiert nach" aktiv={p.sortierung} optionen={[
          { wert: 'abweichung', text: 'Betrag', href: link({ sortierung: 'betrag' }) },
          { wert: 'abweichung_rel', text: 'Prozent', href: link({ sortierung: 'relativ' }) },
        ]} />
      </div>
      <Hinweisbox hinweise={p.hinweise} />
      <div className="grid gap-6 md:grid-cols-2">
        <Abweichungsbalken id="abs" vergleich="plan" einheit={e}
          titel={{ wer, was: e.kurz, wann: wann(p.jahr, ['ΔPL (Ist minus Soll)']) }}
          zeilen={zeilen.map((z) => ({ schluessel: z.schluessel, bezeichnung: z.bezeichnung, href: z.href, wert: z.abs, wirkung: z.wirkung }))}
          hinweise={oben.hinweise.filter((h) => !h.startsWith('Ergebnis auf'))} />
        <Nadeln id="rel" vergleich="plan"
          titel={{ wer, was: '%', wann: wann(p.jahr, ['ΔPL %']) }}
          zeilen={zeilen.map((z) => ({ schluessel: z.schluessel, bezeichnung: z.bezeichnung, href: z.href, wert: z.rel, wirkung: z.wirkung }))} />
      </div>
      <p className="mt-2 text-xs text-[var(--hb-gedaempft)]">
        Grau heißt: ohne Wertung. Grün und Rot gibt es nur nach festen Regeln für Einnahmen, Kreditaufnahme und Zinsen. <a href="/methodik#farben">Regeln ansehen</a>
      </p>
    </>
  );
}
