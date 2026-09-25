import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cloudflare D1's Worker API, over an in-process `node:sqlite` database, loaded
 * from the REAL `server/api/migrations` — never a hand-written subset.
 *
 * Only what the Worker calls is implemented, and each part fails the way D1 does:
 *   * foreign keys ON (D1's default; the app's own SQLite runs with them OFF);
 *   * `batch()` is one transaction — any failing statement rolls back all of them;
 *   * `first()` answers null for no row, `first(col)` answers one column.
 */

export const MIGRATIONS_DIR = join(__dirname, '../../../../../server/api/migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
}

type Meta = { changes: number; last_row_id: number };
export type D1Result<T = Record<string, unknown>> = { results: T[]; success: true; meta: Meta };

export type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<never>>;
  /** Harness-only: executes synchronously so `batch` can hold one transaction. */
  exec(): D1Result;
};

export type TestD1 = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
  exec(sql: string): Promise<void>;
  raw: DatabaseSync;
};

/** D1 binds `undefined` as an error; the app passes optional fields that way, so match D1. */
function checkBinds(values: unknown[]): unknown[] {
  values.forEach((v, i) => {
    if (v === undefined) throw new Error(`D1_TYPE_ERROR: undefined bound at position ${i + 1}`);
  });
  return values.map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
}

/** Does the statement hand rows back? SELECT, WITH, PRAGMA, or anything with RETURNING. */
function returnsRows(stmt: StatementSync, sql: string): boolean {
  const cols = (stmt as unknown as { columns?: () => unknown[] }).columns;
  if (typeof cols === 'function') return cols.call(stmt).length > 0;
  return /^\s*(SELECT|WITH|PRAGMA)\b|\bRETURNING\b/i.test(sql);
}

export function createD1(options: { migrations?: 'all' | 'none' | string[] } = {}): TestD1 {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  const which = options.migrations ?? 'all';
  const files = which === 'all' ? migrationFiles() : which === 'none' ? [] : which;
  for (const f of files) db.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));

  const statement = (sql: string, values: unknown[] = []): D1Statement => {
    const stmt = db.prepare(sql);
    const exec = (): D1Result => {
      const binds = checkBinds(values) as never[];
      if (returnsRows(stmt, sql)) {
        const results = stmt.all(...binds) as Record<string, unknown>[];
        return { results, success: true, meta: { changes: 0, last_row_id: 0 } };
      }
      const r = stmt.run(...binds);
      return {
        results: [], success: true,
        meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
      };
    };
    return {
      bind: (...next) => statement(sql, next),
      exec,
      async first<T>(column?: string) {
        const row = exec().results[0] as Record<string, unknown> | undefined;
        if (!row) return null;
        // node:sqlite rows have a null prototype; spread them into ordinary objects.
        return (column ? row[column] : { ...row }) as T;
      },
      async all<T>() {
        const r = exec();
        return { ...r, results: r.results.map(row => ({ ...row })) as T[] };
      },
      async run() {
        const r = exec();
        return { ...r, results: [] as never[] };
      },
    };
  };

  return {
    prepare: sql => statement(sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = statements.map(s => {
          const r = s.exec();
          return { ...r, results: r.results.map(row => ({ ...row })) };
        });
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) {
      db.exec(sql);
    },
    raw: db,
  };
}
