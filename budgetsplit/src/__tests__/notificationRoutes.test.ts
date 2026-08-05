import { routeForReminder } from '../lib/notificationRoutes';

describe('routeForReminder — renewal nudges', () => {
  it('routes to the rule it is talking about, focused', () => {
    expect(routeForReminder('renew_abc123_d3')).toBe('/plan/recurring?focus=abc123');
  });

  it('handles every lead day the planner emits', () => {
    // reminders.ts counts down renewalLeadDays..1, so the suffix varies.
    for (const d of [1, 2, 3, 7, 14]) {
      expect(routeForReminder(`renew_rule-9_d${d}`)).toBe('/plan/recurring?focus=rule-9');
    }
  });

  it('survives a rule id containing underscores', () => {
    // The greedy capture must take everything up to the final `_d{n}`, or a uuid-ish
    // id with underscores would be truncated and focus nothing.
    expect(routeForReminder('renew_a_b_c_d2')).toBe('/plan/recurring?focus=a_b_c');
  });

  it('encodes a rule id that would otherwise break the query string', () => {
    expect(routeForReminder('renew_a&b=c_d1')).toBe('/plan/recurring?focus=a%26b%3Dc');
  });

  it('ignores a renewal id with no day suffix', () => {
    expect(routeForReminder('renew_abc123')).toBeNull();
  });
});

describe('routeForReminder — the fixed reminders', () => {
  it('sends the daily nudge to the thing it is asking for', () => {
    expect(routeForReminder('daily_log')).toBe('/add/quick');
  });

  it('sends the backup nudge to Reports, where the export lives', () => {
    expect(routeForReminder('backup_nudge')).toBe('/reports');
  });
});

describe('routeForReminder — anything else', () => {
  // A wrong destination is worse than none: it moves someone away from what they
  // were doing, for a notification the app did not schedule.
  it('returns null rather than guessing', () => {
    for (const id of ['', 'unknown', 'renew', 'daily', 'test_reminder', 'DAILY_LOG']) {
      expect(routeForReminder(id)).toBeNull();
    }
  });
});
