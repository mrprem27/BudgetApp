import { materializeInstances, nextOccurrenceOnOrAfter, nextUnskippedOccurrence, occurrenceDatesUpTo, recurringMonthlyEquivalent } from '../lib/recurrence';

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

  it('custom repeats every `interval` days → ×30/interval', () => {
    expect(recurringMonthlyEquivalent(1000, 'custom', 3)).toBe(10000);
    // No interval to go on — left unchanged rather than guessed.
    expect(recurringMonthlyEquivalent(7777, 'custom')).toBe(7777);
  });

  // D6 regression: no cadence contributes NOTHING to a monthly total. Before,
  // an unknown freq passed straight through, so a one-off ('once' from the
  // budget-cadence vocabulary) could be summed as a monthly commitment.
  it('null / undefined freq → 0 (a one-off is not a monthly commitment)', () => {
    expect(recurringMonthlyEquivalent(7777, null)).toBe(0);
    expect(recurringMonthlyEquivalent(7777, undefined)).toBe(0);
  });
});

/**
 * "Skip next" wrote a `recur_skip` row, but every *display* of the next date used the
 * raw projection — so Plan, Home's "Coming up", `/plan/recurring` and Reminders all
 * kept showing the skipped date. The skip only took effect much later, when
 * materialization declined to create the row. The feature looked broken while the
 * stored data was correct, which is the worst shape for a bug: nothing to fix in the DB.
 */
describe('nextUnskippedOccurrence', () => {
  const monthly = { ...base, recur_freq: 'monthly' as const, date: ms(2026, 0, 10) };

  it('matches the raw projection when nothing is skipped', () => {
    const from = ms(2026, 0, 1);
    expect(nextUnskippedOccurrence(monthly as any, from))
      .toBe(nextOccurrenceOnOrAfter(monthly as any, from));
  });

  it('walks past a single skipped occurrence', () => {
    const from = ms(2026, 0, 1);
    const first = nextOccurrenceOnOrAfter(monthly as any, from)!;
    const next = nextUnskippedOccurrence(monthly as any, from, new Set([first]));
    expect(next).not.toBe(first);
    expect(next).toBe(ms(2026, 1, 10)); // February
  });

  it('walks past several consecutive skips', () => {
    const from = ms(2026, 0, 1);
    const skips = new Set([ms(2026, 0, 10), ms(2026, 1, 10), ms(2026, 2, 10)]);
    expect(nextUnskippedOccurrence(monthly as any, from, skips)).toBe(ms(2026, 3, 10));
  });

  it('ignores skips that are not on real occurrence dates', () => {
    const from = ms(2026, 0, 1);
    // A stale skip row (e.g. the series was edited) must not shift the answer.
    const skips = new Set([ms(2026, 0, 11), ms(2026, 0, 9)]);
    expect(nextUnskippedOccurrence(monthly as any, from, skips)).toBe(ms(2026, 0, 10));
  });

  it('returns null when every remaining occurrence is skipped', () => {
    // A series ending in March, with all three of its remaining dates skipped.
    const bounded = { ...monthly, recur_end: ms(2026, 2, 31) };
    const skips = new Set([ms(2026, 0, 10), ms(2026, 1, 10), ms(2026, 2, 10)]);
    expect(nextUnskippedOccurrence(bounded as any, ms(2026, 0, 1), skips)).toBeNull();
  });

  it('treats an empty skip set as no skips', () => {
    const from = ms(2026, 0, 1);
    expect(nextUnskippedOccurrence(monthly as any, from, new Set()))
      .toBe(nextOccurrenceOnOrAfter(monthly as any, from));
  });

  it('terminates on a series with no future occurrence at all', () => {
    const ended = { ...monthly, recur_end: ms(2025, 11, 31) };
    expect(nextUnskippedOccurrence(ended as any, ms(2026, 5, 1), new Set([ms(2026, 0, 10)]))).toBeNull();
  });
});

/**
 * Month-end anchoring. Stepping `addMonths` from the *previous cursor* clamps
 * 31 Jan → 28 Feb and then never recovers, because the next step reads 28 Feb
 * as the anchor: 31 Jan → 28 Feb → 28 Mar → 28 Apr, forever. The anchor is the
 * series start date, so every occurrence must be computed from it.
 */
describe('month-end anchoring', () => {
  const monthEnd = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 31) }; // 31 Jan 2024

  it('recovers the 31st after a short month', () => {
    // Jan 31 → Feb 29 (leap, clamped) → Mar 31 (recovered) → Apr 30. May 31 is
    // past the cutoff, so the run stops at April.
    const out = occurrenceDatesUpTo(ms(2024, 0, 31), 'monthly', 1, ms(2024, 4, 15), null);
    expect(out.map(d => new Date(d).getDate())).toEqual([31, 29, 31, 30]);
  });

  it('does not walk backward through a whole year', () => {
    const out = occurrenceDatesUpTo(ms(2024, 0, 31), 'monthly', 1, ms(2024, 11, 31), null);
    // Every occurrence is the last day the month has — never an inherited 28th.
    expect(out.map(d => new Date(d).getDate()))
      .toEqual([31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it('materializeInstances anchors on the start date too', () => {
    const out = materializeInstances(monthEnd as any, ms(2024, 0, 1), ms(2024, 3, 30));
    expect(out.map(i => new Date(i.date).getDate())).toEqual([31, 29, 31, 30]);
  });

  it('nextOccurrenceOnOrAfter returns the 31st, not an inherited 28th', () => {
    // Asking in March must give 31 Mar — the pre-fix walk answered 28 Mar.
    expect(nextOccurrenceOnOrAfter(monthEnd as any, ms(2024, 2, 1)))
      .toBe(ms(2024, 2, 31));
  });

  it('a yearly 29 Feb rule survives the non-leap years', () => {
    const out = occurrenceDatesUpTo(ms(2024, 1, 29), 'yearly', 1, ms(2028, 5, 1), null);
    // 2025-27 clamp to the 28th, but 2028 is a leap year and must return to the 29th.
    expect(out.map(d => new Date(d).getDate())).toEqual([29, 28, 28, 28, 29]);
  });
});
