import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadFlags, setFlag as persistFlag, type FeatureFlags, type FeatureKey } from '../../lib/featureFlags';

type ContextValue = {
  flags: FeatureFlags;
  setFlag: (key: FeatureKey, value: boolean) => void;
  ready: boolean;
};

const defaultFlags: FeatureFlags = {
  dashboardCash: true, dashboardBudget: true, dashboardDonut: true, dashboardBalances: true, dashboardSavings: true, dashboardInsights: true,
  reportsDonut: true, reportsTrend: true, forecast: true,
  budgetInsights: true, savingsInsights: true,
  itemizedOcr: true, recurring: true, smartCategory: false, affordCheck: false, streak: false, healthScore: true, subscriptions: false,
};

const Ctx = createContext<ContextValue>({ flags: defaultFlags, setFlag: () => {}, ready: false });

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

  return <Ctx.Provider value={{ flags, setFlag: set, ready }}>{children}</Ctx.Provider>;
}

export function useFeatureFlags() {
  return useContext(Ctx);
}
