import { createD1, type TestD1 } from './helpers/d1';
import { addMember, insert, makeUser, syncCols } from './helpers/fixtures';
import { applyPush, ensureDevice, type Mutation } from '../../../../server/api/sync/push';
import { parsePull, pull, PULL_PAGE_ROWS } from '../../../../server/api/sync/pull';
import { ENTITIES } from '../../../../server/api/sync/routes';

/**
 * Pull (SPEC-SERVER.md §3.3, task S7).
 *
 * A pull that skips a row is silent data loss — the row is behind the cursor and
 * never comes back. So the tests hunt for the ways a cursor can jump a row: two
 * writes in one millisecond, a page cut inside one write, a group joined late.
 */

const T0 = 1_750_000_000_000;

async function push(db: TestD1, userId: string, mutations: Mutation[], now = T0) {
  const deviceId = `dev-${userId}`;
  const last = (await ensureDevice(db, userId, deviceId, now))!;
  return applyPush({ db, userId, deviceId, now }, mutations, last, ENTITIES);
}

const asset = (id: number, entityId: string, baseVersion = 0, data: Record<string, unknown> = {}): Mutation => ({
  id, entity: 'assets', op: 'upsert', entityId, baseVersion, data: { name: `Asset ${entityId}`, balance: 100, ...data },
});

async function drain(db: TestD1, userId: string, cursors: Record<string, number> = {}, limit?: number) {
  const pages = [];
  let c = { ...cursors };
  for (let i = 0; i < 50; i++) {
    const r = await pull(db, userId, `dev-${userId}`, c, 0, limit);
    pages.push(r);
    c = Object.fromEntries(r.scopes.map(s => [s.id, s.cursor]));
    if (!r.scopes.some(s => s.more)) break;
  }
  return { pages, cursors: c };
}
const idsOf = (pages: Awaited<ReturnType<typeof pull>>[], scope: string, table: string) =>
  pages.flatMap(p => p.scopes.filter(s => s.id === scope).flatMap(s => (s.rows[table] ?? []).map(r => r.id as string)));

describe('pull — one write that stamps more rows than a page', () => {
  it('still advances past it, instead of answering the same empty page forever', async () => {
    const db = createD1();
    const u = await makeUser(db);
    // 501 rows at one seq, as a single write that re-stamps many rows leaves them.
    for (let k = 0; k < PULL_PAGE_ROWS + 1; k++) {
      await insert(db, 'categories', { id: `c-${k}`, ...syncCols(u.userId, u.userId, 1), user_id: u.userId, kind: 'expense', name: `Cat ${k}` });
    }
    await insert(db, 'categories', { id: 'c-last', ...syncCols(u.userId, u.userId, 2), user_id: u.userId, kind: 'expense', name: 'Later' });
    await db.prepare('UPDATE sync_scopes SET seq = 2 WHERE id = ?').bind(u.userId).run();
    let cursors: Record<string, number> = {};
    const seen = new Set<string>();
    for (let round = 0; round < 5; round++) {
      const res = await pull(db, u.userId, 'dev-x', cursors, 0);
      const mine = res.scopes.find(s => s.id === u.userId)!;
      for (const c of (mine.rows.categories ?? []) as Array<{ id: string }>) seen.add(c.id);
      cursors = { ...cursors, [u.userId]: mine.cursor };
      if (!mine.more) break;
    }
    expect(seen.size).toBe(PULL_PAGE_ROWS + 2);
    expect(cursors[u.userId]).toBe(2);
  });
});

