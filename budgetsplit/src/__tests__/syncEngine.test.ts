import { createTestDb, type TestDb } from './helpers/testDb';
import { createD1, type TestD1 } from './server/helpers/d1';
import { applyPush, ensureDevice } from '../../../server/api/sync/push';
import { pull } from '../../../server/api/sync/pull';
import { ENTITIES } from '../../../server/api/sync/routes';
import { syncOnce, type Transport } from '../lib/sync/engine';
import { selfPersonId } from '../lib/sync/ids';
import { applyScope, setLinkedUser, recordedRejections } from '../db/queries/syncApply';
import { queueCount, queueUpsert } from '../db/queries/syncQueue';
import { insertAsset, getAssets, restateAssetBalance } from '../db/queries/assets';
import { insertGoal, fundGoal, getGoals } from '../db/queries/savings';
import { insertTxn } from '../db/queries/transactions';
import { setCategoryBudgets } from '../db/queries/categoryBudgets';

/**
 * The sync engine end to end (task S12): real app queries write a real local
 * database, the engine drains and pulls through a transport wired straight to the
 * REAL Worker code on an in-process D1. Nothing about the server is mocked.
 */

const USER = 'u-eng';
const ME = selfPersonId(USER);
const PERSONAL = 'g-personal';
type Db = TestDb & Parameters<typeof syncOnce>[0];

function transport(d1: TestD1, userId: string, opts: { loseReply?: () => boolean; perRequest?: number } = {}): Transport {
  return {
    async push(body) {
      const now = Date.now();
      const last = (await ensureDevice(d1, userId, body.deviceId, now))!;
      // `perRequest`: a server that stops part-way, like a Worker at its query limit.
      const todo = opts.perRequest ? body.mutations.filter(m => m.id > last).slice(0, opts.perRequest) : body.mutations;
      const lastMutationId = await applyPush({ db: d1, userId, deviceId: body.deviceId, now }, todo, last, ENTITIES);
      if (opts.loseReply?.()) throw new Error('network: reply lost');
      return { lastMutationId };
    },
    async pull(body) {
      await ensureDevice(d1, userId, body.deviceId, Date.now());
      return pull(d1, userId, body.deviceId, body.cursors, body.rejectionsAfter) as never;
    },
  };
}

async function server(): Promise<TestD1> {
  const d1 = createD1();
  await d1.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(USER, 'e@x.in', 'Prem', 1).run();
  await d1.prepare("INSERT INTO sync_scopes (id, kind, seq, created_at) VALUES (?, 'user', 0, 1)").bind(USER).run();
  return d1;
}

/** A phone whose ledger is joined to the account, with its "me" and personal group queued. */
async function phone(): Promise<Db> {
  const db = createTestDb() as Db;
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Prem', '#20C4B8', 1)").run(ME);
  db.raw.prepare(`INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
                  VALUES (?, 'Personal', 'user', '#20C4B8', 1, 1, ?)`).run(PERSONAL, ME);
  db.raw.prepare("INSERT INTO group_member (group_id, person_id, joined_at, role) VALUES (?, ?, 1, 'admin')").run(PERSONAL, ME);
  await queueUpsert(db, 'person', ME);
  await queueUpsert(db, 'budget_group', PERSONAL);
  await setLinkedUser(db, USER);
  return db;
}

const serverCount = (d1: TestD1, table: string) => d1.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<number>('n');

