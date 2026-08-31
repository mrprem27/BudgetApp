import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type * as SQLite from 'expo-sqlite';
import { useRefreshOnDataChange } from '../components/system/DataRefreshProvider';

type Options = {
  /** Re-run when the screen regains focus (skips the initial mount focus). Default true. */
  refetchOnFocus?: boolean;
  /** Re-run when another screen signals a write via DataRefreshProvider. Default true. */
  refetchOnDataChange?: boolean;
};

export type ScreenData<T> = {
  /** Loader result; undefined until the first load resolves. */
  data: T | undefined;
  /**
   * True while the data on hand does not describe the current `deps` — i.e. on
   * the first load, and again whenever `deps` change.
   *
   * Deliberately NOT true for a refocus, a pull-to-refresh or a cross-screen
   * write: those re-read the same inputs, so what is on screen is still correct
   * and replacing it with a skeleton would flash for no reason.
   */
  loading: boolean;
  /** True if the most recent load threw. */
  error: boolean;
  /** True while a pull-to-refresh is in flight. */
  refreshing: boolean;
  /** Pass straight to {@link AppRefreshControl} as `onRefresh`. */
  onRefresh: () => void;
  /** Imperatively re-run the loader (e.g. after an in-screen retry). */
  reload: () => Promise<void>;
};

/**
 * The one data-loading hook for screens. Replaces the per-screen
 * `useState`/`load()`/try-catch/`loading`/`error`/`useFocusEffect`/`useRefresh`/
 * `useRefreshOnDataChange` boilerplate with a single call, built on the existing
 * primitives (SQLite context + DataRefreshProvider + AppRefreshControl).
 *
 * Loads on mount and whenever `deps` change; reloads on refocus and on a
 * cross-screen write; exposes pull-to-refresh state. Truth stays in SQLite — this
 * is read ergonomics, not a store.
 *
 * @example
 * const { data, loading, error, refreshing, onRefresh } = useScreenData(
 *   async (db) => ({ me: await getMe(db), friends: await getFriendBalances(db, meId) }),
 *   [meId],
 * );
 */
export function useScreenData<T>(
  loader: (db: SQLite.SQLiteDatabase) => Promise<T>,
  deps: DependencyList = [],
  options: Options = {},
): ScreenData<T> {
  const { refetchOnFocus = true, refetchOnDataChange = true } = options;
  const db = useSQLiteContext();

  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Keep the latest loader without making it a reactive dependency — `deps` is the
  // explicit contract for when to re-run, so an inline closure won't refetch every render.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async (mode: 'load' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const result = await loaderRef.current(db);
      if (!mounted.current) return;
      setData(result);
      setError(false);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) {
        setLoading(false);
        if (mode === 'refresh') setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...deps]);

  const reload = useCallback(() => run('load'), [run]);
  const onRefresh = useCallback(() => { void run('refresh'); }, [run]);

  /*
   * Load on mount + whenever deps (via `run`) change — and go back to `loading`
   * when they do.
   *
   * `loading` was only ever set false, never true again, so it meant "the first
   * load has finished" forever after. A deps change is different in kind from a
   * refocus or a cross-screen write: those re-read the SAME inputs, so the data
   * on screen is merely a moment old and still describes what it claims to. A
   * deps change means the data now describes DIFFERENT inputs — it is not stale,
   * it is mislabelled.
   *
   * Reports is where that showed: changing the month left last month's Spent,
   * Earned, donut and deltas on screen under the new month's heading, and its
   * loader floors itself at 450ms to stop the skeleton flashing, which
   * guaranteed the wrong numbers were displayed under the wrong label for at
   * least that long. Someone reading them had no way to know.
   */
  useEffect(() => {
    setLoading(true);
    void run('load');
  }, [run]);

  // Track focus so a cross-screen write only re-queries the screen the user is
  // actually looking at. Backgrounded tabs (Home/Groups/Savings all stay mounted)
  // just mark themselves dirty and reload the next time they regain focus —
  // otherwise one write fans out into a full re-query of every mounted screen.
  const isFocused = useRef(false);
  const dirty = useRef(false);

  // Reload on refocus, skipping the initial mount focus (the effect above already loaded).
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    if (firstFocus.current) {
      firstFocus.current = false;
    } else if (refetchOnFocus || dirty.current) {
      dirty.current = false;
      void run('load');
    }
    return () => { isFocused.current = false; };
  }, [run, refetchOnFocus]));

  // Cross-screen write: reload now if we're the focused screen, otherwise defer to
  // next focus. (This helper already skips the initial mount.)
  useRefreshOnDataChange(() => {
    if (!refetchOnDataChange) return;
    if (isFocused.current) void run('load');
    else dirty.current = true;
  });

  return { data, loading, error, refreshing, onRefresh, reload };
}
