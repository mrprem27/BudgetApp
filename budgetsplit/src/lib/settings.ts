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
  // Opt-in, and default OFF. A sweep moves real money into goals without being
  // asked, so it has to be a decision someone made rather than one they inherited.
  autoSweep: 'auto_sweep_enabled',
  // Whether shared-group entries travel between devices at all. Off by default:
  // the app is local-first, and turning this on is the moment data leaves the
  // phone. It is a pause, not a delete -- see `settings.setSyncEnabled`.
  syncEnabled: 'sync_enabled',
  lastSyncAt: 'sync_last_at',
  lastSyncNote: 'sync_last_note',
  syncGroups: 'sync_known_groups',
  syncLog: 'sync_log',
  syncEverything: 'sync_everything',
  lastSnapshotAt: 'sync_last_snapshot_at',
  restoreOfferDismissed: 'restore_offer_dismissed',
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

/** One sync attempt, as the details screen shows it. */
export type SyncLogEntry = {
  at: number;
  pushed: number;
  pulled: number;
  conflicts: number;
  /** Groups that ended — deleted for everyone, or that I left. */
  vanished: number;
  /** Absent when it completed. Otherwise why it did nothing. */
  skipped?: string;
};

/** Enough to see a pattern, few enough to stay a diagnostic rather than history. */
export const SYNC_LOG_MAX = 20;

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
  autoSweep: () => getBool(K.autoSweep, false),
  setAutoSweep: (v: boolean) => setBool(K.autoSweep, v),
  syncEnabled: () => getBool(K.syncEnabled, false),
  /**
   * Turning sync OFF is a pause, never a delete.
   *
   * Nothing already uploaded is removed, and nothing local is lost — the queue
   * simply stops draining and no pulls happen. Turning it back on resumes from
   * where it left off. The copy has to say that, because "off" reading as
   * "deleted from the server" is the assumption people make, and acting on that
   * assumption is how someone turns it off expecting a retraction they never get.
   */
  setSyncEnabled: (v: boolean) => setBool(K.syncEnabled, v),

  /**
   * When sync last completed, and what happened if it did not.
   *
   * Recorded because `runSync` deliberately never throws — a failed sync must not
   * put a dialog in front of somebody who did not ask for one. The cost of that
   * is a feature which, when it silently does nothing, looks exactly like a
   * feature that is working. This is the one surface that tells the two apart,
   * and it is what makes a problem on a real phone diagnosable instead of a
   * shrug.
   */
  lastSyncAt: () => getNumber(K.lastSyncAt),
  setLastSyncAt: (v: number) => setNumber(K.lastSyncAt, v),
  lastSyncNote: () => getString(K.lastSyncNote),
  setLastSyncNote: (v: string) => setString(K.lastSyncNote, v),

  /**
   * Keep an encrypted copy of EVERYTHING on the account, not just shared groups.
   *
   * The second switch, and a genuinely different promise from the first. Groups
   * sync entry by entry because two people race the same bill. This is a whole-app
   * snapshot, sealed with a passphrase the server never sees, so a fresh phone can
   * become this one again — which the group sync cannot do, because personal data
   * has no other member to re-wrap a key.
   *
   * Off by default, like everything else that sends data anywhere.
   */
  syncEverything: () => getBool(K.syncEverything, false),
  setSyncEverything: (v: boolean) => setBool(K.syncEverything, v),

  lastSnapshotAt: () => getNumber(K.lastSnapshotAt),
  setLastSnapshotAt: (v: number) => setNumber(K.lastSnapshotAt, v),

  /**
   * They were offered their data back and said no.
   *
   * Sticky, because saying no means "this phone is a fresh start" and asking
   * again every launch would nag somebody out of a decision they have already
   * made. Cleared by a restore, which makes the question moot anyway.
   */
  restoreOfferDismissed: () => getBool(K.restoreOfferDismissed, false),
  setRestoreOfferDismissed: (v: boolean) => setBool(K.restoreOfferDismissed, v),

  /**
   * What the server last said about my groups: `[id, state]` pairs.
   *
   * Cached so the Sync screen can answer "will this queue ever move?" without a
   * request. Whether an entry can be sent depends on the group being published
   * and joined, which is knowledge only the server has — and a screen that has to
   * be online to explain why nothing is happening is useless in exactly the
   * moment it is needed.
   */
  syncGroups: async (): Promise<Array<[string, string]>> => {
    try { return JSON.parse((await getString(K.syncGroups)) ?? '[]'); } catch { return []; }
  },
  setSyncGroups: (v: Array<[string, string]>) => setString(K.syncGroups, JSON.stringify(v)),

  /**
   * The last few sync runs, newest first. A ring buffer, not a log file.
   *
   * `runSync` swallows every failure on purpose — it must never interrupt someone
   * who did not ask for it — so without this there is no way to tell a sync that
   * did nothing from one that never ran. Bounded at SYNC_LOG_MAX because this is
   * a diagnostic, not history: the interesting question is always "what happened
   * the last few times", never "what happened last March".
   */
  syncLog: async (): Promise<SyncLogEntry[]> => {
    try { return JSON.parse((await getString(K.syncLog)) ?? '[]'); } catch { return []; }
  },
  appendSyncLog: async (entry: SyncLogEntry): Promise<void> => {
    const prev = await settings.syncLog().catch(() => [] as SyncLogEntry[]);
    await setString(K.syncLog, JSON.stringify([entry, ...prev].slice(0, SYNC_LOG_MAX)));
  },

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
