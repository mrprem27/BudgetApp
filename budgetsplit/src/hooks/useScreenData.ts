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
   * **There is nothing to show yet** — no load has ever resolved.
   *
   * Most screens render `loading ? null` or a skeleton, so this must mean "the
   * screen is empty", nothing more. It was briefly widened to "the data does not
   * describe the current deps", which fires on every `deps` change — and since a
   * period pill or a month arrow IS a dep, the Dashboard blanked and faded itself
   * back in on every Day/Month/Year tap, along with five other screens.
   *
   * If you need "the figures on screen are about to be relabelled", that is
   * {@link ScreenData.stale}, not this.
   */
  loading: boolean;
  /**
   * A refetch caused by a **`deps` change** is in flight, and there is already
   * data on screen — so what is displayed describes the PREVIOUS deps.
   *
   * Only worth reacting to when the surrounding UI relabels the data: Reports
   * puts a month name above its figures, so showing August's numbers under
   * "September" is a lie, and it shows a skeleton instead. Everywhere else the
   * honest thing is to leave the content up — a local SQLite read is tens of
   * milliseconds, and a screen that empties is far worse than one that is briefly
   * a beat behind.
   *
   * Never true for a refocus, a pull-to-refresh or a cross-screen write: those
   * re-read the SAME inputs, so nothing on screen is mislabelled.
   */
  stale: boolean;
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
  const [stale, setStale] = useState(false);
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
        setStale(false);
        if (mode === 'refresh') setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...deps]);

  const reload = useCallback(() => run('load'), [run]);
  const onRefresh = useCallback(() => { void run('refresh'); }, [run]);

  // Whether any load has ever resolved. A ref, not `data`, because the effect
  // below needs the answer for the render it is reacting to, and state is a render
  // behind.
  const prevExists = useRef(false);
  useEffect(() => { if (data !== undefined) prevExists.current = true; }, [data]);

  /*
   * Load on mount + whenever deps (via `run`) change.
   *
   * A deps change raises `stale`, NOT `loading`, and the difference is the whole
   * point of having two flags:
   *
   * - `loading` means "there is nothing to show". Setting it here made every deps
   *   change empty the screen — and a period pill, a month arrow and a kind tab
   *   are all deps, so the Dashboard blanked and re-faded on every Day/Month/Year
   *   tap, as did report-transactions, categories and history.
   * - `stale` means "what is on screen describes the previous deps". Reports acts
   *   on it, because it prints a month name above its figures and showing August's
   *   numbers under "September" is a lie. Nobody else needs to: a local read is
   *   tens of milliseconds, and content that is a beat behind beats no content.
   *
   * Only raised when data already exists — on the very first run `loading` is
   * already true and there is nothing to be stale about.
   */
  useEffect(() => {
    setStale(prevExists.current);
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

  return { data, loading, stale, error, refreshing, onRefresh, reload };
}
