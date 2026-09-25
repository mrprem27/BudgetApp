import { createD1, type TestD1 } from './helpers/d1';
import { addMember, makeGroup, makeUser } from './helpers/fixtures';
import { applyPush, ensureDevice, type Mutation } from '../../../../server/api/sync/push';
import { createdAt } from '../../../../server/api/sync/utils/mutation';
import { pull } from '../../../../server/api/sync/pull';
import { ENTITIES } from '../../../../server/api/sync/routes';

/**
 * What the phone's row mapping (S8) needs from the server: its own creation
 * times kept, categories and budgets addressed by their natural key, a profile
 * for "me", the phone's audit row carried into the feed, and tag order kept.
 */

const T0 = 1_750_000_000_000;

async function push(db: TestD1, userId: string, mutations: Mutation[], now = T0) {
  const deviceId = `dev-${userId}`;
  const last = (await ensureDevice(db, userId, deviceId, now))!;
  return applyPush({ db, userId, deviceId, now }, mutations, last, ENTITIES);
}
const codes = async (db: TestD1) =>
  (await db.prepare('SELECT code FROM sync_rejections ORDER BY created_at, mutation_id').all<{ code: string }>()).results.map(r => r.code);

describe('created_at — the phone knows when it made a row', () => {
  it('keeps a sane creation time, and replaces a future or ancient one with now', () => {
    expect(createdAt({ created_at: T0 - 86_400_000 }, T0)).toBe(T0 - 86_400_000);
    expect(createdAt({ created_at: T0 + 60 * 60_000 }, T0)).toBe(T0);
    expect(createdAt({ created_at: 5 }, T0)).toBe(T0);
    expect(createdAt({ created_at: '1700000000000' }, T0)).toBe(T0);
    expect(createdAt(undefined, T0)).toBe(T0);
  });

  it('stores it on create and never lets an update move it', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const old = T0 - 30 * 86_400_000;
    await push(db, me.userId, [
      { id: 1, entity: 'assets', op: 'upsert', entityId: 'a1', baseVersion: 0, data: { name: 'Gold', created_at: old } },
      { id: 2, entity: 'assets', op: 'upsert', entityId: 'a1', baseVersion: 1, data: { name: 'Gold 22k', created_at: T0 } },
    ]);
    expect(await db.prepare('SELECT created_at, updated_at FROM assets').first()).toEqual({ created_at: old, updated_at: T0 });
  });
});

describe('categories are their (kind, name)', () => {
  it('insists on the derived id, so a reseeded default never duplicates', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const cat = (id: number, entityId: string): Mutation => ({
      id, entity: 'categories', op: 'upsert', entityId, baseVersion: 0, data: { kind: 'expense', name: 'Food' },
    });
    await push(db, me.userId, [cat(1, `${me.userId}:expense:Food`), cat(2, 'fresh-uuid-from-a-reseed')]);
    expect(await codes(db)).toEqual(['invalid']);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM categories').first('n')).toBe(1);
  });
});

describe('profiles — how I present myself', () => {
  it('holds one profile per user and round-trips it through the pull', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await push(db, me.userId, [{
      id: 1, entity: 'profiles', op: 'upsert', entityId: me.userId, baseVersion: 0,
      data: { display_name: 'Prem', avatar_color: '#20C4B8', upi_vpa: 'prem@okhdfc' },
    }]);
    const r = await pull(db, me.userId, `dev-${me.userId}`, {});
    expect(r.scopes[0].rows.profiles[0]).toMatchObject({ id: me.userId, display_name: 'Prem', upi_vpa: 'prem@okhdfc' });
    await push(db, me.userId, [{
      id: 2, entity: 'profiles', op: 'upsert', entityId: 'someone-else', baseVersion: 0, data: { display_name: 'X' },
    }]);
    expect(await codes(db)).toEqual(['invalid']);
  });
});

