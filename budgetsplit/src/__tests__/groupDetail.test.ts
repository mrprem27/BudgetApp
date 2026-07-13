import {
  isRecurInstance, splitLabel, freqWord,
  computeContributions, computePersonalMonthSpend, computeRecurringMonthlyTotal, computeRecurNextLabel,
} from '../lib/groupDetail';
import type { TxnWithSplits } from '../db/queries/transactions';
import type { Person } from '../db/queries/persons';

const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id, name, avatar_color: '#20C4B8', is_me: 0, image_uri: null, ...(extra as any),
} as Person);

const expense = (id: string, date: number, payments: { personId: string; amount: number }[], shares: { personId: string; amount: number }[] = []): TxnWithSplits => ({
  id, group_id: 'g', kind: 'expense', date, category: 'Food', note: null, is_deleted: 0,
  payments, shares, recur_freq: null,
} as any);

describe('isRecurInstance', () => {
  it('detects occurrence ids (rule id + _n suffix)', () => {
    expect(isRecurInstance('abc_3')).toBe(true);
    expect(isRecurInstance('abc')).toBe(false);
    expect(isRecurInstance('abc_def')).toBe(false);
  });
});

describe('splitLabel / freqWord', () => {
  it('maps split modes', () => {
    expect(splitLabel('shares')).toBe('by shares');
    expect(splitLabel('exact')).toBe('by exact amounts');
    expect(splitLabel('percent')).toBe('by percentage');
    expect(splitLabel('equal')).toBe('equally');
  });
  it('maps frequencies, defaulting to monthly', () => {
    expect(freqWord('daily')).toBe('daily');
    expect(freqWord('weekly')).toBe('weekly');
    expect(freqWord(null)).toBe('monthly');
    expect(freqWord('monthly')).toBe('monthly');
  });
});

describe('computeContributions', () => {
  const me = person('me', 'Me', { is_me: 1 });
  const a = person('a', 'Aarav');
  const members = [me, a];

  it('sums payments, computes fair share, sorts by paid desc', () => {
    const txns = [
      expense('t1', 1, [{ personId: 'me', amount: 8000 }]),
      expense('t2', 2, [{ personId: 'a', amount: 2000 }]),
    ];
    const net = { me: 3000, a: -3000 };
    const c = computeContributions(txns, members, net);
    expect(c.total).toBe(10000);
    expect(c.fairShare).toBe(5000);
    expect(c.rows[0].member.id).toBe('me'); // paid most first
    expect(c.rows[0].paid).toBe(8000);
    expect(c.rows[0].frac).toBeCloseTo(1);
    expect(c.rows[1].paid).toBe(2000);
    expect(c.rows[1].net).toBe(-3000);
  });

  it('ignores deleted rows and non-expense kinds', () => {
    const txns = [
      { ...expense('t1', 1, [{ personId: 'me', amount: 5000 }]), is_deleted: 1 } as TxnWithSplits,
      { ...expense('t2', 2, [{ personId: 'a', amount: 4000 }]), kind: 'income' } as TxnWithSplits,
    ];
    const c = computeContributions(txns, members, {});
    expect(c.total).toBe(0);
    expect(c.fairShare).toBe(0);
  });
});

describe('computePersonalMonthSpend', () => {
  it('sums only my share of this-month expenses', () => {
    const now = new Date(2026, 5, 15).getTime();
    const thisMonth = new Date(2026, 5, 3).getTime();
    const lastMonth = new Date(2026, 4, 20).getTime();
    const txns = [
      expense('t1', thisMonth, [{ personId: 'me', amount: 1000 }], [{ personId: 'me', amount: 1000 }]),
      expense('t2', lastMonth, [{ personId: 'me', amount: 9999 }], [{ personId: 'me', amount: 9999 }]),
    ];
    expect(computePersonalMonthSpend(txns, 'me', now)).toBe(1000);
  });
});

describe('computeRecurringMonthlyTotal / computeRecurNextLabel', () => {
  it('returns 0 and null for no rules', () => {
    expect(computeRecurringMonthlyTotal([])).toBe(0);
    expect(computeRecurNextLabel([])).toBeNull();
  });
});
