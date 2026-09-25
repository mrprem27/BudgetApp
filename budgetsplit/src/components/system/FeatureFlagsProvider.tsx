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

type Props = {
  children: React.ReactNode;
  /**
   * Flags already read by the root boot effect, in parallel with opening the
   * DB (`app/_layout.tsx`). When given, this provider starts `ready` — no
   * second AsyncStorage read stands between the root's one loader and the
   * first real screen. Omit it (existing callers, tests) and the provider
   * reads for itself exactly as before.
   */
  initialFlags?: FeatureFlags;
};

export function FeatureFlagsProvider({ children, initialFlags }: Props) {
  const [flags, setFlags] = useState<FeatureFlags>(() => initialFlags ?? defaultFlags);
  const [ready, setReady] = useState(() => initialFlags !== undefined);

  useEffect(() => {
    // Already have a fresh read from the root boot effect — nothing to do.
    if (initialFlags !== undefined) return;
    let alive = true;
    loadFlags().then(f => { if (alive) setFlags(f); }).catch(() => {}).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [initialFlags]);

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
 * In practice this never shows one: the root boot effect reads flags in
 * parallel with opening the DB and hands them to `FeatureFlagsProvider` as
 * `initialFlags`, so `ready` is already true by the time anything here
 * mounts. It stays as the safety net for the one caller that doesn't pass
 * `initialFlags` — without it the tree would render once with DEFAULTS and
 * then re-render with the user's real values, flashing a surface someone
 * switched off. `boot-flicker` (T1) is what moved the read up front; this
 * gate is the fallback if that ever regresses, not the primary defence.
 */
export function FlagsGate({ children }: { children: React.ReactNode }) {
  const { ready } = useFeatureFlags();
  if (!ready) return <BrandedLoader />;
  return <>{children}</>;
}

export function useFeatureFlags() {
  return useContext(Ctx);
}
