import {
  computeSafeToSpend, goalRemainingThisCycle, typicalDailySpend, dailySpendTotals,
  everydaySpendAhead, STS_HORIZON_DAYS, EVERYDAY_MIN_DAYS,
} from '../lib/safeToSpend';
import { getSafeToSpend } from '../db/queries/spendPower';
import { createTestDb, addPerson, addGroup, addMember, addTxn, type TestDb } from './helpers/testDb';
import type * as SQLite from 'expo-sqlite';

const asDb = (db: TestDb) => db as unknown as SQLite.SQLiteDatabase;
const DAY = 86_400_000;

const parts = (over: Partial<Parameters<typeof computeSafeToSpend>[0]> = {}) => ({
  available: 0, upcomingBills: 0, cardRepayment: 0, goalRemaining: 0, netIOwe: 0, everydaySpend: 0,
  ...over,
});

describe('computeSafeToSpend', () => {
  it('subtracts every claim from liquid cash', () => {
    const s = computeSafeToSpend(parts({
      available: 100000, upcomingBills: 30000, goalRemaining: 20000, netIOwe: 10000,
    }));
    expect(s.amount).toBe(40000);
  });

  it('subtracts the card balance — it never left cash, but the bill still will', () => {
    const withCard = computeSafeToSpend(parts({ available: 100000, cardRepayment: 30000 }));
    const without = computeSafeToSpend(parts({ available: 100000 }));
    expect(without.amount - withCard.amount).toBe(30000);
  });

  it('subtracts everyday spending ahead', () => {
    expect(computeSafeToSpend(parts({ available: 100000, everydaySpend: 25000 })).amount).toBe(75000);
  });

  it('goes negative honestly when over-committed', () => {
    expect(computeSafeToSpend(parts({ available: 10000, upcomingBills: 30000 })).amount).toBe(-20000);
  });

  it('clamps claim terms at zero but lets available stay negative', () => {
    const s = computeSafeToSpend(parts({
      available: -5000, upcomingBills: -100, goalRemaining: NaN, netIOwe: -1,
      cardRepayment: -7, everydaySpend: NaN,
    }));
    expect(s.amount).toBe(-5000);
    expect(s.upcomingBills).toBe(0);
    expect(s.goalRemaining).toBe(0);
    expect(s.cardRepayment).toBe(0);
    expect(s.everydaySpend).toBe(0);
  });

  it('keeps an unknown rate null rather than reporting it as zero', () => {
    // "We can't say" and "it's ₹0/day" must not look alike — the strip hides the
    // per-day figure on null, and would print "₹0/day" on a zero.
    expect(computeSafeToSpend(parts()).dailyRate).toBeNull();
    expect(computeSafeToSpend(parts(), { dailyRate: NaN }).dailyRate).toBeNull();
    expect(computeSafeToSpend(parts(), { dailyRate: 0 }).dailyRate).toBe(0);
  });

  it('defaults the horizon to STS_HORIZON_DAYS', () => {
    expect(computeSafeToSpend(parts()).daysLeft).toBe(STS_HORIZON_DAYS);
  });
});

describe('goalRemainingThisCycle', () => {
  const goal = (id: string, monthlyRate: number, saved = 0, target = 1000000) => ({ id, monthlyRate, saved, target });

  it('sums the unfunded remainder per goal', () => {
    const out = goalRemainingThisCycle([goal('a', 50000), goal('b', 30000)], { a: 20000 });
    expect(out).toBe(30000 + 30000);
  });

  it('an over-funded month claims nothing more', () => {
    expect(goalRemainingThisCycle([goal('a', 50000)], { a: 80000 })).toBe(0);
  });

  it('completed goals and zero-rate goals claim nothing', () => {
    expect(goalRemainingThisCycle([goal('done', 50000, 1000000, 1000000), goal('idle', 0)], {})).toBe(0);
  });
});

/**
 * The everyday-spend estimator. Its whole reason to exist is that a mean is
 * wrong here: one hospital bill inside a quarter of ordinary days would move a
 * mean enough to make the headline wrong for months.
 */
describe('typicalDailySpend', () => {
  const days = (n: number, each: number) => new Array<number>(n).fill(each);

  it('refuses to estimate below the minimum history', () => {
    expect(typicalDailySpend(days(EVERYDAY_MIN_DAYS - 1, 40000))).toBeNull();
    expect(typicalDailySpend([])).toBeNull();
  });

  it('estimates once there is enough history', () => {
    expect(typicalDailySpend(days(EVERYDAY_MIN_DAYS, 40000))).toBe(40000);
  });

  it('is unmoved by a single extraordinary day', () => {
    const ordinary = days(89, 40000);
    const withHospitalBill = [...days(89, 40000), 4000000]; // ₹40,000 in one day
    const before = typicalDailySpend(ordinary)!;
    const after = typicalDailySpend(withHospitalBill)!;
    expect(after).toBe(before);
    // A plain mean would have moved by ~₹440/day on the same data.
    const mean = withHospitalBill.reduce((s, n) => s + n, 0) / withHospitalBill.length;
    expect(mean - after).toBeGreaterThan(40000);
  });

  it('keeps quiet days in the average rather than dropping them', () => {
    // 45 days at ₹400, 45 days at ₹0 → ~₹200/day, not ₹400. The horizon has
    // quiet days in it too; trimming them would overestimate what's ahead.
    const rate = typicalDailySpend([...days(45, 40000), ...days(45, 0)])!;
    expect(rate).toBeGreaterThan(15000);
    expect(rate).toBeLessThan(25000);
  });

  it('never returns a negative rate', () => {
    expect(typicalDailySpend(days(40, -5000))).toBe(0);
  });
});

