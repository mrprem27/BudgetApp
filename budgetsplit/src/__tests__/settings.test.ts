import AsyncStorage from '@react-native-async-storage/async-storage';
import { settings, SETTINGS_KEYS } from '../lib/settings';

const store = AsyncStorage as unknown as { __reset: () => void };

beforeEach(() => store.__reset());

describe('defaults on a fresh install', () => {
  it('defaults security/privacy flags correctly', async () => {
    // privacyScreen is the one deliberately default-ON.
    await expect(settings.privacyScreen()).resolves.toBe(true);
    await expect(settings.biometricEnabled()).resolves.toBe(false);
    await expect(settings.hideAmounts()).resolves.toBe(false);
  });

  it('defaults capture + lifecycle flags to off', async () => {
    await expect(settings.saveLocation()).resolves.toBe(false);
    await expect(settings.onboardingDone()).resolves.toBe(false);
    await expect(settings.pendingFirstAdd()).resolves.toBe(false);
  });

  it('returns null for unset strings and numbers', async () => {
    await expect(settings.defaultCadence()).resolves.toBeNull();
    await expect(settings.defaultCurrency()).resolves.toBeNull();
    await expect(settings.onboardingIntent()).resolves.toBeNull();
    await expect(settings.appLastOpen()).resolves.toBeNull();
  });
});

describe('booleans round-trip', () => {
  it('persists an explicit false over a default-true', async () => {
    await settings.setPrivacyScreen(false);
    await expect(settings.privacyScreen()).resolves.toBe(false);
  });

  it('persists an explicit true over a default-false', async () => {
    await settings.setBiometricEnabled(true);
    await expect(settings.biometricEnabled()).resolves.toBe(true);
  });

  it('can be toggled back and forth', async () => {
    await settings.setHideAmounts(true);
    await expect(settings.hideAmounts()).resolves.toBe(true);
    await settings.setHideAmounts(false);
    await expect(settings.hideAmounts()).resolves.toBe(false);
  });

  it('writes the literal strings "true"/"false"', async () => {
    await settings.setSaveLocation(true);
    await expect(AsyncStorage.getItem(SETTINGS_KEYS.saveLocation)).resolves.toBe('true');
    await settings.setSaveLocation(false);
    await expect(AsyncStorage.getItem(SETTINGS_KEYS.saveLocation)).resolves.toBe('false');
  });

  it('treats any non-"true" stored value as false', async () => {
    await AsyncStorage.setItem(SETTINGS_KEYS.hideAmounts, 'garbage');
    await expect(settings.hideAmounts()).resolves.toBe(false);
  });
});

// These exercise the getNumber/setNumber helpers. They used to run through
// `monthlyIncome`, which was removed as a write-only setting; `appLastOpen` is
// now the only numeric one, so the helper coverage moved onto it.
describe('numbers round-trip', () => {
  it('stores and reads back a number', async () => {
    await settings.setAppLastOpen(5_000_00);
    await expect(settings.appLastOpen()).resolves.toBe(500000);
  });

  it('handles zero (not treated as unset)', async () => {
    await settings.setAppLastOpen(0);
    await expect(settings.appLastOpen()).resolves.toBe(0);
  });

  it('handles negative values', async () => {
    await settings.setAppLastOpen(-100);
    await expect(settings.appLastOpen()).resolves.toBe(-100);
  });

  it('returns null for a corrupt non-numeric value rather than NaN', async () => {
    await AsyncStorage.setItem(SETTINGS_KEYS.appLastOpen, 'not-a-number');
    await expect(settings.appLastOpen()).resolves.toBeNull();
  });

  it('round-trips a large epoch timestamp without precision loss', async () => {
    const now = 1_800_000_000_000;
    await settings.setAppLastOpen(now);
    await expect(settings.appLastOpen()).resolves.toBe(now);
  });
});

describe('strings round-trip', () => {
  it('stores and reads back a string', async () => {
    await settings.setDefaultCadence('monthly');
    await expect(settings.defaultCadence()).resolves.toBe('monthly');
  });

  it('preserves an empty string as distinct from unset', async () => {
    await settings.setOnboardingIntent('');
    await expect(settings.onboardingIntent()).resolves.toBe('');
  });
});

describe('clear helpers', () => {
  it('clearOnboardingDone reverts to the default, not to false-as-stored', async () => {
    await settings.setOnboardingDone(true);
    await expect(settings.onboardingDone()).resolves.toBe(true);
    await settings.clearOnboardingDone();
    await expect(AsyncStorage.getItem(SETTINGS_KEYS.onboardingDone)).resolves.toBeNull();
    await expect(settings.onboardingDone()).resolves.toBe(false);
  });

  it('clearPendingFirstAdd removes the key', async () => {
    await settings.setPendingFirstAdd(true);
    await settings.clearPendingFirstAdd();
    await expect(AsyncStorage.getItem(SETTINGS_KEYS.pendingFirstAdd)).resolves.toBeNull();
  });
});

describe('key namespace', () => {
  it('exposes every key it writes, with no duplicates', () => {
    const keys = Object.values(SETTINGS_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not collide with the feature-flag namespace', () => {
    expect(Object.values(SETTINGS_KEYS).some(k => k.startsWith('feature_'))).toBe(false);
  });
});

describe('scanPayHintPending — onboarding-only coach mark', () => {
  it('is off on an existing install, so nobody is taught a gesture they already use', async () => {
    // Default FALSE is the whole point: a hint armed by absence would appear on Home
    // for every existing user and sit there until they happened to long-press.
    await expect(settings.scanPayHintPending()).resolves.toBe(false);
  });

  it('round-trips once onboarding arms it', async () => {
    await settings.setScanPayHintPending(true);
    await expect(settings.scanPayHintPending()).resolves.toBe(true);
    await settings.setScanPayHintPending(false);
    await expect(settings.scanPayHintPending()).resolves.toBe(false);
  });
});
