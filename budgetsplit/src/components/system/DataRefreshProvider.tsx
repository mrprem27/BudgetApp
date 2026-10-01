import { track } from '../../lib/usageEvents';
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * App-wide "data changed" signal. The app reads SQLite directly per screen, so a
 * write on one screen can leave another showing stale data (e.g. saving a budget
 * then seeing the old number on Home). This is a tiny invalidation bus, not a
 * store: a write calls `refresh()`, which bumps a version; any screen registered
 * via `useRefreshOnDataChange(load)` re-runs its load — the *focused* screen
 * reloads live, backgrounded tabs mark themselves dirty and reload on next focus
 * (see useScreenData). Lightweight alternative to wiring the whole app through
 * React Query / a global store.
 *
 * Bumps are **coalesced**: a burst of writes (batch inserts, a multi-row save that
 * calls refresh() several times) collapses into a single version bump one frame
 * later, so the invalidation fans out once instead of N times.
 */
type DataRefreshValue = {
  version: number;
  /** After a write the user made. */
  refresh: () => void;
  /** After a change nobody on this phone made: sync, the foreground catch-up. Same reload, no `Saved` event. */
  refreshQuietly: () => void;
};

const Ctx = createContext<DataRefreshValue>({ version: 0, refresh: () => {}, refreshQuietly: () => {} });

// One frame's worth of quiet time — long enough to swallow a synchronous burst of
// writes, short enough to feel instant.
const COALESCE_MS = 32;

export function DataRefreshProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the burst being coalesced holds a write the user made.
  const byUser = useRef(false);

  const bump = useCallback((user: boolean) => {
    if (user) byUser.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      // Every write in the app ends here, so this one line measures "did something" on every
      // screen, present and future (`docs/SPEC-ANALYTICS.md`).
      if (byUser.current) track('Saved');
      byUser.current = false;
      setVersion(v => v + 1);
    }, COALESCE_MS);
  }, []);
  const refresh = useCallback(() => bump(true), [bump]);
  const refreshQuietly = useCallback(() => bump(false), [bump]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const value = useMemo(() => ({ version, refresh, refreshQuietly }), [version, refresh, refreshQuietly]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `refresh()` to broadcast that data changed after a write. */
export function useDataRefresh(): DataRefreshValue {
  return useContext(Ctx);
}

/**
 * Re-run `onChange` whenever data changes elsewhere (skips the initial mount —
 * screens already load on mount/focus, so this only fires on *subsequent*
 * cross-screen writes). Pair with a screen's existing `load()`.
 */
export function useRefreshOnDataChange(onChange: () => void) {
  const { version } = useDataRefresh();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    onChange();
    // onChange is intentionally not a dep — we trigger only on version change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}
