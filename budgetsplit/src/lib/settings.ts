import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Single typed home for the app's key/value preferences. Replaces ~30 raw
 * AsyncStorage calls that were scattered across screens, each repeating its own
 * string key and its own default/parse rule (`=== 'true'` here, `!== 'false'`
 * there). One enumerable list of keys, one place that owns each default.
 *
 * Self-contained stores that own a richer shape keep their OWN modules and are
 * intentionally NOT folded in here — they aren't "scattered settings":
 *   - feature flags ............ lib/featureFlags.ts (the `feature_*` namespace)
 *   - reminder prefs (JSON) .... lib/reminders.ts
 *   - smart-category learned map lib/smartCategoryLearn.ts
 *   - savings sweep markers .... db/queries/savings.ts
 */

const K = {
  biometricEnabled: 'biometric_enabled',
  privacyScreen: 'privacy_screen',
  hideAmounts: 'hide_amounts',
  saveLocation: 'save_location',
  defaultCadence: 'default_cadence',
  defaultCurrency: 'default_currency',
  monthlyIncome: 'monthly_income',
  payday: 'payday',
  appLastOpen: 'app_last_open',
  onboardingDone: 'onboarding_done',
  onboardingIntent: 'onboarding_intent',
  pendingFirstAdd: 'pending_first_add',
} as const;

export const SETTINGS_KEYS = K;

// Only 'true'/'false' are ever written, so `getBool(key, true)` reproduces the
// old `!== 'false'` (default-on) predicate exactly, and `getBool(key, false)`
// the old `=== 'true'`.
async function getBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await AsyncStorage.getItem(key);
  return v === null ? fallback : v === 'true';
}
const setBool = (key: string, v: boolean) => AsyncStorage.setItem(key, v ? 'true' : 'false');

const getString = (key: string): Promise<string | null> => AsyncStorage.getItem(key);
const setString = (key: string, v: string) => AsyncStorage.setItem(key, v);

async function getNumber(key: string): Promise<number | null> {
  const v = await AsyncStorage.getItem(key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const setNumber = (key: string, v: number) => AsyncStorage.setItem(key, String(v));

export const settings = {
  // Security / privacy
  biometricEnabled: () => getBool(K.biometricEnabled, false),
  setBiometricEnabled: (v: boolean) => setBool(K.biometricEnabled, v),
  privacyScreen: () => getBool(K.privacyScreen, true), // default ON
  setPrivacyScreen: (v: boolean) => setBool(K.privacyScreen, v),
  hideAmounts: () => getBool(K.hideAmounts, false),
  setHideAmounts: (v: boolean) => setBool(K.hideAmounts, v),

  // Capture preferences
  saveLocation: () => getBool(K.saveLocation, false),
  setSaveLocation: (v: boolean) => setBool(K.saveLocation, v),

  // Entry defaults
  defaultCadence: () => getString(K.defaultCadence),
  setDefaultCadence: (v: string) => setString(K.defaultCadence, v),
  defaultCurrency: () => getString(K.defaultCurrency),
  setDefaultCurrency: (v: string) => setString(K.defaultCurrency, v),

  // Onboarding-captured figures
  monthlyIncome: () => getNumber(K.monthlyIncome),
  setMonthlyIncome: (v: number) => setNumber(K.monthlyIncome, v),
  payday: () => getNumber(K.payday),
  setPayday: (v: number) => setNumber(K.payday, v),

  // App lifecycle
  appLastOpen: () => getNumber(K.appLastOpen),
  setAppLastOpen: (v: number) => setNumber(K.appLastOpen, v),
  onboardingDone: () => getBool(K.onboardingDone, false),
  setOnboardingDone: (v: boolean) => setBool(K.onboardingDone, v),
  clearOnboardingDone: () => AsyncStorage.removeItem(K.onboardingDone),
  onboardingIntent: () => getString(K.onboardingIntent),
  setOnboardingIntent: (v: string) => setString(K.onboardingIntent, v),
  pendingFirstAdd: () => getBool(K.pendingFirstAdd, false),
  setPendingFirstAdd: (v: boolean) => setBool(K.pendingFirstAdd, v),
  clearPendingFirstAdd: () => AsyncStorage.removeItem(K.pendingFirstAdd),
};
