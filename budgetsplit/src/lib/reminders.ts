import type * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveRecurringRules } from '../db/queries/transactions';
import { getSkipsMap } from '../db/queries/recurring';
import { getMe } from '../db/queries/persons';
import { nextUnskippedOccurrence } from './recurrence';
import { myShareOrTotal } from './splitMath';
import {
  scheduleReminderAt, scheduleDailyReminder, cancelAllReminders,
  ensureAndroidChannel, hasNotificationPermission,
} from './notifications';
import { formatRupees } from './money';
import { settings } from './settings';
import { loadFlags } from './featureFlags';
import {
  type ReminderPrefs, type ReminderTime, type PlannedReminder,
  DEFAULT_RENEWAL_TIME, DEFAULT_DAILY_TIME, DEFAULT_BACKUP_TIME,
  clampLead, clampTime, defaultReminderPrefs, limitReminders, atTimeOfDay, nextMonthlyAnchor,
  planRenewalReminders,
} from './reminderPlan';

// Re-export the pure surface so callers import everything from one place.
export {
  type ReminderPrefs, type ReminderTime, type PlannedReminder,
  DEFAULT_RENEWAL_TIME, DEFAULT_DAILY_TIME, DEFAULT_BACKUP_TIME, DEFAULT_LEAD_DAYS, MAX_LEAD_DAYS,
  REMINDER_CAP, formatReminderTime, limitReminders,
} from './reminderPlan';

const DAY = 24 * 60 * 60 * 1000;
// Preference persistence lives in reminderPrefsStore (AsyncStorage only, no
// expo-notifications) so non-scheduling callers can read/write a pref without
// pulling the native module in. Re-exported here so callers see one surface.
import { getReminderPrefs, setReminderPrefs } from './reminderPrefsStore';
export { getReminderPrefs, setReminderPrefs };

/**
 * Rebuild all local reminders from current prefs + data. Cancels everything
 * first so it's idempotent. No-ops without notification permission (Expo Go).
 * Renewal reminders fire on each of the last `renewalLeadDays` days before a
 * charge at the chosen time; overlapping reminders are staggered 5s apart and
 * capped. The daily nudge is a single repeating notification.
 * Call on app open and whenever a reminder pref or recurring rule changes.
 */
export function rescheduleReminders(db: SQLite.SQLiteDatabase): Promise<void> {
  // One rebuild at a time. The switches, the foreground and a re-picked setup can each start one;
  // interleaved, a rebuild that read "on" could schedule after one that read "off" had cancelled.
  const run = queue.then(() => rebuild(db));
  queue = run.catch(() => {});
  return run;
}
let queue: Promise<void> = Promise.resolve();

async function rebuild(db: SQLite.SQLiteDatabase): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  await ensureAndroidChannel();
  await cancelAllReminders();
  // Feature Management's Reminders switch turns every nudge off, not only its Settings row; the
  // Recurring switch turns off the renewal nudges, which would open a Recurring screen it hides.
  const flags = await loadFlags();
  if (!flags.reminders) return;

  const prefs = await getReminderPrefs();
  const now = Date.now();

  if (prefs.renewals && flags.recurring) {
    const rules = await getActiveRecurringRules(db);
    // Skip-aware: a renewal the user explicitly skipped must not push
    // "renews tomorrow" — the next UNskipped date is the one that's due.
    const skips = await getSkipsMap(db, rules.map(r => r.id));
    const me = await getMe(db);
    const planned = planRenewalReminders(
      rules,
      r => nextUnskippedOccurrence(r, now, skips.get(r.id)),
      // A reminder is a personal surface: it says what YOU owe (my share,
      // whole bill for unsplit rules) — not the group's full rent.
      r => (me ? myShareOrTotal(r, me.id) : r.payments.reduce((s, p) => s + p.amount, 0)),
      formatRupees,
      prefs,
      now,
    );
    for (const rem of limitReminders(planned)) {
      await scheduleReminderAt(rem.id, new Date(rem.fireAt), rem.title, rem.body);
    }
  }

  if (prefs.daily) {
    await scheduleDailyReminder(
      'daily_log', prefs.dailyTime.hour, prefs.dailyTime.minute,
      'Keep your streak going', 'Log today’s spending — it only takes a few taps.',
    );
  }

  if (prefs.backup) {
    // Anchored to the last real export (reset in app/reports.tsx on success), or
    // to when the reminder was turned on if nothing's been exported yet — never
    // a fixed calendar day, so this can't nag right after a real backup.
    const anchor = (await settings.backupAnchorAt()) ?? now;
    const fireAt = atTimeOfDay(nextMonthlyAnchor(anchor, now), DEFAULT_BACKUP_TIME);
    await scheduleReminderAt(
      'backup_nudge', new Date(fireAt), 'Back up your data',
      // Points at the backup that can actually be RESTORED. This used to send
      // people to Reports for a CSV, which is an export and not a backup: it
      // cannot be restored, so someone who followed the advice and then lost the
      // phone had a spreadsheet and no ledger.
      'Settings → Backup makes an encrypted copy you can restore if you lose this phone.',
    );
  }
}
