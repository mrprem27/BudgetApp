import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type ReminderPrefs,
  DEFAULT_RENEWAL_TIME, DEFAULT_DAILY_TIME,
  clampLead, clampTime, defaultReminderPrefs,
} from './reminderPlan';

/**
 * Persistence for the reminder preferences — AsyncStorage only, deliberately
 * free of `expo-notifications`.
 *
 * `reminders.ts` (which schedules with the OS) re-exports these, so callers see
 * no change; but anything that only needs to READ or SET a preference —
 * onboarding turning the backup nudge on, a settings toggle — can import here
 * without dragging the native notification module into its dependency graph.
 */

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
        backup: !!p.backup,
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
    backup: patch.backup ?? cur.backup,
  };
  try { await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
  return next;
}
