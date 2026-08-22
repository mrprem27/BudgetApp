import { useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useStore } from '../store';
import { useScreenData } from './useScreenData';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { getPendingApprovals, approveTxn, rejectTxn } from '../db/queries/approval';
import { loadSplitsMany, type Txn } from '../db/queries/transactions';
import { setTrustState } from '../db/queries/persons';
import { getAllPersons } from '../db/queries/persons';
import { getAllGroups } from '../db/queries/groups';
import { groupByAuthor, isIncomingTransfer, type PendingEntry } from '../lib/approvalData';
import { confirmAsync } from '../lib/confirm';
import type { PayMethod } from '../constants/enums';
import { haptic } from '../lib/haptics';

/**
 * The approvals queue: entries other people wrote that are waiting on me.
 *
 * A hook rather than the screen, so the screen stays a composer — the same split
 * `usePersonScreen` and `useTxnDetail` use.
 */
export function useApprovals() {
  const db = useSQLiteContext();
  const me = useStore(s => s.me);
  const { refresh } = useDataRefresh();

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(
    async (database) => {
      if (!me) throw new Error('No current user');
      const approvals = await getPendingApprovals(database);
      if (approvals.length === 0) return { entries: [] as PendingEntry[] };

      const [people, groups] = await Promise.all([
        getAllPersons(database),
        getAllGroups(database),
      ]);
      const personName = new Map(people.map(p => [p.id, p.name]));
      const groupName = new Map(groups.map(g => [g.id, g.name]));

      // Fetch the entries themselves. No approval filter here on purpose: this is
      // the one screen whose entire subject is the pending rows.
      const placeholders = approvals.map(() => '?').join(',');
      const rows = await database.getAllAsync<Txn>(
        `SELECT * FROM txn WHERE id IN (${placeholders})`,
        approvals.map(a => a.txn_id),
      );
      const withSplits = await loadSplitsMany(database, rows);
      const arrivedAt = new Map(approvals.map(a => [a.txn_id, a.created_at]));

      const entries: PendingEntry[] = withSplits.map(t => ({
        txnId: t.id,
        authorId: t.author_person_id ?? '',
        authorName: personName.get(t.author_person_id ?? '') ?? 'Someone',
        groupName: groupName.get(t.group_id) ?? 'a group',
        category: t.category,
        note: t.note,
        date: t.date,
        arrivedAt: arrivedAt.get(t.id) ?? t.created_at,
        kind: t.kind === 'settlement' ? 'settlement' : 'expense',
        total: t.payments.reduce((s, p) => s + p.amount, 0),
        myShare: t.shares.find(s => s.personId === me.id)?.amount ?? 0,
        myPaid: t.payments.find(p => p.personId === me.id)?.amount ?? 0,
        recurFreq: t.recur_freq,
      }));
      // Keep arrival order; grouping preserves it per author.
      entries.sort((a, b) => a.arrivedAt - b.arrivedAt);
      return { entries };
    },
    [me?.id],
  );

  const entries = data?.entries ?? [];
  const byAuthor = useMemo(() => groupByAuthor(entries), [entries]);

  /**
   * Accepting is the ordinary act, so it is not gated behind a dialog — except for
   * money arriving, where the screen asks where it landed first and passes it here.
   */
  async function approve(txnId: string, landedPayMethod?: PayMethod) {
    await approveTxn(db, txnId, landedPayMethod);
    haptic.success();
    refresh();
  }

  /**
   * Rejecting says "this did not happen". It removes the entry from my ledger and
   * cannot be undone from this screen, so it asks first — and the copy is honest
   * that their copy is unaffected.
   */
  async function reject(entry: PendingEntry) {
    const ok = await confirmAsync(
      `Not yours?`,
      `This removes ${entry.authorName}'s entry from your ledger. It stays on theirs — you may want to tell them.`,
      'Not mine',
    );
    if (!ok) return;
    await rejectTxn(db, entry.txnId);
    haptic.warning();
    refresh();
  }

  /**
   * The answer to "I approve everything from this person". Trusting is a real
   * decision with a future, so it confirms — and it applies to everything already
   * waiting, because otherwise the user has to trust AND clear the queue.
   */
  async function trustAuthor(authorId: string, name: string, pending: PendingEntry[]) {
    const ok = await confirmAsync(
      `Trust ${name}?`,
      `Anything ${name} adds in a shared group will count straight away, without waiting for you. `
      + `Money they say they have sent you still has to be confirmed each time.`,
      'Trust',
    );
    if (!ok) return;
    await setTrustState(db, authorId, 'trusted');
    // Trust does not clear money ARRIVING. "Did it reach me, and where" is not a
    // question about honesty, and those entries stay in the queue to be confirmed
    // one at a time. See `requiresMyApproval`.
    for (const e of pending) {
      if (!isIncomingTransfer(e)) await approveTxn(db, e.txnId);
    }
    haptic.success();
    refresh();
  }

  return {
    entries, byAuthor,
    approve, reject, trustAuthor,
    loading, error, refreshing, onRefresh, reload,
  };
}
