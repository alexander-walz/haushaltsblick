import type { Metadata } from 'next';
import { IbcsTabelle, type TabellenZeile } from '@/components/ibcs/IbcsTabelle';
import { Hinweisbox } from '@/components/ui/Hinweisbox';
import { JahrAuswahl } from '@/components/ui/JahrAuswahl';
import { Umschalter } from '@/components/ui/Umschalter';
import { frage, ladeDatenstand } from '@/lib/daten/abfragen';
import { istVerfuegbar, standardjahre } from '@/lib/daten/jahre';
import { bezeichnung, brotkrumen, ebene, EBENENNAME, explorerHref, kindHref, leseParameter, TEXTSPALTE, type ExplorerParameter, type Sicht } from '@/lib/explorer';
import { wirkungAus } from '@/lib/ibcs/farbe';
import { einheitFuer } from '@/lib/ibcs/format';
import { wann } from '@/lib/ibcs/titel';
import type { SuchParameter } from '@/lib/seite';
import { text, zahl } from '@/lib/werte';
import { heute } from '@/lib/zeit';

export const metadata: Metadata = { title: 'Explorer' };

const SICHTEN: readonly { wert: Sicht; text: string }[] = [
  { wert: 'ressort', text: 'nach Ressorts' },
  { wert: 'aufgabe', text: 'nach Aufgaben' },
  { wert: 'art', text: 'nach Arten' },
];

export default async function Explorer({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const sp = await searchParams;
  const stand = await ladeDatenstand();
  const jahre = standardjahre(stand, heute());
  const { param, hinweise } = leseParameter(sp, jahre);
  const e = ebene(param);
  const mitIst = istVerfuegbar(stand, param.jahr, param.konto);
  const entwurf = param.jahr === jahre.entwurf;
  const kennzahlen = mitIst ? ['soll', 'ist', 'abweichung', 'abweichung_rel'] : ['soll', 'soll_vj_abs', 'soll_anteil'];
  const filter = { konto: param.konto, jahr: param.jahr, ...e.filter };
  const pfadDims = Object.keys(e.filter);
  const [daten, summe] = await Promise.all([
    frage({ kennzahlen, gruppierung: [e.gruppierung], filter, sortierung: 'soll', limit: 500 }, stand.version),
    frage({ kennzahlen, gruppierung: pfadDims, filter }, stand.version),
  ]);
  const s0 = summe.zeilen[0];
  const texte = Object.fromEntries(pfadDims.map((d) => [TEXTSPALTE[d]!, text(s0, TEXTSPALTE[d]!)]));
  const krumen = brotkrumen(param, texte);
  const textspalte = TEXTSPALTE[e.gruppierung]!;
  const sollSzenario = entwurf ? 'entwurf' as const : 'soll' as const;
  const zuZeile = (z: (typeof daten.zeilen)[number] | undefined, schluessel: string, name: string, href?: string): TabellenZeile => ({
    schluessel, bezeichnung: name, href,
    soll: zahl(z, 'soll'), ist: zahl(z, 'ist'), abweichung: zahl(z, 'abweichung'), abweichungRel: zahl(z, 'abweichung_rel'),
    deltaVj: zahl(z, 'soll_vj_abs'), anteil: zahl(z, 'soll_anteil'), wirkung: wirkungAus(z?.wirkungsrichtung), sollSzenario,
  });
  const zeilen = daten.zeilen.map((z) => {
    const s = text(z, e.gruppierung) ?? '';
    return zuZeile(z, s, bezeichnung(e.gruppierung, s, text(z, textspalte)), kindHref(param, s));
  });
  const kontoText = param.konto === 'ausgaben' ? 'Ausgaben' : 'Einnahmen';
  const ort = krumen.length > 1 ? krumen.slice(1).map((k) => k.bezeichnung).join(' › ') : 'Bund';
  const sollWort = entwurf ? 'Entwurf' : 'Soll';
  const einheit = einheitFuer(zeilen.flatMap((z) => [z.soll, z.ist ?? null]));
  const summeZeile = s0 ? zuZeile(s0, 'summe', e.tiefe === 0 ? `${kontoText} gesamt` : `Summe ${krumen.at(-1)!.bezeichnung}`) : undefined;
  const mit = (aenderung: Partial<ExplorerParameter>) => explorerHref({ ...param, pfad: {}, ...aenderung });

  return (
    <>
      <h1 className="text-2xl font-bold">Explorer</h1>
      <nav aria-label="Ebene" className="mt-1 text-sm">
        {krumen.map((k, i) => (
          <span key={k.href}>{i > 0 && ' › '}{i === krumen.length - 1 ? <span aria-current="page">{k.bezeichnung}</span> : <a href={k.href}>{k.bezeichnung}</a>}</span>
        ))}
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <JahrAuswahl jahre={jahre.alle} aktiv={param.jahr} entwurf={jahre.entwurf} ziel="/explorer" versteckt={{ konto: param.konto, sicht: param.sicht }} />
        <Umschalter beschriftung="Konto" aktiv={param.konto} optionen={[
          { wert: 'ausgaben', text: 'Ausgaben', href: mit({ konto: 'ausgaben' }) },
          { wert: 'einnahmen', text: 'Einnahmen', href: mit({ konto: 'einnahmen', sicht: param.sicht === 'aufgabe' ? 'ressort' : param.sicht }) },
        ]} />
        <Umschalter beschriftung="Sicht" aktiv={param.sicht}
          optionen={SICHTEN.filter((s) => !(s.wert === 'aufgabe' && param.konto === 'einnahmen')).map((s) => ({ wert: s.wert, text: s.text, href: mit({ sicht: s.wert }) }))} />
      </div>
      <Hinweisbox hinweise={hinweise} />
      <IbcsTabelle
        id="explorer"
        modus={mitIst ? 'plan_ist' : 'soll'}
        titel={{
          wer: `${ort}, ${kontoText} nach ${EBENENNAME[e.gruppierung]}`,
          was: einheit.kurz,
          wann: wann(param.jahr, mitIst ? ['Soll', 'Ist', 'ΔPL'] : [sollWort, `Δ ${sollWort} Vorjahr`, 'Anteil']),
        }}
        zeilen={zeilen}
        summe={summeZeile}
        einheit={einheit}
        hinweise={daten.hinweise}
      />
    </>
  );
}
