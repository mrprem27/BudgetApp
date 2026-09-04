import { deletePerson, removeMemberFromGroup, getAllPersons, setGroupTrust } from '../db/queries/persons';
import { getSharedGroupsWith, archiveGroupSafe } from '../db/queries/groups';
import { refusalReason } from '../lib/personCopy';
import { createTestDb, addPerson, addGroup, addMember, addTxn, addCategory, asDb } from './helpers/testDb';

/**
 * A person added by mistake had to stay forever.
 *
 * There was no delete at all, and `mergePerson` — the only way to get rid of a
 * row — is reachable from exactly one place, a sync name-collision alert. So
 * typing "Priyaa" instead of "Priya" put a row in the People list, in every
 * member picker and in the Linked-people match sheet, permanently.
 *
 * The bar for a hard delete is that it can change no number and orphan nothing.
 * Anyone who fails it is a real person with real history, and the answers for
 * them are removal from a group (soft, reversible) or a merge.
 */
describe('deletePerson', () => {
  it('removes somebody with no history at all', async () => {
    const db = createTestDb();
    addPerson(db, 'Me', true);
    const typo = addPerson(db, 'Priyaa');

    expect(await deletePerson(asDb(db), typo)).toEqual({ ok: true });
    expect((await getAllPersons(asDb(db))).map(p => p.id)).not.toContain(typo);
  });

  it('refuses somebody on a transaction', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');
    addMember(db, gid, aarav, 'member');
    addCategory(db, 'Food');
    addTxn(db, {
      groupId: gid, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: 100000 }],
      shares: [{ personId: me, amount: 50000 }, { personId: aarav, amount: 50000 }],
    });

    expect(await deletePerson(asDb(db), aarav)).toEqual({ ok: false, reason: 'in-use', via: 'history' });
  });

  it('still refuses after they are removed from the group, and says it is the group', async () => {
    // Removal is soft, so the membership row survives and still names them. This
    // person has no money anywhere — so the refusal must NOT claim shared expenses,
    // which is exactly what it used to do.
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');
    addMember(db, gid, aarav, 'member');

    await removeMemberFromGroup(asDb(db), gid, aarav, me);

    expect(await deletePerson(asDb(db), aarav)).toEqual({ ok: false, reason: 'in-use', via: 'group' });
  });

  it('refuses somebody linked to an account', async () => {
    // A real person whose entries can arrive at any moment — and who may have no
    // history at all yet, so "you've shared expenses" would be false here too.
    const db = createTestDb();
    addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('acct-aarav', aarav);

    expect(await deletePerson(asDb(db), aarav)).toEqual({ ok: false, reason: 'in-use', via: 'account' });
  });

  it('refuses me', async () => {
    // The row every balance in the app is measured against.
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    expect(await deletePerson(asDb(db), me)).toEqual({ ok: false, reason: 'is-me' });
  });

  it('refuses somebody who created a group', async () => {
    const db = createTestDb();
    addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    addGroup(db, 'Flat', false, aarav);
    expect(await deletePerson(asDb(db), aarav)).toEqual({ ok: false, reason: 'in-use', via: 'group' });
  });

  it('calls it history when money and a membership both exist', async () => {
    // Both buckets are non-zero; history is the stronger claim and the one that
    // explains why removal would change a number, so it must win.
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');
    addMember(db, gid, aarav, 'member');
    addCategory(db, 'Food');
    addTxn(db, {
      groupId: gid, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: 100000 }],
      shares: [{ personId: me, amount: 50000 }, { personId: aarav, amount: 50000 }],
    });

    expect(await deletePerson(asDb(db), aarav)).toEqual({ ok: false, reason: 'in-use', via: 'history' });
  });
});

/**
 * The refusal has to be true before it can be useful.
 *
 * One bucket covered all three blocks, so Friends said "you've shared expenses with
 * them" to a person who had never been in a transaction — and told them to do a
 * thing (take them out of a group) that cannot unblock it, because removal is soft
 * and the membership row survives on purpose.
 */
describe('refusalReason', () => {
  it('never claims shared money for a group-only block', () => {
    const msg = refusalReason({ ok: false, reason: 'in-use', via: 'group' });
    expect(msg).not.toMatch(/shared (money|expenses)/i);
    expect(msg).toMatch(/group/i);
  });

  it('does not offer group removal as an escape when it would not work', () => {
    // The old copy's advice. It has to be absent, not reworded.
    expect(refusalReason({ ok: false, reason: 'in-use', via: 'group' }))
      .not.toMatch(/take them out of a group instead/i);
  });

  it('still says shared money when money is the reason', () => {
    expect(refusalReason({ ok: false, reason: 'in-use', via: 'history' })).toMatch(/shared money/i);
  });

  it('names the account when that is what blocks it', () => {
    expect(refusalReason({ ok: false, reason: 'in-use', via: 'account' })).toMatch(/account/i);
  });

  it('gives every block a distinct sentence', () => {
    const all = (['account', 'history', 'group'] as const)
      .map(via => refusalReason({ ok: false, reason: 'in-use', via }));
    expect(new Set(all).size).toBe(3);
  });
});

/**
 * A per-group trust override set on a group that was later archived became
 * permanently unclearable: the row survived, the control to reach it did not, and
 * restoring the group would have let the forgotten answer govern again.
 *
 * AGENTS.md is explicit that an override "must stay clearable, or 'trusted except
 * here' is a one-way door" — and trust is the one setting where
 * stale-and-more-permissive is exactly the wrong failure.
 */
describe('an archived group keeps its trust override reachable', () => {
  async function scene() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    const live = addGroup(db, 'Flat', false, me);
    const old = addGroup(db, 'Goa Trip', false, me);
    [live, old].forEach(g => { addMember(db, g, me, 'admin'); addMember(db, g, aarav, 'member'); });
    return { db, me, aarav, live, old };
  }

  it('still lists the group after it is archived', async () => {
    const s = await scene();
    await setGroupTrust(asDb(s.db), s.aarav, s.old, 'review');
    await archiveGroupSafe(asDb(s.db), s.old);

    const shared = await getSharedGroupsWith(asDb(s.db), s.me, s.aarav);
    const entry = shared.find(g => g.id === s.old);
    expect(entry).toBeDefined();
    // Marked, so it is obvious why a hidden group is in the list.
    expect(entry!.is_archived).toBe(1);
  });

  it('sorts live groups first', async () => {
    const s = await scene();
    await archiveGroupSafe(asDb(s.db), s.old);
    const shared = await getSharedGroupsWith(asDb(s.db), s.me, s.aarav);
    expect(shared[0].id).toBe(s.live);
  });

  it('leaves out a group that ended for everyone', async () => {
    // Nothing left for an override to govern.
    const s = await scene();
    await s.db.runAsync('UPDATE budget_group SET deleted_at = ? WHERE id = ?', [Date.now(), s.old]);
    const shared = await getSharedGroupsWith(asDb(s.db), s.me, s.aarav);
    expect(shared.map(g => g.id)).not.toContain(s.old);
  });
});
