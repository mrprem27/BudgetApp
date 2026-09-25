import { createTestDb } from './helpers/testDb';
import { createD1, type TestD1 } from './server/helpers/d1';
import { applyPush, ensureDevice, type Mutation } from '../../../server/api/sync/push';
import { pull, type PullResult } from '../../../server/api/sync/pull';
import { ENTITIES } from '../../../server/api/sync/routes';
import {
  COLUMN_FATES, assetToServer, budgetToServer, categoryToServer, friendToPerson, goalToServer, groupPreferenceToServer,
  groupToServer, importToServer, meToProfile, moneyProfileToServer, personToFriend, preferenceToServer, profileToMe,
  savingsTxnToServer, serverToAudit, serverToBudget, serverToCategory, serverToGroup, serverToMember,
  serverToMoneySettings, serverToTxn, simpleToLocal, trustToServer, txnToServer, type Outgoing, type Row,
} from '../lib/sync/rowMap';
import { selfPersonId, syncIds } from '../lib/sync/ids';

/**
 * The phone ⇄ server translation (task S8).
 *
 * 1. Every local column has a declared fate — travels, or stays with a reason.
 *    A column added without one is data that silently does not survive a new phone.
 * 2. Every table round-trips through the REAL push and pull: phone rows → rowMap →
 *    the Worker's own write path → its own pull → rowMap → the same phone rows.
 */

