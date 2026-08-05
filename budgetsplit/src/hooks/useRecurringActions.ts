import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import {
  pauseRecurring, resumeRecurring, endRecurring, skipNextOccurrence, undoNextSkip,
} from '../db/queries/recurring';
import { haptic } from '../lib/haptics';

/**
 * Pause / resume / skip / undo-skip / stop for one recurring rule.
 *
 * Shared so the per-group list and the global Plan list can't drift: the global
 * list previously had none of these and could only bounce you into the group one.
 */
export function useRecurringActions(reload: () => Promise<void> | void) {
  const db = useSQLiteContext();

  const fail = () => { haptic.error(); Alert.alert('Something went wrong', 'Please try again.'); };

  async function skipNext(ruleId: string) {
    try {
      const skipped = await skipNextOccurrence(db, ruleId);
      if (skipped === null) { Alert.alert('Nothing to skip', 'This series has no upcoming occurrence.'); return; }
      haptic.warning();
      await reload();
    } catch { fail(); }
  }

  async function undoSkip(ruleId: string) {
    try {
      const restored = await undoNextSkip(db, ruleId);
      if (restored === null) { Alert.alert('No skips to undo', 'There are no upcoming skipped occurrences.'); return; }
      haptic.success();
      await reload();
    } catch { fail(); }
  }

  async function pause(ruleId: string) {
    try { await pauseRecurring(db, ruleId); haptic.warning(); await reload(); } catch { fail(); }
  }

  async function resume(ruleId: string) {
    try { await resumeRecurring(db, ruleId); haptic.success(); await reload(); } catch { fail(); }
  }

  function end(ruleId: string) {
    Alert.alert('Stop this recurring transaction?', 'It stops generating new occurrences. Past ones stay in history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: async () => {
        try { await endRecurring(db, ruleId); haptic.warning(); await reload(); } catch { fail(); }
      } },
    ]);
  }

  return { skipNext, undoSkip, pause, resume, end };
}
