import postgres from 'postgres';

export type Sql = postgres.Sql;

export const LOKALE_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export function verbinde(url: string = process.env.DATABASE_URL ?? LOKALE_DB): Sql {
  return postgres(url, { max: 4, onnotice: () => {} });
}

/** Führt fn atomar aus: als Transaktion auf einer Verbindung, als Savepoint innerhalb einer Transaktion. */
export function inTransaktion<T>(sql: Sql, fn: (tx: Sql) => Promise<T>): Promise<T> {
  if ('savepoint' in sql && typeof sql.savepoint === 'function') {
    return (sql as unknown as postgres.TransactionSql).savepoint((tx) => fn(tx as unknown as Sql)) as unknown as Promise<T>;
  }
  return sql.begin((tx) => fn(tx as unknown as Sql)) as unknown as Promise<T>;
}
