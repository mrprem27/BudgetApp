import { selfPersonId } from '../lib/sync/ids';
import { pendingInvites, setInvites, answerInvite, recordedRejections } from '../db/queries/syncApply';
import { queueCount, queueUpsert } from '../db/queries/syncQueue';
import { deleteGroup, getGroupMembersWithRoles, insertGroup, leaveGroup, setMemberRole } from '../db/queries/groups';
import { addMemberToGroup, insertPerson, removeMemberFromGroup, setRemoteUid } from '../db/queries/persons';
import { insertTxn } from '../db/queries/transactions';
import {
  A, B, ME_A, ME_B, type Db, sync, serverMember, localMember, flatWithAarav, aaravJoined,
} from './helpers/twoPhones';

/**
 * Group flows over server sync (task S20): two phones, two accounts, one server — the real
 * Worker code on an in-process D1, the real app queries on each phone. Every flow
 * goes phone → server → the other phone, because a flow that only works on the
 * phone that started it is the v1 bug this replaces.
 */

describe('invite and answer', () => {
  it('an account added on one phone is invited, and the invitation reaches their phone', async () => {
    const { d1, a, b, flat, aaravOnA } = await flatWithAarav();
    expect(aaravOnA).toBe(ME_B);
    expect(await serverMember(d1, flat, ME_B)).toEqual({ status: 'invited', role: 'member' });
    expect(await pendingInvites(b)).toEqual([expect.objectContaining({ groupId: flat, groupName: 'Flat' })]);
    // Prem's phone says so too, rather than passing Aarav off as in.
    expect((await getGroupMembersWithRoles(a, flat)).find(m => m.person_id === ME_B)?.invited).toBe(true);
    // Not a member yet: the group itself has not come down.
    expect(b.raw.prepare('SELECT 1 FROM budget_group WHERE id = ?').get(flat)).toBeUndefined();
  });

  it('accepting goes through the queue, and the group arrives with its members', async () => {
    const { d1, a, b, flat } = await aaravJoined();
    expect(await serverMember(d1, flat, ME_B)).toEqual({ status: 'active', role: 'member' });
    expect(await pendingInvites(b)).toEqual([]);
    // Once he's in, Prem's phone stops calling him invited.
    expect((await getGroupMembersWithRoles(a, flat)).find(m => m.person_id === ME_B)?.invited).toBe(false);
    expect(b.raw.prepare('SELECT name, is_archived FROM budget_group WHERE id = ?').get(flat)).toEqual({ name: 'Flat', is_archived: 0 });
    expect(localMember(b, flat, ME_B)?.deleted_at).toBeNull();
    expect(localMember(b, flat, ME_A)).toMatchObject({ role: 'admin', deleted_at: null });
    // One "me" on Aarav's phone, not a second Aarav pulled from the roster.
    expect(b.raw.prepare('SELECT COUNT(*) AS n FROM person WHERE id = ? OR remote_uid = ?').get(ME_B, B)).toEqual({ n: 1 });
    expect(await queueCount(b)).toBe(0);
  });

  it('an answer given offline is kept, and the invitation stays answered through a pull', async () => {
    const { d1, b } = await flatWithAarav();
    const [invite] = await pendingInvites(b);
    await answerInvite(b, invite, true);
    // A pull that lands before the push (another device, a retry) must not bring the card back.
    await setInvites(b, [invite]);
    expect(await pendingInvites(b)).toEqual([]);
    await sync(b, d1, B);
    expect(await queueCount(b)).toBe(0);
  });

  it('declining leaves them out, and says so on the server', async () => {
    const { d1, b, flat } = await flatWithAarav();
    const [invite] = await pendingInvites(b);
    await answerInvite(b, invite, false);
    await sync(b, d1, B);
    expect(await serverMember(d1, flat, ME_B)).toMatchObject({ status: 'left' });
    expect(await pendingInvites(b)).toEqual([]);
    expect(b.raw.prepare('SELECT 1 FROM budget_group WHERE id = ?').get(flat)).toBeUndefined();
  });

  it('an admin re-saving an invited member does not accept for them', async () => {
    // The phone has no "invited" state: its row for Aarav is live, so every
    // re-save sends `active`. The server treats that as nothing asked (S20).
    const { d1, a, flat } = await flatWithAarav();
    await setMemberRole(a, flat, ME_A, ME_B, 'admin');
    await sync(a, d1, A);
    expect(await serverMember(d1, flat, ME_B)).toEqual({ status: 'invited', role: 'admin' });
    expect(await recordedRejections(a)).toEqual([]);
  });
});

