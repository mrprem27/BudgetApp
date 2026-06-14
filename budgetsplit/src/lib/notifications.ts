import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { getAllGroups } from '../db/queries/groups';
import { getBudgetUsage } from './budget';

export async function scheduleNotifications(db: SQLite.SQLiteDatabase): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const groups = await getAllGroups(db);

  for (const group of groups) {
    for (const period of ['daily', 'monthly', 'yearly'] as const) {
      const usage = await getBudgetUsage(db, group, period);
      if (!usage.limit || usage.pct === null) continue;

      if (usage.pct >= 100) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${group.name} budget exceeded`,
            body: `You've spent ${usage.pct}% of your ${period} budget.`,
          },
          trigger: null,
        });
      } else if (usage.pct >= 80) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${group.name} budget at ${usage.pct}%`,
            body: `You've used ${usage.pct}% of your ${period} budget.`,
          },
          trigger: null,
        });
      }
    }
  }
}
