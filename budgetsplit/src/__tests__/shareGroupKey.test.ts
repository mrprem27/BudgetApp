import { x25519 } from '@noble/curves/ed25519.js';
import { bytesToHex } from '../lib/bytes';
import { newGroupKey, wrapGroupKey, unwrapGroupKey } from '../lib/groupCrypto';
import { createTestDb, addPerson, addGroup, addMember, asDb, type TestDb } from './helpers/testDb';

/**
 * One group, one key — and the bug that made sharing with a SECOND person
 * deliver nothing.
 *
 * `shareGroup` called `newGroupKey()` unconditionally, and the Worker's publish
 * returned early for a group it already had *without re-wrapping*. So: share with
 * Aarav under K1, and every entry from then on is sealed with K1. Share with
 * Priya, mint K2 — the publish is a no-op, so my own wraps stay K1, and Priya is
 * handed K2. She sees the group appear, and never a single entry in it, forever,
 * with nothing anywhere saying why.
 *
 * `syncEngine` had no test of its own, which is exactly how this stayed invisible:
 * the crypto tests all pass, because the crypto was never wrong.
 */

const ME_UID = 'acct-me';

/**
 * `jest.mock` is hoisted above the imports, so a factory may only close over
 * names beginning with `mock` — hence this one holder rather than free variables.
 */
const mockDevice = {
  myId: 'dev-me-1',
  mySecret: new Uint8Array(32),
  myPublicKey: '',
  theirs: { deviceId: 'dev-them-1', publicKey: '' },
};

/** A real curve keypair, so every wrap in this file is genuinely openable. */
function keypair() {
  const secret = x25519.utils.randomSecretKey();
  return { secret, publicKey: bytesToHex(x25519.getPublicKey(secret)) };
}

// Mocked at the transport boundary only. Everything below it — the curve, the
// wraps, the key comparison — is the real implementation.
jest.mock('../lib/serverApi', () => ({
  serverConfigured: () => true,
  getStoredSession: jest.fn(),
  listDeviceKeys: jest.fn(),
  listSyncGroups: jest.fn(),
  publishSyncGroup: jest.fn(async () => {}),
  inviteSyncMember: jest.fn(async () => {}),
  pushSyncWraps: jest.fn(async () => {}),
  pushSyncEntry: jest.fn(async () => {}),
  pullSyncEntries: jest.fn(),
  pushSyncDispute: jest.fn(),
  pullSyncDisputes: jest.fn(),
  registerDevice: jest.fn(),
  joinSyncGroup: jest.fn(),
  ServerRequestError: class extends Error { status = 0; detail: unknown = null; },
}));

jest.mock('../lib/deviceKey', () => ({
  deviceIdentity: jest.fn(async () => ({ deviceId: mockDevice.myId, publicKey: mockDevice.myPublicKey })),
  deviceSecret: jest.fn(async () => mockDevice.mySecret),
  bindDeviceToAccount: jest.fn(async () => false),
}));

// Imported after the mocks so the module graph picks them up.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverApi = require('../lib/serverApi');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { shareGroup } = require('../lib/syncEngine');

/** Me, an admin of a shared group, with Aarav already a member. */
function scene() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run(ME_UID, me);
  const gid = addGroup(db, 'Flat', false, me);   // created_by = me → admin
  addMember(db, gid, me, 'admin');
  return { db, me, gid };
}

beforeEach(() => {
  jest.clearAllMocks();
  const mine = keypair();
  const theirs = keypair();
  mockDevice.mySecret = mine.secret;
  mockDevice.myPublicKey = mine.publicKey;
  mockDevice.theirs = { deviceId: 'dev-them-1', publicKey: theirs.publicKey };

  serverApi.listDeviceKeys.mockImplementation(async (userId?: string) =>
    userId
      ? [mockDevice.theirs]
      : [{ deviceId: mockDevice.myId, publicKey: mockDevice.myPublicKey }]);
  serverApi.listSyncGroups.mockResolvedValue([]);
});

/** The wrap this device published for ITSELF on the Nth publish call. */
const myWrapFrom = (call: number): string =>
  serverApi.publishSyncGroup.mock.calls[call][1][0].wrappedKey as string;

