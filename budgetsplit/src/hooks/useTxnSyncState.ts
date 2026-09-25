import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { syncIssuesFor, keepYours, keepTheirs, type TxnSyncIssue } from '../db/queries/syncConflicts';
import { linkedUser } from '../db/queries/syncApply';
import { serverVersion } from '../db/queries/syncQueue';
import { fetchTxnHistory, getStoredSession, serverConfigured } from '../lib/serverApi';
import { describeHistory, type HistoryLine } from '../lib/txnHistory';
import { scheduleSync } from '../lib/sync';

/**
 * What sync has to say about one transaction (SPEC-SERVER.md §6.3–6.4):
 *
 * - `conflict`: changed on another phone first — "Keep yours or theirs?";
 * - `refused`: a change the server would not take, already undone here;
 * - `history`: every saved version, from the server, described — or null when
 *   there is none to fetch (not signed in, never uploaded, offline), and the
 *   screen shows this phone's own log instead.
 */
export function useTxnSyncState(txnId: string | undefined) {
  const db = useSQLiteContext();
  const { version, refresh } = useDataRefresh();
  const [issues, setIssues] = useState<TxnSyncIssue[]>([]);
  const [history, setHistory] = useState<HistoryLine[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!txnId) return;
    let alive = true;
    syncIssuesFor(db, txnId).then(x => { if (alive) setIssues(x); }).catch(() => {});
    return () => { alive = false; };
  }, [db, txnId, version]);

  // Loaded when opened, never synced (§6.4). A failed fetch leaves the local log.
  useEffect(() => {
    if (!txnId || !serverConfigured()) return;
    let alive = true;
    (async () => {
      const session = await getStoredSession();
      if (!session || (await linkedUser(db)) !== session.user.id) return;
      if ((await serverVersion(db, 'transactions', txnId)) === 0) return;   // never reached the server
      const entries = await fetchTxnHistory(txnId);
      if (alive) setHistory(describeHistory(entries, session.user.id));
    })().catch(() => {});
    return () => { alive = false; };
  }, [db, txnId, version]);

  const conflict = issues.find(i => i.kind === 'conflict') ?? null;
  const refusal = issues.find(i => i.kind === 'refused') ?? null;

  const chooseYours = useCallback(async () => {
    if (!conflict) return;
    const session = await getStoredSession();
    if (!session) return;
    setBusy(true);
    try {
      await keepYours(db, conflict.mutationId, session.user.id);
      refresh();
      scheduleSync(db, refresh, 0);
    } finally {
      setBusy(false);
    }
  }, [db, conflict, refresh]);

  const chooseTheirs = useCallback(async () => {
    if (!conflict) return;
    await keepTheirs(db, conflict.mutationId);
    refresh();
  }, [db, conflict, refresh]);

  const dismissRefusal = useCallback(async () => {
    if (!refusal) return;
    await keepTheirs(db, refusal.mutationId);
    refresh();
  }, [db, refusal, refresh]);

  return { conflict, refusal, history, busy, chooseYours, chooseTheirs, dismissRefusal };
}
