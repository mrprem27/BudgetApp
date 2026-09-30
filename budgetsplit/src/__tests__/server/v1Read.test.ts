import { createD1, type TestD1 } from './helpers/d1';
import { makeUser } from './helpers/fixtures';
import { applyPush, ensureDevice, type Mutation } from '../../../../server/api/sync/push';
import { ENTITIES } from '../../../../server/api/sync/routes';
import { groupLedger, listGroups, myBalances } from '../../../../server/api/v1/read';

/**
 * The `/v1` read API (`DQ-104`) reads what sync wrote, with sync's access rule and the phone's
 * debt math: an entry waiting for MY approval is listed but moves none of my figures.
 */
const T0 = 1_750_000_000_000;
let mid = 0;
const G = 'g-flat';

async function push(db: TestD1, userId: string, ms: Array<Omit<Mutation, 'id'>>) {
  const last = (await ensureDevice(db, userId, `dev-${userId}`, T0))!;
  await applyPush({ db, userId, deviceId: `dev-${userId}`, now: T0 }, ms.map(m => ({ ...m, id: ++mid })), last, ENTITIES);
}
const mem = (data: Record<string, unknown>, entityId: string): Omit<Mutation, 'id'> =>
  ({ entity: 'group_members', op: 'upsert', entityId, baseVersion: 0, data: { group_id: G, ...data } });
const dinner = (id: string, payer: string, a: string, b: string, date = T0): Omit<Mutation, 'id'> => ({
  entity: 'transactions', op: 'upsert', entityId: id, baseVersion: 0,
  data: { group_id: G, kind: 'expense', entry_mode: 'quick', amount: 400, date, category: 'Food',
    payers: [{ person_id: payer, amount: 400 }], splits: [{ person_id: a, amount: 200 }, { person_id: b, amount: 200 }] },
});

async function world() {
  const db = createD1();
  const owner = await makeUser(db);
  const aarav = await makeUser(db);
  const stranger = await makeUser(db);
  await push(db, owner.userId, [{
    entity: 'groups', op: 'upsert', entityId: G, baseVersion: 0,
    data: { kind: 'shared', name: 'Flat', icon: 'home', color: '#20C4B8', owner_display_name: 'Prem' },
  }]);
  await push(db, owner.userId, [mem({ user_id: aarav.userId, display_name: 'Aarav' }, `${G}:${aarav.personId}`)]);
  await push(db, aarav.userId, [mem({ person_id: aarav.personId, status: 'active' }, `${G}:${aarav.personId}`)]);
  return { db, owner, aarav, stranger };
}

describe('/v1 reads', () => {
  it('lists my groups with members and my position; a stranger sees none', async () => {
    const { db, owner, aarav, stranger } = await world();
    await push(db, owner.userId, [dinner('t1', owner.personId, owner.personId, aarav.personId)]);
    const mine = await listGroups(db, owner.userId);
    expect(mine.groups).toHaveLength(1);
    expect(mine.groups[0]).toMatchObject({ id: G, name: 'Flat', myNet: 200 });
    expect(mine.groups[0].members.map(m => m.name).sort()).toEqual(['Aarav', 'Prem']);
    expect((await listGroups(db, stranger.userId)).groups).toEqual([]);
    expect(await groupLedger(db, stranger.userId, G)).toBeNull();
  });

  it('an entry waiting for my approval is listed, marked, and moves none of my figures', async () => {
    const { db, owner, aarav } = await world();
    await push(db, owner.userId, [dinner('t1', owner.personId, owner.personId, aarav.personId)]);
    // For its author it counts at once; for Aarav it waits.
    expect((await myBalances(db, owner.userId)).people).toEqual([{ personId: aarav.personId, name: 'Aarav', net: 200 }]);
    expect((await myBalances(db, aarav.userId)).people).toEqual([]);
    const ledger = (await groupLedger(db, aarav.userId, G))!;
    expect(ledger.transactions.map(t => [t.id, t.pendingForMe])).toEqual([['t1', true]]);
    expect(ledger.transactions[0].payers).toEqual([{ personId: owner.personId, amount: 400 }]);

    await push(db, aarav.userId, [{ entity: 'approvals', op: 'upsert', entityId: `t1:${aarav.userId}`, baseVersion: 0, data: { status: 'approved' } }]);
    expect((await myBalances(db, aarav.userId)).people).toEqual([{ personId: owner.personId, name: 'Prem', net: -200 }]);
  });

  it('pages newest first without skipping or repeating a row on the same day', async () => {
    const { db, owner, aarav } = await world();
    await push(db, owner.userId, ['a', 'b', 'c', 'd', 'e'].map((id, i) => dinner(id, owner.personId, owner.personId, aarav.personId, T0 - (i < 3 ? 0 : 1000))));
    const first = (await groupLedger(db, owner.userId, G, { limit: 2 }))!;
    const second = (await groupLedger(db, owner.userId, G, { limit: 2, before: first.next }))!;
    const third = (await groupLedger(db, owner.userId, G, { limit: 2, before: second.next }))!;
    const all = [...first.transactions, ...second.transactions, ...third.transactions].map(t => t.id);
    expect(all).toEqual(['c', 'b', 'a', 'e', 'd']);
    expect(third.next).toBeNull();
  });
});
