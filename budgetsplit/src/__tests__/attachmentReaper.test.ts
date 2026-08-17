import { reapDeletedAttachments } from '../db/queries/transactions';
import { createTestDb, addPerson, addGroup, addMember, addTxn, type TestDb } from './helpers/testDb';
import type * as SQLite from 'expo-sqlite';

// softDeleteTxn never unlinks a transaction's receipt, and the only way back
// from a soft-delete is the ~5s Undo toast — so a row still `is_deleted=1`
// long after that is never coming back. This reaper is the cleanup: it reads
// and nulls `attachment_uri` for old soft-deleted rows and hands the URIs to
// the caller (this module does no file IO, same split as `deleteGroup`'s own
// orphaned-attachment cleanup).

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;
const DAY = 86400000;

function setup() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const group = addGroup(db, 'Personal', true);
  addMember(db, group, me);
  return { db, me, group };
}

/** `addTxn` has no attachment param — set it directly, matching a real receipt-attached row. */
function attach(db: TestDb, txnId: string, uri: string) {
  db.raw.prepare('UPDATE txn SET attachment_uri = ? WHERE id = ?').run(uri, txnId);
}

const attachmentOf = (db: TestDb, txnId: string) =>
  (db.raw.prepare('SELECT attachment_uri FROM txn WHERE id = ?').get(txnId) as any).attachment_uri;

describe('reapDeletedAttachments', () => {
  it('unlinks and nulls the receipt of a transaction deleted long ago', async () => {
    const { db, me, group } = setup();
    // `addTxn` stamps both created_at and updated_at from `date` — the
    // reaper's cutoff reads updated_at, so an old `date` is what ages this row.
    const txnId = addTxn(db, {
      groupId: group, kind: 'expense', date: Date.now() - 60 * DAY, category: 'Food',
      payments: [{ personId: me, amount: 1000 }], isDeleted: true,
    });
    attach(db, txnId, 'file:///attachments/old-receipt.jpg');

    const reaped = await reapDeletedAttachments(asDb(db), 30 * DAY);

    expect(reaped).toEqual(['file:///attachments/old-receipt.jpg']);
    expect(attachmentOf(db, txnId)).toBeNull();
  });

  it('leaves a recently-deleted transaction alone (still inside the Undo-adjacent window)', async () => {
    const { db, me, group } = setup();
    const txnId = addTxn(db, {
      groupId: group, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: 1000 }], isDeleted: true,
    });
    attach(db, txnId, 'file:///attachments/recent-receipt.jpg');

    const reaped = await reapDeletedAttachments(asDb(db), 30 * DAY);

    expect(reaped).toEqual([]);
    expect(attachmentOf(db, txnId)).toBe('file:///attachments/recent-receipt.jpg');
  });

  it('never touches a transaction that is not deleted, however old', async () => {
    const { db, me, group } = setup();
    const txnId = addTxn(db, {
      groupId: group, kind: 'expense', date: Date.now() - 100 * DAY, category: 'Food',
      payments: [{ personId: me, amount: 1000 }],
    });
    attach(db, txnId, 'file:///attachments/live-receipt.jpg');

    const reaped = await reapDeletedAttachments(asDb(db), 30 * DAY);

    expect(reaped).toEqual([]);
    expect(attachmentOf(db, txnId)).toBe('file:///attachments/live-receipt.jpg');
  });

  it('ignores an old deleted transaction with no attachment', async () => {
    const { db, me, group } = setup();
    addTxn(db, {
      groupId: group, kind: 'expense', date: Date.now() - 60 * DAY, category: 'Food',
      payments: [{ personId: me, amount: 1000 }], isDeleted: true,
    });

    const reaped = await reapDeletedAttachments(asDb(db), 30 * DAY);

    expect(reaped).toEqual([]);
  });

  it('reaps more than one row in a single pass', async () => {
    const { db, me, group } = setup();
    const a = addTxn(db, { groupId: group, kind: 'expense', date: Date.now() - 60 * DAY, category: 'Food', payments: [{ personId: me, amount: 500 }], isDeleted: true });
    const b = addTxn(db, { groupId: group, kind: 'expense', date: Date.now() - 90 * DAY, category: 'Food', payments: [{ personId: me, amount: 500 }], isDeleted: true });
    attach(db, a, 'file:///a.jpg');
    attach(db, b, 'file:///b.jpg');

    const reaped = await reapDeletedAttachments(asDb(db), 30 * DAY);

    expect(new Set(reaped)).toEqual(new Set(['file:///a.jpg', 'file:///b.jpg']));
  });
});
