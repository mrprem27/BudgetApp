import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { useFocusEffect, usePathname } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type * as SQLite from 'expo-sqlite';
import { useRefreshOnDataChange } from '../components/system/DataRefreshProvider';
import { readDataStamp } from '../db/queries/dataStamp';
import { recordLoad } from '../lib/loadTimes';

/** A load newer than this, with nothing changed since, is shown again on focus without re-reading. */
export const FRESH_FOR_MS = 5 * 60_000;

type Options = {
  /**
   * Re-run when the screen regains focus (skips the initial mount focus). Default true, and only
   * when something could have changed: see `FRESH_FOR_MS` and `readDataStamp`.
   * `'always'` is for a loader that reads something the database cannot vouch for: files, the
   * system's notification settings.
   */
  refetchOnFocus?: boolean | 'always';
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
 * Loads on mount and whenever `deps` change; reloads on a cross-screen write, and on refocus
 * when the data could have changed since; exposes pull-to-refresh state. Truth stays in SQLite — this
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

  // What the data looked like when the last good load started, and when that was. Read BEFORE
  // the loader runs, so a write that lands mid-load makes the next focus reload.
  const stamp = useRef<string | null>(null);
  const loadedAt = useRef(0);
  // The route this screen mounted on. A ref: `usePathname` follows the whole app's current route,
  // and a value that changed on every navigation would re-run every mounted screen's loader.
  const path = useRef(usePathname()).current;

  const run = useCallback(async (mode: 'load' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    const started = Date.now();
    try {
      const before = await readDataStamp(db).catch(() => null);
      const result = await loaderRef.current(db);
      recordLoad(path, Date.now() - started);
      if (!mounted.current) return;
      stamp.current = before;
      loadedAt.current = started;
      setData(result);
      setError(false);
    } catch {
      stamp.current = null;
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

  /*
   * On refocus (the initial mount focus is skipped; the effect above already loaded):
   *
   * - a write was announced while this screen was in the background → reload;
   * - otherwise ask the database whether anything changed (one round trip) and reload only if
   *   it did, or if what is on screen is older than `FRESH_FOR_MS`.
   *
   * It used to reload unconditionally, so moving between tabs re-ran every loader (seventy to a
   * hundred and fifty round trips each) to show the same figures (`U-02`).
   */
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    if (firstFocus.current) {
      firstFocus.current = false;
    } else if (dirty.current || refetchOnFocus === 'always') {
      dirty.current = false;
      void run('load');
    } else if (refetchOnFocus) {
      void (async () => {
        const unchanged = stamp.current !== null
          && Date.now() - loadedAt.current < FRESH_FOR_MS
          && (await readDataStamp(db).catch(() => null)) === stamp.current;
        if (!unchanged && mounted.current && isFocused.current) void run('load');
      })();
    }
    return () => { isFocused.current = false; };
  }, [run, refetchOnFocus, db]));

  // Cross-screen write: reload now if we're the focused screen, otherwise defer to
  // next focus. (This helper already skips the initial mount.)
  useRefreshOnDataChange(() => {
    if (!refetchOnDataChange) return;
    if (isFocused.current) void run('load');
    else dirty.current = true;
  });

  return { data, loading, stale, error, refreshing, onRefresh, reload };
}
