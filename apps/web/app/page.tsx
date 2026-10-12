import { FrageKarte } from '@/components/FrageKarte';
import { Fussnoten } from '@/components/ibcs/Fussnoten';
import { Strukturbalken } from '@/components/ibcs/Strukturbalken';
import { kernaussageStart } from '@/lib/aussagen';
import { frage, ladeDatenstand } from '@/lib/daten/abfragen';
import { standardjahre } from '@/lib/daten/jahre';
import { bezeichnung, explorerHref, kindHref, type ExplorerParameter } from '@/lib/explorer';
import { fragenFuer } from '@/lib/fragen';
import { einheitFuer } from '@/lib/ibcs/format';
import { wann } from '@/lib/ibcs/titel';
import { text, zahl } from '@/lib/werte';
import { heute } from '@/lib/zeit';

export default async function Start() {
  const stand = await ladeDatenstand();
  const jahre = standardjahre(stand, heute());
  const j = jahre.laufend;
  const v = stand.version;
  const [gesamt, struktur] = await Promise.all([
    frage({ kennzahlen: ['soll', 'soll_pro_kopf', 'soll_pro_tag'], filter: { konto: 'ausgaben', jahr: j } }, v),
    frage({ kennzahlen: ['soll', 'soll_vj_abs'], gruppierung: ['einzelplan_nr'], filter: { konto: 'ausgaben', jahr: j }, sortierung: 'soll', limit: 6 }, v),
  ]);
  const g = gesamt.zeilen[0];
  const aussage = kernaussageStart(j, zahl(g, 'soll') ?? 0, zahl(g, 'soll_pro_kopf'), zahl(g, 'soll_pro_tag'), false);
  const p: ExplorerParameter = { jahr: j, konto: 'ausgaben', sicht: 'ressort', pfad: {} };
  const zeilen = struktur.zeilen.map((z) => {
    const s = text(z, 'einzelplan_nr') ?? '';
    return { schluessel: s, bezeichnung: bezeichnung('einzelplan_nr', s, text(z, 'einzelplan_text')), href: kindHref(p, s), soll: zahl(z, 'soll'), delta: zahl(z, 'soll_vj_abs') };
  });
  const e = einheitFuer(zeilen.map((z) => z.soll));
  return (
    <>
      <section aria-labelledby="kernaussage" className="mb-6">
        <h1 id="kernaussage" className="text-3xl font-bold leading-tight">{aussage.titel}</h1>
        {aussage.untertitel && <p className="mt-2 text-lg text-[var(--hb-gedaempft)]">{aussage.untertitel}</p>}
        <Fussnoten hinweise={gesamt.hinweise} />
      </section>
      <Strukturbalken
        id="einzelplaene"
        titel={{ wer: 'Bund, Ausgaben nach Einzelplänen', was: e.kurz, wann: wann(j, ['Soll', 'Δ Soll Vorjahr']) }}
        zeilen={zeilen}
        einheit={e}
        deltaBeschriftung="Δ Soll Vorjahr"
        hinweise={struktur.hinweise.filter((h) => !h.startsWith('Ergebnis auf'))}
        weitere={{ anzahl: struktur.zeilen_gesamt - zeilen.length, href: explorerHref(p) }}
      />
      <section aria-labelledby="fragen" className="mt-8">
        <h2 id="fragen" className="text-xl font-semibold">Fragen, die die Daten beantworten</h2>
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          {fragenFuer(heute()).map((f) => <FrageKarte key={f.id} f={f} jahre={jahre} version={v} />)}
        </div>
      </section>
    </>
  );
}
