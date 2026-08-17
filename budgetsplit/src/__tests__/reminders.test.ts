import { limitReminders, formatReminderTime, planRenewalReminders, type PlannedReminder } from '../lib/reminderPlan';
import { nextUnskippedOccurrence } from '../lib/recurrence';
import { myShareOrTotal } from '../lib/splitMath';
import type { TxnWithSplits } from '../db/queries/transactions';

const mk = (id: string, fireAt: number): PlannedReminder => ({ id, fireAt, title: id, body: '' });

describe('limitReminders', () => {
  it('returns reminders in time order without altering their times', () => {
    const out = limitReminders([mk('late', 10), mk('early', 0)], 50);
    expect(out.map(r => r.id)).toEqual(['early', 'late']);
    expect(out.map(r => r.fireAt)).toEqual([0, 10]);
  });

  it('keeps only the soonest `cap` reminders', () => {
    const many = Array.from({ length: 100 }, (_, i) => mk(`r${i}`, i * 1000));
    const out = limitReminders(many, 50);
    expect(out).toHaveLength(50);
    expect(out[0].id).toBe('r0'); // soonest kept
    expect(out[49].id).toBe('r49'); // furthest-out dropped
  });
});

describe('formatReminderTime', () => {
  it('formats 12-hour clock with AM/PM', () => {
    expect(formatReminderTime({ hour: 9, minute: 0 })).toBe('9:00 AM');
    expect(formatReminderTime({ hour: 20, minute: 5 })).toBe('8:05 PM');
    expect(formatReminderTime({ hour: 0, minute: 30 })).toBe('12:30 AM');
    expect(formatReminderTime({ hour: 12, minute: 0 })).toBe('12:00 PM');
  });
});

// The renewal pipeline as reminders.ts wires it: skip-aware next date +
// my-share amount. Regression for the skip-blind push ("Rent renews tomorrow"
// for an occurrence the user explicitly skipped) — reverting the
// nextUnskippedOccurrence wiring makes the first test fail.
describe('planRenewalReminders', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date(2026, 0, 10, 12).getTime();
  const rule = (over: Partial<TxnWithSplits> = {}): TxnWithSplits => ({
    id: 'r1', kind: 'expense', category: 'Rent', note: null,
    date: new Date(2026, 0, 12).getTime(), recur_freq: 'monthly', recur_interval: null,
    recur_state: 'active', recur_end: null, is_deleted: 0,
    payments: [{ personId: 'me', amount: 2200000 }],
    shares: [{ personId: 'me', amount: 733400 }, { personId: 'a', amount: 733300 }, { personId: 'b', amount: 733300 }],
    ...over,
  } as TxnWithSplits);
  const prefs = { renewalLeadDays: 1, renewalTime: { hour: 9, minute: 0 } };
  const plan = (r: TxnWithSplits, skips?: Set<number>) =>
    planRenewalReminders(
      [r],
      x => nextUnskippedOccurrence(x, now, skips),
      x => myShareOrTotal(x, 'me'),
      p => `₹${p / 100}`,
      prefs,
      now,
    );

  it('does not remind for a skipped occurrence — it plans for the next unskipped one', () => {
    const r = rule();
    const skipped = nextUnskippedOccurrence(r, now)!;
    const out = plan(r, new Set([skipped]));
    // Next unskipped is a month later; the day-before reminder must aim there.
    const nextReal = nextUnskippedOccurrence(r, now, new Set([skipped]))!;
    expect(out).toHaveLength(1);
    expect(out[0].fireAt).toBeGreaterThan(skipped);
    expect(out[0].fireAt).toBeLessThan(nextReal);
  });

  it('announces MY share, not the whole bill', () => {
    const out = plan(rule());
    expect(out[0].body).toContain('₹7334');
    expect(out[0].body).not.toContain('₹22000');
  });

  it('skips non-expense rules and rules with no next occurrence', () => {
    expect(plan(rule({ kind: 'income' } as any))).toHaveLength(0);
    expect(planRenewalReminders([rule()], () => null, () => 0, String, prefs, now)).toHaveLength(0);
  });
});
