import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadFlags, setFlag, DEFAULTS, type FeatureKey } from '../lib/featureFlags';

const store = AsyncStorage as unknown as { __reset: () => void };

beforeEach(() => store.__reset());

describe('DEFAULTS', () => {
  it('keeps the four opt-in features off', () => {
    expect(DEFAULTS.smartCategory).toBe(false);
    expect(DEFAULTS.affordCheck).toBe(false);
    expect(DEFAULTS.streak).toBe(false);
  });

  it('has every other flag on', () => {
    const off = Object.entries(DEFAULTS).filter(([, v]) => !v).map(([k]) => k).sort();
    expect(off).toEqual(['affordCheck', 'smartCategory', 'streak']);
  });

  it('is a flat boolean record with no duplicate keys', () => {
    const keys = Object.keys(DEFAULTS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.values(DEFAULTS).every(v => typeof v === 'boolean')).toBe(true);
  });
});

describe('loadFlags', () => {
  it('returns the defaults on a fresh install', async () => {
    await expect(loadFlags()).resolves.toEqual(DEFAULTS);
  });

  it('returns every known key, even with nothing stored', async () => {
    const flags = await loadFlags();
    expect(Object.keys(flags).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });

  it('lets a stored value override a default-on flag', async () => {
    await setFlag('recurring', false);
    await expect(loadFlags()).resolves.toMatchObject({ recurring: false });
  });

  it('lets a stored value override a default-off flag', async () => {
    await setFlag('streak', true);
    await expect(loadFlags()).resolves.toMatchObject({ streak: true });
  });

  it('leaves untouched flags at their defaults', async () => {
    await setFlag('streak', true);
    const flags = await loadFlags();
    expect(flags.recurring).toBe(DEFAULTS.recurring);
    expect(flags.affordCheck).toBe(DEFAULTS.affordCheck);
  });

  it('treats a corrupt stored value as false rather than throwing', async () => {
    await AsyncStorage.setItem('feature_recurring', 'yes-please');
    await expect(loadFlags()).resolves.toMatchObject({ recurring: false });
  });

  it('ignores stored keys outside the known set', async () => {
    await AsyncStorage.setItem('feature_notARealFlag', 'true');
    const flags = await loadFlags();
    expect(flags).not.toHaveProperty('notARealFlag');
    expect(Object.keys(flags).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });

  it('does not mutate DEFAULTS across calls', async () => {
    const snapshot = { ...DEFAULTS };
    await setFlag('recurring', false);
    await loadFlags();
    expect(DEFAULTS).toEqual(snapshot);
  });
});

describe('setFlag', () => {
  it('namespaces every key with the feature_ prefix', async () => {
    await setFlag('forecast', false);
    await expect(AsyncStorage.getItem('feature_forecast')).resolves.toBe('false');
    await expect(AsyncStorage.getItem('forecast')).resolves.toBeNull();
  });

  it('round-trips a toggle', async () => {
    await setFlag('healthScore', false);
    await expect(loadFlags()).resolves.toMatchObject({ healthScore: false });
    await setFlag('healthScore', true);
    await expect(loadFlags()).resolves.toMatchObject({ healthScore: true });
  });

  it('persists every key independently', async () => {
    const keys = Object.keys(DEFAULTS) as FeatureKey[];
    for (const k of keys) await setFlag(k, false);
    const flags = await loadFlags();
    expect(Object.values(flags).every(v => v === false)).toBe(true);
  });
});
