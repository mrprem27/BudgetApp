import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { getStoredSession, serverConfigured } from '../lib/serverApi';
import { linkedUser, lastSyncedAt } from '../db/queries/syncApply';
import { queueCount } from '../db/queries/syncQueue';
import { runSync, syncActivity } from '../lib/sync';
import { syncStatus, type SyncStatusView } from '../lib/syncStatus';

type Snapshot = { signedIn: boolean; linked: boolean; waiting: number; lastSyncedAt: number | null };

/**
 * Everything `SyncStatus` shows, live: what sync is doing (in memory), what is
 * waiting and when it last finished (the database), and whether there is anyone
 * signed in at all. Null when there is nothing to report — no server in this
 * build, or nobody signed in — so the line simply isn't drawn.
 */
export function useSyncStatus(): { view: SyncStatusView; retry: () => void } | null {
  const db = useSQLiteContext();
  const { version, refresh } = useDataRefresh();
  const activity = useSyncExternalStore(syncActivity.subscribe, syncActivity.get);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    (async () => {
      const session = serverConfigured() ? await getStoredSession().catch(() => null) : null;
      if (!session) { if (alive) setSnap({ signedIn: false, linked: false, waiting: 0, lastSyncedAt: null }); return; }
      const [linked, waiting, last] = await Promise.all([linkedUser(db), queueCount(db), lastSyncedAt(db)]);
      if (alive) setSnap({ signedIn: true, linked: linked === session.user.id, waiting, lastSyncedAt: last });
    })().catch(() => {});
    return () => { alive = false; };
    // Re-read after every write (version) and every time a sync starts or ends.
  }, [db, version, activity.syncing]);

  // "2 min ago" has to keep moving while the screen is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const retry = useCallback(() => {
    runSync(db).then(r => { if (r?.changed) refresh(); }).catch(() => {});
  }, [db, refresh]);

  if (!snap?.signedIn) return null;
  return {
    view: syncStatus({ ...activity, linked: snap.linked, waiting: snap.waiting, lastSyncedAt: snap.lastSyncedAt, now }),
    retry,
  };
}
