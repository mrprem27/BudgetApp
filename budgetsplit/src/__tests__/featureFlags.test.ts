import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadFlags, setFlag, DEFAULTS, type FeatureKey } from '../lib/featureFlags';

const store = AsyncStorage as unknown as { __reset: () => void };

beforeEach(() => store.__reset());

// --- Source scan, for the "no dead flags" invariant below -------------------
const ROOT = path.resolve(__dirname, '../..');
const FLAG_DEF = path.join(ROOT, 'src/lib/featureFlags.ts');
const FEATURES_SCREEN = path.join(ROOT, 'app/features.tsx');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every .ts/.tsx under app/ and src/, minus the flag definition itself. */
const CONSUMER_SOURCE = sourceFiles(path.join(ROOT, 'app'))
  .concat(sourceFiles(path.join(ROOT, 'src')))
  .filter(f => f !== FLAG_DEF && f !== FEATURES_SCREEN)
  .map(f => fs.readFileSync(f, 'utf8'))
  .join('\n');

describe('DEFAULTS', () => {
  // affordCheck was flipped ON: once the engine grew past a cash check it stopped
  // being a novelty, and defaulting it off is why nobody ever found it. Streak is
  // the only flag left off — it is decoration, and it self-hides under 3 days
  // anyway, so on-by-default would be a promise the feature rarely keeps.
  it('leaves exactly one flag off by default', () => {
    const off = Object.entries(DEFAULTS).filter(([, v]) => !v).map(([k]) => k);
    expect(off).toEqual(['streak']);
  });

  it('is a flat boolean record with no duplicate keys', () => {
    const keys = Object.keys(DEFAULTS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.values(DEFAULTS).every(v => typeof v === 'boolean')).toBe(true);
  });
});

/**
 * The reason the five chart-fragment keys were deleted: a flag that gates nothing
 * renders as a working switch that does nothing. These two tests are the guard against that coming
 * back — they read the actual source, so a new key must be wired before it can
 * be added, and a surface can't quietly stop honouring its flag.
 */
describe('no dead flags', () => {
  it('every key is read by some screen or lib', () => {
    const unused = (Object.keys(DEFAULTS) as FeatureKey[]).filter(key => {
      const patterns = [`flags.${key}`, `flags['${key}']`, `'${key}'`];
      return !patterns.some(p => CONSUMER_SOURCE.includes(p));
    });
    expect(unused).toEqual([]);
  });

  it('every key is exposed in the Feature Management screen', () => {
    const screen = fs.readFileSync(FEATURES_SCREEN, 'utf8');
    const hidden = (Object.keys(DEFAULTS) as FeatureKey[]).filter(key => !screen.includes(`'${key}'`));
    expect(hidden).toEqual([]);
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
    expect(flags.insights).toBe(DEFAULTS.insights);
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
    await setFlag('reports', false);
    await expect(AsyncStorage.getItem('feature_reports')).resolves.toBe('false');
    await expect(AsyncStorage.getItem('reports')).resolves.toBeNull();
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
