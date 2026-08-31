import type * as SQLite from 'expo-sqlite';
import { openTestDb, seedGroupAndMe } from './dbHarness';
import { insertTxnRows, getTransactionsInRange } from '../db/queries/transactions';
import {
  convertToRecurring, pauseRecurring, resumeRecurring, endRecurring,
  materializeDueOccurrences,
} from '../db/queries/recurring';

/**
 * A rule's lifecycle is money, and every step of it has to reach the group.
 *
 * Two separate defects live here. **Nothing** in this file's write paths was
 * queued for sync — pause, resume, end and convert all wrote to `txn` without an
 * outbox row, so ending a shared "Maid ₹3,000/mo" stopped the bill on this phone
 * and nowhere else: the other member's device kept posting it every month, and
 * kept syncing the charge back, while this device's audit log recorded that the
 * rule had been ended.
 *
 * And `convertToRecurring` could delete the transaction it was converting. The
 * UPDATE turns the row into a rule, rules are excluded from every ledger read,
 * and the money only reappeared because the next materialize run happened to
 * recreate it at the same date — which `MATERIALIZE_HORIZON_MS` refuses to do for
 * anything older than ~3 months. Converting an imported statement row, which is
 * exactly what the Review suggestion offers, made it vanish.
 */

const DAY = 24 * 60 * 60 * 1000;
const ME = 'me';
const AMOUNT = 200_000;   // ₹2,000

async function freshDb() {
  const db = await openTestDb();
  await seedGroupAndMe(db);
  return db;
}

/** One committed expense, `ageDays` old. Not recurring yet. */
async function seedExpense(db: SQLite.SQLiteDatabase, ageDays: number, id = 'txn-1') {
  await insertTxnRows(db, {
    groupId: 'g',
    kind: 'expense',
    entryMode: 'quick',
    date: Date.now() - ageDays * DAY,
    category: 'Electricity',
    payments: [{ personId: ME, amount: AMOUNT }],
    shares: [{ personId: ME, amount: AMOUNT }],
  } as Parameters<typeof insertTxnRows>[1], id, Date.now());
  await db.runAsync('DELETE FROM sync_outbox');
}

const queued = async (db: SQLite.SQLiteDatabase) =>
  (await db.getAllAsync<{ entry_id: string }>('SELECT entry_id FROM sync_outbox')).map(r => r.entry_id);

/** Everything the ledger and every aggregate can see, in paise. */
async function ledgerTotal(db: SQLite.SQLiteDatabase): Promise<number> {
  const rows = await getTransactionsInRange(db, null, 0, Date.now() + DAY);
  return rows.reduce((sum, t) => sum + t.shares.reduce((s, r) => s + r.amount, 0), 0);
}

describe('convertToRecurring keeps the spend it converts', () => {
  it.each([[10, 'recent'], [200, 'older than the back-fill horizon']])(
    'a %s-day-old expense (%s) still counts after conversion',
    async (ageDays) => {
      const db = await freshDb();
      await seedExpense(db, ageDays as number);
      const before = await ledgerTotal(db);
      expect(before).toBe(AMOUNT);

      await convertToRecurring(db, 'txn-1', 'monthly', 1);

      // The rule itself is a template and correctly drops out of the ledger — so
      // if the occurrence were not written here, this would read ₹0.
      expect(await ledgerTotal(db)).toBe(AMOUNT);
    },
  );

  it('does not double-count when materialization runs afterwards', async () => {
    const db = await freshDb();
    await seedExpense(db, 10);
    await convertToRecurring(db, 'txn-1', 'monthly', 1);

    await materializeDueOccurrences(db);

    // One occurrence for the anchor date, whatever else the rule has since become
    // due for. The anchor's own date must be claimed exactly once.
    const anchors = await db.getAllAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM txn
        WHERE parent_recur_id = 'txn-1'
          AND recur_override_date = (SELECT date FROM txn WHERE id = 'txn-1')`,
    );
    expect(anchors[0].n).toBe(1);
  });

  it('queues both the rule and its first occurrence', async () => {
    const db = await freshDb();
    await seedExpense(db, 10);

    await convertToRecurring(db, 'txn-1', 'monthly', 1);

    // The rule changed shape and the occurrence is new; a peer holding the old
    // plain expense needs both.
    const ids = await queued(db);
    expect(ids).toContain('txn-1');
    expect(ids).toHaveLength(2);
  });
});

describe('pause, resume and end reach the group', () => {
  async function seedRule(db: SQLite.SQLiteDatabase) {
    await insertTxnRows(db, {
      groupId: 'g',
      kind: 'expense',
      entryMode: 'quick',
      date: Date.now() - 40 * DAY,
      category: 'Rent',
      recurFreq: 'monthly',
      recurInterval: 1,
      payments: [{ personId: ME, amount: AMOUNT }],
      shares: [{ personId: ME, amount: AMOUNT }],
    } as Parameters<typeof insertTxnRows>[1], 'rule', Date.now());
    await db.runAsync('DELETE FROM sync_outbox');
  }

  it.each([
    ['pause', pauseRecurring],
    ['end', endRecurring],
  ])('%s queues the rule', async (_label, fn) => {
    const db = await freshDb();
    await seedRule(db);
    await fn(db, 'rule');
    expect(await queued(db)).toEqual(['rule']);
  });

  it('resume queues the rule', async () => {
    const db = await freshDb();
    await seedRule(db);
    await pauseRecurring(db, 'rule');
    await db.runAsync('DELETE FROM sync_outbox');

    await resumeRecurring(db, 'rule');
    expect(await queued(db)).toEqual(['rule']);
  });
});

describe('only the rule author posts its occurrences', () => {
  it('skips a rule that arrived from a peer', async () => {
    const db = await freshDb();
    await db.runAsync(
      `INSERT INTO person (id,name,avatar_color,is_me) VALUES ('aarav','Aarav','#222222',0)`,
    );
    await db.runAsync(`INSERT INTO group_member (group_id, person_id, joined_at, role)
                       VALUES ('g','aarav',0,'member')`);
    await insertTxnRows(db, {
      groupId: 'g',
      kind: 'expense',
      entryMode: 'quick',
      date: Date.now() - 40 * DAY,
      category: 'Rent',
      recurFreq: 'monthly',
      recurInterval: 1,
      payments: [{ personId: 'aarav', amount: AMOUNT }],
      shares: [{ personId: ME, amount: AMOUNT }],
    } as Parameters<typeof insertTxnRows>[1], 'their-rule', Date.now());
    // What ingestPeerTxn writes: authored by them.
    await db.runAsync("UPDATE txn SET author_person_id = 'aarav' WHERE id = 'their-rule'");

    // Their device posts this month; mine must not post a second copy of it.
    expect(await materializeDueOccurrences(db)).toBe(0);
  });

  it('still posts a rule I wrote myself', async () => {
    const db = await freshDb();
    await insertTxnRows(db, {
      groupId: 'g',
      kind: 'expense',
      entryMode: 'quick',
      date: Date.now() - 40 * DAY,
      category: 'Rent',
      recurFreq: 'monthly',
      recurInterval: 1,
      payments: [{ personId: ME, amount: AMOUNT }],
      shares: [{ personId: ME, amount: AMOUNT }],
    } as Parameters<typeof insertTxnRows>[1], 'my-rule', Date.now());

    expect(await materializeDueOccurrences(db)).toBeGreaterThan(0);
  });
});
