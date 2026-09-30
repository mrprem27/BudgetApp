import fs from 'fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { composeFlags, loadLevel, applyLevel, nextLevel } from '../lib/levels';
import { DEFAULTS, loadFlags } from '../lib/featureFlags';
import { settings } from '../lib/settings';

// U-01 (SPEC-FEATURES.md): Simple / Standard / Everything, composed over the persona.
const store = AsyncStorage as unknown as { __reset: () => void };
beforeEach(() => store.__reset());

describe('composeFlags — a level only switches things off', () => {
  it('Everything is the persona as it is', () => {
    expect(composeFlags('both', 'everything')).toEqual(DEFAULTS);
  });
  it('Standard hides the power tools; Simple also hides goals, recurring, Afford and reports', () => {
    const std = composeFlags('both', 'standard');
    expect([std.importReview, std.itemized, std.healthScore, std.savingsGoals]).toEqual([false, false, false, true]);
    const simple = composeFlags('both', 'simple');
    expect([simple.savingsGoals, simple.recurring, simple.affordCheck, simple.reports]).toEqual([false, false, false, false]);
    expect([simple.insights, simple.splitting, simple.smartCategory]).toEqual([true, true, true]); // Insights stays, with less on it
  });
  it('never turns on what the persona trimmed', () => {
    expect(composeFlags('split', 'everything').healthScore).toBe(false);
  });
  it('steps up one level at a time, and stops at the top', () => {
    expect([nextLevel('simple'), nextLevel('standard'), nextLevel('everything')]).toEqual(['standard', 'everything', null]);
  });
});

describe('loadLevel — installs from before levels keep everything', () => {
  it('a new install is Simple; one past onboarding with none stored is Everything', async () => {
    expect(await loadLevel()).toBe('simple');
    await settings.setOnboardingDone(true);
    expect(await loadLevel()).toBe('everything');
  });
  it('a stored level wins', async () => {
    await settings.setOnboardingDone(true);
    await applyLevel('standard', 'both');
    expect(await loadLevel()).toBe('standard');
  });
});

describe('applyLevel — writes the switches it implies', () => {
  it('Simple turns its trims off; going back to Everything with every key restores them', async () => {
    await applyLevel('simple', 'both');
    expect((await loadFlags()).savingsGoals).toBe(false);
    await applyLevel('everything', 'both', Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]);
    expect(await loadFlags()).toEqual(DEFAULTS);
  });
});

describe('the app uses the level', () => {
  it('onboarding starts new installs on Simple', () => {
    expect(fs.readFileSync('src/lib/onboarding.ts', 'utf8')).toMatch(/await applyLevel\('simple', data\.intent\)/);
  });
  it("Simple's Add hides the title field and the details, never while editing", () => {
    const src = fs.readFileSync('app/add/quick.tsx', 'utf8');
    expect(src).toMatch(/const simple = level === 'simple' && !isEditing && !isRecurEdit && !isTransfer/);
    expect(src).toMatch(/\{!simple && <View style=\{styles\.formBlock\}>\s*<Input/);
    expect(src).toMatch(/\{!simple && \(\s*<DetailChips/);
  });
  it('Feature Management re-picking a setup keeps the level on top', () => {
    expect(fs.readFileSync('app/(system)/features.tsx', 'utf8')).toMatch(/await applyPersona\(next, FEATURE_KEYS\);[\s\S]{0,120}await applyLevel\(level, next, FEATURE_KEYS\)/);
  });
});
