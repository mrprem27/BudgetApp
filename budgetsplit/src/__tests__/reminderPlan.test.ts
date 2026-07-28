import {
  clampLead,
  clampTime,
  defaultReminderPrefs,
  formatReminderTime,
  limitReminders,
  atTimeOfDay,
  nextMonthlyAnchor,
  DEFAULT_DAILY_TIME,
  DEFAULT_LEAD_DAYS,
  DEFAULT_RENEWAL_TIME,
  MAX_LEAD_DAYS,
  REMINDER_CAP,
  type PlannedReminder,
} from '../lib/reminderPlan';

const planned = (id: string, fireAt: number): PlannedReminder => ({
  id, fireAt, title: `t-${id}`, body: `b-${id}`,
});

describe('clampLead', () => {
  it('keeps in-range values', () => {
    expect(clampLead(1)).toBe(1);
    expect(clampLead(4)).toBe(4);
    expect(clampLead(MAX_LEAD_DAYS)).toBe(MAX_LEAD_DAYS);
  });
  it('clamps out-of-range values to the bounds', () => {
    expect(clampLead(0)).toBe(1);
    expect(clampLead(-99)).toBe(1);
    expect(clampLead(MAX_LEAD_DAYS + 1)).toBe(MAX_LEAD_DAYS);
    expect(clampLead(10_000)).toBe(MAX_LEAD_DAYS);
  });
  it('rounds fractional input', () => {
    expect(clampLead(2.4)).toBe(2);
    expect(clampLead(2.6)).toBe(3);
  });
  it('falls back to the default for non-finite input', () => {
    expect(clampLead(NaN)).toBe(DEFAULT_LEAD_DAYS);
    expect(clampLead(Infinity)).toBe(DEFAULT_LEAD_DAYS);
    expect(clampLead(-Infinity)).toBe(DEFAULT_LEAD_DAYS);
  });
});

describe('clampTime', () => {
  const fb = { hour: 9, minute: 30 };

  it('keeps a valid time', () => {
    expect(clampTime({ hour: 14, minute: 5 }, fb)).toEqual({ hour: 14, minute: 5 });
  });
  it('accepts the boundary values', () => {
    expect(clampTime({ hour: 0, minute: 0 }, fb)).toEqual({ hour: 0, minute: 0 });
    expect(clampTime({ hour: 23, minute: 59 }, fb)).toEqual({ hour: 23, minute: 59 });
  });
  it('clamps out-of-range hours and minutes', () => {
    expect(clampTime({ hour: 24, minute: 60 }, fb)).toEqual({ hour: 23, minute: 59 });
    expect(clampTime({ hour: -1, minute: -1 }, fb)).toEqual({ hour: 0, minute: 0 });
  });
  it('falls back per-field when a field is missing or non-finite', () => {
    expect(clampTime({ hour: 7 }, fb)).toEqual({ hour: 7, minute: 30 });
    expect(clampTime({ minute: 15 }, fb)).toEqual({ hour: 9, minute: 15 });
    expect(clampTime({ hour: NaN, minute: 15 }, fb)).toEqual({ hour: 9, minute: 15 });
    expect(clampTime(undefined, fb)).toEqual(fb);
    expect(clampTime({}, fb)).toEqual(fb);
  });
  it('rounds fractional values', () => {
    expect(clampTime({ hour: 8.6, minute: 29.4 }, fb)).toEqual({ hour: 9, minute: 29 });
  });
});

describe('defaultReminderPrefs', () => {
  it('starts with every reminder off (never opt-in by default)', () => {
    const p = defaultReminderPrefs();
    expect(p.renewals).toBe(false);
    expect(p.daily).toBe(false);
    expect(p.backup).toBe(false);
  });
  it('uses the documented default times and lead', () => {
    const p = defaultReminderPrefs();
    expect(p.renewalTime).toEqual(DEFAULT_RENEWAL_TIME);
    expect(p.dailyTime).toEqual(DEFAULT_DAILY_TIME);
    expect(p.renewalLeadDays).toBe(DEFAULT_LEAD_DAYS);
  });
  it('returns a fresh object each call (no shared mutable default)', () => {
    const a = defaultReminderPrefs();
    const b = defaultReminderPrefs();
    expect(a).not.toBe(b);
    a.renewals = true;
    expect(b.renewals).toBe(false);
  });
});

