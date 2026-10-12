import { ladeDatenstand, suche } from '@/lib/daten/abfragen';
import { standardjahre } from '@/lib/daten/jahre';
import { TYP_BEZEICHNUNG, trefferZiel } from '@/lib/explorer';
import { heute } from '@/lib/zeit';

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 200) return Response.json({ treffer: [] });
  try {
    const stand = await ladeDatenstand();
    const jahre = standardjahre(stand, heute());
    const s = await suche(q, { jahr: jahre.laufend, limit: 8, version: stand.version });
    return Response.json({
      treffer: s.treffer.map((t) => ({
        typ: t.typ,
        typBezeichnung: TYP_BEZEICHNUNG[t.typ] ?? t.typ,
        bezeichnung: t.bezeichnung ?? t.schluessel,
        schluessel: t.schluessel,
        treffer: t.treffer,
        href: trefferZiel(t, s.jahr),
      })),
    });
  } catch (fehler) {
    console.error('Suche fehlgeschlagen', fehler);
    return Response.json({ treffer: [], fehler: 'Die Suche ist gerade nicht verfügbar.' }, { status: 503 });
  }
}
