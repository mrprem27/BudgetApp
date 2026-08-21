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
  defaultPayMethod: 'default_pay_method',
  appLastOpen: 'app_last_open',
  onboardingDone: 'onboarding_done',
  onboardingIntent: 'onboarding_intent',
  pendingFirstAdd: 'pending_first_add',
  lockExplainerSeen: 'lock_explainer_seen',
  goalReorderHintSeen: 'goal_reorder_hint_seen',
  scanPayHintPending: 'scan_pay_hint_pending',
  preferredUpiApp: 'preferred_upi_app',
  backupAnchorAt: 'backup_anchor_at',
  lastBackupAt: 'last_backup_at',
  ocrProvider: 'ocr_provider',
  storageWarnDismissed: 'storage_warn_dismissed',
  budgetTarget: 'budget_target',
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
  /**
   * The whole-month figure typed during onboarding, in paise — a *suggestion* the
   * My Budget editor shows, not a budget.
   *
   * It used to be written as a budget line for a category called 'Total', which is
   * in no catalog, so every reader folded it into `Others` — a phantom "Others
   * ₹30,000" row on Personal, and "Total" offered in the editor as a category to adopt.
   */
  budgetTarget: () => getNumber(K.budgetTarget),
  setBudgetTarget: (v: number) => setNumber(K.budgetTarget, v),
  defaultCurrency: () => getString(K.defaultCurrency),
  setDefaultCurrency: (v: string) => setString(K.defaultCurrency, v),
  /**
   * How this user usually pays. A *capture* preference — it seeds the Add screen's
   * pay-method chip so the common case needs no tap. It does not touch the money
   * model: `lib/cash.ts` still branches on `PayMethod.Card` alone, and per-method
   * balances stay parked (RELEASE_CHECKLIST post-pilot).
   *
   * Unset means UPI, which is what both Add forms hardcoded before this existed.
   */
  defaultPayMethod: () => getString(K.defaultPayMethod),
  setDefaultPayMethod: (v: string) => setString(K.defaultPayMethod, v),

  // NOTE: `monthlyIncome` / `payday` accessors were removed — onboarding wrote
  // both and nothing ever read them. Onboarding's salary recurring rule already
  // records the amount and the pay-day anchor, and the afford engine derives
  // income from actual income transactions. See lib/onboarding.ts.

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

  // Goal "protect" (overspend-raid shield) one-time explainer
  lockExplainerSeen: () => getBool(K.lockExplainerSeen, false),
  setLockExplainerSeen: (v: boolean) => setBool(K.lockExplainerSeen, v),
  // Goal reorder hint — retired the first time a drag actually lands, so it is a
  // teaching line rather than permanent chrome.
  goalReorderHintSeen: () => getBool(K.goalReorderHintSeen, false),
  setGoalReorderHintSeen: (v: boolean) => setBool(K.goalReorderHintSeen, v),
  // Armed by onboarding, cleared the first time the FAB is touched. Defaults to
  // FALSE so an existing install never sees it — a coach mark for a gesture you may
  // have been using for months is noise, and it would sit on Home indefinitely for
  // anyone who simply never long-pressed.
  scanPayHintPending: () => getBool(K.scanPayHintPending, false),
  setScanPayHintPending: (v: boolean) => setBool(K.scanPayHintPending, v),

  // The UPI app to hand payments to, so the picker is a first-time question rather
  // than a toll on every payment. Stored as the raw key and validated on read — an
  // app can be uninstalled, and a preference pointing at something absent must fall
  // back to asking rather than open nothing.
  preferredUpiApp: () => getString(K.preferredUpiApp),
  setPreferredUpiApp: (v: string | null) =>
    v === null ? AsyncStorage.removeItem(K.preferredUpiApp) : setString(K.preferredUpiApp, v),

  // Backup reminder cadence anchor — last real export, or when the reminder
  // was first turned on if the user hasn't exported yet. **Not** a record that a
  // backup happened: turning the reminder on writes it too.
  backupAnchorAt: () => getNumber(K.backupAnchorAt),
  setBackupAnchorAt: (v: number) => setNumber(K.backupAnchorAt, v),

  // When a backup was actually written. Split from the anchor above, which the
  // Settings row was reading: enabling the *reminder* stamped the anchor, so the
  // row read "Backed up just now" to someone who had never backed up once — the
  // one indicator whose entire job is to be trusted when it says you are safe.
  // Only a completed export writes this.
  lastBackupAt: () => getNumber(K.lastBackupAt),
  setLastBackupAt: (v: number) => setNumber(K.lastBackupAt, v),

  // Receipt-scan provider: 'device' (free/offline, Apple Vision + regex) or
  // 'gemini' (cloud, free tier, better accuracy) — see lib/ocrProviders/index.ts
  // for the full comparison. Defaults to 'gemini' when unset.
  ocrProvider: () => getString(K.ocrProvider),
  setOcrProvider: (v: 'device' | 'gemini') => setString(K.ocrProvider, v),

  // The worst low-storage tier the user has already dismissed. Stored as the tier rather
  // than a boolean so the warning comes back when things actually get worse — dismissing
  // "running low" should not silence "saving may fail".
  storageWarnDismissed: () => getString(K.storageWarnDismissed),
  setStorageWarnDismissed: (v: string) => setString(K.storageWarnDismissed, v),
};