describe('formatReminderTime', () => {
  it('formats midnight and noon as 12, not 0', () => {
    expect(formatReminderTime({ hour: 0, minute: 0 })).toBe('12:00 AM');
    expect(formatReminderTime({ hour: 12, minute: 0 })).toBe('12:00 PM');
  });
  it('pads minutes to two digits', () => {
    expect(formatReminderTime({ hour: 9, minute: 5 })).toBe('9:05 AM');
  });
  it('switches to PM after noon', () => {
    expect(formatReminderTime({ hour: 13, minute: 30 })).toBe('1:30 PM');
    expect(formatReminderTime({ hour: 23, minute: 59 })).toBe('11:59 PM');
  });
  it('treats 11:59 AM as AM (the boundary before noon)', () => {
    expect(formatReminderTime({ hour: 11, minute: 59 })).toBe('11:59 AM');
  });
});

describe('limitReminders', () => {
  it('sorts by fire time, soonest first', () => {
    const out = limitReminders([planned('c', 300), planned('a', 100), planned('b', 200)]);
    expect(out.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('keeps the soonest `cap` and drops the furthest out', () => {
    const out = limitReminders([planned('a', 100), planned('b', 200), planned('c', 300)], 2);
    expect(out.map(r => r.id)).toEqual(['a', 'b']);
  });
  it('does not mutate the input array', () => {
    const input = [planned('c', 300), planned('a', 100)];
    limitReminders(input);
    expect(input.map(r => r.id)).toEqual(['c', 'a']);
  });
  it('handles empty input and a cap larger than the list', () => {
    expect(limitReminders([])).toEqual([]);
    expect(limitReminders([planned('a', 1)], 99)).toHaveLength(1);
  });
  it('returns nothing for a zero cap', () => {
    expect(limitReminders([planned('a', 1)], 0)).toEqual([]);
  });
  it('stays under the iOS pending-notification limit by default', () => {
    const many = Array.from({ length: 200 }, (_, i) => planned(String(i), i));
    expect(limitReminders(many)).toHaveLength(REMINDER_CAP);
    expect(REMINDER_CAP).toBeLessThan(64);
  });
});

describe('atTimeOfDay', () => {
  it('sets the wall-clock time and zeroes seconds/ms', () => {
    const base = new Date(2026, 0, 15, 3, 7, 42, 500).getTime();
    const out = new Date(atTimeOfDay(base, { hour: 20, minute: 30 }));
    expect(out.getHours()).toBe(20);
    expect(out.getMinutes()).toBe(30);
    expect(out.getSeconds()).toBe(0);
    expect(out.getMilliseconds()).toBe(0);
  });
  it('keeps the same calendar day', () => {
    const base = new Date(2026, 5, 9, 23, 59).getTime();
    const out = new Date(atTimeOfDay(base, { hour: 0, minute: 0 }));
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(5);
    expect(out.getDate()).toBe(9);
  });
  it('is idempotent', () => {
    const base = new Date(2026, 2, 3, 11, 11).getTime();
    const once = atTimeOfDay(base, { hour: 8, minute: 15 });
    expect(atTimeOfDay(once, { hour: 8, minute: 15 })).toBe(once);
  });
});

describe('nextMonthlyAnchor', () => {
  it('advances by one month when the anchor already passed', () => {
    const anchor = new Date(2026, 0, 15).getTime(); // Jan 15
    const now = new Date(2026, 1, 1).getTime();     // Feb 1 — anchor already passed
    const out = new Date(nextMonthlyAnchor(anchor, now));
    expect(out.getMonth()).toBe(1); // Feb
    expect(out.getDate()).toBe(15);
  });
  it('keeps stepping forward until strictly after now, across several missed cycles', () => {
    const anchor = new Date(2026, 0, 15).getTime(); // Jan 15
    const now = new Date(2026, 3, 20).getTime();    // Apr 20 — 3 cycles missed
    const out = new Date(nextMonthlyAnchor(anchor, now));
    expect(out.getMonth()).toBe(4); // May — first Jan-15-anniversary after Apr 20
    expect(out.getDate()).toBe(15);
  });
  it('returns a time strictly after now, never equal', () => {
    const anchor = new Date(2026, 0, 15, 9, 0).getTime();
    const now = anchor; // now exactly equals the anchor
    expect(nextMonthlyAnchor(anchor, now)).toBeGreaterThan(now);
  });
});
