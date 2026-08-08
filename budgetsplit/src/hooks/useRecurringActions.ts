import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import {
  pauseRecurring, resumeRecurring, endRecurring, skipNextOccurrence, undoNextSkip,
} from '../db/queries/recurring';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { haptic } from '../lib/haptics';

/**
 * Pause / resume / skip / undo-skip / stop for one recurring rule.
 *
 * Shared so the per-group list and the global Plan list can't drift: the global
 * list previously had none of these and could only bounce you into the group one.
 */
export function useRecurringActions(reload: () => Promise<void> | void) {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();

  const fail = () => { haptic.error(); Alert.alert('Something went wrong', 'Please try again.'); };

  /**
   * Every action here changes what OTHER screens show — the next-charge date on Plan,
   * Home's "Coming up", Reminders. `reload()` only re-runs the calling screen, so a
   * skip made on `/plan/recurring` left the Plan tab showing the old date until it
   * remounted. AGENTS.md ("After a write, call `refresh()`") existed for exactly this;
   * this hook was the one write path that didn't.
   */
  async function commit() {
    refresh();
    await reload();
  }

  async function skipNext(ruleId: string) {
    try {
      const skipped = await skipNextOccurrence(db, ruleId);
      if (skipped === null) { Alert.alert('Nothing to skip', 'This series has no upcoming occurrence.'); return; }
      haptic.warning();
      await commit();
    } catch { fail(); }
  }

  async function undoSkip(ruleId: string) {
    try {
      const restored = await undoNextSkip(db, ruleId);
      if (restored === null) { Alert.alert('No skips to undo', 'There are no upcoming skipped occurrences.'); return; }
      haptic.success();
      await commit();
    } catch { fail(); }
  }

  async function pause(ruleId: string) {
    try { await pauseRecurring(db, ruleId); haptic.warning(); await commit(); } catch { fail(); }
  }

  async function resume(ruleId: string) {
    try { await resumeRecurring(db, ruleId); haptic.success(); await commit(); } catch { fail(); }
  }

  function end(ruleId: string) {
    Alert.alert('Stop this recurring transaction?', 'It stops generating new occurrences. Past ones stay in history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: async () => {
        try { await endRecurring(db, ruleId); haptic.warning(); await commit(); } catch { fail(); }
      } },
    ]);
  }

  return { skipNext, undoSkip, pause, resume, end };
}
