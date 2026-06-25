import { materializeInstances, nextOccurrenceOnOrAfter, occurrenceDatesUpTo, recurringMonthlyEquivalent } from '../lib/recurrence';

const base = {
  id: 'r1', group_id: 'g', kind: 'expense', entry_mode: 'quick',
  category: 'Rent', note: null, attachment_uri: null, tags: null,
  recur_interval: 1, recur_end: null, recur_override_date: null,
  recur_state: 'active', is_deleted: 0, created_at: 0, updated_at: 0,
  payments: [{ personId: 'a', amount: 1000 }], shares: [{ personId: 'a', amount: 1000 }],
};

const ms = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe('materializeInstances', () => {
  it('returns nothing when not recurring', () => {
    const t: any = { ...base, recur_freq: null, date: ms(2024, 0, 1) };
    expect(materializeInstances(t, ms(2024, 0, 1), ms(2024, 2, 31))).toEqual([]);
  });

  it('generates one monthly instance per month in range', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1) };
    const out = materializeInstances(t, ms(2024, 0, 1), ms(2024, 2, 31)); // Jan, Feb, Mar
    expect(out).toHaveLength(3);
  });

  it('respects recur_end', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1), recur_end: ms(2024, 1, 1) };
    const out = materializeInstances(t, ms(2024, 0, 1), ms(2024, 5, 30)); // capped at Feb
    expect(out).toHaveLength(2);
  });

  it('gives each instance a unique virtual id', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1) };
    const out = materializeInstances(t, ms(2024, 0, 1), ms(2024, 2, 31));
    expect(new Set(out.map(i => i.id)).size).toBe(out.length);
  });

  it('omits skipped occurrence dates', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1) };
    const skips = new Set([ms(2024, 1, 1)]); // skip February
    const out = materializeInstances(t, ms(2024, 0, 1), ms(2024, 2, 31), skips);
    expect(out).toHaveLength(2);
    expect(out.map(i => i.date)).not.toContain(ms(2024, 1, 1));
  });
});

describe('nextOccurrenceOnOrAfter', () => {
  it('returns the first occurrence on or after the given time', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1) };
    expect(nextOccurrenceOnOrAfter(t, ms(2024, 1, 10))).toBe(ms(2024, 2, 1)); // next is March 1
  });

  it('returns the exact date when the boundary lands on an occurrence', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1) };
    expect(nextOccurrenceOnOrAfter(t, ms(2024, 1, 1))).toBe(ms(2024, 1, 1)); // Feb 1 itself
  });

  it('returns null once the series has ended', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1), recur_end: ms(2024, 1, 1) };
    expect(nextOccurrenceOnOrAfter(t, ms(2024, 5, 1))).toBeNull();
  });

  it('returns null when not recurring', () => {
    const t: any = { ...base, recur_freq: null, date: ms(2024, 0, 1) };
    expect(nextOccurrenceOnOrAfter(t, ms(2024, 0, 1))).toBeNull();
  });
});

describe('occurrenceDatesUpTo (materialize job)', () => {
  it('lists monthly occurrences from start to the until date inclusive', () => {
    const dates = occurrenceDatesUpTo(ms(2024, 0, 1), 'monthly', 1, ms(2024, 2, 15), null);
    expect(dates).toEqual([ms(2024, 0, 1), ms(2024, 1, 1), ms(2024, 2, 1)]);
  });

  it('clamps to recur_end when it is earlier than until', () => {
    const dates = occurrenceDatesUpTo(ms(2024, 0, 1), 'monthly', 1, ms(2024, 5, 1), ms(2024, 1, 1));
    expect(dates).toEqual([ms(2024, 0, 1), ms(2024, 1, 1)]);
  });

  it('honors the interval (every 2 weeks)', () => {
    const dates = occurrenceDatesUpTo(ms(2024, 0, 1), 'weekly', 2, ms(2024, 0, 29), null);
    expect(dates).toEqual([ms(2024, 0, 1), ms(2024, 0, 15), ms(2024, 0, 29)]);
  });

  it('returns just the start when until is before the next occurrence', () => {
    const dates = occurrenceDatesUpTo(ms(2024, 0, 1), 'monthly', 1, ms(2024, 0, 10), null);
    expect(dates).toEqual([ms(2024, 0, 1)]);
  });
});

describe('recurringMonthlyEquivalent', () => {
  it('daily → ×30', () => {
    expect(recurringMonthlyEquivalent(10000, 'daily')).toBe(300000);
  });

  it('weekly → ×52/12 (≈4.33/mo), NOT ×4 — this is the bug that was fixed', () => {
    expect(recurringMonthlyEquivalent(12000, 'weekly')).toBe(Math.round((12000 * 52) / 12));
    expect(recurringMonthlyEquivalent(12000, 'weekly')).not.toBe(12000 * 4);
  });

  it('monthly → unchanged', () => {
    expect(recurringMonthlyEquivalent(50000, 'monthly')).toBe(50000);
  });

  it('yearly → ÷12', () => {
    expect(recurringMonthlyEquivalent(120000, 'yearly')).toBe(10000);
  });

  it('custom / unknown / null → unchanged (no fixed monthly cadence)', () => {
    expect(recurringMonthlyEquivalent(7777, 'custom')).toBe(7777);
    expect(recurringMonthlyEquivalent(7777, null)).toBe(7777);
    expect(recurringMonthlyEquivalent(7777, undefined)).toBe(7777);
  });
});
