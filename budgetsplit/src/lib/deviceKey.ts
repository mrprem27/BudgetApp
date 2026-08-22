import { getRandomBytesAsync, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { x25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes } from './bytes';

/**
 * This device's identity for sync: a secret it keeps, and an id others can name.
 *
 * **Per device, not per account.** A group key wrapped to a person cannot be
 * opened by that person's second phone, so wrapping has to target a device. It is
 * also the only shape where losing one phone does not mean rotating everything —
 * you drop that device's wrap and leave the rest alone.
 *
 * The private half never leaves the keychain and never travels. What the server
 * learns is an X25519 public key and an opaque id — neither of which can open
 * anything, which is what makes it safe for the server to hand them out.
 */

type SecureStoreModule = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/**
 * Lazily required and cached — the same discipline `serverApi.ts` documents at
 * length, and for the same reason: `expo-secure-store` is a native module, this
 * file is reachable from a route, and expo-router loads routes eagerly. A
 * top-level import once crashed the entire app on launch on a build without the
 * module. A local-first app must not die because an optional feature's dependency
 * is missing.
 *
 * `undefined` = not attempted, `null` = attempted and unavailable.
 */
let secureStore: SecureStoreModule | null | undefined;

function keychain(): SecureStoreModule | null {
  if (secureStore !== undefined) return secureStore;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    secureStore = require('expo-secure-store') as SecureStoreModule;
  } catch {
    secureStore = null;
  }
  return secureStore;
}

/** Versioned, like the session key, so a format change never reads stale bytes. */
const SECRET_KEY = 'budgetsplit.device.secret.v1';
const DEVICE_ID_KEY = 'budgetsplit.device.id.v1';
/** Which account this device identity belongs to. See `bindDeviceToAccount`. */
const OWNER_KEY = 'budgetsplit.device.owner.v1';

export type DeviceIdentity = {
  /** Opaque, stable for the life of this install. Named in every wrap. */
  deviceId: string;
  /** What the server and other members store, to wrap a group key to us. */
  publicKey: string;
};

/**
 * This device's secret. Minted once, then read.
 *
 * 32 random bytes rather than a derived value: deriving from the account would
 * make every one of that user's devices share a secret, which is precisely the
 * property per-device keys exist to avoid. Those 32 bytes are also the X25519
 * private key — the curve clamps them itself, so no separate keygen step is
 * needed and the secret has exactly one representation.
 *
 * Returns null when there is no keychain. That is the right failure — **no key, no
 * sync** — rather than holding a long-lived secret in memory where a reload loses
 * it and a crash log might not.
 */
export async function deviceSecret(): Promise<Uint8Array | null> {
  const ks = keychain();
  if (!ks) return null;

  const existing = await ks.getItemAsync(SECRET_KEY).catch(() => null);
  if (existing) return hexToBytes(existing);

  const fresh = await getRandomBytesAsync(32);
  await ks.setItemAsync(SECRET_KEY, bytesToHex(fresh));
  return fresh;
}

/**
 * The public half, plus the id that names this device.
 *
 * A real **X25519** public key: the curve point for this device's secret. That is
 * what makes wrapping genuinely asymmetric — anyone can wrap a group key to this
 * device knowing only its public key, and only this device can open it. Nothing
 * that travels or is stored server-side can be used to unwrap anything.
 *
 * The device ID stays hash-derived and separate from the public key. It is an
 * identifier, not a credential, and keeping the two distinct means logging or
 * leaking an id says nothing about the key.
 */
export async function deviceIdentity(): Promise<DeviceIdentity | null> {
  const ks = keychain();
  const secret = await deviceSecret();
  if (!ks || !secret) return null;

  let deviceId = await ks.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  if (!deviceId) {
    // Derived from the secret so it is stable, but hashed so the id reveals
    // nothing about the secret even if it is logged.
    deviceId = (await digestStringAsync(CryptoDigestAlgorithm.SHA256, `id:${bytesToHex(secret)}`)).slice(0, 32);
    await ks.setItemAsync(DEVICE_ID_KEY, deviceId);
  }

  const publicKey = bytesToHex(x25519.getPublicKey(secret));
  return { deviceId, publicKey };
}

/**
 * Make sure this device's identity belongs to the account now signed in.
 *
 * Device ids are stored per install, not per account, and the server refuses to
 * let one account overwrite another's device key — correctly. Put together, those
 * two facts had a hole in them: sign out, hand the phone to someone else, and
 * their `POST /sync/devices` names an id registered to the previous owner. The
 * server refuses it, forever, and sync silently never works for them again.
 *
 * Keeping the identity across a sign-out and back in for the SAME account is the
 * behaviour worth protecting — otherwise every sign-out costs every group key and
 * needs a re-wrap from another member. So the account is recorded alongside, and
 * only a genuine change of owner mints a new identity.
 *
 * Returns whether it reset, so a caller can say why the groups went quiet.
 */
export async function bindDeviceToAccount(userId: string): Promise<boolean> {
  const ks = keychain();
  if (!ks) return false;

  const owner = await ks.getItemAsync(OWNER_KEY).catch(() => null);
  if (owner === userId) return false;

  // A different account, or an identity minted before this key existed. Both are
  // safer to reset than to hand over: the wraps are useless to the new owner
  // anyway, since they cannot open them.
  if (owner !== null) await forgetDevice();
  await ks.setItemAsync(OWNER_KEY, userId);
  return owner !== null;
}

/**
 * Forget this device's identity — on sign-out, or when a user wants a clean break.
 *
 * Destructive and permanent: every group key wrapped to this device becomes
 * unopenable by it, and the wraps have to be reissued by a member who still holds
 * the group key. That is F12, and it is why this is a named function rather than
 * something sign-out does quietly.
 */
export async function forgetDevice(): Promise<void> {
  const ks = keychain();
  if (!ks) return;
  await ks.deleteItemAsync(SECRET_KEY).catch(() => {});
  await ks.deleteItemAsync(DEVICE_ID_KEY).catch(() => {});
  await ks.deleteItemAsync(OWNER_KEY).catch(() => {});
}

/** Sync has nowhere to keep a secret, so it stays off entirely. */
export const deviceKeyAvailable = (): boolean => keychain() !== null;
