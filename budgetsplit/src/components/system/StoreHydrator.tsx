import { useCallback, useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useStore } from '../../store';
import { getMe } from '../../db/queries/persons';
import { getAllGroups } from '../../db/queries/groups';
import { useRefreshOnDataChange } from './DataRefreshProvider';

/**
 * Hydrates the small global store (`me`, `groups`) once at app start and again on
 * any cross-screen write (DataRefreshProvider). Renders nothing. Must live inside
 * the SQLiteProvider + DataRefreshProvider tree. Screens read these from the store
 * instead of re-querying, for instant first paint.
 */
export function StoreHydrator() {
  const db = useSQLiteContext();
  const setMe = useStore((s) => s.setMe);
  const setGroups = useStore((s) => s.setGroups);

  const hydrate = useCallback(async () => {
    try {
      const [me, groups] = await Promise.all([getMe(db), getAllGroups(db)]);
      // Most cross-screen writes (a new expense, a budget edit, a savings deposit)
      // touch neither the current user nor the groups list. Diff before writing so
      // those refreshes don't churn the store and re-render every consumer.
      const state = useStore.getState();
      const nextMe = me ?? null;
      if (JSON.stringify(state.me) !== JSON.stringify(nextMe)) setMe(nextMe);
      if (JSON.stringify(state.groups) !== JSON.stringify(groups)) setGroups(groups);
    } catch {
      // Non-fatal: screens still load their own data via useScreenData.
    }
  }, [db, setMe, setGroups]);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useRefreshOnDataChange(() => { void hydrate(); });

  return null;
}