describe('every local column has a declared fate', () => {
  const db = createTestDb();
  const tables = (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>)
    .map(t => t.name).sort();

  it('names every local table, and no table that does not exist', () => {
    expect(Object.keys(COLUMN_FATES).sort()).toEqual(tables);
  });

  it.each(tables)('%s: every column is decided, and no decision is about a column that does not exist', t => {
    const cols = (db.raw.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map(c => c.name).sort();
    expect(Object.keys(COLUMN_FATES[t] ?? {}).sort()).toEqual(cols);
    for (const fate of Object.values(COLUMN_FATES[t] ?? {})) {
      expect(fate).toMatch(/^(→|←|local: .{8,})/);
    }
  });
});

// ---------------------------------------------------------------------------
// Round trips through the real server
// ---------------------------------------------------------------------------

const T0 = 1_750_000_000_000;
const USER = 'u-rt';
const ME = selfPersonId(USER);
const ctx = { userId: USER };

async function server() {
  const db = createD1();
  await db.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(USER, 'rt@example.in', 'Prem', 1).run();
  await ensureDevice(db, USER, 'phone', T0);
  return db;
}
let mutationId = 0;
async function send(db: TestD1, out: Outgoing[], baseVersion = 0): Promise<void> {
  const mutations: Mutation[] = out.map(o => ({ id: ++mutationId, entity: o.entity, op: 'upsert', entityId: o.entityId, baseVersion, data: o.data }));
  const last = (await ensureDevice(db, USER, 'phone', T0 + 1_000))!;
  await applyPush({ db, userId: USER, deviceId: 'phone', now: T0 + 1_000 }, mutations, last, ENTITIES);
  const rejected = await db.prepare('SELECT code, message FROM sync_rejections').all();
  expect(rejected.results).toEqual([]);
}
async function pulled(db: TestD1): Promise<PullResult> {
  return pull(db, USER, 'phone', {});
}
const rowsOf = (p: PullResult, table: string, scope?: string) =>
  p.scopes.filter(s => !scope || s.id === scope).flatMap(s => s.rows[table] ?? []);

describe('round trips through the real push and pull', () => {
  it('assets, goals, the goal ledger and the Review inbox come back identical', async () => {
    const db = await server();
    const asset = { id: 'a1', name: 'Gold', kind: 'gold', icon: 'award', color: '#F5B700', balance: 500000, is_archived: 0, sort_order: 2, created_at: T0 - 5_000 };
    const goal = { id: 'g1', name: 'Trip', target: 5000000, priority: 'want', category: 'Travel', icon: 'map', color: '#20C4B8', allocation: 100000, frequency: 'monthly', locked: 1, is_archived: 0, last_auto_at: T0 - 9, target_date: T0 + 9, sort_order: 0, created_at: T0 - 7_000 };
    const st = { id: 's1', goal_id: 'g1', amount: 100000, kind: 'deposit', source: 'auto', date: T0 - 3, note: 'Sept', created_at: T0 - 2, source_asset: 'bank' };
    const imp = { id: 'i1', date: T0 - 10, amount: 4500, description: 'SWIGGY', kind: 'expense', category: 'Food', direction: 'debit', raw: 'row', created_at: T0 - 11, dest_group_id: null, split_draft: '{"mode":"equal"}', counterparty_id: null, source: 'paytm', pay_method: 'upi', lat: 28.4, lng: 77.1, place_label: 'Cyber Hub' };
    await send(db, [assetToServer(asset), goalToServer(goal), savingsTxnToServer(st), importToServer(imp)]);
    const p = await pulled(db);
    expect(simpleToLocal('asset', rowsOf(p, 'assets')[0])).toEqual({ ...asset, updated_at: T0 + 1_000 });
    expect(simpleToLocal('savings_goal', rowsOf(p, 'savings_goals')[0])).toEqual(goal);
    expect(simpleToLocal('savings_txn', rowsOf(p, 'savings_transactions')[0])).toEqual(st);
    expect(simpleToLocal('pending_txn', rowsOf(p, 'imported_transactions')[0])).toEqual(imp);
  });

  it('me → profile, a friend → friends, trust everywhere and in one group', async () => {
    const db = await server();
    const meRow = { id: ME, name: 'Prem', avatar_color: '#20C4B8', mobile: '98100', upi_vpa: 'prem@okhdfc', is_me: 1 };
    const rohan = { id: 'p-rohan', name: 'Rohan', avatar_color: '#8B7CF8', mobile: null, email: 'r@x.in', upi_vpa: 'rohan@ybl', receivable_state: 'written_off', receivable_state_at: T0 - 1, is_me: 0 };
    await send(db, [
      meToProfile(meRow, ctx), personToFriend(rohan, ctx),
      groupToServer({ id: 'flat', name: 'Flat', icon: 'home', color: '#20C4B8', is_personal: 0, simplify_debt: 1, default_split: 'equal', carry_over: 0, created_at: T0 }),
    ]);
    await send(db, [trustToServer('p-rohan', null, 'trusted', ctx), trustToServer('p-rohan', 'flat', 'review', ctx)]);
    const p = await pulled(db);
    expect(profileToMe(rowsOf(p, 'profiles')[0], ctx)).toEqual({ ...meRow, remote_uid: USER });
    expect(friendToPerson(rowsOf(p, 'friends')[0], ctx)).toEqual({ ...rohan, remote_uid: null });
    const trust = rowsOf(p, 'trust_settings').map(t => [t.person_id, t.group_id, t.level]);
    expect(trust).toEqual([['p-rohan', null, 'trusted'], ['p-rohan', 'flat', 'review']]);
  });

  it('a group, my archive of it, and my own membership come back', async () => {
    const db = await server();
    const g = { id: 'flat', name: 'Flat 4B', icon: 'home', color: '#20C4B8', is_personal: 0, simplify_debt: 0, default_split: 'shares', carry_over: 1, created_at: T0 - 50, is_archived: 1, pair_person_id: null };
    await send(db, [groupToServer(g)]);
    await send(db, [groupPreferenceToServer(g, ctx)]);
    const p = await pulled(db);
    const members = rowsOf(p, 'group_members', 'flat');
    const archived = rowsOf(p, 'group_preferences')[0].is_archived as number;
    expect(serverToGroup(rowsOf(p, 'groups', 'flat')[0], members, archived, ctx)).toEqual({
      ...g, created_by: ME, updated_at: T0 + 1_000, deleted_at: null,
    });
    expect(serverToMember(members[0])).toMatchObject({ group_id: 'flat', person_id: ME, role: 'admin', deleted_at: null });
  });

  it('a transaction bundle — rule, skips, items, tags in order, adjustments — comes back identical', async () => {
    const db = await server();
    await send(db, [groupToServer({ id: 'me', name: 'Personal', icon: 'user', color: '#20C4B8', is_personal: 1, simplify_debt: 1, default_split: 'equal', carry_over: 0, created_at: T0 })]);
    const txn = {
      id: 'rent', group_id: 'me', kind: 'expense', entry_mode: 'itemized', date: T0 - 100, category: 'Rent',
      note: 'Sept', tags: JSON.stringify(['home', 'fixed']), adjustments: '{"tax":0}',
      recur_freq: 'monthly', recur_interval: 1, recur_end: T0 + 99, recur_override_date: null, parent_recur_id: null,
      recur_state: 'paused', recur_paused_at: null, recur_mode: 'remind',
      tz: 'Asia/Kolkata', lat: 12.9, lng: 77.6, place_label: 'Home', pay_method: 'bank', currency: null, source: 'manual',
      asset_id: null, author_person_id: null, is_deleted: 0, created_at: T0 - 90, updated_at: T0 + 1_000,
    };
    const bundle = {
      txn,
      payments: [{ txn_id: 'rent', person_id: ME, amount: 2500000 }],
      shares: [{ txn_id: 'rent', person_id: ME, amount: 2500000 }],
      items: [{ id: 'li1', txn_id: 'rent', name: 'Rent', qty: 1, unit_price: 2500000, assigned_to: 'all', split_mode: null, split_values: null }],
      skips: [T0 + 5],
    };
    await send(db, [txnToServer(bundle, ctx)]);
    const p = await pulled(db);
    expect(serverToTxn(rowsOf(p, 'transactions', 'me')[0], ctx)).toEqual(bundle);
  });

  it('normalises only what means the same: a NULL interval is 1, a NULL currency is INR', async () => {
    const db = await server();
    await send(db, [groupToServer({ id: 'me', name: 'Personal', icon: 'user', color: '#20C4B8', is_personal: 1, simplify_debt: 1, default_split: 'equal', carry_over: 0, created_at: T0 })]);
    await send(db, [txnToServer({
      txn: { id: 't', group_id: 'me', kind: 'expense', entry_mode: 'quick', date: T0, category: 'Food', recur_freq: 'weekly', recur_interval: null, recur_state: 'active', recur_mode: 'auto', currency: null, created_at: T0 },
      payments: [{ person_id: ME, amount: 100 }], shares: [{ person_id: ME, amount: 100 }], items: [], skips: [],
    }, ctx)]);
    const t = serverToTxn(rowsOf(await pulled(db), 'transactions', 'me')[0], ctx).txn;
    expect(t.recur_interval).toBe(1);
    expect(t.currency).toBeNull();
  });

  it('categories come back under their natural key, and a deleted one comes back as a tombstone', async () => {
    const db = await server();
    const food = { id: 'reseeded-uuid', group_id: null, name: 'Food', icon: 'coffee', color: '#FF6F61', kind: 'expense', section: 'Daily' };
    await send(db, [categoryToServer(food, ctx)]);
    const id = syncIds.category(USER, 'expense', 'Food');
    await applyPush({ db, userId: USER, deviceId: 'phone', now: T0 + 2_000 },
      [{ id: ++mutationId, entity: 'categories', op: 'delete', entityId: id, baseVersion: 1 }], mutationId - 1, ENTITIES);
    const p = await pulled(db);
    expect(serverToCategory(rowsOf(p, 'categories')[0])).toEqual({ tombstone: { name: 'Food', kind: 'expense', created_at: T0 + 2_000 } });
    await send(db, [categoryToServer(food, ctx)]);
    expect(serverToCategory(rowsOf(await pulled(db), 'categories')[0])).toEqual({ category: { ...food, id } });
  });

  it('a budget line comes back under its natural key', async () => {
    const db = await server();
    await send(db, [groupToServer({ id: 'me', name: 'Personal', icon: 'user', color: '#20C4B8', is_personal: 1, simplify_debt: 1, default_split: 'equal', carry_over: 0, created_at: T0 })]);
    const line = { id: 'random', group_id: 'me', category: 'Food', period: 'monthly', amount: 800000, cadence: 'daily', person_id: null };
    await send(db, [budgetToServer(line)]);
    expect(serverToBudget(rowsOf(await pulled(db), 'budgets', 'me')[0])).toEqual({ ...line, id: syncIds.budget('me', 'Food', null) });
  });

  it('the money profile comes back; an unset balance reads as 0, exactly as the phone reads it', async () => {
    const db = await server();
    const settings = { 'money.opening_cash': '150000', 'money.opening_bank': '2500000', 'money.credit_used': '40000', 'money.updated_at': String(T0 - 60), 'money.card_baseline_at': String(T0 - 61) };
    await send(db, [moneyProfileToServer(settings, ctx)!]);
    expect(serverToMoneySettings(rowsOf(await pulled(db), 'money_profiles')[0]))
      .toEqual({ ...settings, 'money.opening_wallet': '0', 'money.credit_limit': '0' });
    expect(moneyProfileToServer({ 'money.investments': '99' }, ctx)).toBeNull();   // derived from assets; never travels
  });

  it('a preference travels; device state is refused by the server itself', async () => {
    const db = await server();
    await send(db, [preferenceToServer('feature_voiceEntry', 'false', ctx), preferenceToServer('budget_target', '3000000', ctx)]);
    expect(rowsOf(await pulled(db), 'user_preferences').map(r => [r.key, r.value]))
      .toEqual([['feature_voiceEntry', 'false'], ['budget_target', '3000000']]);
    const last = (await ensureDevice(db, USER, 'phone', T0))!;
    await applyPush({ db, userId: USER, deviceId: 'phone', now: T0 }, [{
      id: last + 1, entity: 'user_preferences', op: 'upsert', entityId: syncIds.preference(USER, 'biometric_enabled'),
      baseVersion: 0, data: { key: 'biometric_enabled', value: 'true' },
    }], last, ENTITIES);
    expect((await db.prepare('SELECT code FROM sync_rejections').all<{ code: string }>()).results).toEqual([{ code: 'invalid' }]);
  });

  it('the feed comes back as the phone\'s audit rows, with me as NULL', async () => {
    const db = await server();
    await send(db, [{ ...groupToServer({ id: 'me', name: 'Personal', icon: 'user', color: '#20C4B8', is_personal: 1, simplify_debt: 1, default_split: 'equal', carry_over: 0, created_at: T0 }),
      data: { ...groupToServer({ id: 'me', name: 'Personal', icon: 'user', color: '#20C4B8', is_personal: 1, simplify_debt: 1, default_split: 'equal', carry_over: 0, created_at: T0 }).data, audit: { id: 'audit-local-1', summary: 'Set up Personal' } } }]);
    const [a] = rowsOf(await pulled(db), 'activity_log', 'me');
    expect(serverToAudit(a as Row, 'group', ctx)).toEqual({
      id: 'audit-local-1', entity_type: 'group', entity_id: 'me', group_id: 'me', action: 'created',
      summary: 'Set up Personal', amount: null, created_at: T0 + 1_000, actor_person_id: null,
    });
  });
});
