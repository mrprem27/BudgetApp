jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { SNAPSHOT_MIN_GAP_MS } from '../lib/syncSnapshot';

/**
 * The automatic whole-app copy, and the reasons it declines.
 *
 * `maybeSnapshot` runs behind a foreground event and never throws, so every
 * refusal is a silent one — which makes each `reason` the only evidence that
 * anything was decided at all. They are asserted here rather than trusted.
 */
describe('the snapshot throttle', () => {
  it('is hours, not minutes', () => {
    /*
     * A snapshot reads the whole database, seals it through 50,000 PBKDF2 rounds
     * and uploads it, and the account keeps only ten. Running that per foreground
     * would burn the user's battery and their retention window in an afternoon.
     *
     * Six hours bounds a lost phone to a few hours of entries — against the
     * alternative, which is everything since somebody last remembered to press a
     * button.
     */
    expect(SNAPSHOT_MIN_GAP_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(SNAPSHOT_MIN_GAP_MS).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});

describe('what stops a snapshot', () => {
  /*
   * Order matters, and it is deliberate. The cheap local checks come before
   * anything that touches the keychain or the network, so a device with the
   * feature off never reads a secret or opens a socket to discover that.
   */
  it('declines before touching the keychain when the feature is off', async () => {
    jest.resetModules();
    jest.doMock('../lib/settings', () => ({
      settings: {
        syncEverything: async () => false,
        lastSnapshotAt: async () => null,
        setLastSnapshotAt: async () => {},
        setLastSnapshotNote: async () => {},
      },
    }));
    const secret = jest.fn();
    jest.doMock('expo-secure-store', () => ({ getItemAsync: secret, setItemAsync: secret, deleteItemAsync: secret }));

    const { maybeSnapshot } = require('../lib/syncSnapshot');
    const res = await maybeSnapshot({} as never);

    expect(res).toEqual({ ok: false, reason: 'off' });
    expect(secret).not.toHaveBeenCalled();
  });

  it('refuses rather than inventing a passphrase', async () => {
    /*
     * The one that would be silently catastrophic. A snapshot sealed with a
     * generated key is a file nobody can ever open — it would upload happily,
     * report success, prune a real backup to make room, and be worthless at the
     * only moment it is wanted.
     */
    jest.resetModules();
    jest.doMock('../lib/settings', () => ({
      settings: {
        syncEverything: async () => true,
        lastSnapshotAt: async () => null,
        setLastSnapshotAt: async () => {},
        setLastSnapshotNote: async () => {},
      },
    }));
    jest.doMock('../lib/serverApi', () => ({
      serverConfigured: () => true,
      getStoredSession: async () => ({ token: 't', user: { id: 'u' } }),
      uploadBackup: jest.fn(),
    }));
    jest.doMock('expo-secure-store', () => ({
      getItemAsync: async () => null,          // nothing remembered
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    }));

    const { maybeSnapshot } = require('../lib/syncSnapshot');
    const res = await maybeSnapshot({} as never);
    expect(res).toEqual({ ok: false, reason: 'no-passphrase' });

    const { uploadBackup } = require('../lib/serverApi');
    expect(uploadBackup).not.toHaveBeenCalled();
  });

  it('waits out the gap instead of uploading on every foreground', async () => {
    jest.resetModules();
    jest.doMock('../lib/settings', () => ({
      settings: {
        syncEverything: async () => true,
        lastSnapshotAt: async () => Date.now() - 60_000, // a minute ago
        setLastSnapshotAt: async () => {},
        setLastSnapshotNote: async () => {},
      },
    }));
    jest.doMock('../lib/serverApi', () => ({
      serverConfigured: () => true,
      getStoredSession: async () => ({ token: 't', user: { id: 'u' } }),
      uploadBackup: jest.fn(),
    }));

    const { maybeSnapshot } = require('../lib/syncSnapshot');
    expect(await maybeSnapshot({} as never)).toEqual({ ok: false, reason: 'too-soon' });
    expect(require('../lib/serverApi').uploadBackup).not.toHaveBeenCalled();
  });
});
