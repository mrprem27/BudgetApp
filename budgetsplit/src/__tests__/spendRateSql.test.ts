import { DatabaseSync } from 'node:sqlite';
import { DAILY_SPEND_SQL, bucketsFromDailyRows, type DailySpendRow } from '../db/queries/spendRateQuery';
import { dailySpendTotals, typicalDailySpend } from '../lib/safeToSpend';

// Proves the SQL-aggregated everyday-spend path (getSafeToSpend → DAILY_SPEND_SQL
// → bucketsFromDailyRows) produces exactly the same per-day buckets as the JS
// reducer dailySpendTotals() over the same data. Runs against a real in-process
// SQLite (node:sqlite), so it exercises the actual SQL.
//
// This parity matters more than usual: the SQL is what ships, the JS reducer is
// the readable statement of the rule, and the rule ("recurring rows belong to
// upcomingBills, not here") is the one that stops every bill in the app being
// subtracted twice.

const ME = 'me';
const OTHER = 'aarav';
const DAY = 86_400_000;
const FROM = 1_700_000_000_000;
const TO = FROM + 90 * DAY;

type Split = { person: string; amount: number };
type Fixture = {
  id: string;
  kind: string;
  is_deleted?: 0 | 1;
  recur_freq?: string | null;
  parent_recur_id?: string | null;
  date: number;
  shares: Split[];
};

