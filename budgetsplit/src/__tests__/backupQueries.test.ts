jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import type * as SQLite from 'expo-sqlite';
import { createTestDb, addPerson, addGroup, addMember, addSimpleExpense, addCategory, type TestDb } from './helpers/testDb';
import { File, Directory, Paths } from 'expo-file-system';
import { readAllTables, restoreAllTables, reapUnreferencedPhotos } from '../db/queries/backup';
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

  /**
   * The outbox is deliberately NOT backed up — it is a delivery queue, not user
   * data — but it must still be cleared, and that half was missing.
   *
   * `sync_outbox.entry_id REFERENCES txn(id)`, and a restore deletes every txn.
   * Left behind, every row points at an id that no longer exists: the Sync screen
   * counts changes "waiting to go up" that cannot be read, and the drain walks
   * rows whose entries are gone. It is also the one table `restoreAllTables` never
   * touched, so nothing else would have caught it.
   */
  it('clears the sync outbox, so no queued row survives pointing at a deleted txn', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const group = addGroup(db, 'Roommates');
    addMember(db, group, me);
    addCategory(db, 'Groceries');
    const txnId = addSimpleExpense(db, {
      groupId: group, personId: me, amount: 50000, date: Date.now(), category: 'Groceries',
    });
    await db.runAsync(
      'INSERT INTO sync_outbox (entry_id, group_id, queued_at) VALUES (?, ?, ?)',
      [txnId, group, Date.now()],
    );

    await restoreAllTables(asDb(db), emptyTables());

    const left = await db.getAllAsync('SELECT * FROM sync_outbox');
    expect(left).toHaveLength(0);
  });

  /**
   * OFF, not ON — this used to assert ON, which was the bug.
   *
   * `applyConnectionPragmas` sets FK OFF on EVERY connection, deliberately and
   * temporarily, because several delete paths still orphan rows the constraints
   * would refuse. Restore runs on the shared provider connection every screen
   * writes through, so turning FKs back ON in its `finally` left that connection
   * enforcing them for the rest of the session: `deleteGroup` started throwing
   * `FOREIGN KEY constraint failed` on a device where it had always worked.
   *
   * That is the same-code-two-behaviours bug the pragma work exists to kill,
   * reintroduced from inside it — and a test asserting ON was holding it in place.
   */
  it('leaves foreign_keys OFF after restoring, matching every other connection', async () => {
    const db = createTestDb();
    await restoreAllTables(asDb(db), emptyTables());

    const pragma = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(pragma?.foreign_keys).toBe(0);
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

/**
 * Files on disk that nothing points at any more.
 *
 * The ordinary reaper is ROW-driven: it finds soft-deleted transactions and
 * unlinks their receipts. A restore hard-deletes every old row, so the previous
 * install's photos end up with no row at all — invisible to that reaper forever,
 * and still counted on the storage screen. This one goes the other way: list what
 * is on disk, subtract what the database names, delete the rest.
 */
describe('reapUnreferencedPhotos', () => {
  it('keeps a file a row still points at, and removes one nothing does', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const group = addGroup(db, 'Flat');
    addMember(db, group, me);
    addCategory(db, 'Food');
    const kept = addSimpleExpense(db, {
      groupId: group, personId: me, amount: 100, date: Date.now(), category: 'Food',
    });
    await db.runAsync('UPDATE txn SET attachment_uri = ? WHERE id = ?',
      ['file:///doc/attachments/keep.jpg', kept]);

    const dir = new Directory(Paths.document, 'attachments');
    dir.create({ intermediates: true, idempotent: true });
    for (const name of ['keep.jpg', 'orphan.jpg']) {
      const f = new File(dir, name);
      f.create({ overwrite: true });
      f.write('x');
    }

    const removed = await reapUnreferencedPhotos(asDb(db));
    expect(removed).toBe(1);
    expect(new File(dir, 'keep.jpg').exists).toBe(true);
    expect(new File(dir, 'orphan.jpg').exists).toBe(false);
  });

  /**
   * A receipt on a PENDING entry must survive. Its row exists and the entry is one
   * approval away from counting — deleting the photo because the entry is not
   * mine yet would destroy it exactly when it is about to be needed. This is why
   * the query is on the approval invariant's allowlist rather than carrying the
   * usual filter.
   */
  it('keeps the receipt of an entry that is still awaiting approval', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const group = addGroup(db, 'Flat');
    addMember(db, group, me);
    addCategory(db, 'Food');
    const pending = addSimpleExpense(db, {
      groupId: group, personId: me, amount: 100, date: Date.now(), category: 'Food',
    });
    await db.runAsync('UPDATE txn SET attachment_uri = ? WHERE id = ?',
      ['file:///doc/attachments/pending.jpg', pending]);
    await db.runAsync(
      `INSERT INTO txn_approval (txn_id, state, created_at) VALUES (?, 'pending', ?)`,
      [pending, Date.now()],
    );

    const dir = new Directory(Paths.document, 'attachments');
    dir.create({ intermediates: true, idempotent: true });
    const f = new File(dir, 'pending.jpg');
    f.create({ overwrite: true });
    f.write('x');

    await reapUnreferencedPhotos(asDb(db));
    expect(f.exists).toBe(true);
  });
});
