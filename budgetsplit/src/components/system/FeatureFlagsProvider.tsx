import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadFlags, setFlag as persistFlag, DEFAULTS, type FeatureFlags, type FeatureKey } from '../../lib/featureFlags';
import { BrandedLoader } from './BrandedLoader';

type ContextValue = {
  flags: FeatureFlags;
  setFlag: (key: FeatureKey, value: boolean) => void;
  reload: () => Promise<void>;
  ready: boolean;
};

// Single source of truth for defaults — lib/featureFlags.ts (was duplicated here).
const defaultFlags = DEFAULTS;

const Ctx = createContext<ContextValue>({
  flags: defaultFlags, setFlag: () => {}, reload: async () => {}, ready: false,
});

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(defaultFlags);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadFlags().then(f => { if (alive) setFlags(f); }).catch(() => {}).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const set = useCallback((key: FeatureKey, value: boolean) => {
    setFlags(prev => ({ ...prev, [key]: value }));
    persistFlag(key, value).catch(() => {}); // best-effort persist
  }, []);

  /**
   * Re-read the stored flags. Needed because this provider mounts *above* the
   * onboarding gate, so it has already loaded (and cached) the defaults by the time
   * the questionnaire writes the persona's flags. Without this, a user who picks
   * "Track my own spending" would still see the Groups tab until the next cold
   * start. Only onboarding needs it — `setFlag` keeps state in step otherwise.
   */
  const reload = useCallback(async () => {
    try { setFlags(await loadFlags()); } catch { /* keep what we have */ }
  }, []);

  return <Ctx.Provider value={{ flags, setFlag: set, reload, ready }}>{children}</Ctx.Provider>;
}

/**
 * Holds the branded loader until the stored flags have actually loaded.
 *
 * Without this the tree renders once with DEFAULTS and then re-renders with the
 * user's real values, so a surface someone switched OFF flashes on every cold
 * start. `ready` existed for this and had no consumer. The wait is a single
 * AsyncStorage.multiGet, and the root is already showing this same loader for
 * fonts and the DB.
 */
export function FlagsGate({ children }: { children: React.ReactNode }) {
  const { ready } = useFeatureFlags();
  if (!ready) return <BrandedLoader />;
  return <>{children}</>;
}

export function useFeatureFlags() {
  return useContext(Ctx);
}
