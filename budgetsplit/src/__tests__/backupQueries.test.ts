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
