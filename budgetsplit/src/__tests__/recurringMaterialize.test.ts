import type * as SQLite from 'expo-sqlite';
import { openTestDb, seedGroupAndMe } from './dbHarness';
import { insertTxnRows } from '../db/queries/transactions';
import { materializeDueOccurrences } from '../db/queries/recurring';

// The first test to run a real query module against the REAL schema, using the in-memory
// `expo-sqlite` mock. Everything here was previously unreachable: the module imported an
// empty stub, so no assertion about it could ever fail.

const ME = 'me';
const DAY = 24 * 60 * 60 * 1000;

async function freshDb() {
  const db = await openTestDb();
  await seedGroupAndMe(db);
  return db;
}

/** A monthly rule that first occurred 40 days ago, so one occurrence is due. */
async function seedRule(db: SQLite.SQLiteDatabase, extra: Record<string, unknown> = {}) {
  const start = Date.now() - 40 * DAY;
  await insertTxnRows(db, {
    groupId: 'g',
    kind: 'expense',
    entryMode: 'quick',
    date: start,
    category: 'Rent',
    note: 'Card bill',
    payMethod: 'card',
    recurFreq: 'monthly',
    recurInterval: 1,
    payments: [{ personId: ME, amount: 120_000 }],
    shares: [{ personId: ME, amount: 120_000 }],
    ...extra,
  } as Parameters<typeof insertTxnRows>[1], 'rule', Date.now());
}

describe('materializeDueOccurrences', () => {
  it('carries pay_method onto the occurrence it creates', async () => {
    // `pay_method` is the axis `cash.ts` splits on. Dropping it books a recurring CARD bill
    // as cash out instead of debt — understating available cash and creditUsed by the same
    // amount, every month, compounding. Invisible to the SQL/TS parity test because both
    // sides read the same corrupted row.
    const db = await freshDb();
    await seedRule(db);

    const created = await materializeDueOccurrences(db);
    expect(created).toBeGreaterThan(0);

    const occ = await db.getFirstAsync<{ pay_method: string | null }>(
      `SELECT pay_method FROM txn WHERE parent_recur_id = 'rule'`,
    );
    expect(occ?.pay_method).toBe('card');
  });

  it('copies every column the canonical insert writes', async () => {
    // Asserting on the COLUMN SET, not on one field: the bug was a hand-maintained column
    // list in a second INSERT drifting from the first. Naming them individually would only
    // catch the columns someone already thought of.
    const db = await freshDb();
    await seedRule(db);
    await materializeDueOccurrences(db);

    const carried = [
      'group_id', 'kind', 'entry_mode', 'category', 'note', 'tags',
      'pay_method', 'currency', 'source', 'tz', 'lat', 'lng', 'place_label',
    ];
    const rule = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT ${carried.join(',')} FROM txn WHERE id = 'rule'`,
    );
    const occ = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT ${carried.join(',')} FROM txn WHERE parent_recur_id = 'rule'`,
    );
    expect(occ).toEqual(rule);
  });

  it('does not re-create an occurrence it already claimed', async () => {
    const db = await freshDb();
    await seedRule(db);
    const first = await materializeDueOccurrences(db);
    const second = await materializeDueOccurrences(db);
    expect(second).toBe(0);
    const { c } = (await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM txn WHERE parent_recur_id = 'rule'`,
    ))!;
    expect(c).toBe(first);
  });
});