describe('pull', () => {
  it('returns what was written, in seq order, and nothing more on the next pull', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await push(db, me.userId, [asset(1, 'a1'), asset(2, 'a2'), asset(3, 'a3')]);
    const first = await pull(db, me.userId, `dev-${me.userId}`, {});
    const mine = first.scopes.find(s => s.id === me.userId)!;
    expect(mine.rows.assets.map(r => [r.id, r.seq])).toEqual([['a1', 1], ['a2', 2], ['a3', 3]]);
    expect(mine).toMatchObject({ cursor: 3, more: false, reset: false });
    const again = await pull(db, me.userId, `dev-${me.userId}`, { [me.userId]: 3 });
    expect(again.scopes.find(s => s.id === me.userId)!.rows).toEqual({});
  });

  it('delivers a deletion as a tombstone', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await push(db, me.userId, [asset(1, 'a1')]);
    await push(db, me.userId, [{ id: 2, entity: 'assets', op: 'delete', entityId: 'a1', baseVersion: 1 }], T0 + 7);
    const r = await pull(db, me.userId, `dev-${me.userId}`, { [me.userId]: 1 });
    expect(r.scopes[0].rows.assets).toEqual([expect.objectContaining({ id: 'a1', deleted_at: T0 + 7 })]);
  });

  it('never loses a write made in the same millisecond as another — order comes from seq, not the clock', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await push(db, me.userId, [asset(1, 'a1')], T0);
    const page1 = await pull(db, me.userId, `dev-${me.userId}`, {});
    await push(db, me.userId, [asset(2, 'a2')], T0);   // same updated_at as a1
    const page2 = await pull(db, me.userId, `dev-${me.userId}`, { [me.userId]: page1.scopes[0].cursor });
    expect(page2.scopes[0].rows.assets.map(r => r.id)).toEqual(['a2']);
  });

  it('pages without skipping a row, and never cuts inside one write', async () => {
    const db = createD1();
    const me = await makeUser(db);
    // 7 separate writes, plus a group create — one write that stamps a group,
    // its owner's membership and an activity row with ONE seq.
    await push(db, me.userId, [1, 2, 3, 4, 5, 6, 7].map(n => asset(n, `a${n}`)));
    await push(db, me.userId, [{
      id: 8, entity: 'groups', op: 'upsert', entityId: 'g1', baseVersion: 0,
      data: { kind: 'personal', name: 'Personal', icon: 'home', color: '#20C4B8' },
    }]);
    const { pages } = await drain(db, me.userId, {}, 2);
    expect(pages.length).toBeGreaterThan(3);
    expect(idsOf(pages, me.userId, 'assets')).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']);
    // The group's three rows arrive on the same page, whatever the page size.
    const withGroup = pages.flatMap(p => p.scopes.filter(s => s.id === 'g1'));
    const groupPage = withGroup.find(s => s.rows.groups);
    expect(groupPage?.rows.group_members).toHaveLength(1);
    expect(groupPage?.rows.activity_log).toHaveLength(1);
  });

  it('returns a transaction as the same bundle the push sends', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await push(db, me.userId, [
      { id: 1, entity: 'groups', op: 'upsert', entityId: 'g1', baseVersion: 0,
        data: { kind: 'personal', name: 'Personal', icon: 'home', color: '#20C4B8' } },
      { id: 2, entity: 'transactions', op: 'upsert', entityId: 'rent', baseVersion: 0,
        data: {
          group_id: 'g1', kind: 'expense', amount: 1000, date: T0, category: 'Rent',
          payers: [{ person_id: me.personId, amount: 1000 }], splits: [{ person_id: me.personId, amount: 1000 }],
          tags: ['home'], recurrence: { frequency: 'monthly' }, skips: [T0 + 1],
        } },
    ]);
    const r = await pull(db, me.userId, `dev-${me.userId}`, {});
    const [t] = r.scopes.find(s => s.id === 'g1')!.rows.transactions;
    expect(t).toMatchObject({
      id: 'rent', amount: 1000, author_id: me.personId,
      payers: [{ person_id: me.personId, amount: 1000 }],
      splits: [{ person_id: me.personId, amount: 1000 }],
      tags: ['home'], skips: [T0 + 1],
      recurrence: expect.objectContaining({ frequency: 'monthly', status: 'active' }),
    });
  });

  it('gives a member who joins late the group\'s whole history, and a stranger nothing', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const aarav = await makeUser(db);
    const stranger = await makeUser(db);
    await push(db, me.userId, [{
      id: 1, entity: 'groups', op: 'upsert', entityId: 'flat', baseVersion: 0,
      data: { kind: 'shared', name: 'Flat', icon: 'home', color: '#20C4B8' },
    }]);
    await push(db, me.userId, [{ id: 2, entity: 'groups', op: 'upsert', entityId: 'flat', baseVersion: 1, data: { name: 'Flat 4B' } }]);
    await addMember(db, 'flat', aarav.personId, me.userId, { seq: 3 });
    await ensureDevice(db, aarav.userId, `dev-${aarav.userId}`, T0);
    await ensureDevice(db, stranger.userId, `dev-${stranger.userId}`, T0);

    const joined = await pull(db, aarav.userId, `dev-${aarav.userId}`, {});
    const flat = joined.scopes.find(s => s.id === 'flat')!;
    expect(flat.rows.groups[0]).toMatchObject({ name: 'Flat 4B' });
    expect(flat.rows.activity_log.map(a => a.action)).toEqual(['created', 'updated']);

    const outsider = await pull(db, stranger.userId, `dev-${stranger.userId}`, {});
    expect(outsider.scopes.map(s => s.id)).toEqual([stranger.userId]);
  });

  it('tells a removed member the group is revoked, and stops sending it', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const aarav = await makeUser(db);
    await push(db, me.userId, [{
      id: 1, entity: 'groups', op: 'upsert', entityId: 'flat', baseVersion: 0,
      data: { kind: 'shared', name: 'Flat', icon: 'home', color: '#20C4B8' },
    }]);
    await addMember(db, 'flat', aarav.personId, me.userId, { status: 'removed', left_at: 5 });
    await ensureDevice(db, aarav.userId, `dev-${aarav.userId}`, T0);
    const r = await pull(db, aarav.userId, `dev-${aarav.userId}`, { flat: 1 });
    expect(r.revoked).toEqual(['flat']);
    expect(r.scopes.map(s => s.id)).toEqual([aarav.userId]);
  });

  it('carries whether a member has an account, without exposing people as a table', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await push(db, me.userId, [{
      id: 1, entity: 'friends', op: 'upsert', entityId: `${me.userId}:p-rohan`, baseVersion: 0,
      data: { person_id: 'p-rohan', name: 'Rohan', avatar_color: '#8B7CF8' },
    }]);
    const r = await pull(db, me.userId, `dev-${me.userId}`, {});
    expect(r.scopes[0].rows.friends[0]).toMatchObject({ name: 'Rohan', person_user_id: null });
    expect(r.scopes[0].rows.people).toBeUndefined();
  });

  it('reports how far the device got, and why anything was refused', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await push(db, me.userId, [asset(1, 'a1'), asset(2, 'a1', 0)]);   // the second is a stale create
    const r = await pull(db, me.userId, `dev-${me.userId}`, {});
    expect(r.lastMutationId).toBe(2);
    expect(r.rejections).toEqual([expect.objectContaining({ mutationId: 2, code: 'conflict' })]);
    expect(r.rejections[0].current).toMatchObject({ id: 'a1', version: 1 });
    const later = await pull(db, me.userId, `dev-${me.userId}`, {}, 2);
    expect(later.rejections).toEqual([]);
  });

  it('starts a scope over when the phone is ahead of the server (a wiped database)', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await push(db, me.userId, [asset(1, 'a1')]);
    const r = await pull(db, me.userId, `dev-${me.userId}`, { [me.userId]: 999 });
    expect(r.scopes[0]).toMatchObject({ reset: true, cursor: 1 });
    expect(r.scopes[0].rows.assets.map(a => a.id)).toEqual(['a1']);
  });

  it('never shows one user another user\'s personal rows', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const other = await makeUser(db);
    await push(db, other.userId, [asset(1, 'theirs')]);
    await ensureDevice(db, me.userId, `dev-${me.userId}`, T0);
    const r = await pull(db, me.userId, `dev-${me.userId}`, { [other.userId]: 0 });
    expect(r.scopes.map(s => s.id)).toEqual([me.userId]);
    expect(JSON.stringify(r)).not.toContain('theirs');
  });

  it('validates the pull body', () => {
    expect(parsePull({})).toMatch(/deviceId/);
    expect(parsePull({ deviceId: 'd', cursors: { x: -1 } })).toMatch(/cursor/);
    expect(parsePull({ deviceId: 'd', cursors: [] })).toMatch(/object/);
    expect(parsePull({ deviceId: 'd' })).toEqual({ deviceId: 'd', cursors: {}, rejectionsAfter: 0 });
  });
});
