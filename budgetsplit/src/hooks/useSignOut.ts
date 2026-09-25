import { useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { haptic } from '../lib/haptics';
import { signOut, getStoredSession } from '../lib/serverApi';
import { settings } from '../lib/settings';
import { rescheduleReminders } from '../lib/reminders';
import { reapUnreferencedPhotos } from '../db/queries/backup';
import { planSignOutNow, wipeForSignOutNow } from '../lib/sync';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { useRestartOnboarding } from '../components/system/OnboardingGate';

/**
 * Sign out (SPEC-SERVER.md §4.1, `DQ-97`): upload first, then empty the phone.
 *
 * 1. Confirm.
 * 2. One sync. A phone never linked to this account keeps its data and only
 *    signs out — that data exists nowhere else.
 * 3. Changes still waiting (offline, a refused push) → say how many. Cancel is
 *    the default; "Sign out anyway" writes an export file first.
 * 4. Wipe to a fresh install, THEN clear the session: a wipe that fails leaves
 *    the phone as it was and still signed in, never signed out with data behind.
 * 5. Preferences go too, and the app returns to Welcome.
 *
 * The confirms are `Alert`s until S15/S16 give sync its screens.
 */
export function useSignOut({ onSignedOut }: { onSignedOut?: () => void | Promise<void> } = {}) {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const restartOnboarding = useRestartOnboarding();
  const [signingOut, setSigningOut] = useState(false);

  const ask = (title: string, body: string, action: string) => new Promise<boolean>(resolve => {
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

  /** The session and everything that belonged to it. */
  async function endSession() {
    await signOut();
  }

  async function run(): Promise<void> {
    const session = await getStoredSession();
    if (!session) return;
    if (!(await ask(
      'Sign out?',
      'Everything is saved to your account. Signing out clears this phone; sign in again to bring it back.',
      'Sign out',
    ))) return;

    setSigningOut(true);
    try {
      const plan = await planSignOutNow(db, session.user.id);
      if (plan.kind === 'keep') {
        // Never joined to this account: nothing here is on the server.
        await endSession();
      } else {
        let exportFirst = false;
        if (plan.kind === 'unsent') {
          const n = plan.count;
          if (!(await ask(
            `${n} ${n === 1 ? 'change hasn’t' : 'changes haven’t'} uploaded yet`,
            'Signing out now removes them from this phone. Connect to the internet and try again, or sign out anyway — a copy is saved to Files first.',
            'Sign out anyway',
          ))) return;
          exportFirst = true;
        }
        await wipeForSignOutNow(db, { exportFirst });
        await endSession();
        await settings.resetAll().catch(() => {});
        await rescheduleReminders(db).catch(() => {});
        await reapUnreferencedPhotos(db).catch(() => {});
        refresh();
        restartOnboarding();
      }
      haptic.warning();
      await onSignedOut?.();
    } catch (e) {
      haptic.error();
      Alert.alert(
        'Couldn’t sign out',
        `${e instanceof Error ? e.message : 'Something went wrong.'} Nothing on this phone changed, and you’re still signed in.`,
      );
    } finally {
      setSigningOut(false);
    }
  }

  return { signOut: run, signingOut };
}