describe('the feed carries the phone\'s own audit row', () => {
  it('takes the audit id and summary, and names the actor as a person on pull', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await push(db, me.userId, [{
      id: 1, entity: 'groups', op: 'upsert', entityId: 'g1', baseVersion: 0,
      data: { kind: 'personal', name: 'Personal', icon: 'home', color: '#20C4B8', audit: { id: 'audit-00000001', summary: 'Made my ledger' } },
    }, {
      id: 2, entity: 'transactions', op: 'upsert', entityId: 't1', baseVersion: 0,
      data: {
        group_id: 'g1', kind: 'expense', amount: 300, date: T0, category: 'Food',
        payers: [{ person_id: me.personId, amount: 300 }], splits: [{ person_id: me.personId, amount: 300 }],
        tags: ['zeta', 'alpha', 'mid'], audit: { id: 'audit-00000002', summary: 'Added ₹3 · Food' },
      },
    }]);
    const r = await pull(db, me.userId, `dev-${me.userId}`, {});
    const g = r.scopes.find(s => s.id === 'g1')!;
    expect(g.rows.activity_log.map(a => [a.id, a.summary, a.actor_person_id])).toEqual([
      ['audit-00000001', 'Made my ledger', me.personId],
      ['audit-00000002', 'Added ₹3 · Food', me.personId],
    ]);
    expect(g.rows.groups[0].owner_person_id).toBe(me.personId);
    // Tags come back in the order they were typed, not alphabetically.
    expect(g.rows.transactions[0].tags).toEqual(['zeta', 'alpha', 'mid']);
  });
});

describe('budgets — the app\'s own rules on who may set which line', () => {
  async function world() {
    const db = createD1();
    const owner = await makeUser(db);
    const plain = await makeUser(db);
    const g = await makeGroup(db, owner.userId);
    await addMember(db, g, owner.personId, owner.userId, { role: 'admin' });
    await addMember(db, g, plain.personId, owner.userId);
    return { db, owner, plain, g };
  }
  const line = (id: number, g: string, category: string, personId: string | null, amount = 500000, baseVersion = 0): Mutation => ({
    id, entity: 'budgets', op: 'upsert', entityId: `${g}:${category}:${personId ?? '*'}`, baseVersion,
    data: { group_id: g, category, amount, person_id: personId },
  });

  it('lets an admin set the group\'s default line, and refuses a plain member', async () => {
    const { db, owner, plain, g } = await world();
    await push(db, plain.userId, [line(1, g, 'Food', null)]);
    await push(db, owner.userId, [line(1, g, 'Food', null)]);
    expect(await codes(db)).toEqual(['forbidden']);
    expect(await db.prepare('SELECT amount FROM budgets').first('amount')).toBe(500000);
  });

  it('lets anyone set their OWN override, and nobody — not even an admin — set someone else\'s', async () => {
    const { db, owner, plain, g } = await world();
    await push(db, plain.userId, [line(1, g, 'Food', plain.personId, 200000)]);
    await push(db, owner.userId, [line(1, g, 'Food', plain.personId, 1)]);
    expect(await codes(db)).toEqual(['forbidden']);
    expect(await db.prepare('SELECT amount FROM budgets WHERE person_id = ?').bind(plain.personId).first('amount')).toBe(200000);
  });

  it('insists on the natural-key id, and is compare-and-set like all money', async () => {
    const { db, owner, g } = await world();
    await push(db, owner.userId, [
      { ...line(1, g, 'Food', null), entityId: 'random' },
      line(2, g, 'Food', null),
      line(3, g, 'Food', null, 9, 0),        // a stale create
      line(4, g, 'Food', null, 600000, 1),   // a correct edit
    ]);
    expect(await codes(db)).toEqual(['invalid', 'conflict']);
    expect(await db.prepare('SELECT amount, version FROM budgets').first()).toEqual({ amount: 600000, version: 2 });
  });
});
