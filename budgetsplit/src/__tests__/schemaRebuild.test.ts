import * as SQLite from 'expo-sqlite';
import { rebuildTable } from '../db/schema';

/**
 * What a failed table rebuild must leave behind: nothing.
 *
 * Every one-time rebuild in `openDB` is the same shape — build `X_new`, copy,
 * drop `X`, rename — and each was one `execAsync` carrying its own
 * `BEGIN TRANSACTION` / `COMMIT` with **no `ROLLBACK`**, under a bare `catch`
 * whose comment claimed the original table was left intact.
 *
 * It was not. `execAsync` stops at the first failing statement, so a failure
 * part-way left an open transaction on the connection *and* a half-built
 * `X_new` in `sqlite_master`, and the catch hid both. That does not degrade, it
 * compounds: every later `BEGIN` on that connection fails with "cannot start a
 * transaction within a transaction", taking out the remaining rebuilds, the
 * one-time fixes and the root layout's startup writes — and the *next* launch
 * re-fires the same rebuild, which now dies on "table X_new already exists",
 * permanently, on data that was never damaged.
 *
 * These three tests are the three properties that make that impossible.
 */

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('test');
  await db.execAsync(`
    CREATE TABLE thing (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO thing (id, name) VALUES ('a', 'Aarav'), ('b', 'Priya');
  `);
  return db;
}

const GOOD = `
  CREATE TABLE thing_new (id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT);
  INSERT INTO thing_new (id, name) SELECT id, name FROM thing;
  DROP TABLE thing;
  ALTER TABLE thing_new RENAME TO thing;
`;

/** Fails at the copy: `nope` is not a column. The scratch table already exists by then. */
const FAILING = `
  CREATE TABLE thing_new (id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT);
  INSERT INTO thing_new (id, name) SELECT id, nope FROM thing;
  DROP TABLE thing;
  ALTER TABLE thing_new RENAME TO thing;
`;

const tables = async (db: SQLite.SQLiteDatabase) =>
  (await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  )).map(r => r.name);

describe('rebuildTable', () => {
  it('rebuilds the table and keeps every row', async () => {
    const db = await open();
    await rebuildTable(db, 'thing_new', GOOD);

    expect(await tables(db)).toEqual(['thing']);
    const rows = await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM thing ORDER BY id');
    expect(rows).toEqual([{ id: 'a', name: 'Aarav' }, { id: 'b', name: 'Priya' }]);
  });

  it('rolls back a failure completely: original intact, no scratch table left', async () => {
    const db = await open();

    await expect(rebuildTable(db, 'thing_new', FAILING)).rejects.toThrow();

    // The claim the old bare `catch` made, now actually true.
    expect(await tables(db)).toEqual(['thing']);
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM thing ORDER BY id');
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('leaves no open transaction, so the next write still works', async () => {
    const db = await open();
    await expect(rebuildTable(db, 'thing_new', FAILING)).rejects.toThrow();

    // This is the assertion that matters most. Under the old code the connection
    // was still inside a BEGIN here, so this threw "cannot start a transaction
    // within a transaction" — and so did every startup step after it.
    await expect(
      db.withTransactionAsync(async () => {
        await db.runAsync("INSERT INTO thing (id, name) VALUES ('c', 'Rohan')");
      }),
    ).resolves.toBeUndefined();

    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM thing ORDER BY id');
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('recovers when a previous attempt left its scratch table behind', async () => {
    const db = await open();
    // Simulate a database already poisoned by the old code path.
    await db.execAsync('CREATE TABLE thing_new (id TEXT PRIMARY KEY, junk TEXT);');

    await rebuildTable(db, 'thing_new', GOOD);

    expect(await tables(db)).toEqual(['thing']);
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM thing ORDER BY id');
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});
