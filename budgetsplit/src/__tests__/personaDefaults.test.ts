import { DEFAULTS, type FeatureKey } from '../lib/featureFlags';
import {
  INTENTS, asIntent, personaFlagPatch, personaFlags, personaChangedKeys,
} from '../lib/personaDefaults';

describe('asIntent', () => {
  it('accepts the three known personas', () => {
    expect(asIntent('personal')).toBe('personal');
    expect(asIntent('split')).toBe('split');
    expect(asIntent('both')).toBe('both');
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

  it('gives the personal persona the solo-money modules that are opt-in by default', () => {
    // The point of the mapping: these are off in DEFAULTS, and this persona is
    // exactly who they were built for.
    for (const key of ['affordCheck', 'streak'] as FeatureKey[]) {
      expect(DEFAULTS[key]).toBe(false);
      expect(personaFlags('personal')[key]).toBe(true);
    }
  });

  it('keeps solo-money surfaces out of a splitter\'s way', () => {
    const split = personaFlags('split');
    expect(split.healthScore).toBe(false);
    expect(split.forecast).toBe(false);
    expect(split.savingsInsights).toBe(false);
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
