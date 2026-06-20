import AsyncStorage from '@react-native-async-storage/async-storage';

// Each insight surface owns its own flag so it can be toggled independently.
export type FeatureKey =
  | 'dashboardInsights'
  | 'budgetInsights'
  | 'savingsInsights'
  | 'forecast'
  | 'itemizedOcr'
  | 'recurring';

export type FeatureFlags = Record<FeatureKey, boolean>;

const DEFAULTS: FeatureFlags = {
  dashboardInsights: true,
  budgetInsights: true,
  savingsInsights: true,
  forecast: true,
  itemizedOcr: true,
  recurring: true,
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
