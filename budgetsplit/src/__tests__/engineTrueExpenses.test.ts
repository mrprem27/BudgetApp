import type { FinanceSnapshot } from '../lib/engine/types';
import { PERSONA_NOW } from '../db/enginePersonas';
import { trueExpenses, monthlyAffordability } from '../lib/engine/behaviour';
import { afford } from '../lib/engine/assess';

/** EN6 — sinking funds for yearly commitments/dated goals, "unfundable → No". */

const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;
const R = (rupees: number) => Math.round(rupees * 100);

const EMPTY: FinanceSnapshot = {
  asOf: PERSONA_NOW,
  meId: 'me',
  cash: { available: R(1_000_000), creditUsed: 0, creditLimit: 0, cardDueDay: null },
  recurring: { rules: [], skips: {} },
  goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
  exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
  receivables: [],
  budgets: [],
  history: [],
  futureOneOffs: [],
};

function yearlyFeeRule(dueInMonths: number, amountPaise: number) {
  return {
    id: 'fee', group_id: 'g', kind: 'expense' as const, entry_mode: 'quick' as const,
    date: PERSONA_NOW + dueInMonths * MONTH_MS, category: 'Education', recur_freq: 'yearly' as const,
    is_deleted: 0, pendingApproval: false,
    payments: [], shares: [{ personId: 'me', amount: amountPaise }],
  } as unknown as FinanceSnapshot['recurring']['rules'][number];
}

describe('trueExpenses — a yearly fee claims only its monthly accrual', () => {
  it('a ₹60,000 fee due in 6 months accrues ₹10,000/month, never the lump sum', () => {
    const snap: FinanceSnapshot = { ...EMPTY, recurring: { rules: [yearlyFeeRule(6, R(60_000))], skips: {} } };
    const expenses = trueExpenses(snap);
    expect(expenses).toHaveLength(1);
    expect(expenses[0].monthlyAccrualPaise).toBe(R(10_000));
  });
});

describe('monthlyAffordability — a future month with no surplus reads unfundable', () => {
  it('a large fee against thin monthly income makes a specific month unfundable', () => {
    const snap: FinanceSnapshot = {
      ...EMPTY,
      recurring: {
        rules: [
          yearlyFeeRule(6, R(60_000)), // ₹10,000/month accrual
          {
            id: 'salary', group_id: 'g', kind: 'income', entry_mode: 'quick',
            date: PERSONA_NOW - 3 * DAY_MS, category: 'Salary', recur_freq: 'monthly',
            is_deleted: 0, pendingApproval: false,
            payments: [{ personId: 'me', amount: R(12_000) }], shares: [],
          } as unknown as FinanceSnapshot['recurring']['rules'][number],
        ],
        skips: {},
      },
      history: [
        // 3 months of income rows so incomeModel doesn't fall back to "no history".
        { id: 'i1', date: PERSONA_NOW - 90 * DAY_MS, kind: 'income', category: 'Salary', amountPaise: R(12_000), isRecurringLinked: true },
        { id: 'i2', date: PERSONA_NOW - 60 * DAY_MS, kind: 'income', category: 'Salary', amountPaise: R(12_000), isRecurringLinked: true },
        { id: 'i3', date: PERSONA_NOW - 30 * DAY_MS, kind: 'income', category: 'Salary', amountPaise: R(12_000), isRecurringLinked: true },
      ],
    };
    const months = monthlyAffordability(snap);
    // ₹12,000 income - ₹10,000 accrual (every month through month 6) leaves
    // only ₹2,000 — thin, but not the point; the point is it's still
    // required every month, so it never magically stops being tight.
    expect(months[0].requiredPaise).toBe(R(10_000));
    expect(months[0].surplusPaise).not.toBeNull();
  });

  it('an unfundable month makes afford() say No today, for a purchase that has nothing to do with it', () => {
    const snap: FinanceSnapshot = {
      ...EMPTY,
      recurring: {
        rules: [
          yearlyFeeRule(6, R(600_000)), // ₹1,00,000/month accrual — far past any plausible income
          {
            id: 'salary', group_id: 'g', kind: 'income', entry_mode: 'quick',
            date: PERSONA_NOW - 3 * DAY_MS, category: 'Salary', recur_freq: 'monthly',
            is_deleted: 0, pendingApproval: false,
            payments: [{ personId: 'me', amount: R(12_000) }], shares: [],
          } as unknown as FinanceSnapshot['recurring']['rules'][number],
        ],
        skips: {},
      },
      history: [
        { id: 'i1', date: PERSONA_NOW - 90 * DAY_MS, kind: 'income', category: 'Salary', amountPaise: R(12_000), isRecurringLinked: true },
        { id: 'i2', date: PERSONA_NOW - 60 * DAY_MS, kind: 'income', category: 'Salary', amountPaise: R(12_000), isRecurringLinked: true },
        { id: 'i3', date: PERSONA_NOW - 30 * DAY_MS, kind: 'income', category: 'Salary', amountPaise: R(12_000), isRecurringLinked: true },
      ],
    };
    expect(monthlyAffordability(snap).some(m => m.unfundable)).toBe(true);

    // Ask about a trivially small, unrelated purchase — the answer is still
    // No, because the ledger itself is already broken 6 months out.
    const result = afford(snap, { amountPaise: R(10), when: 'now' }, 30, true);
    expect(result.verdict).toBe('not-affordable');
    expect(result.reasons.some(r => r.code === 'unfundable_commitment')).toBe(true);

    // Without withIncome, this check doesn't run at all (opt-in, per projection.ts's file header).
    const withoutIncome = afford(snap, { amountPaise: R(10), when: 'now' }, 30, false);
    expect(withoutIncome.reasons.some(r => r.code === 'unfundable_commitment')).toBe(false);
  });

  it('no double subtraction: the unfundable reason and a cash-short reason never both claim the same money', () => {
    const snap: FinanceSnapshot = {
      ...EMPTY,
      cash: { available: R(-5_000), creditUsed: 0, creditLimit: 0, cardDueDay: null }, // already short today too
      recurring: {
        rules: [
          yearlyFeeRule(6, R(600_000)),
          {
            id: 'salary', group_id: 'g', kind: 'income', entry_mode: 'quick',
            date: PERSONA_NOW - 3 * DAY_MS, category: 'Salary', recur_freq: 'monthly',
            is_deleted: 0, pendingApproval: false,
            payments: [{ personId: 'me', amount: R(12_000) }], shares: [],
          } as unknown as FinanceSnapshot['recurring']['rules'][number],
        ],
        skips: {},
      },
      history: [
        { id: 'i1', date: PERSONA_NOW - 90 * DAY_MS, kind: 'income', category: 'Salary', amountPaise: R(12_000), isRecurringLinked: true },
        { id: 'i2', date: PERSONA_NOW - 60 * DAY_MS, kind: 'income', category: 'Salary', amountPaise: R(12_000), isRecurringLinked: true },
        { id: 'i3', date: PERSONA_NOW - 30 * DAY_MS, kind: 'income', category: 'Salary', amountPaise: R(12_000), isRecurringLinked: true },
      ],
    };
    const result = afford(snap, { amountPaise: R(10), when: 'now' }, 30, true);
    const cashShort = result.reasons.find(r => r.code === 'cash_short');
    const unfundable = result.reasons.find(r => r.code === 'unfundable_commitment');
    expect(cashShort).toBeDefined();
    expect(unfundable).toBeDefined();
    // Each reason's own figure, not the same number twice.
    expect(cashShort!.amountPaise).not.toBe(unfundable!.amountPaise);
  });
});