/** Every wrap handed to the invitee across all calls so far. */
const invitedWraps = () =>
  serverApi.inviteSyncMember.mock.calls.flatMap((c: unknown[]) => c[2] as { deviceId: string; wrappedKey: string }[]);

describe('sharing a group reuses its key', () => {
  it('hands the second person the SAME key as the first', async () => {
    const s = scene();

    // First share: nothing published yet, so a key is minted.
    expect(await shareGroup(asDb(s.db), s.gid, 'acct-aarav')).toMatchObject({ ok: true });
    const firstWrap = invitedWraps()[0].wrappedKey;

    // What the server now holds for MY device — this is what the second share
    // must read the key back out of.
    const myWrap = myWrapFrom(0);
    serverApi.listSyncGroups.mockResolvedValue([
      { id: s.gid, owner: ME_UID, state: 'approved', wrappedKey: myWrap },
    ]);

    // Second share, to somebody else.
    expect(await shareGroup(asDb(s.db), s.gid, 'acct-priya')).toMatchObject({ ok: true });

    const secondWrap = invitedWraps()[1].wrappedKey;
    // Different wraps — a fresh ephemeral keypair every time, by design...
    expect(secondWrap).not.toBe(firstWrap);

    // ...of ONE key. This is the assertion the whole file exists for: what the
    // second person is handed opens exactly what the entries were sealed with.
    const k1 = await unwrapGroupKey(myWrap, mockDevice.mySecret);
    const k2 = await unwrapGroupKey(myWrapFrom(1), mockDevice.mySecret);
    expect(k1).not.toBeNull();
    expect(Array.from(k2!)).toEqual(Array.from(k1!));
  });

  it('mints a key only for a group that is not published yet', async () => {
    const s = scene();
    await shareGroup(asDb(s.db), s.gid, 'acct-aarav');
    const minted = await unwrapGroupKey(myWrapFrom(0), mockDevice.mySecret);
    expect(minted).not.toBeNull();
    expect(minted!.length).toBe(32);
  });

  it('refuses rather than re-keying a group this device cannot open', async () => {
    // Re-keying here would leave every entry already on the server sealed with a
    // key nobody holds any more — unrecoverable, because the old one only ever
    // lived in one device's memory.
    const s = scene();
    serverApi.listSyncGroups.mockResolvedValue([
      { id: s.gid, owner: ME_UID, state: 'approved', wrappedKey: null },
    ]);

    expect(await shareGroup(asDb(s.db), s.gid, 'acct-aarav'))
      .toEqual({ ok: false, reason: 'no-key' });
    expect(serverApi.publishSyncGroup).not.toHaveBeenCalled();
    expect(serverApi.inviteSyncMember).not.toHaveBeenCalled();
  });

  it('refuses a wrap it cannot actually unwrap, rather than trusting the server', async () => {
    const s = scene();
    const strangersKey = await newGroupKey();
    const notForMe = await wrapGroupKey(strangersKey, keypair().publicKey);
    serverApi.listSyncGroups.mockResolvedValue([
      { id: s.gid, owner: ME_UID, state: 'approved', wrappedKey: notForMe },
    ]);

    expect(await shareGroup(asDb(s.db), s.gid, 'acct-aarav'))
      .toEqual({ ok: false, reason: 'no-key' });
  });
});

describe('sharing answers to the same permission as adding a member', () => {
  it('refuses a plain member, before touching the network', async () => {
    // Sharing IS letting someone in, and it publishes every member's name, colour
    // and account id to them. It was ungated while `canAddMember` refused a plain
    // member from adding anybody.
    const db = createTestDb();
    const creator = addPerson(db, 'Aarav');
    const me = addPerson(db, 'Prem', true);
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run(ME_UID, me);
    const gid = addGroup(db, 'Flat', false, creator);
    addMember(db, gid, creator, 'admin');
    addMember(db, gid, me, 'member');

    expect(await shareGroup(asDb(db), gid, 'acct-priya'))
      .toEqual({ ok: false, reason: 'not-allowed' });
    expect(serverApi.listDeviceKeys).not.toHaveBeenCalled();
  });
});
