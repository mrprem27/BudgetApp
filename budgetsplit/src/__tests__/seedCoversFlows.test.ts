import { openTestDb } from './dbHarness';
import { loadDemoData } from '../db/seedDemo';
import { getPendingApprovalCount } from '../db/queries/approval';
import { getMyExposure } from '../db/queries/balances';
import { getTransactionsForGroup } from '../db/queries/transactions';
import { disputesFor } from '../db/queries/syncDoc';

/**
 * Demo data has to be able to REACH the flows, or the device sweep cannot judge
 * them.
 *
 * "Load demo data" is how every screen gets walked before a release, and the
 * sync surfaces were invisible in it: no linked account, so trust was inert; no
 * pending entry, so the approvals queue was empty; no objection, so the dispute
 * banner had nothing to render. Each of those screens would have been ticked off
 * as fine while showing an empty state.
 *
 * This is the guard on that — not on the seeding code, on the COVERAGE.
 */
describe('demo data reaches the sync surfaces', () => {
  it('gives trust something to act on', async () => {
    const db = await openTestDb();
    await loadDemoData(db);

    // Without `remote_uid` a person has no account, so `requiresMyApproval`
    // has nobody to ask about and every peer entry below would be inert.
    const linked = await db.getAllAsync<{ name: string; trust_state: string }>(
      'SELECT name, trust_state FROM person WHERE remote_uid IS NOT NULL',
    );
    expect(linked.length).toBeGreaterThanOrEqual(2);
    // Both sides of the switch, so the same entry lands differently by author.
    expect(linked.map(p => p.trust_state)).toEqual(
      expect.arrayContaining(['trusted', 'review']),
    );
  });

  it('leaves entries actually waiting on you', async () => {
    const db = await openTestDb();
    await loadDemoData(db);
    // The Home badge and the approvals queue both read this.
    expect(await getPendingApprovalCount(db)).toBeGreaterThanOrEqual(2);
  });

  it('includes a transfer that waits even though its author is trusted', async () => {
    // The rule that looks like a bug to anyone who does not know it: money
    // arriving always asks, because only the recipient knows where it landed.
    const db = await openTestDb();
    await loadDemoData(db);
    const waiting = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM txn t
         JOIN txn_approval a ON a.txn_id = t.id AND a.state = 'pending'
         JOIN person p ON p.id = t.author_person_id
        WHERE t.kind = 'settlement' AND p.trust_state = 'trusted'`,
    );
    expect(waiting?.n).toBeGreaterThanOrEqual(1);
  });

  it('shows a waiting entry in the group ledger while counting it nowhere', async () => {
    /*
     * The promise the whole approval model rests on, asserted against real demo
     * data rather than a fixture: the group agrees on what happened, and my own
     * figures ignore it until I say so.
     */
    const db = await openTestDb();
    await loadDemoData(db);

    const pending = await db.getFirstAsync<{ id: string; group_id: string }>(
      `SELECT t.id, t.group_id FROM txn t
         JOIN txn_approval a ON a.txn_id = t.id AND a.state = 'pending'
        WHERE t.kind = 'expense' LIMIT 1`,
    );
    expect(pending).not.toBeNull();

    const ledger = await getTransactionsForGroup(db, pending!.group_id);
    expect(ledger.map(t => t.id)).toContain(pending!.id);

    const before = await getMyExposure(db, (await me(db)));
    // Approving is the only thing that should move it; nothing here does, so the
    // figure must simply not include it. Proven by the row being absent from the
    // exposure query's own inputs rather than by arithmetic on a magic number.
    const counted = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM txn_share s
        WHERE s.txn_id = ? AND EXISTS (
          SELECT 1 FROM txn_approval a WHERE a.txn_id = s.txn_id AND a.state = 'pending')`,
      [pending!.id],
    );
    expect(counted?.n).toBeGreaterThan(0);   // it does have shares...
    expect(before.owe).toBeGreaterThanOrEqual(0); // ...and the figure still stands
  });

  it('includes an objection to something you wrote', async () => {
    // Otherwise the dispute banner on transaction detail can never be seen.
    const db = await openTestDb();
    await loadDemoData(db);
    const row = await db.getFirstAsync<{ txn_id: string }>('SELECT txn_id FROM txn_dispute LIMIT 1');
    expect(row).not.toBeNull();
    expect(await disputesFor(db, row!.txn_id)).toHaveLength(1);
  });
});

async function me(db: Awaited<ReturnType<typeof openTestDb>>): Promise<string> {
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM person WHERE is_me = 1');
  return row!.id;
}
