/**
 * A throwaway, in-memory database for the engine dev screen (`app/dev/engine.tsx`,
 * `EN2`) — never the app's own `budgetsplit.db`. Each persona gets its own,
 * built the same way `openDB` builds the real one (schema + column migrations),
 * so `enginePersonas.ts`'s real write paths work against it unmodified.
 *
 * `useNewConnection: true` is load-bearing: without it, expo-sqlite's connection
 * cache would hand back the SAME `:memory:` database for every persona, and the
 * five would silently share one ledger.
 */
import * as SQLite from 'expo-sqlite';
import { SCHEMA, COLUMN_MIGRATIONS, INDEXES, applyConnectionPragmas } from './schema';

export async function openScratchDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(':memory:', { useNewConnection: true } as SQLite.SQLiteOpenOptions);
  await applyConnectionPragmas(db);
  await db.execAsync(SCHEMA);
  for (const sql of COLUMN_MIGRATIONS) {
    try { await db.execAsync(sql); } catch { /* column already exists — same tolerance as openDB */ }
  }
  await db.execAsync(INDEXES);
  return db;
}
