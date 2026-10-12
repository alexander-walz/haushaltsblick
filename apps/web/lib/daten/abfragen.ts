import { rpc, type RpcOptionen } from './rpc';
import { DatenstandSchema, GlossarSchema, KennzahlenSchema, QueryMetricSchema, SucheSchema, TitelDetailSchema } from './schemas';

export type Filterwert = string | number | boolean | readonly (string | number)[];

export type Abfrage = {
  kennzahlen: readonly string[];
  gruppierung?: readonly string[];
  filter?: Readonly<Record<string, Filterwert>>;
  sortierung?: string;
  absteigend?: boolean;
  limit?: number;
};

export function ladeDatenstand(opt?: RpcOptionen) {
  return rpc('get_dataset_status', {}, DatenstandSchema, opt);
}

export function frage(a: Abfrage, version: number, opt?: RpcOptionen) {
  return rpc('query_metric', {
    p_metrics: a.kennzahlen,
    p_group_by: a.gruppierung ?? [],
    p_filters: a.filter ?? {},
    p_order_by: a.sortierung,
    p_absteigend: a.absteigend,
    p_limit: a.limit,
    p_version: version,
  }, QueryMetricSchema, opt);
}

export function suche(q: string, p: { jahr?: number; typ?: string; limit?: number; version?: number } = {}, opt?: RpcOptionen) {
  return rpc('search_entities', { p_q: q, p_jahr: p.jahr, p_typ: p.typ, p_limit: p.limit, p_version: p.version }, SucheSchema, opt);
}

export function titelDetail(titelKey: string, jahr: number, version: number, opt?: RpcOptionen) {
  return rpc('get_titel_detail', { p_titel_key: titelKey, p_jahr: jahr, p_version: version }, TitelDetailSchema, opt);
}

export function ladeKennzahlen(version: number, opt?: RpcOptionen) {
  return rpc('list_kennzahlen', { p_version: version }, KennzahlenSchema, opt);
}

export function ladeGlossar(version: number, opt?: RpcOptionen) {
  return rpc('get_glossar', { p_version: version }, GlossarSchema, opt);
}
