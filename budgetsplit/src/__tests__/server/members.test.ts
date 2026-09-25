import { createD1, type TestD1 } from './helpers/d1';
import { makeUser } from './helpers/fixtures';
import { applyPush, ensureDevice, type Mutation } from '../../../../server/api/sync/push';
import { pull } from '../../../../server/api/sync/pull';
import { ENTITIES } from '../../../../server/api/sync/routes';
import { canReadScope } from '../../../../server/api/sync/utils/access';

/**
 * Group membership on the server (task S18, SPEC-SERVER.md §5). The rules used to
 * live on each phone, where a phone could simply not apply them (`SYNC-F24`); now
 * the server refuses, whatever the client sends.
 */

const T0 = 1_750_000_000_000;
let mid = 0;

async function push(db: TestD1, userId: string, ms: Array<Omit<Mutation, 'id'>>) {
  const last = (await ensureDevice(db, userId, `dev-${userId}`, T0))!;
  return applyPush({ db, userId, deviceId: `dev-${userId}`, now: T0 }, ms.map(m => ({ ...m, id: ++mid })), last, ENTITIES);
}
const lastRejection = async (db: TestD1) =>
  db.prepare('SELECT code, message FROM sync_rejections ORDER BY mutation_id DESC LIMIT 1').first<{ code: string; message: string }>();
const member = (db: TestD1, id: string) =>
  db.prepare('SELECT status, role, left_at IS NOT NULL AS ended FROM group_members WHERE id = ?').bind(id).first();

const G = 'g-flat';
const mem = (data: Record<string, unknown>, entityId: string): Omit<Mutation, 'id'> =>
  ({ entity: 'group_members', op: 'upsert', entityId, baseVersion: 0, data: { group_id: G, ...data } });

/** Owner with a shared group; an account holder; a second account holder. */
async function world() {
  const db = createD1();
  const owner = await makeUser(db);
  const aarav = await makeUser(db);
  const bina = await makeUser(db);
  await push(db, owner.userId, [{
    entity: 'groups', op: 'upsert', entityId: G, baseVersion: 0,
    data: { kind: 'shared', name: 'Flat', icon: 'home', color: '#20C4B8', owner_display_name: 'Prem' },
  }]);
  const idOf = (personId: string) => `${G}:${personId}`;
  return { db, owner, aarav, bina, idOf };
}

/** Invite Aarav (by account) and have him accept. */
async function withAarav() {
  const w = await world();
  await push(w.db, w.owner.userId, [mem({ user_id: w.aarav.userId, display_name: 'Aarav' }, w.idOf(w.aarav.personId))]);
  await push(w.db, w.aarav.userId, [mem({ person_id: w.aarav.personId, status: 'active' }, w.idOf(w.aarav.personId))]);
  return w;
}

