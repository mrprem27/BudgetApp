import type * as SQLite from 'expo-sqlite';
import { openTestDb, seedGroupAndMe } from './dbHarness';
import { insertTxnRows } from '../db/queries/transactions';
import { materializeDueOccurrences, pauseRecurring, resumeRecurring } from '../db/queries/recurring';

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

/**
 * Pause/resume. Both halves were wrong in a way that only shows up with time:
 * pause overwrote the user's `recur_end` and resume nulled it, and the dormant
 * window was back-posted in one burst on the next foreground.
 */
describe('pause / resume', () => {
  /** A daily rule that started 90 days ago and is set to end 30 days from now. */
  async function seedDaily(db: SQLite.SQLiteDatabase) {
    const userEnd = Date.now() + 30 * DAY;
    await insertTxnRows(db, {
      groupId: 'g', kind: 'expense', entryMode: 'quick',
      date: Date.now() - 90 * DAY, category: 'Rent', note: 'Chai',
      recurFreq: 'daily', recurInterval: 1, recurEnd: userEnd,
      payments: [{ personId: ME, amount: 30_000 }],
      shares: [{ personId: ME, amount: 30_000 }],
    } as Parameters<typeof insertTxnRows>[1], 'daily', Date.now());
    return userEnd;
  }

  it('pause preserves the end date the user set', async () => {
    const db = await freshDb();
    const userEnd = await seedDaily(db);
    await pauseRecurring(db, 'daily');
    const row = await db.getFirstAsync<any>('SELECT * FROM txn WHERE id=?', ['daily']);
    expect(row.recur_end).toBe(userEnd);
    expect(row.recur_state).toBe('paused');
  });

  it('resume restores neither NULL nor "now" — it leaves the end date alone', async () => {
    const db = await freshDb();
    const userEnd = await seedDaily(db);
    await pauseRecurring(db, 'daily');
    await resumeRecurring(db, 'daily');
    const row = await db.getFirstAsync<any>('SELECT * FROM txn WHERE id=?', ['daily']);
    // Pre-fix this was NULL, i.e. "recurs forever".
    expect(row.recur_end).toBe(userEnd);
    expect(row.recur_state).toBe('active');
  });

  it('resume does not back-post the dormant gap', async () => {
    const db = await freshDb();
    await seedDaily(db);
    await materializeDueOccurrences(db); // claim what is due up to today
    const before = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) n FROM txn WHERE parent_recur_id=?', ['daily']);

    await pauseRecurring(db, 'daily');
    // Backdate the pause 60 days to simulate a long dormancy without faking time.
    await db.runAsync('UPDATE txn SET recur_paused_at=? WHERE id=?', [Date.now() - 60 * DAY, 'daily']);
    await resumeRecurring(db, 'daily');
    await materializeDueOccurrences(db);

    const after = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) n FROM txn WHERE parent_recur_id=?', ['daily']);
    // Pre-fix: ~60 rows and ₹18,000 the user never spent.
    expect(after!.n).toBe(before!.n);
  });

  it('records the gap as skips, so a later run cannot resurrect it', async () => {
    const db = await freshDb();
    await seedDaily(db);
    await pauseRecurring(db, 'daily');
    await db.runAsync('UPDATE txn SET recur_paused_at=? WHERE id=?', [Date.now() - 10 * DAY, 'daily']);
    await resumeRecurring(db, 'daily');
    const skips = await db.getAllAsync<{ occurrence_date: number }>(
      'SELECT occurrence_date FROM recur_skip WHERE series_id=?', ['daily']);
    expect(skips.length).toBeGreaterThanOrEqual(10);
    expect(await db.getFirstAsync<any>('SELECT recur_paused_at p FROM txn WHERE id=?', ['daily']))
      .toMatchObject({ p: null });
  });

  it('keeps generating after the resume, up to the user end date', async () => {
    const db = await freshDb();
    await seedDaily(db);
    await pauseRecurring(db, 'daily');
    await resumeRecurring(db, 'daily');
    const row = await db.getFirstAsync<any>('SELECT * FROM txn WHERE id=?', ['daily']);
    // Still a live rule with a finite horizon — not immortal, not dead.
    expect(row.recur_state).toBe('active');
    expect(row.recur_end).toBeGreaterThan(Date.now());
  });
});
