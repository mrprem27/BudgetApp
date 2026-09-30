import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { pendingInvites, answerInvite, type PendingInvite } from '../db/queries/syncApply';
import { scheduleSync } from '../lib/sync/run';
import { haptic } from '../lib/haptics';
import { confirmAsync } from '../lib/confirm';
import { useDataRefresh } from '../components/system/DataRefreshProvider';

/** Group invitations waiting on me, and accepting one. Re-read on focus. */
export function useSyncInvites() {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    pendingInvites(db).then(p => { if (alive) setInvites(p); }).catch(() => {});
    return () => { alive = false; };
  }, [db]);

  useFocusEffect(load);

  /**
   * Queued like any other change (`answerInvite`), so it holds offline and can't
   * half-fail here. The group and its entries arrive with the sync this kicks off —
   * a cursor of zero already means "everything", so there is no special first pull.
   */
  async function accept(g: PendingInvite) {
    setJoining(g.memberId);
    try {
      await answerInvite(db, g, true);
    } catch {
      setJoining(null);
      haptic.error();
      Alert.alert('Could not accept', 'Please try again.');
      return;
    }
    setJoining(null);
    haptic.success();
    setInvites(prev => prev.filter(x => x.memberId !== g.memberId));
    // The group then shows up everywhere, not only here.
    scheduleSync(db, () => { refresh(); load(); }, 0);
    Alert.alert(
      'Joined',
      'The group appears as soon as the app syncs, in a few seconds if you’re online. Entries other people add show up in '
      + 'the group straight away, but move none of your own numbers until you accept them, '
      + 'unless you have marked that person trusted.',
    );
  }

  /**
   * Say no. Queued like an accept (`answerInvite`), so it holds offline; the server
   * only lets the invitee do it, and the group never appears here. Asked first
   * because the way back is being re-invited by an admin.
   */
  async function decline(g: PendingInvite) {
    const ok = await confirmAsync(
      `Decline ${g.groupName}?`,
      'You won’t see this group or anything in it. An admin can invite you again later.',
      'Decline',
    );
    if (!ok) return;
    setJoining(g.memberId);
    try {
      await answerInvite(db, g, false);
    } catch {
      setJoining(null);
      haptic.error();
      Alert.alert('Could not decline', 'Please try again.');
      return;
    }
    setJoining(null);
    haptic.warning();
    setInvites(prev => prev.filter(x => x.memberId !== g.memberId));
    scheduleSync(db, () => { refresh(); load(); }, 0);
  }

  return { invites, joining, accept, decline };
}
