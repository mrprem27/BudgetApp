import { DEFAULTS, type FeatureFlags, type FeatureKey } from './featureFlags';

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
    // Tracks their own money. Splitting comes off — that's the Groups tab, the
    // owe/owed strip and the Transfer kind — and the personal-finance surfaces
    // that are opt-in by default come on, since this is what they came for.
    case 'personal':
      return {
        splitting: false,
        healthScore: true,
        savingsGoals: true,
        affordCheck: true,
        streak: true,
      };

    // Here to split bills. Splitting stays on; the solo-money modules that only
    // make sense for someone budgeting their own income stay out of the way. They
    // are all reachable in Feature Management the moment they want them.
    case 'split':
      return {
        splitting: true,
        healthScore: false,
        affordCheck: false,
        streak: false,
        savingsInsights: false,
        forecast: false,
      };

    // Living together and splitting the same bills every month — the recurring,
    // habitual case, unlike 'split' which is shaped like a trip. Wants both halves
    // on, plus the recurring/reminder surfaces those shared bills depend on.
    case 'household':
      return {
        splitting: true,
        recurring: true,
        reminders: true,
        recurringSuggest: true,
        healthScore: true,
        savingsGoals: true,
      };

    case 'both':
      return {};
  }
}

/** The full flag set a persona starts with — `DEFAULTS` plus its patch. */
export function personaFlags(intent: OnboardingIntent): FeatureFlags {
  return { ...DEFAULTS, ...personaFlagPatch(intent) };
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
