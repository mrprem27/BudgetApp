import {
  isRecurInstance, splitLabel,
  computeContributions, computeRecurringMonthlyTotal, computeRecurNextLabel,
  computeRecurringMyShareMonthly, primarySettleTarget, settlementSummary,
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

describe('splitLabel', () => {
  it('maps split modes (from the canonical SPLIT_MODE_PHRASE)', () => {
    expect(splitLabel('shares')).toBe('by shares');
    expect(splitLabel('exact')).toBe('by exact amounts');
    expect(splitLabel('percent')).toBe('by percentage');
    expect(splitLabel('equal')).toBe('equally');
    expect(splitLabel('nonsense')).toBe('equally');
  });
  // freqWord is gone — every cadence label now comes from `freqLabel` in
  // lib/recurrence, which honours recur_interval ("Every 3 months") where
  // freqWord silently dropped it.
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

describe('computeRecurringMonthlyTotal / computeRecurNextLabel', () => {
  it('returns 0 and null for no rules', () => {
    expect(computeRecurringMonthlyTotal([])).toBe(0);
    expect(computeRecurNextLabel([])).toBeNull();
  });
});

describe('computeRecurringMyShareMonthly', () => {
  const rule = (freq: string, total: number, mine?: number): TxnWithSplits => ({
    id: 'r', group_id: 'g', kind: 'expense', date: 1, category: 'Rent', note: null, is_deleted: 0,
    payments: [{ personId: 'a', amount: total }],
    shares: mine === undefined ? [] : [{ personId: 'me', amount: mine }, { personId: 'a', amount: total - mine }],
    recur_freq: freq, recur_interval: 1, recur_state: 'active',
  } as any);

  it('sums my share, not the whole bill', () => {
    expect(computeRecurringMyShareMonthly([rule('monthly', 90000, 30000)], 'me')).toBe(30000);
  });

  it('converts non-monthly cadences the same way the group total does', () => {
    const yearly = [rule('yearly', 120000, 60000)];
    expect(computeRecurringMyShareMonthly(yearly, 'me')).toBe(computeRecurringMonthlyTotal([rule('yearly', 60000)]));
  });

  it('falls back to the whole bill when I have no share on the rule', () => {
    expect(computeRecurringMyShareMonthly([rule('monthly', 90000)], 'me')).toBe(90000);
  });

  it('is 0 for no rules', () => {
    expect(computeRecurringMyShareMonthly([], 'me')).toBe(0);
  });
});

describe('primarySettleTarget', () => {
  const me = person('me', 'Me', { is_me: 1 });
  const a = person('a', 'Aarav');
  const map = new Map([['me', me], ['a', a]]);

  it('when I owe, returns who I pay', () => {
    const settles = [{ from: 'me', to: 'a', amount: 500 }];
    expect(primarySettleTarget(settles, 'me', map, -500)?.id).toBe('a');
  });

  it('when I am owed, returns who pays me', () => {
    const settles = [{ from: 'a', to: 'me', amount: 500 }];
    expect(primarySettleTarget(settles, 'me', map, 500)?.id).toBe('a');
  });

  it('is null when square, so no Settle button is offered', () => {
    expect(primarySettleTarget([{ from: 'a', to: 'me', amount: 500 }], 'me', map, 0)).toBeNull();
  });

  it('is null when no plan step involves me — never an empty payee', () => {
    expect(primarySettleTarget([{ from: 'a', to: 'b', amount: 500 }], 'me', map, -500)).toBeNull();
  });

  it('is null when the counterpart is not a known person', () => {
    expect(primarySettleTarget([{ from: 'me', to: 'ghost', amount: 500 }], 'me', map, -500)).toBeNull();
  });
});

describe('settlementSummary', () => {
  it('totals what is still to move', () => {
    const s = settlementSummary(
      [{ from: 'me', to: 'a', amount: 500 }, { from: 'b', to: 'a', amount: 300 }],
      { me: -500, a: 800, b: -300 },
      ['me', 'a', 'b'],
    );
    expect(s.openTotal).toBe(800);
    expect(s.settledCount).toBe(0);
  });

  it('counts a member absent from the balance map as settled, not outstanding', () => {
    const s = settlementSummary([], { me: 0, a: 0 }, ['me', 'a', 'newcomer']);
    expect(s.settledCount).toBe(3);
  });

  it('is zeroed for an empty group', () => {
    expect(settlementSummary([], {}, [])).toEqual({ openTotal: 0, settledCount: 0 });
  });
});
