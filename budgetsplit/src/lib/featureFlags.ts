import AsyncStorage from '@react-native-async-storage/async-storage';

// Each surface owns its own flag so it can be toggled independently — letting a
// user make the app as minimal or as rich as they want.
//
// INVARIANT: every key here gates a real surface AND appears in app/features.tsx.
// A key that gates nothing is worse than no key — it renders as a working switch
// that silently does nothing. Eight keys used to be pure dead configuration
// (five dashboard sections, budgetInsights, itemizedOcr); they were removed
// rather than given aspirational gates. `featureFlags.test.ts` asserts this.
// Old `feature_*` values for removed keys simply stop being read.
export type FeatureKey =
  // Dashboard sections
  | 'dashboardInsights'
  // Reports sections
  | 'reportsDonut'
  | 'reportsTrend'
  | 'forecast'
  // Other insight surfaces
  | 'savingsInsights'
  // Modules
  | 'splitting'
  | 'recurring'
  | 'smartCategory'
  | 'affordCheck'
  | 'streak'
  | 'healthScore'
  | 'savingsGoals'
  | 'reminders'
  | 'recurringSuggest';

export type FeatureFlags = Record<FeatureKey, boolean>;

export const DEFAULTS: FeatureFlags = {
  dashboardInsights: true,
  reportsDonut: true,
  reportsTrend: true,
  forecast: true,
  savingsInsights: true,
  // The one structural flag: OFF hides the Groups tab, the owe/owed strip on Home
  // and the Transfer kind in Add. Everything else here tunes a section's presence;
  // this one changes the app's shape, which is why the onboarding persona sets it
  // (see lib/personaDefaults.ts). Default ON — a fresh install shows the full app.
  splitting: true,
  recurring: true,
  smartCategory: false, // opt-in
  affordCheck: false,   // opt-in
  streak: false,        // opt-in
  healthScore: true,    // shown on home by default (matches Settings design)
  savingsGoals: true,   // Plan tab savings pool + goals
  reminders: true,      // bill / settle-up nudges (Settings › Reminders)
  recurringSuggest: false, // opt-in — heuristic, false-positive-prone like smartCategory
};

const PREFIX = 'feature_';

export async function loadFlags(): Promise<FeatureFlags> {
  const keys = Object.keys(DEFAULTS) as FeatureKey[];
  const pairs = await AsyncStorage.multiGet(keys.map(k => PREFIX + k));
  const flags = { ...DEFAULTS };
  for (const [raw, val] of pairs) {
    const key = raw.replace(PREFIX, '') as FeatureKey;
    if (val !== null) flags[key] = val === 'true';
  }
  return flags;
}

export async function setFlag(key: FeatureKey, value: boolean): Promise<void> {
  await AsyncStorage.setItem(PREFIX + key, value ? 'true' : 'false');
}
