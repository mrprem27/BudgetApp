import { routeForReminder } from '../lib/notificationRoutes';

describe('routeForReminder — renewal nudges', () => {
  // Straight to the rule, not to a list of every rule in every group. The old
  // destination was `/plan/recurring?focus={id}`, and nothing on that screen has
  // ever read `focus` — so the nudge opened an unscrolled list.
  it('routes to the rule it is talking about', () => {
    expect(routeForReminder('renew_abc123_d3')).toBe('/recurring/abc123');
  });

  it('handles every lead day the planner emits', () => {
    // reminders.ts counts down renewalLeadDays..1, so the suffix varies.
    for (const d of [1, 2, 3, 7, 14]) {
      expect(routeForReminder(`renew_rule-9_d${d}`)).toBe('/recurring/rule-9');
    }
  });

  it('survives a rule id containing underscores', () => {
    // The greedy capture must take everything up to the final `_d{n}`, or a uuid-ish
    // id with underscores would be truncated and open the wrong rule.
    expect(routeForReminder('renew_a_b_c_d2')).toBe('/recurring/a_b_c');
  });

  it('encodes a rule id that would otherwise break the path', () => {
    // Still encoded now that the id is a path segment rather than a query value:
    // a raw `/` or `?` in an id would otherwise change which route is matched.
    expect(routeForReminder('renew_a&b=c_d1')).toBe('/recurring/a%26b%3Dc');
    expect(routeForReminder('renew_a/b_d1')).toBe('/recurring/a%2Fb');
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
