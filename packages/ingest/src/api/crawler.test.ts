import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ApiVertragsFehler, pruefeApiAntwort } from './schema';
import { apiUrl, centZuDezimal, crawle, holeWurzel, zuCent, type ApiParameter } from './crawler';
import { baueBaum, fakeAbruf, type BaumPlan } from './test-baum';

const P: ApiParameter = { jahr: 2024, konto: 'ausgaben', quote: 'ist' };
const PLAN: BaumPlan = {
  '04': {
    '0411': [['43257', '018', 'Versorgungsbezüge', 61346498.79], ['97201', '880', 'Globale Minderausgabe', -168000]],
    '0416': [['68421', '322', 'Zentrale Maßnahmen Sport', 1234.5]],
  },
  '06': { '0601': [['53201', '011', 'Ausgaben', 0.01]] },
};

async function vollerCrawl(baum = baueBaum(P, PLAN)) {
  const abruf = fakeAbruf(baum);
  const wurzel = await holeWurzel(P, abruf);
  if (wurzel.status !== 'ok') throw new Error('Wurzel fehlt');
  return { ergebnis: await crawle(P, abruf, wurzel), abruf };
}

describe('Hilfsfunktionen', () => {
  it('baut die URL mit www, Konto, Quote und optionaler ID', () => {
    expect(apiUrl(P)).toBe('https://www.bundeshaushalt.de/internalapi/budgetData?year=2024&account=expenses&quota=actual&unit=single');
    expect(apiUrl({ jahr: 2027, konto: 'einnahmen', quote: 'soll' }, '0411'))
      .toBe('https://www.bundeshaushalt.de/internalapi/budgetData?year=2027&account=income&quota=target&unit=single&id=0411');
  });

  it('rechnet über ganze Cent', () => {
    expect(zuCent(474753727609.58)).toBe(47475372760958);
    expect(zuCent(0.1 + 0.2)).toBe(30);
    expect(centZuDezimal(47475372760958)).toBe('474753727609.58');
    expect(centZuDezimal(-16800000)).toBe('-168000.00');
    expect(centZuDezimal(-5)).toBe('-0.05');
    expect(centZuDezimal(0)).toBe('0.00');
  });
});

describe('holeWurzel', () => {
  it('meldet nicht verfügbare Jahre', async () => {
    const abruf = fakeAbruf(new Map());
    expect(await holeWurzel({ jahr: 2026, konto: 'ausgaben', quote: 'ist' }, abruf)).toEqual({
      status: 'nicht_verfuegbar',
      url: apiUrl({ jahr: 2026, konto: 'ausgaben', quote: 'ist' }),
    });
    expect(abruf.aufrufe).toHaveLength(1);
  });
});

