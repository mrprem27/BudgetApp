import {
  deviceSecret, deviceIdentity, forgetDevice, deviceKeyAvailable, bindDeviceToAccount,
} from '../lib/deviceKey';

/**
 * A device's secret is the root of everything sync can decrypt. If it is not
 * stable, group keys stop opening; if it is shared between devices, per-device
 * wrapping is a fiction.
 */
describe('device identity', () => {
  beforeEach(async () => { await forgetDevice(); });

  it('is available when there is a keychain to hold it', () => {
    expect(deviceKeyAvailable()).toBe(true);
  });

  it('mints a secret once and returns the same one after', async () => {
    // Stability is the whole point: a secret that changed on relaunch would make
    // every group key wrapped to this device unopenable the next morning.
    const first = await deviceSecret();
    const second = await deviceSecret();
    expect(first).not.toBeNull();
    expect(Array.from(second!)).toEqual(Array.from(first!));
  });

  it('mints 32 bytes of real randomness, not a derived value', async () => {
    // Deriving from the account would give every one of that user's devices the
    // same secret — exactly the property per-device keys exist to avoid.
    const secret = await deviceSecret();
    expect(secret).toHaveLength(32);
    await forgetDevice();
    const other = await deviceSecret();
    expect(Array.from(other!)).not.toEqual(Array.from(secret!));
  });

  it('gives a stable id and public key for the same secret', async () => {
    const a = await deviceIdentity();
    const b = await deviceIdentity();
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
    expect(a!.deviceId).toHaveLength(32);
  });

  it('never exposes the secret in the id or the public key', async () => {
    // Both are hashes. An id in a log or a server row must reveal nothing about
    // the key material behind it.
    const secret = await deviceSecret();
    const id = await deviceIdentity();
    const hex = Array.from(secret!, b => b.toString(16).padStart(2, '0')).join('');
    expect(id!.deviceId).not.toContain(hex);
    expect(id!.publicKey).not.toContain(hex);
    expect(id!.publicKey).not.toBe(id!.deviceId);
  });

  it('gives two devices different identities', async () => {
    const first = await deviceIdentity();
    await forgetDevice();
    const second = await deviceIdentity();
    expect(second!.deviceId).not.toBe(first!.deviceId);
    expect(second!.publicKey).not.toBe(first!.publicKey);
  });

  it('forgetting is total — F12, and deliberately not quiet', async () => {
    // Every group key wrapped to this device becomes unopenable by it, and the
    // wraps must be reissued by a member who still holds the group key.
    await deviceIdentity();
    await forgetDevice();
    const after = await deviceIdentity();
    expect(after).not.toBeNull();
    expect(after!.deviceId).toBeTruthy();
  });
});

/**
 * A phone that changes hands.
 *
 * Device ids live per install, and the server refuses to let one account
 * overwrite another's device key — correctly. Those two facts together had a
 * hole: sign out, hand the phone over, and the next person's registration names
 * an id belonging to the previous owner. The server refuses it, and their sync
 * never works again, silently, forever.
 */
describe('binding a device to an account', () => {
  beforeEach(async () => { await forgetDevice(); });

  it('keeps the same identity when the same account signs back in', async () => {
    // The behaviour worth protecting: otherwise every sign-out costs every group
    // key and needs a re-wrap from another member.
    await bindDeviceToAccount('user-a');
    const first = await deviceIdentity();

    const reset = await bindDeviceToAccount('user-a');
    expect(reset).toBe(false);
    expect((await deviceIdentity())?.deviceId).toBe(first?.deviceId);
  });

  it('mints a fresh identity when a different account signs in', async () => {
    await bindDeviceToAccount('user-a');
    const first = await deviceIdentity();

    expect(await bindDeviceToAccount('user-b')).toBe(true);
    const second = await deviceIdentity();
    expect(second?.deviceId).not.toBe(first?.deviceId);
    // And a genuinely different key, not just a different label — the new owner
    // must not inherit anything that could open the old owner's groups.
    expect(second?.publicKey).not.toBe(first?.publicKey);
  });

  it('claims an identity that predates the owner record without resetting it', async () => {
    // An install that synced before this key existed has a working identity and
    // working wraps. Throwing those away on upgrade would break every group for
    // no reason.
    const before = await deviceIdentity();
    expect(await bindDeviceToAccount('user-a')).toBe(false);
    expect((await deviceIdentity())?.deviceId).toBe(before?.deviceId);
  });
});