function makeDb(fixtures: Fixture[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE txn (
      id TEXT PRIMARY KEY, group_id TEXT, kind TEXT, is_deleted INTEGER,
      recur_freq TEXT, parent_recur_id TEXT, date INTEGER
    );
    CREATE TABLE txn_share (txn_id TEXT, person_id TEXT, amount INTEGER, PRIMARY KEY (txn_id, person_id));
  `);
  const insTxn = db.prepare('INSERT INTO txn (id, group_id, kind, is_deleted, recur_freq, parent_recur_id, date) VALUES (?,?,?,?,?,?,?)');
  const insShare = db.prepare('INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?,?,?)');
  for (const f of fixtures) {
    insTxn.run(f.id, 'g1', f.kind, f.is_deleted ?? 0, f.recur_freq ?? null, f.parent_recur_id ?? null, f.date);
    for (const s of f.shares) insShare.run(f.id, s.person, s.amount);
  }
  return db;
}

/** The SQL path, end to end. */
function viaSql(fixtures: Fixture[]): number[] {
  const db = makeDb(fixtures);
  const rows = db.prepare(DAILY_SPEND_SQL).all(FROM, ME, FROM, TO) as unknown as DailySpendRow[];
  db.close();
  return bucketsFromDailyRows(rows, FROM, TO);
}

/** The JS path, over the same fixtures. */
function viaJs(fixtures: Fixture[]): number[] {
  const txns = fixtures.map(f => ({
    kind: f.kind,
    is_deleted: f.is_deleted ?? 0,
    recur_freq: f.recur_freq ?? null,
    parent_recur_id: f.parent_recur_id ?? null,
    date: f.date,
    shares: f.shares,
  }));
  return dailySpendTotals(
    txns,
    t => t.shares.filter(s => s.person === ME).reduce((sum, s) => sum + s.amount, 0),
    FROM,
    TO,
  );
}

const expense = (id: string, dayOffset: number, mine: number, over: Partial<Fixture> = {}): Fixture => ({
  id, kind: 'expense', date: FROM + dayOffset * DAY, shares: [{ person: ME, amount: mine }], ...over,
});

/**
 * Both paths must agree, and must agree on the specific buckets.
 *
 * `expected` is the run from the first spend to the last, not the whole array:
 * history ends at *now*, so a spend on day 12 of a 90-day window is followed by
 * ~77 genuinely quiet days. Those zeros are real data — the horizon has quiet
 * days in it too, and trimming them would overestimate the rate — so they are
 * asserted as zeros rather than written out.
 */
function expectParity(fixtures: Fixture[], expected: number[]) {
  const sql = viaSql(fixtures);
  expect(sql).toEqual(viaJs(fixtures));
  expect(sql.slice(0, expected.length)).toEqual(expected);
  expect(sql.slice(expected.length).every(n => n === 0)).toBe(true);
}

describe('DAILY_SPEND_SQL matches dailySpendTotals', () => {
  it('buckets one spend per day', () => {
    expectParity(
      [expense('a', 10, 40000), expense('b', 11, 50000), expense('c', 12, 30000)],
      [40000, 50000, 30000],
    );
  });

  it('sums several spends on the same day', () => {
    expectParity([expense('a', 10, 40000), expense('b', 10, 15000)], [55000]);
  });

  it('keeps quiet days between spends as zeros', () => {
    expectParity([expense('a', 10, 40000), expense('b', 13, 20000)], [40000, 0, 0, 20000]);
  });

  it('excludes a recurring rule template', () => {
    expectParity(
      [expense('a', 10, 40000), expense('rule', 11, 99999, { recur_freq: 'monthly' })],
      [40000],
    );
  });

  it('excludes a materialized recurring occurrence — upcomingBills owns it', () => {
    expectParity(
      [expense('a', 10, 40000), expense('occ', 11, 99999, { parent_recur_id: 'rule-1' })],
      [40000],
    );
  });

  it('excludes income, settlements and deleted rows', () => {
    expectParity(
      [
        expense('a', 10, 40000),
        expense('inc', 11, 99999, { kind: 'income' }),
        expense('set', 11, 99999, { kind: 'settlement' }),
        expense('del', 11, 99999, { is_deleted: 1 }),
      ],
      [40000],
    );
  });

  it('counts only my share of a split expense', () => {
    expectParity(
      [{ id: 'a', kind: 'expense', date: FROM + 10 * DAY, shares: [{ person: ME, amount: 30000 }, { person: OTHER, amount: 70000 }] }],
      [30000],
    );
  });

  it('ignores a row where my share is zero', () => {
    expectParity(
      [
        expense('a', 10, 40000),
        { id: 'b', kind: 'expense', date: FROM + 11 * DAY, shares: [{ person: OTHER, amount: 70000 }] },
      ],
      [40000],
    );
  });

  it('agrees that no qualifying history means no buckets at all', () => {
    expectParity([], []);
    expectParity([expense('inc', 10, 40000, { kind: 'income' })], []);
  });

  it('measures days of history, not days of window', () => {
    // The window is 90 days; the first spend is on day 80. Ten buckets, not
    // ninety — otherwise the rate is diluted across 80 days that never existed.
    const fixtures = [expense('a', 80, 40000), expense('b', 89, 40000)];
    expect(viaSql(fixtures)).toEqual(viaJs(fixtures));
    expect(viaSql(fixtures)).toHaveLength(10);
  });
});

describe('the rate the two paths feed', () => {
  /** Spend every day of the window, so the estimate isn't diluted by a tail of
   *  genuinely quiet days — this test is about the outlier, nothing else. */
  const everyDay = Array.from({ length: 90 }, (_, i) => expense(`d${i}`, i, 40000));

  it('is identical through typicalDailySpend', () => {
    expect(typicalDailySpend(viaSql(everyDay))).toBe(typicalDailySpend(viaJs(everyDay)));
    expect(typicalDailySpend(viaSql(everyDay))).toBe(40000);
  });

  it('is unmoved by one extraordinary day, through the SQL path too', () => {
    const withHospitalBill = [...everyDay, expense('hospital', 30, 4_000_000)]; // ₹40,000 in a day
    const sql = typicalDailySpend(viaSql(withHospitalBill));
    expect(sql).toBe(typicalDailySpend(viaJs(withHospitalBill)));
    expect(sql).toBe(40000);
    // A plain mean over the same buckets would have moved by ~₹444/day.
    const buckets = viaSql(withHospitalBill);
    const mean = buckets.reduce((s, n) => s + n, 0) / buckets.length;
    expect(mean).toBeGreaterThan(44000);
  });
});
