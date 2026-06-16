import AsyncStorage from '@react-native-async-storage/async-storage';

export type FeatureKey = 'insights' | 'forecast' | 'itemizedOcr' | 'recurring';

export type FeatureFlags = Record<FeatureKey, boolean>;

const DEFAULTS: FeatureFlags = {
  insights: true,
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
