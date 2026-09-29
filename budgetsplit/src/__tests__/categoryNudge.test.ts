import type { FinanceSnapshot } from '../lib/engine/types';
import { categoryNudge } from '../lib/categoryNudge';

const ASOF = Date.UTC(2026, 8, 20, 12); // 20 Sep 2026
const DAY = 86_400_000;
const R = (r: number) => r * 100;

const base: FinanceSnapshot = {
  asOf: ASOF, meId: 'me',
  cash: { available: 0, creditUsed: 0, creditLimit: 0, cardDueDay: null },
  recurring: { rules: [], skips: {} },
  goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
  exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
  receivables: [], budgets: [], history: [], futureOneOffs: [],
};
const row = (id: string, daysAgo: number, category: string, rupees: number, kind: 'expense' | 'income' = 'expense') =>
  ({ id, date: ASOF - daysAgo * DAY, kind, category, amountPaise: R(rupees), isRecurringLinked: false });

describe('categoryNudge (L11)', () => {
  it('sums only this month\'s my-share spend in that category', () => {
    const snap = { ...base, history: [
      row('a', 2, 'Food', 300), row('b', 5, 'Food', 200),
      row('c', 25, 'Food', 999),            // last month
      row('d', 1, 'Travel', 500),           // other category
      row('e', 1, 'Food', 800, 'income'),   // not spend
    ] };
    expect(categoryNudge(snap, 'Food').spentThisMonth).toBe(R(500));
  });

  it('rolls a daily line up by the real month length, keeps monthly as is, and never divides a yearly pool', () => {
    const line = (cadence: 'daily' | 'monthly' | 'yearly', amount: number) =>
      ({ ...base, budgets: [{ id: 'b', group_id: 'g', category: 'Trips', cadence, amount: R(amount), person_id: null }] });
    expect(categoryNudge(line('monthly', 3000), 'Trips').budget).toBe(R(3000));
    expect(categoryNudge(line('daily', 100), 'Trips').budget).toBe(R(100) * 30); // September has 30 days
    expect(categoryNudge(line('yearly', 24000), 'Trips').budget).toBeNull();     // not ₹2,000/month of headroom
    expect(categoryNudge(base, 'Trips').budget).toBeNull();
  });
});