describe('membership changes travel', () => {
  it('a placeholder — a name with no account — is a member at once, on every phone', async () => {
    const { d1, a, b, flat } = await aaravJoined();
    const chotu = await insertPerson(a, 'Chotu', '#64B5F6');
    await addMemberToGroup(a, flat, chotu.id, ME_A);
    await sync(a, d1, A);
    expect(await serverMember(d1, flat, chotu.id)).toEqual({ status: 'active', role: 'member' });
    expect((await getGroupMembersWithRoles(a, flat)).find(m => m.person_id === chotu.id)?.invited).toBe(false);
    await sync(b, d1, B);
    expect(b.raw.prepare('SELECT name FROM person WHERE id = ?').get(chotu.id)).toEqual({ name: 'Chotu' });
    expect(localMember(b, flat, chotu.id)?.deleted_at).toBeNull();
  });

  it('a role change on one phone is a role on the other', async () => {
    const { d1, a, b, flat } = await aaravJoined();
    await setMemberRole(a, flat, ME_A, ME_B, 'admin');
    await sync(a, d1, A);
    await sync(b, d1, B);
    expect(await serverMember(d1, flat, ME_B)).toMatchObject({ role: 'admin' });
    expect(localMember(b, flat, ME_B)?.role).toBe('admin');
  });

  it('a removed member stops receiving the group — their phone archives it', async () => {
    const { d1, a, b, flat } = await aaravJoined();
    await removeMemberFromGroup(a, flat, ME_B, ME_A);
    await sync(a, d1, A);
    expect(await serverMember(d1, flat, ME_B)).toMatchObject({ status: 'removed' });
    const first = await sync(b, d1, B);
    expect(b.raw.prepare('SELECT is_archived, deleted_at FROM budget_group WHERE id = ?').get(flat)).toEqual({ is_archived: 1, deleted_at: null });
    // Archived, never deleted: what they spent there is still theirs to see.
    expect(b.raw.prepare('SELECT COUNT(*) AS n FROM budget_group WHERE id = ?').get(flat)).toEqual({ n: 1 });
    // Said once, as a removal — not again on the next sync.
    expect(first.vanished).toEqual([{ groupId: flat, name: 'Flat', state: 'removed' }]);
    // Unarchived to look back at it: the next sync leaves it where they put it.
    b.raw.prepare('UPDATE budget_group SET is_archived = 0 WHERE id = ?').run(flat);
    const second = await sync(b, d1, B);
    expect(second.vanished).toEqual([]);
    expect(b.raw.prepare('SELECT is_archived FROM budget_group WHERE id = ?').get(flat)).toEqual({ is_archived: 0 });
  });

  it('a group its owner deleted ends on every phone, as deleted — and says so', async () => {
    const { d1, a, b, flat } = await aaravJoined();
    expect((await deleteGroup(a, flat, ME_A)).ok).toBe(true);
    await sync(a, d1, A);
    const r = await sync(b, d1, B);
    expect(r.vanished).toEqual([{ groupId: flat, name: 'Flat', state: 'deleted' }]);
    const g = b.raw.prepare('SELECT is_archived, deleted_at FROM budget_group WHERE id = ?').get(flat) as { is_archived: number; deleted_at: number | null };
    expect(g.is_archived).toBe(1);
    expect(g.deleted_at).not.toBeNull();
  });

  it('leaving on my phone is a departure on theirs', async () => {
    const { d1, a, b, flat } = await aaravJoined();
    expect(await leaveGroup(b, flat, ME_B)).toEqual({ ok: true });
    // My own departure isn't news to me.
    expect((await sync(b, d1, B)).vanished).toEqual([]);
    expect(await serverMember(d1, flat, ME_B)).toMatchObject({ status: 'left' });
    await sync(a, d1, A);
    expect(localMember(a, flat, ME_B)?.deleted_at).not.toBeNull();
  });

  it('the owner cannot be removed, whatever a phone sends', async () => {
    const { d1, a, b, flat } = await aaravJoined();
    await setMemberRole(a, flat, ME_A, ME_B, 'admin');
    await sync(a, d1, A);
    await sync(b, d1, B);
    // Aarav's phone would refuse this itself; bypass it, as a modified client would.
    b.raw.prepare('UPDATE group_member SET deleted_at = 5 WHERE group_id = ? AND person_id = ?').run(flat, ME_A);
    await queueUpsert(b, 'group_member', `${flat}|${ME_A}`);
    await sync(b, d1, B);
    expect(await serverMember(d1, flat, ME_A)).toMatchObject({ status: 'active' });
    expect((await recordedRejections(b)).map(r => r.code)).toEqual(['forbidden']);
  });
});