describe('adding people', () => {
  it('an account is invited — no access until they accept — and is told about it on pull', async () => {
    const { db, owner, aarav, idOf } = await world();
    await push(db, owner.userId, [mem({ user_id: aarav.userId, display_name: 'Aarav' }, idOf(aarav.personId))]);
    expect(await member(db, idOf(aarav.personId))).toMatchObject({ status: 'invited', role: 'member' });
    expect(await canReadScope(db, aarav.userId, G)).toBe(false);
    const res = await pull(db, aarav.userId, `dev-${aarav.userId}`, {});
    expect(res.invites).toEqual([expect.objectContaining({ groupId: G, groupName: 'Flat', memberId: idOf(aarav.personId) })]);
    expect(res.scopes.map(s => s.id)).not.toContain(G);
  });

  it('accepting makes them active, and the next pull brings the group\'s whole history', async () => {
    const { db, aarav, idOf } = await withAarav();
    expect(await member(db, idOf(aarav.personId))).toMatchObject({ status: 'active' });
    const res = await pull(db, aarav.userId, `dev-${aarav.userId}`, {});
    const flat = res.scopes.find(s => s.id === G)!;
    expect(flat.rows.groups?.[0]).toMatchObject({ id: G, name: 'Flat' });
    expect(flat.rows.group_members).toHaveLength(2);
    expect(res.invites).toEqual([]);
  });

  it('a placeholder — a name with no account — is active at once', async () => {
    const { db, owner, idOf } = await world();
    await push(db, owner.userId, [mem({ person_id: 'p-ghost', display_name: 'Riya' }, idOf('p-ghost'))]);
    expect(await member(db, idOf('p-ghost'))).toMatchObject({ status: 'active' });
    expect(await db.prepare('SELECT user_id FROM people WHERE id = ?').bind('p-ghost').first('user_id')).toBeNull();
  });

  it('an account id nobody has (a stale link, demo data) lands as a plain named member, not a refusal', async () => {
    const { db, owner, idOf } = await world();
    const ghost = 'user:gone-acct';
    await push(db, owner.userId, [mem({ person_id: ghost, user_id: 'gone-acct', display_name: 'Aarav' }, idOf(ghost))]);
    expect(await lastRejection(db)).toBeNull();
    expect(await member(db, idOf(ghost))).toMatchObject({ status: 'active' });
    expect(await db.prepare('SELECT user_id FROM people WHERE id = ?').bind(ghost).first('user_id')).toBeNull();
    // So an expense naming them is accepted, instead of every one being refused with them.
    await push(db, owner.userId, [{
      entity: 'transactions', op: 'upsert', entityId: 't-1', baseVersion: 0,
      data: {
        group_id: G, kind: 'expense', amount: 1000, category: 'Food', date: T0,
        payers: [{ person_id: owner.personId, amount: 1000 }],
        splits: [{ person_id: owner.personId, amount: 500 }, { person_id: ghost, amount: 500 }],
      },
    }]);
    expect(await lastRejection(db)).toBeNull();
    expect(await db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE id = ?').bind('t-1').first('n')).toBe(1);
  });

  it('a plain member inviting is refused (SYNC-F24), and nothing is written', async () => {
    const { db, aarav, bina, idOf } = await withAarav();
    await push(db, aarav.userId, [mem({ user_id: bina.userId, display_name: 'Bina' }, idOf(bina.personId))]);
    expect(await lastRejection(db)).toMatchObject({ code: 'forbidden' });
    expect(await member(db, idOf(bina.personId))).toBeNull();
  });

  it('only the person invited can accept — an admin re-saving the row leaves them invited', async () => {
    const { db, owner, aarav, idOf } = await world();
    await push(db, owner.userId, [mem({ user_id: aarav.userId, display_name: 'Aarav' }, idOf(aarav.personId))]);
    await push(db, owner.userId, [mem({ person_id: aarav.personId, status: 'active', role: 'admin' }, idOf(aarav.personId))]);
    expect(await member(db, idOf(aarav.personId))).toMatchObject({ status: 'invited', role: 'admin' });
    expect(await canReadScope(db, aarav.userId, G)).toBe(false);
  });
});

describe('leaving and removing', () => {
  it('a removed member\'s next pull lists the group as revoked (SYNC-F16)', async () => {
    const { db, owner, aarav, idOf } = await withAarav();
    await push(db, owner.userId, [mem({ person_id: aarav.personId, status: 'removed' }, idOf(aarav.personId))]);
    expect(await member(db, idOf(aarav.personId))).toMatchObject({ status: 'removed', ended: 1 });
    const res = await pull(db, aarav.userId, `dev-${aarav.userId}`, { [G]: 3 });
    expect(res.revoked).toEqual([G]);
    expect(res.scopes.map(s => s.id)).not.toContain(G);
  });

  it('leaving is your own move; nobody can leave on your behalf', async () => {
    const { db, owner, aarav, idOf } = await withAarav();
    await push(db, owner.userId, [mem({ person_id: aarav.personId, status: 'left' }, idOf(aarav.personId))]);
    expect(await lastRejection(db)).toMatchObject({ code: 'forbidden' });
    await push(db, aarav.userId, [mem({ person_id: aarav.personId, status: 'left' }, idOf(aarav.personId))]);
    expect(await member(db, idOf(aarav.personId))).toMatchObject({ status: 'left', ended: 1 });
    expect(await canReadScope(db, aarav.userId, G)).toBe(false);
  });

  it('an admin can add someone back after they left', async () => {
    const { db, owner, aarav, idOf } = await withAarav();
    await push(db, aarav.userId, [mem({ person_id: aarav.personId, status: 'left' }, idOf(aarav.personId))]);
    await push(db, owner.userId, [mem({ user_id: aarav.userId, status: 'invited' }, idOf(aarav.personId))]);
    expect(await member(db, idOf(aarav.personId))).toMatchObject({ status: 'invited', ended: 0 });
  });
});

describe('the owner is permanent, so there is always an admin (SYNC-F20)', () => {
  it('the owner can\'t be removed, even by another admin', async () => {
    const { db, owner, aarav, idOf } = await withAarav();
    await push(db, owner.userId, [mem({ person_id: aarav.personId, role: 'admin' }, idOf(aarav.personId))]);
    expect(await member(db, idOf(aarav.personId))).toMatchObject({ role: 'admin' });
    await push(db, aarav.userId, [mem({ person_id: owner.personId, status: 'removed' }, idOf(owner.personId))]);
    expect(await lastRejection(db)).toMatchObject({ code: 'forbidden', message: 'The owner can’t be removed' });
  });

  it('the owner can\'t be demoted, and can\'t leave', async () => {
    const { db, owner, aarav, idOf } = await withAarav();
    await push(db, owner.userId, [mem({ person_id: aarav.personId, role: 'admin' }, idOf(aarav.personId))]);
    await push(db, aarav.userId, [mem({ person_id: owner.personId, role: 'member' }, idOf(owner.personId))]);
    expect(await lastRejection(db)).toMatchObject({ code: 'forbidden' });
    await push(db, owner.userId, [mem({ person_id: owner.personId, status: 'left' }, idOf(owner.personId))]);
    expect(await lastRejection(db)).toMatchObject({ code: 'forbidden' });
    expect(await member(db, idOf(owner.personId))).toMatchObject({ status: 'active', role: 'admin' });
  });

  it('a plain member can\'t change roles', async () => {
    const { db, owner, aarav, idOf } = await withAarav();
    await push(db, aarav.userId, [mem({ person_id: aarav.personId, role: 'admin' }, idOf(aarav.personId))]);
    expect(await lastRejection(db)).toMatchObject({ code: 'forbidden' });
    void owner;
  });
});

it('refuses a member whose id doesn\'t match the group and person — no row can be aimed at someone else', async () => {
  const { db, owner, aarav } = await world();
  await push(db, owner.userId, [mem({ user_id: aarav.userId, display_name: 'Aarav' }, `${G}:someone-else`)]);
  expect(await lastRejection(db)).toMatchObject({ code: 'invalid' });
});
