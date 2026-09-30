import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { openTestDb, seedGroupAndMe } from './dbHarness';
import { setFlag } from '../lib/featureFlags';
import { setReminderPrefs } from '../lib/reminderPrefsStore';
import * as notifications from '../lib/notifications';
import { rescheduleReminders } from '../lib/reminders';
import { insertTxnRows } from '../db/queries/transactions';

jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));
// `lib/notifications` wraps the native module; here it only records what would reach the OS.
jest.mock('../lib/notifications', () => ({
  hasNotificationPermission: jest.fn(async () => true),
  ensureAndroidChannel: jest.fn(async () => {}),
  cancelAllReminders: jest.fn(async () => {}),
  scheduleReminderAt: jest.fn(async () => {}),
  scheduleDailyReminder: jest.fn(async () => {}),
}));

const store = AsyncStorage as unknown as { __reset: () => void };
const scheduled = () =>
  (notifications.scheduleReminderAt as jest.Mock).mock.calls.length
  + (notifications.scheduleDailyReminder as jest.Mock).mock.calls.length;

beforeEach(() => { store.__reset(); (SecureStore as unknown as { __reset: () => void }).__reset(); jest.clearAllMocks(); });

// P2-4 (docs/SPEC-BUGSCAN.md): the Reminders switch hid its Settings row and nothing else — the
// daily nudge and the backup nudge kept firing for someone who had turned reminders off.
describe('P2-4 · the Reminders switch turns every reminder off', () => {
  it('schedules the daily and backup nudges while it is on', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await setReminderPrefs({ daily: true, backup: true });
    await rescheduleReminders(db);
    expect(scheduled()).toBe(2);
  });

  it('drops the renewal nudges when Recurring is off', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    // A monthly rule that started 25 days ago: its next charge is inside the 7-day lead.
    await insertTxnRows(db, {
      groupId: 'g', kind: 'expense', entryMode: 'quick', date: Date.now() - 25 * 86_400_000, category: 'Netflix',
      recurFreq: 'monthly', recurInterval: 1,
      payments: [{ personId: 'me', amount: 64_900 }], shares: [{ personId: 'me', amount: 64_900 }],
    } as Parameters<typeof insertTxnRows>[1], 'rule', Date.now());
    await setReminderPrefs({ renewals: true, renewalLeadDays: 7 });
    await rescheduleReminders(db);
    const withRecurring = (notifications.scheduleReminderAt as jest.Mock).mock.calls.length;
    expect(withRecurring).toBeGreaterThan(0);
    jest.clearAllMocks();
    await setFlag('recurring', false);
    await rescheduleReminders(db);
    expect(scheduled()).toBe(0);
  });

  it('drops the backup nudge while signed in — the account already keeps a copy (U-05)', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await setReminderPrefs({ backup: true });
    await SecureStore.setItemAsync('budgetsplit.session.v1', JSON.stringify({ token: 't', user: { id: 'u', email: 'a@b.c' } }));
    await rescheduleReminders(db);
    expect(scheduled()).toBe(0);
  });

  it('cancels them all and schedules nothing once it is off', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await setReminderPrefs({ daily: true, backup: true });
    await setFlag('reminders', false);
    await rescheduleReminders(db);
    expect(notifications.cancelAllReminders).toHaveBeenCalled();
    expect(scheduled()).toBe(0);
  });

  it('runs one rebuild at a time, so a late "on" cannot land after an "off"', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await setReminderPrefs({ daily: true });
    // Two rebuilds started together. Interleaved, both cancel before either schedules — which is
    // the window where one that read "on" schedules after one that read "off" has cancelled.
    await Promise.all([rescheduleReminders(db), rescheduleReminders(db)]);
    const at = (fn: unknown) => (fn as jest.Mock).mock.invocationCallOrder;
    const [c1, c2] = at(notifications.cancelAllReminders);
    const [s1] = at(notifications.scheduleDailyReminder);
    expect(c1 < s1 && s1 < c2).toBe(true);
  });
});
