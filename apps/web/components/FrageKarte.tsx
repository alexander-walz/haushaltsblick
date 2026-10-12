import { Abweichungsbalken } from '@/components/ibcs/Abweichungsbalken';
import { Strukturbalken } from '@/components/ibcs/Strukturbalken';
import { ZeitreiheSaeulen } from '@/components/ibcs/ZeitreiheSaeulen';
import { frage } from '@/lib/daten/abfragen';
import type { Standardjahre } from '@/lib/daten/jahre';
import { bezeichnung, TEXTSPALTE } from '@/lib/explorer';
import type { FrageDef } from '@/lib/fragen';
import { wirkungAus } from '@/lib/ibcs/farbe';
import { einheitFuer } from '@/lib/ibcs/format';
import { wann } from '@/lib/ibcs/titel';
import { text, zahl } from '@/lib/werte';

/** Eine Frage der Startseite mit ihrer fest definierten Antwortansicht (Spec 6.1). */
export async function FrageKarte({ f, jahre, version }: { f: FrageDef; jahre: Standardjahre; version: number }) {
  const a = f.abfrage(jahre);
  if (!a) return null;
  const r = await frage(a, version);
  const id = `frage-${f.id}`;
  const dim = a.gruppierung?.[0] ?? 'jahr';
  let inhalt;
  if (f.darstellung === 'zeitreihe') {
    const punkte = r.zeilen.map((z) => {
      const jahr = zahl(z, 'jahr') ?? 0;
      return { jahr, soll: zahl(z, 'soll'), ist: zahl(z, 'ist'), sollSzenario: jahr === jahre.entwurf ? 'entwurf' as const : 'soll' as const };
    });
    const e = einheitFuer(punkte.flatMap((p) => [p.soll, p.ist]));
    const von = a.filter?.jahr_von;
    const bis = a.filter?.jahr_bis;
    inhalt = <ZeitreiheSaeulen id={id} titel={{ wer: f.wer, was: e.kurz, wann: `${von} bis ${bis} ${f.szenarien.join(', ')}` }} punkte={punkte} einheit={e} hinweise={r.hinweise} />;
  } else if (f.darstellung === 'abweichung') {
    const zeilen = r.zeilen
      .map((z) => {
        const s = text(z, dim) ?? '';
        return { schluessel: s, bezeichnung: bezeichnung(dim, s, text(z, TEXTSPALTE[dim] ?? '')), wert: zahl(z, 'abweichung'), wirkung: wirkungAus(z.wirkungsrichtung) };
      })
      .filter((z) => z.wert !== null)
      .sort((x, y) => Math.abs(y.wert ?? 0) - Math.abs(x.wert ?? 0))
      .slice(0, 5);
    const e = einheitFuer(zeilen.map((z) => z.wert));
    inhalt = <Abweichungsbalken id={id} titel={{ wer: f.wer, was: e.kurz, wann: wann(f.jahr(jahre), f.szenarien) }} zeilen={zeilen} vergleich="plan" einheit={e} hinweise={r.hinweise} />;
  } else {
    const zeilen = r.zeilen.map((z) => {
      const s = text(z, dim) ?? '';
      return { schluessel: s, bezeichnung: bezeichnung(dim, s, text(z, TEXTSPALTE[dim] ?? '')), soll: zahl(z, 'soll') };
    });
    const e = einheitFuer(zeilen.map((z) => z.soll));
    inhalt = <Strukturbalken id={id} titel={{ wer: f.wer, was: e.kurz, wann: wann(f.jahr(jahre), f.szenarien) }} zeilen={zeilen} einheit={e} hinweise={r.hinweise} />;
  }
  return (
    <article className="rounded border border-[var(--hb-linie)] p-4">
      <h3 className="font-semibold">{f.frage(jahre)}</h3>
      {inhalt}
      <a href={f.link(jahre)} className="text-sm">Mehr dazu</a>
    </article>
  );
}
