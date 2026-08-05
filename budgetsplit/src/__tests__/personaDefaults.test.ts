import { DEFAULTS, type FeatureKey } from '../lib/featureFlags';
import {
  INTENTS, asIntent, personaFlagPatch, personaFlags, personaChangedKeys,
} from '../lib/personaDefaults';

describe('asIntent', () => {
  it('accepts every known persona', () => {
    for (const intent of INTENTS) expect(asIntent(intent)).toBe(intent);
    expect(INTENTS).toHaveLength(4);
  });

  it('rejects anything else, including a stale or corrupt stored value', () => {
    expect(asIntent('Personal')).toBeNull();
    expect(asIntent('solo')).toBeNull();
    expect(asIntent('')).toBeNull();
    expect(asIntent(null)).toBeNull();
    expect(asIntent(undefined)).toBeNull();
  });
});

describe('personaFlagPatch', () => {
  it('only ever names real flag keys', () => {
    for (const intent of INTENTS) {
      for (const key of Object.keys(personaFlagPatch(intent))) {
        expect(DEFAULTS).toHaveProperty(key);
      }
    }
  });

  it('is all booleans', () => {
    for (const intent of INTENTS) {
      expect(Object.values(personaFlagPatch(intent)).every(v => typeof v === 'boolean')).toBe(true);
    }
  });

  it('leaves "both" as the documented defaults', () => {
    expect(personaFlagPatch('both')).toEqual({});
    expect(personaFlags('both')).toEqual(DEFAULTS);
  });

  it('turns splitting off for a personal-only user and on for a splitter', () => {
    expect(personaFlags('personal').splitting).toBe(false);
    expect(personaFlags('split').splitting).toBe(true);
    expect(personaFlags('both').splitting).toBe(true);
  });

  it('gives the personal persona the opt-in module built for exactly them', () => {
    expect(DEFAULTS.streak).toBe(false);
    expect(personaFlags('personal').streak).toBe(true);
  });

  it('strips every peer-to-peer surface for a solo user', () => {
    const solo = personaFlags('personal');
    for (const key of ['splitting', 'itemized', 'upiSettle'] as FeatureKey[]) {
      expect(solo[key]).toBe(false);
    }
  });

  it('keeps solo-money surfaces out of a splitter\'s way', () => {
    const split = personaFlags('split');
    for (const key of ['healthScore', 'savingsGoals', 'affordCheck', 'insights', 'reports'] as FeatureKey[]) {
      expect(split[key]).toBe(false);
    }
  });

  it('produces a genuinely different app per persona — the bug this closes', () => {
    const personal = personaFlags('personal');
    const split = personaFlags('split');
    const differing = (Object.keys(DEFAULTS) as FeatureKey[]).filter(k => personal[k] !== split[k]);
    expect(differing.length).toBeGreaterThan(0);
    // Structural, not just cosmetic: the two must differ on the one flag that
    // changes the app's shape rather than a section's visibility.
    expect(differing).toContain('splitting');
  });

  it('never invents a key outside the known flag set', () => {
    for (const intent of INTENTS) {
      expect(Object.keys(personaFlags(intent)).sort()).toEqual(Object.keys(DEFAULTS).sort());
    }
  });
});

describe('personaChangedKeys', () => {
  it('writes nothing for "both"', () => {
    expect(personaChangedKeys('both')).toEqual([]);
  });

  it('omits keys whose persona value already matches the default', () => {
    // 'split' sets splitting: true, which DEFAULTS already says — so there is
    // nothing to persist for it. Writing it anyway would freeze the default.
    expect(personaFlagPatch('split').splitting).toBe(true);
    expect(DEFAULTS.splitting).toBe(true);
    expect(personaChangedKeys('split')).not.toContain('splitting');
  });

  it('lists every key that genuinely deviates, and only those', () => {
    for (const intent of INTENTS) {
      const changed = personaChangedKeys(intent);
      const flags = personaFlags(intent);
      for (const key of changed) expect(flags[key]).not.toBe(DEFAULTS[key]);
      const missed = (Object.keys(DEFAULTS) as FeatureKey[])
        .filter(k => flags[k] !== DEFAULTS[k] && !changed.includes(k));
      expect(missed).toEqual([]);
    }
  });

  it('is enough on its own to reproduce the persona\'s flag set', () => {
    for (const intent of INTENTS) {
      const rebuilt = { ...DEFAULTS };
      for (const key of personaChangedKeys(intent)) rebuilt[key] = personaFlags(intent)[key];
      expect(rebuilt).toEqual(personaFlags(intent));
    }
  });
});

/**
 * The complaint this closes: personas that differed on a flag or two produced four
 * near-identical apps. Each pair must now differ on a MEANINGFUL number of keys,
 * and each persona must be reachable as its own answer.
 */
describe('personas are genuinely distinct combos', () => {
  const REAL = INTENTS.filter(i => i !== 'both');

  it('no two personas produce the same app', () => {
    const seen = new Map<string, string>();
    for (const intent of INTENTS) {
      const sig = JSON.stringify(personaFlags(intent));
      expect(seen.has(sig)).toBe(false);
      seen.set(sig, intent);
    }
  });

  it('every pair of real personas differs on at least three flags', () => {
    for (let i = 0; i < REAL.length; i++) {
      for (let j = i + 1; j < REAL.length; j++) {
        const a = personaFlags(REAL[i]);
        const b = personaFlags(REAL[j]);
        const diff = (Object.keys(DEFAULTS) as FeatureKey[]).filter(k => a[k] !== b[k]);
        expect(diff.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('leaves no persona with an empty app', () => {
    for (const intent of INTENTS) {
      const on = Object.values(personaFlags(intent)).filter(Boolean).length;
      expect(on).toBeGreaterThanOrEqual(5);
    }
  });

  it('separates household from split on the habitual-bill machinery', () => {
    const house = personaFlags('household');
    const split = personaFlags('split');
    expect(house.recurring && house.recurringSuggest && house.reminders).toBe(true);
    // A trip ends; a household does not. Itemising a restaurant bill is the
    // splitter's job, not the flatmate's — rent is one line.
    expect(house.itemized).toBe(false);
    expect(split.itemized).toBe(true);
  });
});

describe('household persona', () => {
  it('turns on splitting plus the recurring-bill surfaces it depends on', () => {
    const f = personaFlags('household');
    expect(f.splitting).toBe(true);
    expect(f.recurring).toBe(true);
    expect(f.reminders).toBe(true);
    expect(f.recurringSuggest).toBe(true);
  });

  it('keeps the personal-money surfaces that "split" turns off', () => {
    expect(personaFlags('household').healthScore).toBe(true);
    expect(personaFlags('split').healthScore).toBe(false);
  });

  it('round-trips through asIntent', () => {
    expect(asIntent('household')).toBe('household');
    expect(INTENTS).toContain('household');
  });
});
