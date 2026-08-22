jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { openTestDb } from './dbHarness';
import { loadDemoData } from '../db/seedDemo';

/**
 * "Your data is on your account — want it back?"
 *
 * A restore is wipe-and-replace, so an unasked prompt offering one is an unasked
 * prompt offering to destroy somebody's work. The rule that makes it safe is that
 * it appears ONLY on a phone with nothing on it — and that rule is the whole
 * test, because everything else about the feature is cosmetic by comparison.
 */
function withMocks(opts: {
  configured?: boolean; signedIn?: boolean; dismissed?: boolean; backups?: Array<{ createdAt: number }>;
}) {
  jest.resetModules();
  jest.doMock('../lib/serverApi', () => ({
    serverConfigured: () => opts.configured ?? true,
    getStoredSession: async () => (opts.signedIn ?? true ? { token: 't', user: { id: 'u' } } : null),
    listServerBackups: async () => opts.backups ?? [{ createdAt: 1_700_000_000_000 }],
  }));
  jest.doMock('../lib/settings', () => ({
    settings: { restoreOfferDismissed: async () => opts.dismissed ?? false },
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../lib/restoreOffer').pendingRestoreOffer;
}

describe('offering a restore', () => {
  it('offers on a phone with nothing on it', async () => {
    const db = await openTestDb();
    const offer = await withMocks({})(db);
    expect(offer).toMatchObject({ count: 1, newestAt: 1_700_000_000_000 });
  });

  it('NEVER offers once the phone has transactions on it', async () => {
    /*
     * The one that matters. Somebody who has been using the app must not be shown
     * a one-tap path to replacing everything they have done — a prompt that can
     * appear beside real data is one that eventually gets tapped by accident.
     * They can still restore deliberately, from the screen built for it.
     */
    const db = await openTestDb();
    await loadDemoData(db);
    expect(await withMocks({})(db)).toBeNull();
  });

  it('counts a soft-deleted entry as having been used', async () => {
    // Deleting your only transaction does not make the phone new, and offering to
    // wipe it at that moment would be grotesque.
    const db = await openTestDb();
    await db.runAsync(
      `INSERT INTO budget_group (id, name, icon, color, carry_over, is_shared, is_archived,
                                 is_personal, simplify_debt, default_split, created_at)
       VALUES ('g1', 'Personal', 'home', '#20C4B8', 0, 0, 0, 1, 1, 'equal', 1)`,
    );
    await db.runAsync(
      `INSERT INTO txn (id, group_id, kind, entry_mode, date, category, is_deleted, created_at, updated_at)
       VALUES ('gone', 'g1', 'expense', 'quick', 1, 'Food', 1, 1, 1)`,
    );
    // Sanity: the row really landed, or this test proves nothing.
    const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM txn');
    expect(n?.n).toBe(1);

    expect(await withMocks({})(db)).toBeNull();
  });

  it('stays quiet once someone has said start fresh', async () => {
    const db = await openTestDb();
    expect(await withMocks({ dismissed: true })(db)).toBeNull();
  });

  it('says nothing when the account holds no copies', async () => {
    const db = await openTestDb();
    expect(await withMocks({ backups: [] })(db)).toBeNull();
  });

  it('says nothing when signed out, or on a build with no server', async () => {
    const db = await openTestDb();
    expect(await withMocks({ signedIn: false })(db)).toBeNull();
    expect(await withMocks({ configured: false })(db)).toBeNull();
  });

  it('reports the NEWEST copy, not the first listed', async () => {
    // The list is newest-first today; depending on that ordering would make the
    // prompt quietly wrong the day it changes.
    const db = await openTestDb();
    const offer = await withMocks({
      backups: [{ createdAt: 100 }, { createdAt: 900 }, { createdAt: 500 }],
    })(db);
    expect(offer).toMatchObject({ count: 3, newestAt: 900 });
  });
});
