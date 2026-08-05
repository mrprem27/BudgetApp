import AsyncStorage from '@react-native-async-storage/async-storage';

// Flags name whole FEATURES, not fragments of them. That distinction is the point:
// five keys used to gate a single chart or a card's sub-section (`reportsDonut`,
// `reportsTrend`, `dashboardInsights`, `forecast`, `savingsInsights`), which is
// configuration nobody asked for — a user who doesn't want the donut doesn't open
// Reports. Those are gone; the charts are simply always there, and decorative
// surfaces self-hide when they have nothing to say, which was always the right
// mechanism. In their place are the real surfaces that were silently always-on
// (receipt scanning, itemized splitting, import/review, reports, insights, UPI).
//
// Flags exist so a PERSONA can compose the app (see lib/personaDefaults.ts) and so
// a power user can override that. They are not monetisation gates.
//
// INVARIANT: every key here gates a real surface AND appears in app/features.tsx.
// A key that gates nothing is worse than no key — it renders as a working switch
// that silently does nothing. `featureFlags.test.ts` asserts both halves.
// Old `feature_*` values for removed keys simply stop being read.
export type FeatureKey =
  // Splitting & people
  | 'splitting'
  | 'itemized'
  | 'upiSettle'
  // Money & planning
  | 'savingsGoals'
  | 'healthScore'
  | 'affordCheck'
  | 'insights'
  | 'reports'
  // Automation
  | 'recurring'
  | 'recurringSuggest'
  | 'smartCategory'
  | 'reminders'
  | 'receiptScan'
  | 'importReview'
  // Fun
  | 'streak';

export type FeatureFlags = Record<FeatureKey, boolean>;

export const DEFAULTS: FeatureFlags = {
  // The structural flag: OFF hides the Groups tab, the owe/owed strip on Home and
  // the Transfer kind in Add. It changes the app's *shape*, not a section's
  // presence, which is why the onboarding persona sets it.
  splitting: true,
  itemized: true,
  upiSettle: true,       // no VPA on a person ⇒ no button anyway
  savingsGoals: true,
  healthScore: true,
  affordCheck: true,     // a real feature since the engine grew; off is why nobody found it
  insights: true,
  reports: true,
  recurring: true,
  recurringSuggest: true, // suggestion-only: never auto-creates, so a miss costs one tap
  smartCategory: true,    // a guess you can overwrite
  reminders: true,
  receiptScan: true,      // closes DEBT_TRACKER F7 — there was no way to hide Scan
  importReview: true,
  streak: false,          // opt-in, and self-hides under 3 days
};

export const FEATURE_KEYS = Object.keys(DEFAULTS) as FeatureKey[];

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
