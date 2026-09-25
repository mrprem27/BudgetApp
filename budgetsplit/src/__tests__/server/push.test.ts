import { createD1, type TestD1 } from './helpers/d1';
import { makeUser } from './helpers/fixtures';
import { applyPush, ensureDevice, parsePush, type Mutation } from '../../../../server/api/sync/push';
import { ENTITIES } from '../../../../server/api/sync/routes';

/**
 * Push for user-scoped entities (SPEC-SERVER.md §3.2, task S5).
 *
 * The properties under test are the ones that protect money and people:
 * a retry applies once; a stale money write is refused, never merged; nobody
 * writes into someone else's scope; and nothing a client sends can set the
 * columns the server owns.
 */

const T0 = 1_750_000_000_000;

async function setup() {
  const db = createD1();
  const me = await makeUser(db);
  const other = await makeUser(db);
  const deviceId = 'device-a';
  await ensureDevice(db, me.userId, deviceId, T0);
  return { db, me, other, deviceId };
}

async function push(db: TestD1, userId: string, deviceId: string, mutations: Mutation[], now = T0) {
  const last = (await ensureDevice(db, userId, deviceId, now))!;
  return applyPush({ db, userId, deviceId, now }, mutations, last, ENTITIES);
}

const asset = (id: number, entityId: string, baseVersion: number, data: Record<string, unknown> = {}): Mutation => ({
  id, entity: 'assets', op: 'upsert', entityId, baseVersion, data: { name: 'Gold', kind: 'gold', balance: 5000, ...data },
});

const row = (db: TestD1, table: string, id: string) =>
  db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
const rejections = (db: TestD1) =>
  db.prepare('SELECT mutation_id, code, message, current FROM sync_rejections ORDER BY mutation_id')
    .all<{ mutation_id: number; code: string; message: string; current: string | null }>().then(r => r.results);

/** A D1 that, like a Worker on Workers Free, fails every query past a budget. */
function limited(db: TestD1, budget: number): TestD1 {
  let used = 0;
  const spend = () => {
    if (++used > budget) throw new Error('Too many API requests by single worker invocation.');
  };
  const wrap = (st: ReturnType<TestD1['prepare']>): ReturnType<TestD1['prepare']> => ({
    ...st,
    bind: (...v: unknown[]) => wrap(st.bind(...v)),
    first: async (col?: string) => { spend(); return st.first(col as never); },
    all: async () => { spend(); return st.all(); },
    run: async () => { spend(); return st.run(); },
  } as never);
  return { ...db, prepare: sql => wrap(db.prepare(sql)), batch: async sts => { spend(); return db.batch(sts); } };
}

describe('push — a query limit mid-push is a pause, never a refusal', () => {
  it('a resumable phone gets what was applied, and nothing is recorded as refused', async () => {
    const { db, me, deviceId } = await setup();
    const ms = [1, 2, 3, 4, 5, 6].map(i => asset(i, `a${i}`, 0));
    const last = await applyPush({ db: limited(db, 5), userId: me.userId, deviceId, now: T0 }, ms, 0, ENTITIES, { resumable: true });
    expect(last).toBeGreaterThan(0);
    expect(last).toBeLessThan(6);
    expect(await rejections(db)).toEqual([]);
    // The rest lands on the next request.
    expect(await push(db, me.userId, deviceId, ms)).toBe(6);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM assets').first('n')).toBe(6);
    expect(await rejections(db)).toEqual([]);
  });

  it('an older phone that cannot resume gets a failure, not a partial answer it would skip past', async () => {
    const { db, me, deviceId } = await setup();
    const ms = [1, 2, 3, 4, 5, 6].map(i => asset(i, `a${i}`, 0));
    await expect(applyPush({ db: limited(db, 5), userId: me.userId, deviceId, now: T0 }, ms, 0, ENTITIES)).rejects.toThrow(/Too many/);
    expect(await rejections(db)).toEqual([]);
  });
});

