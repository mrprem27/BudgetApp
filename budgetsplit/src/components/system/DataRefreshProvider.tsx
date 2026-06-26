import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

/**
 * App-wide "data changed" signal. The app reads SQLite directly per screen, so a
 * write on one screen can leave another showing stale data (e.g. saving a budget
 * then seeing the old number on Home). This is a tiny invalidation bus, not a
 * store: a write calls `refresh()`, which bumps a version; any screen registered
 * via `useRefreshOnDataChange(load)` re-runs its load — even a backgrounded tab —
 * so the next time you see it, it's current. Lightweight alternative to wiring
 * the whole app through React Query / a global store.
 */
type DataRefreshValue = { version: number; refresh: () => void };

const Ctx = createContext<DataRefreshValue>({ version: 0, refresh: () => {} });

export function DataRefreshProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  return <Ctx.Provider value={{ version, refresh }}>{children}</Ctx.Provider>;
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
