import { describe, expect, it } from 'vitest';
import { imRollback } from '../db/test-hilfen';
import { leereMart, veroeffentlicheTitel } from './testdaten';

const MRD = 1e9;

describe('Grundlagen der Abfrageschicht', () => {
  it('normalisiert Texte für die Suche', () =>
    imRollback(async (tx) => {
      const [z] = await tx`
        select semantic.normtext('BAföG: Zuschüsse!') as a, semantic.normtext('Straße  der Einheit') as b, semantic.normtext(null) as c`;
      expect(z).toEqual({ a: 'bafog zuschusse', b: 'strasse der einheit', c: '' });
    }));

  it('liefert den Datenstand mit Ampel, Semantik-Version und Jahren', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      const v = await veroeffentlicheTitel(tx, [
        { jahr: 2024, titelKey: '140153201', soll: 100 * MRD, ist: 90 * MRD },
        { jahr: 2026, titelKey: '140153201', soll: 150 * MRD },
      ]);
      const [z] = await tx`select api.get_dataset_status() as s`;
      const s = z!.s;
      expect(s.version).toBe(v);
      expect(s.ist_aktuell).toBe(true);
      expect(s.ampel).toBe('green');
      expect(typeof s.semantik_version).toBe('number');
      expect(s.zeilen).toBe(2);
      expect(s.pruefungen).toEqual([]);
      expect(s.jahre).toEqual([
        { jahr: 2024, konto: 'ausgaben', haushaltsstand: 'Gesetz', soll_quelle: 'api', ist_verfuegbar: true, titel: 1 },
        { jahr: 2026, konto: 'ausgaben', haushaltsstand: 'Gesetz', soll_quelle: 'api', ist_verfuegbar: false, titel: 1 },
      ]);
    }));

  it('nennt nicht bestandene Prüfungen im Datenstand', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
      await tx`
        insert into ops.dq_ergebnis (dq_lauf_id, check_id, status, failures, details)
        select dq_lauf_id, 'DQ-05', 'warn', 3, '[]'::jsonb from ops.dataset_version where is_current`;
      const [z] = await tx`select api.get_dataset_status() as s`;
      expect(z!.s.pruefungen).toEqual([
        { check_id: 'DQ-05', status: 'warn', failures: 3, schwere: 'warn', beschreibung: 'Jede Gruppierungsnummer hat eine Bezeichnung' },
      ]);
    }));

  it('nennt eine unbekannte Version', () =>
    imRollback(async (tx) => {
      await expect(tx`select api.get_dataset_status(${-1}::bigint)`).rejects.toThrow(/Unbekannte Datenversion -1/);
    }));

  it('meldet, wenn noch keine Version veröffentlicht ist', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      await expect(tx`select api.get_dataset_status()`).rejects.toThrow(/Noch keine Datenversion veröffentlicht/);
    }));

  it('lehnt Versionen ohne Semantik ab', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      const v = await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
      await tx`update ops.dataset_version set semantik_version_id = null where version_id = ${v}`;
      await expect(tx`select api.list_kennzahlen()`).rejects.toThrow(/mit keiner Semantik verknüpft/);
    }));

  it('listet die Kennzahlen in fester Reihenfolge', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
      const [z] = await tx`select api.list_kennzahlen() as k`;
      expect(z!.k.kennzahlen.map((k: { kennzahl_id: string }) => k.kennzahl_id)).toEqual([
        'soll', 'soll_xml', 'ist', 'abweichung', 'abweichung_rel', 'ist_quote', 'soll_anteil', 'ist_anteil',
        'soll_pro_kopf', 'ist_pro_kopf', 'soll_pro_tag', 'ist_pro_tag', 'soll_vj_abs', 'soll_vj_rel',
        'ist_vj_abs', 'ist_vj_rel', 'titel_anzahl',
      ]);
      expect(z!.k.kennzahlen[0]).toEqual(expect.objectContaining({ kennzahl_id: 'soll', einheit: 'EUR', braucht_jahr: false }));
    }));

  it('findet Glossareinträge auch ungenau und listet ohne Begriff alle', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
      const [a] = await tx`select api.get_glossar('minderausgabe') as g`;
      expect(a!.g.eintraege[0].begriff).toBe('Globale Minderausgabe');
      const [b] = await tx`select api.get_glossar() as g`;
      expect(b!.g.eintraege.length).toBeGreaterThanOrEqual(20);
      const [c] = await tx`select api.get_glossar('xyzxyz') as g`;
      expect(c!.g.eintraege).toEqual([]);
    }));

  describe('Rechte für anon', () => {
    it('darf die Funktionen in api ausführen', () =>
      imRollback(async (tx) => {
        await leereMart(tx);
        await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
        await tx`set local role anon`;
        const [z] = await tx`select api.get_dataset_status() as s, api.list_kennzahlen() as k, api.get_glossar('Soll') as g`;
        expect(z!.s.ampel).toBe('green');
      }));

    it('darf mart nicht lesen', () =>
      imRollback(async (tx) => {
        await tx`set local role anon`;
        await expect(tx`select 1 from mart.fct_titel_jahr_hist limit 1`).rejects.toThrow(/permission denied/);
      }));

    it('darf ops nicht lesen', () =>
      imRollback(async (tx) => {
        await tx`set local role anon`;
        await expect(tx`select 1 from ops.dataset_version limit 1`).rejects.toThrow(/permission denied/);
      }));

    it('darf Hilfsfunktionen in semantic nicht aufrufen', () =>
      imRollback(async (tx) => {
        await tx`set local role anon`;
        await expect(tx`select semantic.normtext('x')`).rejects.toThrow(/permission denied/);
      }));
  });
});
