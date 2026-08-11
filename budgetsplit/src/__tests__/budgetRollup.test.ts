import { budgetKind, budgetEquivalent, rollUpBudgets, type Period } from '../lib/budget';
import type { BudgetCadence } from '../db/queries/categoryBudgets';

/**
 * A budget rolls **up** into a headline, never down.
 *
 * ₹24,000/yr for Trips is not ₹2,000/month: a trip spends the whole pool in one
 * month, so dividing by 12 would report "over budget" in exactly the month the
 * money was meant to be spent. Eight call sites disagreed about this — three of
 * them summed raw amounts across cadences with no conversion at all.
 *
 * `src/lib/rebalance.ts` already worked this way ("a yearly budget's headroom is
 * not spendable this month"); these tests are the rest of the app agreeing.
 */

const FEB_2024 = new Date(2024, 1, 15); // leap year: 29 days, 366-day year
const JAN_2026 = new Date(2026, 0, 15); // 31 days, 365-day year

const ALL: BudgetCadence[] = ['daily', 'monthly', 'yearly', 'once'];
const TARGETS: Period[] = ['daily', 'monthly', 'yearly'];

describe('budgetKind is relative to the headline, not a property of the cadence', () => {
  it('a monthly line is a rate in a monthly headline and a pool in a daily one', () => {
    expect(budgetKind('monthly', 'monthly')).toBe('rate');
    expect(budgetKind('monthly', 'daily')).toBe('pool');
    expect(budgetKind('monthly', 'yearly')).toBe('rate');
  });

  it('`once` is a pool at every target — it has no period to roll into', () => {
    for (const t of TARGETS) expect(budgetKind('once', t)).toBe('pool');
  });

  it('a cadence is always a rate in its own period', () => {
    expect(budgetKind('daily', 'daily')).toBe('rate');
    expect(budgetKind('monthly', 'monthly')).toBe('rate');
    expect(budgetKind('yearly', 'yearly')).toBe('rate');
  });
});

