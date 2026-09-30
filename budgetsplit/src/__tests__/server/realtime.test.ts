import { createD1, type TestD1 } from './helpers/d1';
import { makeUser } from './helpers/fixtures';
import { applyPush, ensureDevice, type Mutation } from '../../../../server/api/sync/push';
import { ENTITIES } from '../../../../server/api/sync/routes';
import { fanOut, recipients, type Hubs } from '../../../../server/api/realtime/fanout';

/**
 * Live updates (`DQ-108`): after a push, the server tells the hub of everyone whose data moved.
 * Who that is comes from the scopes the push advanced (`bumpScope` records them).
 */
const T0 = 1_750_000_000_000;
let mid = 0;
const G = 'g-flat';

async function push(db: TestD1, userId: string, ms: Array<Omit<Mutation, 'id'>>) {
  const touched = new Set<string>();
  const last = (await ensureDevice(db, userId, `dev-${userId}`, T0))!;
  await applyPush({ db, userId, deviceId: `dev-${userId}`, now: T0, touched }, ms.map(m => ({ ...m, id: ++mid })), last, ENTITIES);
  return touched;
}
const mem = (data: Record<string, unknown>, entityId: string): Omit<Mutation, 'id'> =>
  ({ entity: 'group_members', op: 'upsert', entityId, baseVersion: 0, data: { group_id: G, ...data } });

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

describe('who hears about a push', () => {
  it('a group entry reaches every member, and nobody else', async () => {
    const { db, owner, aarav, stranger } = await world();
    const touched = await push(db, owner.userId, [{
      entity: 'transactions', op: 'upsert', entityId: 't1', baseVersion: 0,
      data: { group_id: G, kind: 'expense', entry_mode: 'quick', amount: 400, date: T0, category: 'Food',
        payers: [{ person_id: owner.personId, amount: 400 }], splits: [{ person_id: owner.personId, amount: 200 }, { person_id: aarav.personId, amount: 200 }] },
    }]);
    expect(touched.has(G)).toBe(true);
    const who = await recipients(db, touched);
    expect(who.sort()).toEqual([owner.userId, aarav.userId].sort());
    expect(who).not.toContain(stranger.userId);
  });

  it('a personal change reaches only its owner', async () => {
    const { db, owner } = await world();
    const touched = await push(db, owner.userId, [{
      entity: 'assets', op: 'upsert', entityId: 'a1', baseVersion: 0, data: { name: 'Gold', kind: 'gold', balance: 100 },
    }]);
    expect(await recipients(db, touched)).toEqual([owner.userId]);
  });

  it('skips the device that wrote it, and a hub that fails never fails the push', async () => {
    const { db, owner, aarav } = await world();
    const calls: Array<[string, string | null]> = [];
    const hubs: Hubs = {
      notify: async (u, except) => { calls.push([u, except]); if (u === aarav.userId) throw new Error('hub down'); },
    };
    await fanOut(db, hubs, new Set([G]), 'dev-writer');
    expect(calls.map(c => c[0]).sort()).toEqual([owner.userId, aarav.userId].sort());
    expect(calls.every(c => c[1] === 'dev-writer')).toBe(true);
    expect(await recipients(db, new Set())).toEqual([]);
  });
});