describe('sync engine — the phone and the real server', () => {
  it('a server that applies only part of each push loses nothing — the phone resends from its acknowledgement', async () => {
    const d1 = await server();
    const db = await phone();
    for (let k = 0; k < 40; k++) {
      await insertTxn(db, {
        groupId: PERSONAL, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
        payments: [{ personId: ME, amount: 100 + k }], shares: [{ personId: ME, amount: 100 + k }],
      });
    }
    const progress: number[] = [];
    const r = await syncOnce(db, transport(d1, USER, { perRequest: 7 }), USER, p => progress.push(p));
    expect(r.skipped).toBeUndefined();
    expect(await serverCount(d1, 'transactions')).toBe(40);
    expect(await queueCount(db)).toBe(0);
    // The upload itself moves the bar, not only the pull after it.
    expect(progress.filter(p => p > 0 && p < 0.1).length).toBeGreaterThan(3);
  });

  it('does nothing for a ledger not yet joined to this account', async () => {
    const d1 = await server();
    const db = createTestDb() as Db;
    expect(await syncOnce(db, transport(d1, USER), USER)).toMatchObject({ skipped: 'not-linked', pushed: 0 });
  });

  it('sends what the app wrote, and clears the queue once the server has it', async () => {
    const d1 = await server();
    const db = await phone();
    const gold = await insertAsset(db, { name: 'Gold', kind: 'gold', balance: 500000 });
    const goal = await insertGoal(db, { name: 'Trip', target: 5000000, priority: 'want' });
    await fundGoal(db, goal.id, 100000, 'manual', undefined, 'bank');
    await insertTxn(db, {
      groupId: PERSONAL, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food', tags: ['work'],
      payments: [{ personId: ME, amount: 25000 }], shares: [{ personId: ME, amount: 25000 }],
    });
    const r = await syncOnce(db, transport(d1, USER), USER);
    expect(r.skipped).toBeUndefined();
    expect(await queueCount(db)).toBe(0);
    expect(await d1.prepare('SELECT balance FROM assets WHERE id = ?').bind(gold.id).first('balance')).toBe(500000);
    expect(await serverCount(d1, 'savings_transactions')).toBe(1);
    expect(await serverCount(d1, 'transactions')).toBe(1);
    expect(await d1.prepare('SELECT display_name FROM profiles').first('display_name')).toBe('Prem');
    expect(await serverCount(d1, 'sync_rejections')).toBe(0);
  });

  it('restores a second phone to the same ledger', async () => {
    const d1 = await server();
    const a = await phone();
    await insertAsset(a, { name: 'Gold', kind: 'gold', balance: 500000 });
    const goal = await insertGoal(a, { name: 'Trip', target: 5000000, priority: 'want' });
    await fundGoal(a, goal.id, 100000, 'manual', undefined, 'bank');
    await insertTxn(a, {
      groupId: PERSONAL, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME, amount: 25000 }], shares: [{ personId: ME, amount: 25000 }],
    });
    await syncOnce(a, transport(d1, USER), USER);

    const b = createTestDb() as Db;
    b.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Me', '#000000', 1)").run(ME);
    await setLinkedUser(b, USER);
    await syncOnce(b, transport(d1, USER), USER);

    expect((await getAssets(b)).map(x => [x.name, x.balance])).toEqual([['Gold', 500000]]);
    expect((await getGoals(b)).map(g => g.name)).toEqual(['Trip']);
    expect(b.raw.prepare("SELECT category FROM txn").all().map(r => (r as { category: string }).category)).toEqual(['Food']);
    expect((b.raw.prepare('SELECT name FROM person WHERE id = ?').get(ME) as { name: string }).name).toBe('Prem');
    expect(await queueCount(b)).toBe(0);   // a pull never echoes
  });

  it('a retried push whose reply was lost is applied once, not twice', async () => {
    const d1 = await server();
    const db = await phone();
    const goal = await insertGoal(db, { name: 'Trip', target: 5000000, priority: 'want' });
    await fundGoal(db, goal.id, 100000);
    let lose = true;
    expect((await syncOnce(db, transport(d1, USER, { loseReply: () => lose }), USER)).skipped).toBe('failed');
    lose = false;
    await syncOnce(db, transport(d1, USER), USER);
    expect(await serverCount(d1, 'savings_transactions')).toBe(1);
    expect(await serverCount(d1, 'sync_rejections')).toBe(0);
    expect(await queueCount(db)).toBe(0);
  });

  it('a stale money edit is refused, and the phone takes the server\'s copy', async () => {
    const d1 = await server();
    const a = await phone();
    const gold = await insertAsset(a, { name: 'Gold', balance: 500000 });
    await syncOnce(a, transport(d1, USER), USER);
    // Another phone restates it first.
    const b = createTestDb() as Db;
    b.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Me', '#000000', 1)").run(ME);
    await setLinkedUser(b, USER);
    await syncOnce(b, transport(d1, USER), USER);
    await restateAssetBalance(b, gold.id, 700000);
    await syncOnce(b, transport(d1, USER), USER);
    // This phone, still at the old version, restates too.
    await restateAssetBalance(a, gold.id, 900000);
    await syncOnce(a, transport(d1, USER), USER);
    expect(await d1.prepare('SELECT balance FROM assets WHERE id = ?').bind(gold.id).first('balance')).toBe(700000);
    expect((await getAssets(a))[0].balance).toBe(700000);
    expect((await recordedRejections(a)).map(r => [r.code, r.entity])).toEqual([['conflict', 'assets']]);
    expect(await queueCount(a)).toBe(0);
  });

  it('collapses a wholesale budget save into one row per line on the server', async () => {
    const d1 = await server();
    const db = await phone();
    const lines = [{ category: 'Food', cadence: 'monthly' as const, amount: 800000 }];
    await setCategoryBudgets(db, PERSONAL, lines, { level: 'group', actorId: ME });
    await setCategoryBudgets(db, PERSONAL, [{ ...lines[0], amount: 900000 }], { level: 'group', actorId: ME });
    await syncOnce(db, transport(d1, USER), USER);
    expect(await serverCount(d1, 'budgets')).toBe(1);
    expect(await d1.prepare('SELECT amount FROM budgets').first('amount')).toBe(900000);
    expect(await serverCount(d1, 'sync_rejections')).toBe(0);
    // Save again after it synced: the same server row moves on, no second line.
    await setCategoryBudgets(db, PERSONAL, [{ ...lines[0], amount: 950000 }], { level: 'group', actorId: ME });
    await syncOnce(db, transport(d1, USER), USER);
    expect(await d1.prepare('SELECT amount, version, deleted_at FROM budgets').first()).toEqual({ amount: 950000, version: 2, deleted_at: null });
    expect(await serverCount(d1, 'sync_rejections')).toBe(0);
  });

  it('sends a shared-group transaction once its group is on the server (S19/S20)', async () => {
    // Was an interim hold ("queued until approvals exist"). S19 gave the server
    // approvals and S20 removed the hold, so a group I made and an entry in it
    // go up together, group first.
    const d1 = await server();
    const db = await phone();
    db.raw.prepare(`INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
                    VALUES ('flat', 'Flat', 'home', '#20C4B8', 0, 1, ?)`).run(ME);
    db.raw.prepare("INSERT INTO group_member (group_id, person_id, joined_at, role) VALUES ('flat', ?, 1, 'admin')").run(ME);
    await queueUpsert(db, 'budget_group', 'flat');
    await queueUpsert(db, 'group_member', `flat|${ME}`);
    await insertTxn(db, {
      groupId: 'flat', kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: ME, amount: 100 }], shares: [{ personId: ME, amount: 100 }],
    });
    await syncOnce(db, transport(d1, USER), USER);
    expect(await recordedRejections(db)).toEqual([]);
    expect(await d1.prepare('SELECT group_id FROM transactions').first('group_id')).toBe('flat');
    expect(await queueCount(db)).toBe(0);
  });

  it('never lets a pulled copy overwrite a change still waiting to go up', async () => {
    const db = await phone();
    const gold = await insertAsset(db, { name: 'Gold (edited here)', balance: 123 });
    await applyScope(db, {
      id: USER, kind: 'user', cursor: 5,
      rows: { assets: [{ id: gold.id, scope_id: USER, version: 4, seq: 5, name: 'Gold (from the server)', kind: 'other', balance: 999, is_archived: 0, sort_order: 0, created_at: 1, updated_at: 2, deleted_at: null }] },
    }, { userId: USER });
    expect((await getAssets(db))[0]).toMatchObject({ name: 'Gold (edited here)', balance: 123 });
  });
});
