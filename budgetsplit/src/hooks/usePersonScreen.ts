import { useMemo } from 'react';
import { useStore } from '../store';
import { useScreenData } from './useScreenData';
import { getPersonById, setReceivableState } from '../db/queries/persons';
import { getFriendBalances } from '../db/queries/balances';
import { getSharedActivityWith } from '../db/queries/transactions';
import { computeTransferScopes } from '../lib/settleScope';
import { groupByDate } from '../lib/txnGrouping';
import { settleRhythmDays, settleRhythmLabel, isReceivableStale } from '../lib/settleHistory';
import { confirmAsync } from '../lib/confirm';
import { asReceivableState } from '../constants/enums';
import { haptic } from '../lib/haptics';
import { useSQLiteContext } from 'expo-sqlite';

/**
 * Everything the person detail screen shows: our shared history, what it nets to,
 * where that balance sits, and how reliably this person squares up.
 *
 * A hook rather than the screen, so the screen stays a composer (AGENTS "screen
 * thinness") — the same split `useTxnDetail` and `useSavingsGoalScreen` use.
 */
export function usePersonScreen(personId: string) {
  const db = useSQLiteContext();
  const me = useStore(s => s.me);

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(
    async (db) => {
      if (!me) throw new Error('No current user');
      const [person, activity, balances, scopes] = await Promise.all([
        getPersonById(db, personId),
        getSharedActivityWith(db, me.id, personId),
        getFriendBalances(db, me.id),
        computeTransferScopes(db, me.id, personId),
      ]);
      return {
        person,
        activity,
        // `getFriendBalances` returns everyone sharing a group, settled ones included,
        // so a missing row means we share no group rather than "balance zero".
        net: balances.find(b => b.personId === personId)?.net ?? 0,
        scopes,
      };
    },
    [personId, me?.id],
  );

  const activity = data?.activity ?? [];
  const sections = useMemo(() => groupByDate(activity), [activity]);

  const settlementDates = useMemo(
    // Approved settlements only. A pending "I paid you back" is exactly the claim
    // that must not reset the clock — it would make a stale balance look freshly
    // settled and silence the write-off suggestion, on someone else's say-so.
    () => activity.filter(t => t.kind === 'settlement' && !t.pendingApproval).map(t => t.date),
    [activity],
  );
  const rhythmDays = useMemo(() => settleRhythmDays(settlementDates), [settlementDates]);
  const rhythm = useMemo(() => settleRhythmLabel(rhythmDays), [rhythmDays]);

  const receivableState = asReceivableState(data?.person?.receivable_state);
  const net = data?.net ?? 0;

  /**
   * Suggest a write-off, never perform one. Only when they actually owe you and
   * the balance has gone quiet for longer than their own rhythm explains.
   */
  const suggestWriteOff = receivableState === 'expected'
    && net > 0
    && isReceivableStale(settlementDates.length ? Math.max(...settlementDates) : null, Date.now(), rhythmDays);

  async function toggleWrittenOff() {
    const next = receivableState === 'expected' ? 'written_off' : 'expected';
    const name = data?.person?.name ?? 'this person';
    const ok = await confirmAsync(
      next === 'written_off' ? `Write off what ${name} owes?` : `Count ${name}'s balance again?`,
      next === 'written_off'
        ? 'The balance stays on record and still shows here — it just stops counting as money you can rely on, so it will no longer hold off a savings raid.'
        : 'It will count as money coming back again.',
      next === 'written_off' ? 'Write off' : 'Count it',
    );
    if (!ok) return;
    await setReceivableState(db, personId, next);
    haptic.success();
    await reload();
  }

  return {
    me,
    person: data?.person ?? null,
    activity,
    sections,
    net,
    /** Per-group breakdown of this one balance — `FriendBalance` only carries the total. */
    scopes: data?.scopes ?? null,
    rhythm,
    receivableState, suggestWriteOff, toggleWrittenOff,
    loading, error, refreshing, onRefresh, reload,
  };
}
