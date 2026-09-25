import { createD1 } from './helpers/d1';
import { addMember, makeGroup, makeUser } from './helpers/fixtures';
import {
  canReadScope, groupContext, mayAdminister, personOf, scopesFor,
} from '../../../../server/api/sync/utils/access';

/**
 * The one function that decides who reads what. A wrong answer here hands one
 * household's ledger to another, so every state a membership can be in is tested
 * — including the ones that look like membership and are not.
 */
describe('access — who may read a scope', () => {
  async function world() {
    const db = createD1();
    const me = await makeUser(db);
    const aarav = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    await addMember(db, g, me.personId, me.userId, { role: 'admin' });
    return { db, me, aarav, g };
  }

  it('lets a user read their own scope, and nobody else\'s', async () => {
    const { db, me, aarav } = await world();
    expect(await canReadScope(db, me.userId, me.userId)).toBe(true);
    expect(await canReadScope(db, aarav.userId, me.userId)).toBe(false);
  });

  it('refuses a stranger to the group', async () => {
    const { db, aarav, g } = await world();
    expect(await canReadScope(db, aarav.userId, g)).toBe(false);
  });

  it('refuses an invitation that has not been accepted', async () => {
    const { db, me, aarav, g } = await world();
    await addMember(db, g, aarav.personId, me.userId, { status: 'invited' });
    expect(await canReadScope(db, aarav.userId, g)).toBe(false);
  });

  it('allows an active member', async () => {
    const { db, me, aarav, g } = await world();
    await addMember(db, g, aarav.personId, me.userId);
    expect(await canReadScope(db, aarav.userId, g)).toBe(true);
  });

  it('refuses someone who left, and someone who was removed', async () => {
    const { db, me, aarav, g } = await world();
    const third = await makeUser(db);
    await addMember(db, g, aarav.personId, me.userId, { status: 'left', left_at: 5 });
    await addMember(db, g, third.personId, me.userId, { status: 'removed', left_at: 5 });
    expect(await canReadScope(db, aarav.userId, g)).toBe(false);
    expect(await canReadScope(db, third.userId, g)).toBe(false);
  });

  it('refuses everyone once the group is deleted — the owner too', async () => {
    const { db, me, g } = await world();
    await db.prepare('UPDATE groups SET deleted_at = 9 WHERE id = ?').bind(g).run();
    expect(await canReadScope(db, me.userId, g)).toBe(false);
  });

  it('lists readable scopes, and reports the ended ones as revoked rather than dropping them', async () => {
    const { db, me, aarav, g } = await world();
    const other = await makeGroup(db, me.userId, { name: 'Goa' });
    const invitedTo = await makeGroup(db, me.userId, { name: 'Invite' });
    await addMember(db, g, aarav.personId, me.userId);
    await addMember(db, other, aarav.personId, me.userId, { status: 'removed', left_at: 5 });
    await addMember(db, invitedTo, aarav.personId, me.userId, { status: 'invited' });
    const s = await scopesFor(db, aarav.userId);
    expect(s.readable).toEqual([aarav.userId, g]);
    expect(s.revoked).toEqual([other]);
  });

  it('knows each user\'s person', async () => {
    const { db, me } = await world();
    expect(await personOf(db, me.userId)).toBe(me.personId);
    expect(await personOf(db, 'nobody')).toBeNull();
  });
});

describe('access — the app\'s own role rules on server rows', () => {
  it('treats the owner as an admin even when their role row says member', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    await addMember(db, g, me.personId, me.userId, { role: 'member' });
    expect(await groupContext(db, g, me.userId)).toEqual({
      createdBy: me.personId, actorId: me.personId, actorRole: 'member',
    });
    expect(await mayAdminister(db, g, me.userId)).toBe(true);
  });

  it('lets a promoted admin administer, and a plain or former member not', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const admin = await makeUser(db);
    const plain = await makeUser(db);
    const gone = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    await addMember(db, g, admin.personId, me.userId, { role: 'admin' });
    await addMember(db, g, plain.personId, me.userId);
    await addMember(db, g, gone.personId, me.userId, { role: 'admin', status: 'left', left_at: 5 });
    expect(await mayAdminister(db, g, admin.userId)).toBe(true);
    expect(await mayAdminister(db, g, plain.userId)).toBe(false);
    // An admin who left holds no role any more.
    expect(await mayAdminister(db, g, gone.userId)).toBe(false);
  });
});