describe('dailySpendTotals', () => {
  const now = 1_700_000_000_000;
  const share = () => 10000;
  const expense = (date: number, extra: Record<string, unknown> = {}) =>
    ({ kind: 'expense', date, ...extra });

  it('measures days of history, not days of window', () => {
    // 90-day window, but the account is 10 days old. Ten buckets, not ninety —
    // otherwise the rate is diluted across 80 days that never existed.
    const txns = [expense(now - 10 * DAY), expense(now - DAY)];
    expect(dailySpendTotals(txns, share, now - 90 * DAY, now)).toHaveLength(10);
  });

  it('gives a short-history account no rate at all', () => {
    const txns = [expense(now - 5 * DAY)];
    const buckets = dailySpendTotals(txns, share, now - 90 * DAY, now);
    expect(typicalDailySpend(buckets)).toBeNull();
  });

  it('excludes recurring-linked rows — upcomingBills already claims them', () => {
    const txns = [
      expense(now - 40 * DAY),
      expense(now - 20 * DAY, { parent_recur_id: 'rule-1' }),
      expense(now - 10 * DAY, { recur_freq: 'monthly' }),
    ];
    const total = dailySpendTotals(txns, share, now - 90 * DAY, now).reduce((s, n) => s + n, 0);
    expect(total).toBe(10000); // only the one-off
  });

  it('excludes income, settlements and deleted rows', () => {
    const txns = [
      expense(now - 40 * DAY),
      { kind: 'income', date: now - 30 * DAY },
      { kind: 'settlement', date: now - 30 * DAY },
      expense(now - 30 * DAY, { is_deleted: 1 }),
    ];
    const total = dailySpendTotals(txns, share, now - 90 * DAY, now).reduce((s, n) => s + n, 0);
    expect(total).toBe(10000);
  });

  it('returns nothing when there is no qualifying history', () => {
    expect(dailySpendTotals([], share, now - 90 * DAY, now)).toEqual([]);
    expect(dailySpendTotals([{ kind: 'income', date: now - DAY }], share, now - 90 * DAY, now)).toEqual([]);
  });
});

describe('everydaySpendAhead', () => {
  it('is zero when the rate is unknown — not a guess of zero', () => {
    expect(everydaySpendAhead(null, 30)).toBe(0);
  });

  it('scales the rate across the days left', () => {
    expect(everydaySpendAhead(40000, 30)).toBe(1200000);
  });

  it('handles a zero horizon and a negative rate', () => {
    expect(everydaySpendAhead(40000, 0)).toBe(0);
    expect(everydaySpendAhead(-1, 30)).toBe(0);
  });
});

/**
 * Assembly wiring: the number Home shows must reflect real rows. The
 * settlement-exposure subtraction is the term no benchmark app has — it is the
 * split-app half of this app doing its job in the money half.
 */
describe('getSafeToSpend (db)', () => {
  it('returns zeros on an empty database instead of inventing a figure', async () => {
    const db = createTestDb();
    addPerson(db, 'Me', true);
    const s = await getSafeToSpend(asDb(db));
    expect(s.amount).toBe(0);
    expect(s.dailyRate).toBeNull();
  });

  it('subtracts what I owe a friend, net, from spendable cash', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const friend = addPerson(db, 'Aarav', false);
    const personal = addGroup(db, 'Personal', true);
    addMember(db, personal, me);
    const shared = addGroup(db, 'Flat', false);
    addMember(db, shared, me);
    addMember(db, shared, friend);

    // Income gives me cash…
    addTxn(db, {
      groupId: personal, kind: 'income', date: Date.now() - DAY, category: 'Salary',
      payments: [{ personId: me, amount: 100000 }], shares: [],
    });
    // …and a friend-paid dinner leaves me owing my ₹300 share.
    addTxn(db, {
      groupId: shared, kind: 'expense', date: Date.now() - 3600000, category: 'Food',
      payments: [{ personId: friend, amount: 60000 }],
      shares: [{ personId: me, amount: 30000 }, { personId: friend, amount: 30000 }],
    });

    const s = await getSafeToSpend(asDb(db));
    expect(s.available).toBe(100000);
    expect(s.netIOwe).toBe(30000);
    // Two days of history is under the gate, so no everyday rate is invented.
    expect(s.dailyRate).toBeNull();
    expect(s.everydaySpend).toBe(0);
    expect(s.amount).toBe(70000);
  });

  it('counts a bill that falls after month-end but inside the horizon', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const personal = addGroup(db, 'Personal', true);
    addMember(db, personal, me);
    // 25 days out: past the end of any calendar month from most start dates,
    // always inside a rolling 30-day horizon. The old month-end horizon showed
    // its best figure on the 28th, with rent three days away.
    addTxn(db, {
      groupId: personal, kind: 'expense', date: Date.now() + 25 * DAY, category: 'Rent',
      payments: [{ personId: me, amount: 500000 }], shares: [{ personId: me, amount: 500000 }],
    });
    const s = await getSafeToSpend(asDb(db));
    expect(s.upcomingBills).toBe(500000);
  });
});
