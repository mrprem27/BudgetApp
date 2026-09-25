import { insertGroup } from '../db/queries/groups';
import { addMemberToGroup, insertPerson, setRemoteUid } from '../db/queries/persons';
import { insertTxn } from '../db/queries/transactions';
import { pendingInvites, answerInvite, recordedRejections } from '../db/queries/syncApply';
import { queueCount } from '../db/queries/syncQueue';
import { selfPersonId } from '../lib/sync/ids';
import { A, B, ME_A, ME_B, type Db, phone, server, sync } from './helpers/twoPhones';


/**
 * A friend with no account signs up, and I link them (S21 — SPEC-SERVER.md §2.2:
 * "their person is merged into the real one, and every reference is repointed in
 * one batch").
 *
 * Prem made "Flat" with Aarav typed in by hand, and Chotu (an account) is in it
 * too. Money moved. Then Aarav signs up and Prem links him. After that, on every
 * phone and on the server, there is ONE Aarav — the account — and the old money is
 * his.
 */

const C = 'u-chotu';
const ME_C = selfPersonId(C);

async function world() {
  const d1 = await server();
  await d1.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, 1)').bind(C, `${C}@x.in`, 'Chotu').run();
  await d1.prepare("INSERT INTO sync_scopes (id, kind, seq, created_at) VALUES (?, 'user', 0, 1)").bind(C).run();
  const a = await phone(A, 'Prem');
  const b = await phone(B, 'Aarav');
  const c = await phone(C, 'Chotu');

  // Chotu is linked to Prem and joins as an account; Aarav is only a name.
  const chotu = await insertPerson(a, 'Chotu', '#64B5F6');
  const chotuId = await setRemoteUid(a, chotu.id, C);
  const aarav = await insertPerson(a, 'Aarav', '#E57373');
  const flat = await insertGroup(a, 'Flat', 'home', '#20C4B8', [chotuId, aarav.id], 'equal', ME_A);
  const dinner = await insertTxn(a, {
    groupId: flat.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
    payments: [{ personId: ME_A, amount: 90000 }],
    shares: [{ personId: ME_A, amount: 30000 }, { personId: aarav.id, amount: 30000 }, { personId: chotuId, amount: 30000 }],
  });
  await sync(a, d1, A);
  await sync(c, d1, C);
  await answerInvite(c, (await pendingInvites(c))[0], true);
  await sync(c, d1, C);
  return { d1, a, b, c, flat: flat.id, placeholder: aarav.id, dinner };
}

const persons = (db: Db) =>
  db.raw.prepare('SELECT id, name FROM person WHERE is_me = 0 ORDER BY id').all() as Array<{ id: string; name: string }>;
const share = (db: Db, txnId: string, personId: string) =>
  (db.raw.prepare('SELECT amount FROM txn_share WHERE txn_id = ? AND person_id = ?').get(txnId, personId) as { amount: number } | undefined)?.amount;

describe('a placeholder becomes an account', () => {
  it('before: the placeholder is an ordinary member everywhere', async () => {
    const w = await world();
    expect(share(w.c, w.dinner, w.placeholder)).toBe(30000);
    expect(persons(w.c).map(p => p.name).sort()).toEqual(['Aarav', 'Prem']);
    // Chotu was asked about dinner while still invited; the question came down
    // with the group when he accepted, not before (the pull holds it back).
    expect(w.c.raw.prepare('SELECT state FROM txn_approval WHERE txn_id = ?').get(w.dinner)).toEqual({ state: 'pending' });
  });

  it('linking folds it in on the server: one Aarav, the old money his, his to see and answer', async () => {
    const w = await world();
    expect(await setRemoteUid(w.a, w.placeholder, B)).toBe(ME_B);
    await sync(w.a, w.d1, A);
    expect(await recordedRejections(w.a)).toEqual([]);

    // The server: memberships and splits name the account, not the placeholder.
    expect(await w.d1.prepare('SELECT merged_into FROM people WHERE id = ?').bind(w.placeholder).first('merged_into')).toBe(ME_B);
    expect(await w.d1.prepare('SELECT status FROM group_members WHERE id = ?').bind(`${w.flat}:${ME_B}`).first('status')).toBe('active');
    expect(await w.d1.prepare('SELECT COUNT(*) AS n FROM transaction_splits WHERE person_id = ?').bind(w.placeholder).first('n')).toBe(0);
    expect(await w.d1.prepare('SELECT amount FROM transaction_splits WHERE transaction_id = ? AND person_id = ?')
      .bind(w.dinner, ME_B).first('amount')).toBe(30000);

    // Aarav's own phone: the group arrives, with his share, waiting for him.
    await sync(w.b, w.d1, B);
    expect(w.b.raw.prepare('SELECT name FROM budget_group WHERE id = ?').get(w.flat)).toEqual({ name: 'Flat' });
    expect(share(w.b, w.dinner, ME_B)).toBe(30000);
    expect(w.b.raw.prepare('SELECT state FROM txn_approval WHERE txn_id = ?').get(w.dinner)).toEqual({ state: 'pending' });
    expect(await queueCount(w.a)).toBe(0);
  });

  it('every other member\'s phone folds its copy too — no ghost Aarav, no stray friend', async () => {
    const w = await world();
    await setRemoteUid(w.a, w.placeholder, B);
    await sync(w.a, w.d1, A);
    await sync(w.c, w.d1, C);

    expect(persons(w.c)).toEqual([{ id: ME_B, name: 'Aarav' }, { id: ME_A, name: 'Prem' }]);
    expect(share(w.c, w.dinner, ME_B)).toBe(30000);
    expect(share(w.c, w.dinner, w.placeholder)).toBeUndefined();
    expect(w.c.raw.prepare('SELECT deleted_at FROM group_member WHERE group_id = ? AND person_id = ?').get(w.flat, ME_B))
      .toEqual({ deleted_at: null });
    expect(w.c.raw.prepare('SELECT 1 FROM group_member WHERE person_id = ?').get(w.placeholder)).toBeUndefined();
    // Nothing to send: the server already did it for everyone.
    expect(await queueCount(w.c)).toBe(0);
    expect(await w.d1.prepare('SELECT COUNT(*) AS n FROM friends WHERE user_id = ?').bind(C).first('n')).toBe(0);
  });

  it('refuses to fold someone into an account I am not linked with', async () => {
    const w = await world();
    await w.d1.prepare('UPDATE links SET ended_at = 5').run();
    await setRemoteUid(w.a, w.placeholder, B);
    await sync(w.a, w.d1, A);
    expect((await recordedRejections(w.a)).map(r => [r.code, r.entity])).toEqual([['forbidden', 'person_merges']]);
    expect(await w.d1.prepare('SELECT merged_into FROM people WHERE id = ?').bind(w.placeholder).first('merged_into')).toBeNull();
  });

  it('a later member added by the placeholder\'s old id is refused nothing — it simply names the account', async () => {
    const w = await world();
    await setRemoteUid(w.a, w.placeholder, B);
    await sync(w.a, w.d1, A);
    // Re-adding the (now account) member is a no-op on the server, not an error.
    await addMemberToGroup(w.a, w.flat, ME_B, ME_A);
    await sync(w.a, w.d1, A);
    expect(await recordedRejections(w.a)).toEqual([]);
  });
});
