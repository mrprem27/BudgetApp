import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local, on-device reminders (no server, no push). Everything is scheduled
 * locally so it stays offline-safe. These only fire in a **dev build** — in
 * Expo Go scheduling is a no-op, so all calls are guarded and never throw.
 *
 * Reminder identifiers are deterministic per source (e.g. a recurring rule id)
 * so re-scheduling replaces the old one instead of stacking duplicates.
 */

let configured = false;
function ensureHandler() {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch { /* not available (Expo Go) */ }
}

/** Ask for permission. Returns true if granted. Safe to call repeatedly. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    ensureHandler();
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return !!req.granted;
  } catch { return false; }
}

export async function hasNotificationPermission(): Promise<boolean> {
  try { return (await Notifications.getPermissionsAsync()).granted; } catch { return false; }
}

/** Schedule a one-off reminder at an absolute date. No-ops on past dates / errors. */
export async function scheduleReminderAt(id: string, date: Date, title: string, body: string): Promise<void> {
  try {
    const ts = date.getTime();
    if (!Number.isFinite(ts) || ts <= Date.now()) return;
    await cancelReminder(id);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: ts,
        channelId: Platform.OS === 'android' ? 'reminders' : undefined,
      },
    });
  } catch { /* best-effort */ }
}

export async function cancelReminder(id: string): Promise<void> {
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* ignore */ }
}

export async function cancelAllReminders(): Promise<void> {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch { /* ignore */ }
}

/** Schedule a daily repeating reminder at a given local time (e.g. 20:00). */
export async function scheduleDailyReminder(id: string, hour: number, minute: number, title: string, body: string): Promise<void> {
  try {
    await cancelReminder(id);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour, minute,
        channelId: Platform.OS === 'android' ? 'reminders' : undefined,
      },
    });
  } catch { /* best-effort */ }
}

export type TestReminderResult = 'scheduled' | 'denied' | 'unavailable';

/**
 * Fire a one-off test reminder a few seconds out so the user can SEE what
 * renewal / daily nudges look like and confirm notifications work. Requests
 * permission if needed. Returns why it couldn't, for a friendly message.
 */
export async function sendTestReminder(): Promise<TestReminderResult> {
  try {
    ensureHandler();
    const granted = await requestNotificationPermission();
    if (!granted) return 'denied';
    await ensureAndroidChannel();
    await scheduleReminderAt(
      'test_reminder',
      new Date(Date.now() + 5000),
      'Reminders are working',
      'This is a test nudge. Renewal and daily reminders will arrive just like this.',
    );
    return 'scheduled';
  } catch {
    return 'unavailable';
  }
}

/** Android needs a channel before notifications show. Safe/no-op elsewhere. */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch { /* ignore */ }
}
