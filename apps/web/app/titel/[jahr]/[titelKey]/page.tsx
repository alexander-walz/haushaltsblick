import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ZeitreiheSaeulen } from '@/components/ibcs/ZeitreiheSaeulen';
import { frage, ladeDatenstand, titelDetail } from '@/lib/daten/abfragen';
import { standardjahre } from '@/lib/daten/jahre';
import { ApiFehler } from '@/lib/daten/rpc';
import type { TitelDetail } from '@/lib/daten/schemas';
import { bezeichnung } from '@/lib/explorer';
import { wirkungAus } from '@/lib/ibcs/farbe';
import { einheitFuer, NICHT_VERFUEGBAR } from '@/lib/ibcs/format';
import { einzeln, type SuchParameter } from '@/lib/seite';
import { flexibilisiertText, luecke, sichereFundstelle, sollQuelleText, zeitpunkte } from '@/lib/steckbrief';
import { heute } from '@/lib/zeit';

export async function generateMetadata({ params }: { params: Promise<{ jahr: string; titelKey: string }> }): Promise<Metadata> {
  try {
    const { jahr, titelKey } = await params;
    if (!Number.isInteger(Number(jahr)) || !/^\d{9}$/.test(titelKey)) return { title: 'Titel' };
    const stand = await ladeDatenstand();
    const d = await titelDetail(titelKey, Number(jahr), stand.version);
    return { title: d.titel.titel_text ?? 'Titel' };
  } catch {
    return { title: 'Titel' };
  }
}

export default async function TitelSeite({ params, searchParams }: {
  params: Promise<{ jahr: string; titelKey: string }>; searchParams: Promise<SuchParameter>;
}) {
  const { jahr: jahrText, titelKey } = await params;
  const jahr = Number(jahrText);
  if (!Number.isInteger(jahr) || !/^\d{9}$/.test(titelKey)) notFound();
  const mitPlan = einzeln(await searchParams, 'haushaltsplan') === 'ja';
  const stand = await ladeDatenstand();
  const jahre = standardjahre(stand, heute());
  let d: TitelDetail;
  try {
    d = await titelDetail(titelKey, jahr, stand.version);
  } catch (e) {
    if (e instanceof ApiFehler && e.code === '22023') notFound();
    throw e;
  }
  const t = d.titel;
  // Ohne Wirkungsrichtung bleibt die Zeitreihe grau; der Fehler wird protokolliert, nicht verschluckt.
  const wirk = await frage({ kennzahlen: ['abweichung'], filter: { konto: t.konto, jahr: t.jahr, titel_key: t.titel_key } }, stand.version)
    .catch((fehler: unknown) => { console.error('Wirkungsrichtung für Titel nicht abrufbar', t.titel_key, t.jahr, fehler); return null; });
  const wirkung = wirkungAus(wirk?.zeilen[0]?.wirkungsrichtung);
  const punkte = zeitpunkte(d, mitPlan);
  const e = einheitFuer(punkte.flatMap((p) => [p.soll, p.ist, p.haushaltsplan ?? null]));
  const erstes = d.zeitreihe[0]?.jahr ?? jahr;
  const letztes = d.zeitreihe.at(-1)?.jahr ?? jahr;
  const hinweis = luecke(d, jahre.alle[0] ?? 2012);
  const fundstelleUrl = d.fundstelle ? sichereFundstelle(d.fundstelle.url) : null;
  const planLink = `/titel/${jahr}/${titelKey}${mitPlan ? '' : '?haushaltsplan=ja'}`;

  return (
    <>
      <p className="text-sm text-[var(--hb-gedaempft)]">{bezeichnung('titel_key', t.titel_key, null)} · {t.konto === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'} · {jahr}</p>
      <h1 className="text-2xl font-bold">{t.titel_text ?? 'Titel'}</h1>
      <nav aria-label="Jahr wählen" className="mt-2 flex flex-wrap gap-1 text-sm">
        {d.zeitreihe.map((z) => (
          <a key={z.jahr} href={`/titel/${z.jahr}/${z.titel_key}`} aria-current={z.jahr === jahr ? 'page' : undefined}
            className={`rounded border px-1.5 no-underline ${z.jahr === jahr ? 'border-[var(--hb-akzent)] text-[var(--hb-akzent-text)]' : 'border-[var(--hb-linie)]'}`}>{z.jahr}</a>
        ))}
      </nav>
      <ZeitreiheSaeulen id="zeitreihe" wirkung={wirkung} einheit={e}
        titel={{ wer: `Titel ${bezeichnung('titel_key', t.titel_key, t.titel_text)}`, was: e.kurz, wann: `${erstes} bis ${letztes} Soll, Ist, ΔPL` }}
        punkte={punkte} hinweise={[...d.hinweise, ...(hinweis ? [hinweis] : [])]} />
      <p className="text-sm"><a href={planLink}>{mitPlan ? 'Haushaltsplan (XML) ausblenden' : 'Soll laut Haushaltsplan (XML) einblenden'}</a></p>
      <h2 className="mt-6 text-lg font-semibold">Stammdaten {jahr}</h2>
      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt>Einzelplan</dt><dd>{t.einzelplan_nr} {t.einzelplan_text}</dd>
        <dt>Kapitel</dt><dd>{t.kapitel_nr} {t.kapitel_text}</dd>
        {t.titelgruppe_nr && (<><dt>Titelgruppe</dt><dd>{t.titelgruppe_nr} {t.titelgruppe_text}</dd></>)}
        <dt>Funktion</dt><dd>{t.fkt} {t.funktion_text}</dd>
        <dt>Gruppierung</dt><dd>{t.gruppierung_nr} {t.gruppierung_text}</dd>
        <dt>Flexibilisiert</dt><dd>{flexibilisiertText(t.flexibilisiert)}</dd>
        <dt>Haushaltsstand</dt><dd>{t.haushaltsstand ?? NICHT_VERFUEGBAR}</dd>
        <dt>Quelle des Solls</dt><dd>{sollQuelleText(t.soll_quelle)}</dd>
      </dl>
      <h2 className="mt-6 text-lg font-semibold">Fundstelle</h2>
      {d.fundstelle
        ? <p className="mt-1 text-sm">{fundstelleUrl
            ? <a href={fundstelleUrl} rel="noopener noreferrer">{d.fundstelle.dokument}, Seite {d.fundstelle.seite}</a>
            : <>{d.fundstelle.dokument}, Seite {d.fundstelle.seite}</>}</p>
        : <p className="mt-1 text-sm">{t.haushaltsstand === 'Regierungsentwurf' ? 'Für den Regierungsentwurf gibt es noch keinen Haushaltsplan mit Seitenangabe.' : 'Die Quelldaten enthalten für diesen Titel keine Seitenangabe.'}</p>}
    </>
  );
}
