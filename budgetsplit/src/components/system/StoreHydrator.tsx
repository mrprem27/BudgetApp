import { useCallback, useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { hydrateStore } from '../../store/hydrate';
import { useRefreshOnDataChange } from './DataRefreshProvider';

/**
 * Hydrates the small global store (`me`, `groups`) once at app start and again on
 * any cross-screen write (DataRefreshProvider). Renders nothing. Must live inside
 * the SQLiteProvider + DataRefreshProvider tree. Screens read these from the store
 * instead of re-querying, for instant first paint.
 */
export function StoreHydrator() {
  const db = useSQLiteContext();
  // Non-fatal on failure: screens still load their own data via useScreenData.
  const hydrate = useCallback(() => { hydrateStore(db).catch(() => {}); }, [db]);

  useEffect(() => { hydrate(); }, [hydrate]);
  useRefreshOnDataChange(hydrate);

  return null;
}
