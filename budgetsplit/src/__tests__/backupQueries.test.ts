jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import type * as SQLite from 'expo-sqlite';
import { createTestDb, addPerson, addGroup, addMember, addSimpleExpense, addCategory, type TestDb } from './helpers/testDb';
import { readAllTables, restoreAllTables } from '../db/queries/backup';
import { BACKUP_TABLES, type BackupTables } from '../lib/backup';

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;

function emptyTables(): BackupTables {
  const t = {} as BackupTables;
  for (const name of BACKUP_TABLES) t[name] = [];
  return t;
}

describe('readAllTables / restoreAllTables', () => {
  it('reads every backed-up table, including empty ones, as arrays', async () => {
    const db = createTestDb();
    const tables = await readAllTables(asDb(db));
    for (const name of BACKUP_TABLES) {
      expect(Array.isArray(tables[name])).toBe(true);
    }
  });

  it('round-trips real rows through a snapshot and a full restore', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const friend = addPerson(db, 'Friend');
    const group = addGroup(db, 'Roommates');
    addMember(db, group, me);
    addMember(db, group, friend);
    addCategory(db, 'Groceries');
    addSimpleExpense(db, { groupId: group, personId: me, amount: 50000, date: Date.now(), category: 'Groceries' });

    const snapshot = await readAllTables(asDb(db));
    expect(snapshot.person).toHaveLength(2);
    expect(snapshot.txn).toHaveLength(1);

    // Mutate the DB after the snapshot — restore must undo this, not merge with it.
    addPerson(db, 'Added after snapshot');
    const afterMutation = await db.getAllAsync<{ id: string }>('SELECT id FROM person');
    expect(afterMutation).toHaveLength(3);

    await restoreAllTables(asDb(db), snapshot);

    const restored = await readAllTables(asDb(db));
    expect(restored.person).toHaveLength(2);
    expect(restored.person.map(p => p.name as string).sort()).toEqual(['Friend', 'Me']);
    expect(restored.txn).toHaveLength(1);
    expect(restored.group_member).toHaveLength(2);

    // The post-snapshot addition must be gone — whole-replace, not a merge.
    const finalPersons = await db.getAllAsync<{ name: string }>('SELECT name FROM person');
    expect(finalPersons.map(p => p.name)).not.toContain('Added after snapshot');
  });

  it('restores an empty backup to a genuinely empty database (minus the re-seeded global catalog)', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    addGroup(db, 'Some group');

    await restoreAllTables(asDb(db), emptyTables());

    const persons = await db.getAllAsync('SELECT * FROM person');
    const groups = await db.getAllAsync('SELECT * FROM budget_group');
    expect(persons).toHaveLength(0);
    expect(groups).toHaveLength(0);
  });

  it('leaves foreign_keys back ON after restoring, even though it was toggled off mid-operation', async () => {
    const db = createTestDb();
    await restoreAllTables(asDb(db), emptyTables());

    const pragma = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(pragma?.foreign_keys).toBe(1);
  });
});

/**
 * Restore is the one feature whose whole purpose is a NEW device — and both of
 * these bugs looked fine on the old one, which is why neither was noticed.
 */
describe('restore preserves decisions, not just rows', () => {
  it('keeps a deleted category deleted', async () => {
    // `restoreAllTables` re-seeds the default catalog afterwards, and the seeder
    // skips a default only when a tombstone says the user deleted it. With
    // `category_tombstone` outside BACKUP_TABLES the tombstones never travelled,
    // so on a fresh phone every deleted default came back — and came back WITHOUT
    // its budget, because `category_budget` rows really were deleted.
    const source = createTestDb();
    addCategory(source, 'Groceries');
    await source.runAsync("DELETE FROM category WHERE name = 'Groceries'");
    await source.runAsync(
      "INSERT INTO category_tombstone (name, kind, created_at) VALUES ('Groceries', 'expense', 1)",
    );
    const snapshot = await readAllTables(asDb(source));

    const fresh = createTestDb();
    await restoreAllTables(asDb(fresh), snapshot);

    const back = await fresh.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM category WHERE name = 'Groceries'",
    );
    expect(back?.n).toBe(0);
  });

  it('does not carry this device\'s migration markers into the backup', async () => {
    // The direction the checklist names: a marker arriving on a device that never
    // ran the fix would mark it done and skip it forever.
    const source = createTestDb();
    await source.runAsync("INSERT INTO settings (key, value) VALUES ('fix_income_category_kind_v1', '1')");
    await source.runAsync("INSERT INTO settings (key, value) VALUES ('money.opening_cash', '250000')");
    const snapshot = await readAllTables(asDb(source));

    const fresh = createTestDb();
    await restoreAllTables(asDb(fresh), snapshot);

    const marker = await fresh.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'fix_income_category_kind_v1'",
    );
    expect(marker).toBeNull();
    // ...while real user data in the same table survives. `money.*` is opening
    // cash and the card baseline — dropping it would silently reset net worth.
    const cash = await fresh.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'money.opening_cash'",
    );
    expect(cash?.value).toBe('250000');
  });

  it('does not un-mark a fix this device has already run', async () => {
    // The worse, undocumented direction. Restore is DELETE-then-INSERT, so a
    // marker present here but absent from an older snapshot was being wiped — and
    // then `fix_income_category_kind_v1` re-runs, trips UNIQUE(name, kind), and
    // takes the app to "Couldn't start BudgetSplit" on every launch.
    const source = createTestDb();
    const snapshot = await readAllTables(asDb(source));   // older backup, no marker

    const device = createTestDb();
    await device.runAsync("INSERT INTO settings (key, value) VALUES ('fix_income_category_kind_v1', '1')");
    await restoreAllTables(asDb(device), snapshot);

    const marker = await device.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'fix_income_category_kind_v1'",
    );
    expect(marker?.value).toBe('1');
  });
});