describe('budgetEquivalent — the full target × cadence matrix', () => {
  it('daily target takes only daily lines', () => {
    expect(budgetEquivalent('daily', 50000, 'daily', JAN_2026)).toBe(50000);
    expect(budgetEquivalent('monthly', 50000, 'daily', JAN_2026)).toBeNull();
    expect(budgetEquivalent('yearly', 50000, 'daily', JAN_2026)).toBeNull();
    expect(budgetEquivalent('once', 50000, 'daily', JAN_2026)).toBeNull();
  });

  it('monthly target rolls daily up by the REAL length of that month', () => {
    // The old code used a flat ×30 in one place and ×daysInMonth in another, so a
    // daily ₹500 line read ₹15,000 on one screen and ₹15,500 on another.
    expect(budgetEquivalent('daily', 50000, 'monthly', JAN_2026)).toBe(50000 * 31);
    expect(budgetEquivalent('daily', 50000, 'monthly', FEB_2024)).toBe(50000 * 29);
    expect(budgetEquivalent('monthly', 50000, 'monthly', JAN_2026)).toBe(50000);
  });

  it('monthly target treats yearly as a pool — never ÷12', () => {
    // ₹24,000/yr on Trips.
    expect(budgetEquivalent('yearly', 2_400_000, 'monthly', JAN_2026)).toBeNull();
  });

  it('yearly target uses the real year length, not daysInMonth × 12', () => {
    // daysInMonth × 12 would give 336 in February and 372 in January — the ×30
    // fudge in a different hat.
    expect(budgetEquivalent('daily', 100, 'yearly', FEB_2024)).toBe(100 * 366);
    expect(budgetEquivalent('daily', 100, 'yearly', JAN_2026)).toBe(100 * 365);
  });

  it('yearly target rolls monthly up by exactly 12 and passes yearly through', () => {
    expect(budgetEquivalent('monthly', 500000, 'yearly', JAN_2026)).toBe(6_000_000);
    expect(budgetEquivalent('yearly', 2_400_000, 'yearly', JAN_2026)).toBe(2_400_000);
  });

  it('returns null — never 0 — for every pool, so a caller cannot silently drop it', () => {
    for (const target of TARGETS) {
      for (const cadence of ALL) {
        const v = budgetEquivalent(cadence, 100000, target, JAN_2026);
        if (budgetKind(cadence, target) === 'pool') expect(v).toBeNull();
        else expect(v).toBeGreaterThan(0);
      }
    }
  });

  it('never returns a fraction of a paise', () => {
    for (const target of TARGETS) {
      for (const cadence of ALL) {
        const v = budgetEquivalent(cadence, 99_999, target, FEB_2024);
        if (v !== null) expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('handles zero without inventing a negative', () => {
    for (const target of TARGETS) {
      for (const cadence of ALL) {
        const v = budgetEquivalent(cadence, 0, target, JAN_2026);
        if (v !== null) expect(v).toBe(0);
      }
    }
  });
});

describe('rollUpBudgets keeps pools visible instead of dropping them', () => {
  const lines = [
    { cadence: 'monthly' as const, amount: 500000 },   // ₹5,000/mo groceries
    { cadence: 'daily' as const, amount: 10000 },      // ₹100/day chai
    { cadence: 'yearly' as const, amount: 2_400_000 }, // ₹24,000/yr trips
    { cadence: 'once' as const, amount: 900000 },      // ₹9,000 one-off
  ];

  it('a monthly headline excludes the yearly and one-time lines', () => {
    const r = rollUpBudgets(lines, 'monthly', JAN_2026);
    expect(r.amount).toBe(500000 + 10000 * 31);
    expect(r.pooled).toBe(2_400_000 + 900000);
    expect(r.pooledCount).toBe(2);
  });

  it('reports the pools so a headline can name what it left out', () => {
    // This is the whole point: excluding ₹24k of trip budget is correct, letting
    // it vanish from a total presented as complete is not.
    const r = rollUpBudgets(lines, 'monthly', JAN_2026);
    expect(r.pooledCount).toBeGreaterThan(0);
    expect(r.amount + r.pooled).toBeGreaterThan(r.amount);
  });

  it('a yearly headline absorbs the monthly and daily lines, leaving only `once`', () => {
    const r = rollUpBudgets(lines, 'yearly', JAN_2026);
    expect(r.amount).toBe(500000 * 12 + 10000 * 365 + 2_400_000);
    expect(r.pooled).toBe(900000);
    expect(r.pooledCount).toBe(1);
  });

  it('a daily headline takes only the daily line', () => {
    const r = rollUpBudgets(lines, 'daily', JAN_2026);
    expect(r.amount).toBe(10000);
    expect(r.pooledCount).toBe(3);
  });

  it('is 0/0/0 for no lines at all', () => {
    expect(rollUpBudgets([], 'monthly', JAN_2026)).toEqual({ amount: 0, pooled: 0, pooledCount: 0 });
  });

  it('never loses a line — every line is in exactly one of the two buckets', () => {
    for (const target of TARGETS) {
      const r = rollUpBudgets(lines, target, JAN_2026);
      const pooledLines = lines.filter(l => budgetKind(l.cadence, target) === 'pool');
      expect(r.pooledCount).toBe(pooledLines.length);
      expect(r.pooled).toBe(pooledLines.reduce((s, l) => s + l.amount, 0));
    }
  });

  it('a monthly rollup is never inflated by a yearly line, however large', () => {
    // The regression that mattered: on the Plan screen this figure is compared
    // against a MONTH-end forecast, so a big annual budget made an overspending
    // month look comfortably funded.
    const withHugeAnnual = [...lines, { cadence: 'yearly' as const, amount: 100_000_000 }];
    const a = rollUpBudgets(lines, 'monthly', JAN_2026).amount;
    const b = rollUpBudgets(withHugeAnnual, 'monthly', JAN_2026).amount;
    expect(b).toBe(a);
  });
});
