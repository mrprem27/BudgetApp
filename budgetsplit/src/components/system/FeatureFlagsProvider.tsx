import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadFlags, setFlag as persistFlag, type FeatureFlags, type FeatureKey } from '../../lib/featureFlags';

type ContextValue = {
  flags: FeatureFlags;
  setFlag: (key: FeatureKey, value: boolean) => void;
  ready: boolean;
};

const defaultFlags: FeatureFlags = { insights: true, forecast: true, itemizedOcr: true, recurring: true };

const Ctx = createContext<ContextValue>({ flags: defaultFlags, setFlag: () => {}, ready: false });

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(defaultFlags);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadFlags().then(f => { setFlags(f); setReady(true); });
  }, []);

  const set = useCallback((key: FeatureKey, value: boolean) => {
    setFlags(prev => ({ ...prev, [key]: value }));
    persistFlag(key, value);
  }, []);

  return <Ctx.Provider value={{ flags, setFlag: set, ready }}>{children}</Ctx.Provider>;
}

export function useFeatureFlags() {
  return useContext(Ctx);
}
