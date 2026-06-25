import AsyncStorage from '@react-native-async-storage/async-storage';

// Each surface owns its own flag so it can be toggled independently — letting a
// user make the app as minimal or as rich as they want.
export type FeatureKey =
  // Dashboard sections
  | 'dashboardCash'
  | 'dashboardBudget'
  | 'dashboardDonut'
  | 'dashboardBalances'
  | 'dashboardSavings'
  | 'dashboardInsights'
  // Reports sections
  | 'reportsDonut'
  | 'reportsTrend'
  | 'forecast'
  // Other insight surfaces
  | 'budgetInsights'
  | 'savingsInsights'
  // Modules
  | 'itemizedOcr'
  | 'recurring'
  | 'smartCategory'
  | 'affordCheck'
  | 'streak'
  | 'healthScore'
  | 'subscriptions'
  | 'savingsGoals'
  | 'reminders';

export type FeatureFlags = Record<FeatureKey, boolean>;

const DEFAULTS: FeatureFlags = {
  dashboardCash: true,
  dashboardBudget: true,
  dashboardDonut: true,
  dashboardBalances: true,
  dashboardSavings: true,
  dashboardInsights: true,
  reportsDonut: true,
  reportsTrend: true,
  forecast: true,
  budgetInsights: true,
  savingsInsights: true,
  itemizedOcr: true,
  recurring: true,
  smartCategory: false, // opt-in
  affordCheck: false,   // opt-in
  streak: false,        // opt-in
  healthScore: true,    // shown on home by default (matches Settings design)
  subscriptions: true,  // auto-detect recurring charges by default (matches Settings design)
  savingsGoals: true,   // Plan tab savings pool + goals
  reminders: true,      // bill / settle-up nudges (Settings › Reminders)
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
