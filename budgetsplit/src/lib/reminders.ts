import type * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveRecurringRules } from '../db/queries/transactions';
import { nextOccurrenceOnOrAfter } from './recurrence';
import {
  scheduleReminderAt, scheduleDailyReminder, cancelAllReminders,
  ensureAndroidChannel, hasNotificationPermission,
} from './notifications';
import { formatRupees } from './money';

/** AsyncStorage flags for each opt-in reminder type. */
export const REMINDER_KEYS = {
  renewals: 'reminders_renewals',
  daily: 'reminders_daily',
} as const;

const DAY = 24 * 60 * 60 * 1000;
const RENEWAL_LEAD_DAYS = 1; // remind the day before a charge

export async function getReminderPrefs(): Promise<{ renewals: boolean; daily: boolean }> {
  const [r, d] = await Promise.all([
    AsyncStorage.getItem(REMINDER_KEYS.renewals),
    AsyncStorage.getItem(REMINDER_KEYS.daily),
  ]);
  return { renewals: r === 'true', daily: d === 'true' };
}

/**
 * Rebuild all local reminders from current prefs + data. Cancels everything
 * first so it's idempotent. No-ops without notification permission (Expo Go).
 * Call on app open and whenever a reminder pref or recurring rule changes.
 */
export async function rescheduleReminders(db: SQLite.SQLiteDatabase): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  await ensureAndroidChannel();
  await cancelAllReminders();

  const { renewals, daily } = await getReminderPrefs();

  if (renewals) {
    const rules = await getActiveRecurringRules(db);
    const now = Date.now();
    for (const r of rules) {
      if (r.kind !== 'expense') continue;
      const next = nextOccurrenceOnOrAfter(r, now);
      if (!next) continue;
      const remindAt = new Date(next - RENEWAL_LEAD_DAYS * DAY);
      const total = r.payments.reduce((s, p) => s + p.amount, 0);
      await scheduleReminderAt(
        `renew_${r.id}`,
        remindAt,
        `${r.category} renews tomorrow`,
        `${formatRupees(total)} is due. Tap to review — or cancel it if you no longer use it.`,
      );
    }
  }

  if (daily) {
    await scheduleDailyReminder('daily_log', 20, 0, 'Keep your streak going', 'Log today’s spending — it only takes a few taps.');
  }
}
