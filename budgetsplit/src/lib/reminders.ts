import type * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveRecurringRules } from '../db/queries/transactions';
import { nextOccurrenceOnOrAfter } from './recurrence';
import {
  scheduleReminderAt, scheduleDailyReminder, cancelAllReminders,
  ensureAndroidChannel, hasNotificationPermission,
} from './notifications';
import { formatRupees } from './money';
import {
  type ReminderPrefs, type ReminderTime, type PlannedReminder,
  DEFAULT_RENEWAL_TIME, DEFAULT_DAILY_TIME,
  clampLead, clampTime, defaultReminderPrefs, staggerReminders, atTimeOfDay,
} from './reminderPlan';

// Re-export the pure surface so callers import everything from one place.
export {
  type ReminderPrefs, type ReminderTime, type PlannedReminder,
  DEFAULT_RENEWAL_TIME, DEFAULT_DAILY_TIME, DEFAULT_LEAD_DAYS, MAX_LEAD_DAYS,
  REMINDER_GAP_MS, REMINDER_CAP, formatReminderTime, staggerReminders,
} from './reminderPlan';

const DAY = 24 * 60 * 60 * 1000;
const PREFS_KEY = 'reminder_prefs_v2';
/** Legacy boolean keys (pre-scheduling-prefs) — migrated on first read. */
const LEGACY_KEYS = { renewals: 'reminders_renewals', daily: 'reminders_daily' } as const;

/** Read the full reminder preferences (with defaults + one-time legacy migration). */
export async function getReminderPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ReminderPrefs>;
      return {
        renewals: !!p.renewals,
        renewalLeadDays: clampLead(p.renewalLeadDays ?? 1),
        renewalTime: clampTime(p.renewalTime, DEFAULT_RENEWAL_TIME),
        daily: !!p.daily,
        dailyTime: clampTime(p.dailyTime, DEFAULT_DAILY_TIME),
      };
    }
    // Migrate the old on/off booleans, if present.
    const [r, d] = await Promise.all([
      AsyncStorage.getItem(LEGACY_KEYS.renewals),
      AsyncStorage.getItem(LEGACY_KEYS.daily),
    ]);
    const migrated = { ...defaultReminderPrefs(), renewals: r === 'true', daily: d === 'true' };
    if (r !== null || d !== null) await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return defaultReminderPrefs();
  }
}

/** Merge + persist a partial preference change; returns the full resolved prefs. */
export async function setReminderPrefs(patch: Partial<ReminderPrefs>): Promise<ReminderPrefs> {
  const cur = await getReminderPrefs();
  const next: ReminderPrefs = {
    renewals: patch.renewals ?? cur.renewals,
    renewalLeadDays: clampLead(patch.renewalLeadDays ?? cur.renewalLeadDays),
    renewalTime: clampTime(patch.renewalTime ?? cur.renewalTime, DEFAULT_RENEWAL_TIME),
    daily: patch.daily ?? cur.daily,
    dailyTime: clampTime(patch.dailyTime ?? cur.dailyTime, DEFAULT_DAILY_TIME),
  };
  try { await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
  return next;
}

/**
 * Rebuild all local reminders from current prefs + data. Cancels everything
 * first so it's idempotent. No-ops without notification permission (Expo Go).
 * Renewal reminders fire on each of the last `renewalLeadDays` days before a
 * charge at the chosen time; overlapping reminders are staggered 5s apart and
 * capped. The daily nudge is a single repeating notification.
 * Call on app open and whenever a reminder pref or recurring rule changes.
 */
export async function rescheduleReminders(db: SQLite.SQLiteDatabase): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  await ensureAndroidChannel();
  await cancelAllReminders();

  const prefs = await getReminderPrefs();
  const now = Date.now();

  if (prefs.renewals) {
    const rules = await getActiveRecurringRules(db);
    const planned: PlannedReminder[] = [];
    for (const r of rules) {
      if (r.kind !== 'expense') continue;
      const next = nextOccurrenceOnOrAfter(r, now);
      if (!next) continue;
      const total = r.payments.reduce((s, p) => s + p.amount, 0);
      for (let d = prefs.renewalLeadDays; d >= 1; d--) {
        const fireAt = atTimeOfDay(next - d * DAY, prefs.renewalTime);
        if (fireAt <= now) continue; // already passed
        const when = d === 1 ? 'tomorrow' : `in ${d} days`;
        planned.push({
          id: `renew_${r.id}_d${d}`,
          fireAt,
          title: `${r.category} renews ${when}`,
          body: `${formatRupees(total)} is due. Tap to review — or cancel it if you no longer use it.`,
        });
      }
    }
    for (const rem of staggerReminders(planned)) {
      await scheduleReminderAt(rem.id, new Date(rem.fireAt), rem.title, rem.body);
    }
  }

  if (prefs.daily) {
    await scheduleDailyReminder(
      'daily_log', prefs.dailyTime.hour, prefs.dailyTime.minute,
      'Keep your streak going', 'Log today’s spending — it only takes a few taps.',
    );
  }
}
