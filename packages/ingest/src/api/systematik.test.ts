import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { zuCent } from './crawler';
import { ApiVertragsFehler, pruefeApiAntwort } from './schema';
import { crawleSystematik, holeSystematikWurzel, systematikUrl, type SystematikParameter } from './systematik';
import { fakeAbruf } from './test-baum';
import { baueSystematikBaum, type SystematikPlan } from './test-systematik';

const P: SystematikParameter = { jahr: 2024, konto: 'ausgaben', sicht: 'funktion' };
const PLAN: SystematikPlan = {
  '3': { '31': [['312', 'Krankenhäuser', 10]], '32': [['322', 'Sport', 5.5], ['325', 'Erholung', 0.5]] },
  '0': { '01': [['011', 'Politische Führung', 100]] },
};

async function crawl(baum = baueSystematikBaum(P, PLAN)) {
  const abruf = fakeAbruf(baum);
  const wurzel = await holeSystematikWurzel(P, abruf);
  if (wurzel.status !== 'ok') throw new Error('Wurzel fehlt');
  return { ergebnis: await crawleSystematik(P, abruf, wurzel), abruf };
}

describe('systematikUrl', () => {
  it('fragt immer den Soll der jeweiligen Sicht ab', () => {
    expect(systematikUrl(P)).toBe('https://www.bundeshaushalt.de/internalapi/budgetData?year=2024&account=expenses&quota=target&unit=function');
    expect(systematikUrl({ jahr: 2013, konto: 'einnahmen', sicht: 'gruppierung' }, 'G-1'))
      .toBe('https://www.bundeshaushalt.de/internalapi/budgetData?year=2013&account=income&quota=target&unit=group&id=G-1');
  });
});

describe('crawleSystematik', () => {
  it('liefert alle Codes der drei Ebenen mit Bezeichnung ohne Codepräfix', async () => {
    const { ergebnis } = await crawl();
    expect(ergebnis.eintraege).toContainEqual({ code: '3', ebene: 1, label: 'Haupt 3', betragCent: 1600 });
    expect(ergebnis.eintraege).toContainEqual({ code: '32', ebene: 2, label: 'Ober 32', betragCent: 600 });
    expect(ergebnis.eintraege).toContainEqual({ code: '322', ebene: 3, label: 'Sport', betragCent: 550 });
    expect(ergebnis.eintraege).toHaveLength(9);
    expect(ergebnis.quelleTimestamp).toBe(1711628039000);
  });

  it('ruft nur Wurzel, Ebene 1 und Ebene 2 ab', async () => {
    const { abruf } = await crawl();
    expect(abruf.aufrufe).toEqual([
      systematikUrl(P), systematikUrl(P, 'F-0'), systematikUrl(P, 'F-01'), systematikUrl(P, 'F-3'), systematikUrl(P, 'F-31'), systematikUrl(P, 'F-32'),
    ]);
  });

  it('prüft jede Ebene centgenau', async () => {
    const baum = baueSystematikBaum(P, PLAN);
    (baum.get(systematikUrl(P, 'F-32')) as { children: { value: number }[] }).children[0]!.value = 5.49;
    await expect(crawl(baum)).rejects.toThrow(/Summe der Kinder 5\.99 weicht vom Knoten 6\.00 ab/);
  });

  it('lehnt Codes ab, die nicht zum Elternknoten passen', async () => {
    const baum = baueSystematikBaum(P, PLAN);
    (baum.get(systematikUrl(P, 'F-32')) as { children: { id: string }[] }).children[0]!.id = 'F-412';
    await expect(crawl(baum)).rejects.toThrow(/Code F-412 gehört nicht zu 32/);
  });

  it('lehnt Codes der falschen Sicht ab', async () => {
    const baum = baueSystematikBaum(P, PLAN);
    (baum.get(systematikUrl(P)) as { children: { id: string }[] }).children[0]!.id = 'G-3';
    await expect(crawl(baum)).rejects.toThrow(ApiVertragsFehler);
  });

  it('meldet fehlende Knoten als Vertragsfehler', async () => {
    const baum = baueSystematikBaum(P, PLAN);
    baum.delete(systematikUrl(P, 'F-31'));
    await expect(crawl(baum)).rejects.toThrow(/Knoten nicht gefunden \(404\)/);
  });

  it('meldet nicht verfügbare Jahre', async () => {
    expect(await holeSystematikWurzel(P, fakeAbruf(new Map()))).toEqual({ status: 'nicht_verfuegbar', url: systematikUrl(P) });
  });
});

describe('echte Antworten der Systematik', () => {
  it.each(['funktion_wurzel_soll_2024_ausgaben', 'funktion_F-3_soll_2024_ausgaben', 'funktion_F-32_soll_2024_ausgaben', 'gruppierung_G-68_soll_2024_ausgaben'])(
    '%s ist schemakonform und centgenau',
    (name) => {
      const json = JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/api/${name}.json`, import.meta.url)), 'utf8'));
      const { antwort, warnungen } = pruefeApiAntwort(json, name);
      expect(warnungen).toEqual([]);
      expect(antwort.children.reduce((s, k) => s + zuCent(k.value), 0)).toBe(zuCent(antwort.detail.value));
    },
  );
});
