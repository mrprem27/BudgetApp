import {
  newGroupKey, wrapGroupKey, unwrapGroupKey, sealEntry, openEntry,
} from '../lib/groupCrypto';
import { bytesToHex, hexToBytes } from '../lib/bytes';
import { x25519 } from '@noble/curves/ed25519.js';

/**
 * A device, as the rest of the app sees one: a secret it keeps and a public key
 * it publishes. Real X25519, because the whole point of the wrap is the curve
 * operation — a stand-in would test the plumbing and none of the security.
 */
function device() {
  const secret = x25519.utils.randomSecretKey();
  return { secret, publicKey: bytesToHex(x25519.getPublicKey(secret)) };
}

const GROUP = 'grp-flat-7';
const ENTRY = 'txn-abc-123';

describe('group keys', () => {
  it('mints 32 bytes, and a different key every time', async () => {
    const a = await newGroupKey();
    const b = await newGroupKey();
    expect(a).toHaveLength(32);
    // Two groups sharing a key would mean a member of one could open the other.
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  it('wraps to a device and unwraps back to the same key', async () => {
    const key = await newGroupKey();
    const d = device();

    // Wrapping needs ONLY the public key — that is what makes it asymmetric, and
    // what makes a public key safe to hand to the server.
    const wrapped = await wrapGroupKey(key, d.publicKey);
    expect(wrapped).not.toContain(bytesToHex(key)); // actually sealed, not encoded

    expect(bytesToHex((await unwrapGroupKey(wrapped, d.secret))!)).toBe(bytesToHex(key));
  });

  it('gives a different wrap every time, even for the same device and key', async () => {
    // Ephemeral-static: a fresh throwaway keypair per wrap. Identical output would
    // mean a reused shared secret, and a reused AES key with it.
    const key = await newGroupKey();
    const d = device();
    const [a, b] = [await wrapGroupKey(key, d.publicKey), await wrapGroupKey(key, d.publicKey)];
    expect(a).not.toBe(b);
    expect(bytesToHex((await unwrapGroupKey(a, d.secret))!))
      .toBe(bytesToHex((await unwrapGroupKey(b, d.secret))!));
  });

  it('cannot be opened with the public key it was wrapped to', async () => {
    // The property that failed to hold before this was a real curve: knowing what
    // the server knows must not be enough to unwrap anything.
    const key = await newGroupKey();
    const d = device();
    const wrapped = await wrapGroupKey(key, d.publicKey);
    expect(await unwrapGroupKey(wrapped, hexToBytes(d.publicKey))).toBeNull();
  });

  /**
   * The property the whole design rests on: a group key is wrapped per device, so
   * a wrap issued to one phone must be useless on another. Without this, adding a
   * device to any group would hand it every group.
   */
  it('a wrap for one device does not open on another', async () => {
    const key = await newGroupKey();
    const wrapped = await wrapGroupKey(key, device().publicKey);
    expect(await unwrapGroupKey(wrapped, device().secret)).toBeNull();
  });

  it('returns null rather than throwing on a corrupt wrap', async () => {
    // A caller's response is identical either way — this group stays sealed — and
    // a throw here would take down a sync drain over one bad row.
    expect(await unwrapGroupKey('not-base64-at-all', device().secret)).toBeNull();
    expect(await unwrapGroupKey('', device().secret)).toBeNull();
  });

  it('two devices in the same group each get their own wrap of one key', async () => {
    const key = await newGroupKey();
    const mine = device();
    const theirs = device();

    const [w1, w2] = [await wrapGroupKey(key, mine.publicKey), await wrapGroupKey(key, theirs.publicKey)];
    expect(w1).not.toBe(w2);

    // Same key out of both — that is what lets the two read each other's entries.
    expect(bytesToHex((await unwrapGroupKey(w1, mine.secret))!))
      .toBe(bytesToHex((await unwrapGroupKey(w2, theirs.secret))!));
  });
});

describe('sealing an entry', () => {
  it('round-trips a document, and the server sees none of it', async () => {
    const key = await newGroupKey();
    const entry = { amount_paise: 45000, note: 'Dinner at Mahesh', payer: 'p1' };

    const sealed = await sealEntry(entry, key, GROUP, ENTRY, 1);
    // The claim on the Sync screen — "not amounts, not who paid, not what it was
    // for" — is this assertion. It is user-facing copy, so it is tested.
    expect(sealed).not.toContain('Mahesh');
    expect(sealed).not.toContain('45000');

    expect(await openEntry(sealed, key, GROUP, ENTRY, 1)).toEqual(entry);
  });

  it('a member without the group key gets nothing', async () => {
    const sealed = await sealEntry({ amount_paise: 1 }, await newGroupKey(), GROUP, ENTRY, 1);
    expect(await openEntry(sealed, await newGroupKey(), GROUP, ENTRY, 1)).toBeNull();
  });

  it('survives non-ASCII — the payload is full of ₹ and real names', async () => {
    const key = await newGroupKey();
    const entry = { note: '₹1,200 — Priyā’s café 🍜' };
    const sealed = await sealEntry(entry, key, GROUP, ENTRY, 1);
    expect(await openEntry(sealed, key, GROUP, ENTRY, 1)).toEqual(entry);
  });

  it('rejects a tampered payload instead of returning garbage', async () => {
    const key = await newGroupKey();
    const sealed = await sealEntry({ amount_paise: 100 }, key, GROUP, ENTRY, 1);
    const bytes = Buffer.from(sealed, 'base64');
    bytes[bytes.length - 3] ^= 0xff;
    expect(await openEntry(bytes.toString('base64'), key, GROUP, ENTRY, 1)).toBeNull();
  });
});

/**
 * The AAD binding, which is the reason `sealEntry` takes three identifiers it never
 * encrypts.
 *
 * Encryption alone stops the server READING an entry. It does nothing to stop it —
 * or anyone who has the blobs — moving one somewhere it does not belong. Each of
 * these replays decrypts perfectly under the group key; only the binding rejects
 * them, and each one moves money.
 */
describe('an entry cannot be transplanted', () => {
  const key = newGroupKey();

  it('cannot be replayed as a DIFFERENT entry', async () => {
    // Otherwise one ₹50 blob is copied over a ₹5,000 entry and the debt vanishes.
    const k = await key;
    const sealed = await sealEntry({ amount_paise: 5000 }, k, GROUP, 'txn-dinner', 1);
    expect(await openEntry(sealed, k, GROUP, 'txn-rent', 1)).toBeNull();
    expect(await openEntry(sealed, k, GROUP, 'txn-dinner', 1)).toEqual({ amount_paise: 5000 });
  });

  it('cannot be rolled back to an EARLIER version', async () => {
    // The rollback attack the version field exists to stop: re-serve v1 as if it
    // were current and every device accepts a figure the group already corrected.
    const k = await key;
    const v3 = await sealEntry({ amount_paise: 900 }, k, GROUP, ENTRY, 3);
    expect(await openEntry(v3, k, GROUP, ENTRY, 2)).toBeNull();
    expect(await openEntry(v3, k, GROUP, ENTRY, 4)).toBeNull();
    expect(await openEntry(v3, k, GROUP, ENTRY, 3)).toEqual({ amount_paise: 900 });
  });

  it('cannot be moved into ANOTHER group', async () => {
    // Matters most for the two groups a person shares with different people: a
    // flatmate must not be able to plant an entry into the trip group.
    const k = await key;
    const sealed = await sealEntry({ amount_paise: 700 }, k, 'grp-flat', ENTRY, 1);
    expect(await openEntry(sealed, k, 'grp-trip', ENTRY, 1)).toBeNull();
  });

  /**
   * The binding is a delimited string, so ids must not be able to run together —
   * `("a", "b|c")` and `("a|b", "c")` would otherwise produce identical AAD and
   * make two different entries interchangeable.
   */
  it('does not confuse ids that share a boundary', async () => {
    const k = await key;
    const sealed = await sealEntry({ amount_paise: 1 }, k, 'a', 'b|c', 1);
    expect(await openEntry(sealed, k, 'a|b', 'c', 1)).toBeNull();
  });
});
