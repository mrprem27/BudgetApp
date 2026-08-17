import { DEFAULTS, setFlag, type FeatureFlags, type FeatureKey } from './featureFlags';
import { settings } from './settings';

/**
 * The persona picked on the onboarding intent screen.
 *
 * This used to be stored and never read: two users who answered differently got a
 * byte-identical app (AUDIT §4.6 / ISS-04). This module is the missing mapping.
 */
export type OnboardingIntent = 'personal' | 'split' | 'household' | 'both';

export const INTENTS: OnboardingIntent[] = ['personal', 'split', 'household', 'both'];

/** Narrow an unknown stored string back to an intent. */
export function asIntent(v: string | null | undefined): OnboardingIntent | null {
  return v === 'personal' || v === 'split' || v === 'household' || v === 'both' ? v : null;
}

/**
 * How each persona is offered. Lives here, not in the onboarding screen, because
 * Feature Management's "Change my setup" row offers the same four choices and two
 * copies of this list would drift the moment one persona's wording changed.
 */
export const PERSONA_OPTIONS: { key: OnboardingIntent; emoji: string; label: string; desc: string }[] = [
  { key: 'personal',  emoji: '💰', label: 'Track my own spending', desc: 'Budgets, categories, goals, health score' },
  { key: 'split',     emoji: '👥', label: 'Split with people',     desc: 'Trips and one-off group tabs — settle up when it ends' },
  { key: 'household', emoji: '🏡', label: 'Share a household',     desc: 'Rent, bills and groceries with a partner or flatmates' },
  { key: 'both',      emoji: '✨', label: 'Both',                  desc: 'Full experience — most popular' },
];

/**
 * Flags a persona *overrides*, as a sparse patch on `DEFAULTS`.
 *
 * Deliberately sparse: a key absent here keeps whatever `DEFAULTS` says, so adding
 * a flag later doesn't silently acquire a per-persona opinion it was never given.
 *
 * 'both' returns an empty patch on purpose — it means "the full app", which is
 * exactly what `DEFAULTS` already encodes. Anything else would make the most-picked
 * option the one that diverges from the documented defaults.
 */
export function personaFlagPatch(intent: OnboardingIntent): Partial<FeatureFlags> {
  switch (intent) {
    // Solo. Everything peer-to-peer goes — the Groups tab, the owe/owed strip, the
    // Transfer kind, the itemized splitter and the UPI handoff are all machinery for
    // money shared with other people, and none of it applies. What's left is the
    // full personal-finance stack, including the opt-in bits, since that IS the ask.
    case 'personal':
      return {
        splitting: false,
        itemized: false,
        upiSettle: false,
        healthScore: true,
        savingsGoals: true,
        affordCheck: true,
        insights: true,
        streak: true,
      };

    // Trips and one-off group tabs. Splitting and the tools that make a restaurant
    // bill fast stay; the solo-budgeting stack goes, because someone here to settle
    // a Goa trip has no use for a health score or a savings ladder. All one tap
    // away in Feature Management.
    case 'split':
      return {
        splitting: true,
        itemized: true,
        upiSettle: true,
        healthScore: false,
        savingsGoals: false,
        affordCheck: false,
        insights: false,
        reports: false,
        streak: false,
      };

    // Living together: the same bills, every month. Distinct from 'split' — that's
    // trip-shaped and ends, this is habitual and never does. So the recurring and
    // reminder machinery is the point, and the itemized splitter mostly isn't:
    // rent and utilities are one line, not fifteen.
    case 'household':
      return {
        splitting: true,
        itemized: false,
        upiSettle: true,
        recurring: true,
        recurringSuggest: true,
        reminders: true,
        insights: true,
        reports: true,
        healthScore: true,
        savingsGoals: true,
        streak: false,
      };

    // The full app, which is exactly what DEFAULTS already encodes. An empty patch
    // keeps the most-picked option from being the one that diverges from them.
    case 'both':
      return {};
  }
}

/** The full flag set a persona starts with — `DEFAULTS` plus its patch. */
export function personaFlags(intent: OnboardingIntent): FeatureFlags {
  return { ...DEFAULTS, ...personaFlagPatch(intent) };
}

/** Short human names for the flags personas trim — for honest onboarding copy. */
const FLAG_SHORT_LABEL: Partial<Record<FeatureKey, string>> = {
  splitting: 'Group splitting',
  itemized: 'Itemized bills',
  upiSettle: 'UPI settle',
  healthScore: 'Health score',
  savingsGoals: 'Savings goals',
  affordCheck: '“Can I afford this?”',
  insights: 'Insights',
  reports: 'Reports',
  streak: 'Streaks',
};

/**
 * What a persona actually TRIMS (turns off vs DEFAULTS), as human labels —
 * derived live from the patch so the onboarding card can never claim "all
 * features stay available" while silently disabling five of them (which is
 * exactly what the old static copy did).
 */
export function personaTrims(intent: OnboardingIntent): string[] {
  const patch = personaFlagPatch(intent);
  return (Object.keys(patch) as FeatureKey[])
    .filter(k => patch[k] === false && DEFAULTS[k] === true)
    .map(k => FLAG_SHORT_LABEL[k] ?? k);
}

/**
 * The keys a persona actually changes, so onboarding writes only those.
 *
 * Writing every key would turn each flag into a stored value on day one, which
 * defeats the point of `DEFAULTS`: a later change to a default would never reach
 * anyone who had completed onboarding.
 */
export function personaChangedKeys(intent: OnboardingIntent): FeatureKey[] {
  const patch = personaFlagPatch(intent);
  return (Object.keys(patch) as FeatureKey[]).filter(k => patch[k] !== DEFAULTS[k]);
}

/**
 * Persist a persona: the stored intent, plus the flags it implies.
 *
 * `keys` decides how much it overwrites, and the two callers want different
 * answers. Onboarding passes the default — only what the persona deviates on, so
 * untouched flags stay on `DEFAULTS` and a later change to a default still
 * reaches that user. Feature Management passes every key, because re-picking a
 * persona is an explicit "set me up like this again" and has to undo hand-toggles
 * the persona has an opinion about — a reset that silently skipped them would be
 * the bug, not the fix.
 *
 * Per-key writes are best-effort: one failed key must not abandon the rest.
 */
export async function applyPersona(
  intent: OnboardingIntent,
  keys: FeatureKey[] = personaChangedKeys(intent),
): Promise<void> {
  await settings.setOnboardingIntent(intent);
  const flags = personaFlags(intent);
  for (const key of keys) {
    try { await setFlag(key, flags[key]); } catch { /* per key */ }
  }
}