describe('crawle', () => {
  it('liefert alle Titel mit Kapitel, Funktion, Label und Cent-Betrag', async () => {
    const { ergebnis } = await vollerCrawl();
    expect(ergebnis.titel).toContainEqual({
      einzelplanNr: '04', kapitelNr: '0411', titelNr: '43257', fkt: '018', label: 'Versorgungsbezüge', betragCent: 6134649879,
    });
    expect(ergebnis.titel).toHaveLength(4);
    expect(ergebnis.quelleTimestamp).toBe(1752216181000);
    expect(ergebnis.modifyDate).toBe('11.07.2025');
  });

  it('liefert Knoten je Ebene mit Summen', async () => {
    const { ergebnis } = await vollerCrawl();
    expect(ergebnis.knoten.map((k) => [k.ebene, k.knotenId])).toEqual([
      ['gesamt', ''], ['einzelplan', '04'], ['kapitel', '0411'], ['kapitel', '0416'], ['einzelplan', '06'], ['kapitel', '0601'],
    ]);
    expect(ergebnis.knoten[0]!.betragCent).toBe(6134649879 - 16800000 + 123450 + 1);
  });

  it('ruft nur Wurzel, Einzelpläne und Kapitel ab, nie einzelne Titel', async () => {
    const { ergebnis, abruf } = await vollerCrawl();
    expect(abruf.aufrufe).toEqual([apiUrl(P), apiUrl(P, '04'), apiUrl(P, '0411'), apiUrl(P, '0416'), apiUrl(P, '06'), apiUrl(P, '0601')]);
    expect(ergebnis.antworten.map((a) => a.url)).toEqual(abruf.aufrufe);
  });

  it('stellt eine Abweichung zwischen Knoten und Summe der Kinder fest', async () => {
    const baum = baueBaum(P, PLAN);
    const kap = baum.get(apiUrl(P, '0411')) as { children: { value: number }[] };
    kap.children[0]!.value += 0.01;
    await expect(vollerCrawl(baum)).rejects.toThrow(ApiVertragsFehler);
    await expect(vollerCrawl(baum)).rejects.toThrow(/Summe der Kinder 61178498\.80 weicht vom Knoten 61178498\.79 ab/);
  });

  it('stellt fest, wenn ein Einzelplan im Elternknoten anders bewertet ist als in seiner eigenen Antwort', async () => {
    const baum = baueBaum(P, PLAN);
    const ep = baum.get(apiUrl(P, '06')) as { detail: { value: number }; children: { value: number }[] };
    ep.detail.value = 0.02;
    ep.children[0]!.value = 0.02;
    await expect(vollerCrawl(baum)).rejects.toThrow(/Einzelplan 06: Wert 0\.02 weicht vom Elternknoten 0\.01 ab/);
  });

  it('meldet einen fehlenden Kapitelknoten als Vertragsfehler', async () => {
    const baum = baueBaum(P, PLAN);
    baum.delete(apiUrl(P, '0416'));
    await expect(vollerCrawl(baum)).rejects.toThrow(/Knoten nicht gefunden \(404\)/);
  });

  it('prüft, dass die Antwort zur Anfrage passt', async () => {
    const baum = baueBaum(P, PLAN);
    (baum.get(apiUrl(P, '04')) as { meta: { year: number } }).meta.year = 2023;
    await expect(vollerCrawl(baum)).rejects.toThrow(/Antwort passt nicht zur Anfrage/);
  });

  it('prüft das Format der budgetNumber und die Zugehörigkeit des Titels zum Kapitel', async () => {
    const baum = baueBaum(P, PLAN);
    const kap = baum.get(apiUrl(P, '0416')) as { children: { budgetNumber: string }[] };
    kap.children[0]!.budgetNumber = '0416 684 21';
    await expect(vollerCrawl(baum)).rejects.toThrow(/budgetNumber ungültig/);
  });

  it('erkennt doppelte Titel im selben Kapitel', async () => {
    const baum = baueBaum(P, { '04': { '0411': [['43257', '018', 'A', 1], ['43257', '018', 'B', 2]] } });
    await expect(vollerCrawl(baum)).rejects.toThrow(/Titel 041143257 mehrfach/);
  });

  it('sammelt Warnungen aus allen Antworten ohne Doppelungen', async () => {
    const baum = baueBaum(P, PLAN);
    for (const json of baum.values()) (json as Record<string, unknown>).neu = 1;
    const { ergebnis } = await vollerCrawl(baum);
    expect(ergebnis.warnungen).toEqual(['Unbekanntes Feld neu']);
  });
});

describe('echte Antworten', () => {
  it.each(['wurzel_ist_2024_ausgaben', 'ep04_ist_2024_ausgaben', 'kap0411_ist_2024_ausgaben', 'kap0411_soll_2024_ausgaben'])(
    '%s: Knoten ist centgenau die Summe der Kinder',
    (name) => {
      const json = JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/api/${name}.json`, import.meta.url)), 'utf8'));
      const { antwort } = pruefeApiAntwort(json, name);
      expect(antwort.children.reduce((s, k) => s + zuCent(k.value), 0)).toBe(zuCent(antwort.detail.value));
    },
  );
});