describe('a friend who turns out to be an account', () => {
  /**
   * Aarav already knew Prem — as a friend typed in by hand, with money between
   * them in a group only Aarav's phone has. Then Prem's shared group arrives.
   * Prem must still be one person on Aarav's phone, and the old money must still
   * be Prem's.
   */
  async function aaravKnewPrem() {
    const w = await flatWithAarav();
    const premOnB = await insertPerson(w.b, 'Prem bhai', '#FFB74D');
    const trip = await insertGroup(w.b, 'Trip', 'plane', '#20C4B8', [premOnB.id], 'equal', ME_B);
    await insertTxn(w.b, {
      groupId: trip.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME_B, amount: 1000 }],
      shares: [{ personId: ME_B, amount: 500 }, { personId: premOnB.id, amount: 500 }],
    });
    return { ...w, premOnB: premOnB.id, trip: trip.id };
  }
  const shareOf = (db: Db, personId: string) =>
    db.raw.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM txn_share WHERE person_id = ?').get(personId) as { s: number };

  it('linked before the group arrives: they take the account id, and the pull finds them there', async () => {
    const w = await aaravKnewPrem();
    expect(await setRemoteUid(w.b, w.premOnB, A)).toBe(ME_A);
    const [invite] = await pendingInvites(w.b);
    await answerInvite(w.b, invite, true);
    await sync(w.b, w.d1, B);

    expect(w.b.raw.prepare('SELECT COUNT(*) AS n FROM person WHERE is_me = 0').get()).toEqual({ n: 1 });
    // My name for them survives the server's.
    expect(w.b.raw.prepare('SELECT name FROM person WHERE id = ?').get(ME_A)).toEqual({ name: 'Prem bhai' });
    expect(shareOf(w.b, ME_A)).toEqual({ s: 500 });
    expect(shareOf(w.b, w.premOnB)).toEqual({ s: 0 });
    expect(localMember(w.b, w.trip, ME_A)?.deleted_at).toBeNull();
  });

  it('bound before S20, under a phone-made id: the pull moves them onto the account id first', async () => {
    // What a phone that linked people under v1 holds: `remote_uid` set, the id
    // still the random one. `setRemoteUid` would have moved it; the pull has to.
    const w = await aaravKnewPrem();
    w.b.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run(A, w.premOnB);
    const [invite] = await pendingInvites(w.b);
    await answerInvite(w.b, invite, true);
    await sync(w.b, w.d1, B);

    expect(w.b.raw.prepare('SELECT COUNT(*) AS n FROM person WHERE is_me = 0').get()).toEqual({ n: 1 });
    expect(w.b.raw.prepare('SELECT name FROM person WHERE id = ?').get(ME_A)).toEqual({ name: 'Prem bhai' });
    expect(shareOf(w.b, ME_A)).toEqual({ s: 500 });
    expect(localMember(w.b, w.flat, ME_A)?.deleted_at).toBeNull();
  });

  it('linked after the group arrived: the two rows fold into one, and the money follows', async () => {
    const w = await aaravKnewPrem();
    const [invite] = await pendingInvites(w.b);
    await answerInvite(w.b, invite, true);
    await sync(w.b, w.d1, B);
    // The group brought Prem as `user:u-prem`; the hand-typed "Prem bhai" is still separate.
    expect(w.b.raw.prepare('SELECT COUNT(*) AS n FROM person WHERE is_me = 0').get()).toEqual({ n: 2 });

    expect(await setRemoteUid(w.b, w.premOnB, A)).toBe(ME_A);
    expect(w.b.raw.prepare('SELECT COUNT(*) AS n FROM person WHERE is_me = 0').get()).toEqual({ n: 1 });
    expect(w.b.raw.prepare('SELECT name, remote_uid FROM person WHERE id = ?').get(ME_A)).toEqual({ name: 'Prem bhai', remote_uid: A });
    expect(shareOf(w.b, ME_A)).toEqual({ s: 500 });
    expect(localMember(w.b, w.trip, ME_A)?.deleted_at).toBeNull();
    expect(localMember(w.b, w.flat, ME_A)?.deleted_at).toBeNull();

    // And the whole thing syncs without a refusal.
    await sync(w.b, w.d1, B);
    expect(await recordedRejections(w.b)).toEqual([]);
    expect(await queueCount(w.b)).toBe(0);
  });
});
