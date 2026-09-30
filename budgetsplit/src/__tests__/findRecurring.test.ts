import { findRecurring, type RecurringSub } from '../lib/recurringData';

/** Recurring search and sort (2026-09-30): by name or category; Next due, Newest or Amount. */
const sub = (id: string, name: string, category: string, amount: number, createdAt: number): RecurringSub => ({
  id, groupId: 'g', name, category, kind: 'expense', amount, freq: 'monthly', interval: 1, nextMs: null, paused: false, createdAt,
});
const LIST = [sub('a', 'Netflix', 'Subscriptions', 64900, 3), sub('b', 'Rent', 'Rent', 2500000, 1), sub('c', 'Gym', 'Health', 150000, 2)];

describe('finding a recurring rule', () => {
  it('matches name or category, ignoring case, and keeps the given order for Next due', () => {
    expect(findRecurring(LIST, 'NET', 'next').map(s => s.id)).toEqual(['a']);
    expect(findRecurring(LIST, 'health', 'next').map(s => s.id)).toEqual(['c']);
    expect(findRecurring(LIST, '  ', 'next').map(s => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by when the rule was made, or by amount, without touching the input', () => {
    expect(findRecurring(LIST, '', 'newest').map(s => s.id)).toEqual(['a', 'c', 'b']);
    expect(findRecurring(LIST, '', 'amount').map(s => s.id)).toEqual(['b', 'c', 'a']);
    expect(LIST.map(s => s.id)).toEqual(['a', 'b', 'c']);
  });
});
