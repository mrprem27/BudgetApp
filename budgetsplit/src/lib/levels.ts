import { bumpPrefs } from './prefsVersion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULTS, setFlag, FEATURE_KEYS, type FeatureFlags, type FeatureKey } from './featureFlags';
import { personaFlags, type OnboardingIntent } from './personaDefaults';
import { settings } from './settings';

/**
 * How much of the app is on at once (`SPEC-FEATURES.md`, `U-01`): the second answer beside
 * "what for" (the persona). Your call, 2026-09-30: Simple / Standard / Everything; new installs
 * start Simple and are offered the next level when ready; installs from before this start on
 * Everything, so nothing anyone already uses disappears.
 *
 * A level only switches things **off**, on top of what the persona chose — it never turns on a
 * feature the persona trimmed. Levels are about how much is on screen, never what anyone may use
 * (`DQ-01`: no tiers).
 */
export type Level = 'simple' | 'standard' | 'everything';
export const LEVELS: Level[] = ['simple', 'standard', 'everything'];

export const LEVEL_OPTIONS: { key: Level; label: string; desc: string }[] = [
  { key: 'simple', label: 'Simple', desc: 'Log what you spend and see where it goes' },
  { key: 'standard', label: 'Standard', desc: 'Adds goals, recurring bills, Afford and reports' },
  { key: 'everything', label: 'Everything', desc: 'Every tool: import, itemized bills, health score' },
];

/** What each level switches off. Everything keeps the persona's choice as it is. */
const OFF: Record<Level, FeatureKey[]> = {
  everything: [],
  standard: ['importReview', 'itemized', 'healthScore', 'streak'],
  simple: ['importReview', 'itemized', 'healthScore', 'streak',
    'savingsGoals', 'recurring', 'affordCheck', 'recurringSuggest', 'receiptScan', 'reports', 'voiceEntry'],
};

/** The switches a persona and a level add up to. */
export function composeFlags(intent: OnboardingIntent, level: Level): FeatureFlags {
  const flags = { ...personaFlags(intent) };
  for (const k of OFF[level]) flags[k] = false;
  return flags;
}

/** The next level up, or null at the top. */
export function nextLevel(level: Level): Level | null {
  return level === 'simple' ? 'standard' : level === 'standard' ? 'everything' : null;
}

const KEY = 'app_level';
const asLevel = (v: string | null): Level | null => (LEVELS.includes(v as Level) ? (v as Level) : null);

/** The stored level; an install from before levels existed (onboarding done, none stored) is Everything. */
export async function loadLevel(): Promise<Level> {
  const stored = asLevel(await AsyncStorage.getItem(KEY).catch(() => null));
  if (stored) return stored;
  return (await settings.onboardingDone().catch(() => false)) ? 'everything' : 'simple';
}

/**
 * Store a level and write the switches it implies. `keys` defaults to only the switches that
 * differ from `DEFAULTS` (onboarding's sparse write, so a later change to a default still reaches
 * the user); Feature Management passes every key, because picking a level is "set me up like this".
 */
export async function applyLevel(level: Level, intent: OnboardingIntent, keys?: FeatureKey[]): Promise<void> {
  await AsyncStorage.setItem(KEY, level);
  bumpPrefs();
  const flags = composeFlags(intent, level);
  const write = keys ?? FEATURE_KEYS.filter(k => flags[k] !== DEFAULTS[k]);
  for (const k of write) {
    try { await setFlag(k, flags[k]); } catch { /* per key, like applyPersona */ }
  }
}

const OFFER_KEY = 'level_offer_dismissed';
/** Entries logged before the app offers the next level. */
export const LEVEL_OFFER_AFTER = 20;

export async function levelOfferDismissed(level: Level): Promise<boolean> {
  return (await AsyncStorage.getItem(`${OFFER_KEY}_${level}`).catch(() => null)) === 'true';
}
export async function dismissLevelOffer(level: Level): Promise<void> {
  await AsyncStorage.setItem(`${OFFER_KEY}_${level}`, 'true');
}
