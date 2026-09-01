/**
 * Where a tapped reminder should land (`V2-15`).
 *
 * Tapping a notification used to just open the app on whatever screen you left — the
 * nudge told you a bill renews tomorrow and then made you go find it. There was no
 * `addNotificationResponseReceivedListener` anywhere in the codebase.
 *
 * The route is derived from the reminder **identifier** rather than from a payload,
 * because those ids are already the app's contract for this: `notifications.ts` states
 * *"Reminder identifiers are deterministic per source (e.g. a recurring rule id)"*, and
 * scheduling builds them from that source. Deriving here means reminders scheduled
 * *before* this shipped route correctly too, with no payload migration and no second
 * source of truth to drift.
 *
 * Unknown ids return `null` — open the app normally. A wrong destination is worse than
 * no navigation, because it moves someone away from what they were doing.
 */
export function routeForReminder(identifier: string): string | null {
  /*
   * `renew_{ruleId}_d{n}` — n days before a recurring charge. Straight to that rule.
   *
   * This used to return `/plan/recurring?focus={ruleId}`, and that param was read by
   * nobody: `plan/recurring.tsx` has never looked at `focus`. So "Netflix renews in
   * 3 days" opened a list of every rule in every group, unscrolled and unhighlighted —
   * exactly the "go find it yourself" this file exists to stop. `/recurring/[id]` is
   * the rule itself, with Skip next right there, which is what the tap is usually for.
   */
  const renew = /^renew_(.+)_d\d+$/.exec(identifier);
  if (renew) return `/recurring/${encodeURIComponent(renew[1])}`;

  // "Log today's spending" → the thing it is asking for, not a screen about it.
  if (identifier === 'daily_log') return '/add/quick';

  // "Export a CSV/PDF from Reports" → Reports.
  if (identifier === 'backup_nudge') return '/reports';

  return null;
}