describe('push — user-scoped entities', () => {
  it('creates a row with every system column stamped by the server', async () => {
    const { db, me, deviceId } = await setup();
    expect(await push(db, me.userId, deviceId, [asset(1, 'a1', 0)])).toBe(1);
    expect(await row(db, 'assets', 'a1')).toMatchObject({
      scope_id: me.userId, user_id: me.userId, version: 1, seq: 1,
      created_by: me.userId, updated_by: me.userId, created_at: T0, updated_at: T0,
      name: 'Gold', balance: 5000, deleted_at: null,
    });
  });

  it('applies the same push twice with the effect of once', async () => {
    const { db, me, deviceId } = await setup();
    const batch = [asset(1, 'a1', 0), asset(2, 'a1', 1, { balance: 7000 })];
    await push(db, me.userId, deviceId, batch);
    await push(db, me.userId, deviceId, batch, T0 + 1);   // the retry
    expect(await row(db, 'assets', 'a1')).toMatchObject({ version: 2, balance: 7000 });
    expect(await db.prepare('SELECT seq FROM sync_scopes WHERE id = ?').bind(me.userId).first('seq')).toBe(2);
    expect(await rejections(db)).toEqual([]);
  });

  it('refuses a stale money write, hands back the current row, and changes nothing', async () => {
    const { db, me, deviceId } = await setup();
    await push(db, me.userId, deviceId, [asset(1, 'a1', 0), asset(2, 'a1', 1, { balance: 7000 })]);
    // Another device, still at version 1, tries to set 9,000.
    await ensureDevice(db, me.userId, 'device-b', T0);
    await push(db, me.userId, 'device-b', [asset(1, 'a1', 1, { balance: 9000 })]);
    expect(await row(db, 'assets', 'a1')).toMatchObject({ version: 2, balance: 7000 });
    const [r] = (await db.prepare("SELECT * FROM sync_rejections WHERE device_id = 'device-b'").all<Record<string, string>>()).results;
    expect(r.code).toBe('conflict');
    expect(JSON.parse(r.current)).toMatchObject({ version: 2, balance: 7000 });
    // Acknowledged all the same: a refused mutation is never retried.
    expect(await db.prepare("SELECT last_mutation_id FROM devices WHERE id = 'device-b'").first('last_mutation_id')).toBe(1);
  });

  it('refuses a money create over a row that already exists', async () => {
    const { db, me, deviceId } = await setup();
    await push(db, me.userId, deviceId, [asset(1, 'a1', 0), asset(2, 'a1', 0, { balance: 1 })]);
    expect((await rejections(db)).map(r => [r.mutation_id, r.code])).toEqual([[2, 'conflict']]);
    expect(await row(db, 'assets', 'a1')).toMatchObject({ balance: 5000 });
  });

  it('never writes into another user\'s scope, even by guessing their row id', async () => {
    const { db, me, other, deviceId } = await setup();
    await push(db, me.userId, deviceId, [asset(1, 'a1', 0)]);
    await push(db, other.userId, 'device-other', [asset(1, 'a1', 1, { balance: 1 })]);
    await push(db, other.userId, 'device-other', [{ id: 2, entity: 'assets', op: 'delete', entityId: 'a1', baseVersion: 1 }]);
    expect(await row(db, 'assets', 'a1')).toMatchObject({ scope_id: me.userId, balance: 5000, deleted_at: null });
    const codes = (await db.prepare("SELECT code FROM sync_rejections WHERE device_id = 'device-other' ORDER BY mutation_id").all<{ code: string }>()).results;
    expect(codes.map(c => c.code)).toEqual(['forbidden', 'forbidden']);
  });

  it('ignores system columns in the body — a client cannot set its own version, owner or scope', async () => {
    const { db, me, other, deviceId } = await setup();
    await push(db, me.userId, deviceId, [asset(1, 'a1', 0, {
      version: 99, seq: 99, scope_id: other.userId, user_id: other.userId, created_by: other.userId, deleted_at: 5,
    })]);
    expect(await row(db, 'assets', 'a1')).toMatchObject({
      version: 1, seq: 1, scope_id: me.userId, user_id: me.userId, created_by: me.userId, deleted_at: null,
    });
  });

  it('lets a preference be last-write-wins — a lost rename costs nothing', async () => {
    const { db, me, deviceId } = await setup();
    const id = `${me.userId}:budget_target`;
    const pref = (n: number, value: string): Mutation => ({
      id: n, entity: 'user_preferences', op: 'upsert', entityId: id, baseVersion: 1, data: { key: 'budget_target', value },
    });
    await push(db, me.userId, deviceId, [pref(1, '100'), pref(2, '200'), pref(3, '300')]);
    expect(await row(db, 'user_preferences', id)).toMatchObject({ value: '300', version: 3 });
    expect(await rejections(db)).toEqual([]);
  });

  it('refuses a preference that is device state, not the user\'s', async () => {
    const { db, me, deviceId } = await setup();
    await push(db, me.userId, deviceId, [{
      id: 1, entity: 'user_preferences', op: 'upsert', entityId: `${me.userId}:fix_wallet_icon_v1`, baseVersion: 0,
      data: { key: 'fix_wallet_icon_v1', value: '1' },
    }]);
    expect((await rejections(db)).map(r => r.code)).toEqual(['invalid']);
  });

  it('insists on the derived id for a row with a natural key', async () => {
    const { db, me, deviceId } = await setup();
    await push(db, me.userId, deviceId, [{
      id: 1, entity: 'friends', op: 'upsert', entityId: 'random-uuid', baseVersion: 0,
      data: { person_id: 'p-flatmate', name: 'Rohan', avatar_color: '#8B7CF8' },
    }]);
    expect((await rejections(db))[0]).toMatchObject({ code: 'invalid' });
  });

  it('creates a placeholder person for a friend with no account', async () => {
    const { db, me, deviceId } = await setup();
    await push(db, me.userId, deviceId, [{
      id: 1, entity: 'friends', op: 'upsert', entityId: `${me.userId}:p-flatmate`, baseVersion: 0,
      data: { person_id: 'p-flatmate', name: 'Rohan', avatar_color: '#8B7CF8' },
    }]);
    expect(await row(db, 'people', 'p-flatmate')).toMatchObject({ user_id: null, created_by: me.userId });
    expect(await row(db, 'friends', `${me.userId}:p-flatmate`)).toMatchObject({ name: 'Rohan' });
  });

  it('refuses a savings transaction against somebody else\'s goal', async () => {
    const { db, me, other, deviceId } = await setup();
    await push(db, other.userId, 'device-other', [{
      id: 1, entity: 'savings_goals', op: 'upsert', entityId: 'their-goal', baseVersion: 0, data: { name: 'Trip', target: 100 },
    }]);
    await push(db, me.userId, deviceId, [{
      id: 1, entity: 'savings_transactions', op: 'upsert', entityId: 'st1', baseVersion: 0,
      data: { goal_id: 'their-goal', amount: 50, kind: 'deposit', date: T0 },
    }]);
    expect((await rejections(db)).map(r => r.code)).toEqual(['forbidden']);
    expect(await row(db, 'savings_transactions', 'st1')).toBeNull();
  });

  it('soft-deletes: the row stays as a tombstone the pull can deliver', async () => {
    const { db, me, deviceId } = await setup();
    await push(db, me.userId, deviceId, [
      asset(1, 'a1', 0),
      { id: 2, entity: 'assets', op: 'delete', entityId: 'a1', baseVersion: 1 },
    ], T0 + 5);
    expect(await row(db, 'assets', 'a1')).toMatchObject({ deleted_at: T0 + 5, version: 2, seq: 2 });
  });

  it('turns a value the schema forbids into a rejection, not a crash', async () => {
    const { db, me, deviceId } = await setup();
    const last = await push(db, me.userId, deviceId, [asset(1, 'a1', 0, { balance: -1 }), asset(2, 'a2', 0)]);
    expect(last).toBe(2);
    expect((await rejections(db)).map(r => [r.mutation_id, r.code])).toEqual([[1, 'invalid']]);
    expect(await row(db, 'assets', 'a2')).not.toBeNull();   // the next mutation still landed
  });

  it('refuses a device that belongs to another account', async () => {
    const { db, other, deviceId } = await setup();
    expect(await ensureDevice(db, other.userId, deviceId, T0)).toBeNull();
  });

  it('validates the push body', () => {
    expect(parsePush({ deviceId: 'd', mutations: [{ id: 2 }, { id: 1 }] })).toMatch(/entity|increase/);
    expect(parsePush({ deviceId: 'd', mutations: [
      { id: 1, entity: 'assets', op: 'upsert', entityId: 'a', baseVersion: 0, data: {} },
      { id: 1, entity: 'assets', op: 'upsert', entityId: 'a', baseVersion: 0, data: {} },
    ] })).toMatch(/increase/);
    expect(parsePush({ deviceId: 'd', mutations: [{ id: 1, entity: 'assets', op: 'patch', entityId: 'a', baseVersion: 0 }] }))
      .toMatch(/op/);
    expect(parsePush({ mutations: [] })).toMatch(/deviceId/);
  });
});
