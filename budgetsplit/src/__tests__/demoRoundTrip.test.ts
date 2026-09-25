jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { syncOnce } from '../lib/sync/engine';
import { uploadToAccount, replaceWithAccount } from '../lib/sync/firstSignIn';
import { queueCount } from '../db/queries/syncQueue';
import { cursors, linkedUser } from '../db/queries/syncApply';
import { loadDemoData } from '../db/seedDemo';
import { USER, ACCOUNT, transport, server, freshPhone, type Db } from './helpers/syncWorld';

/**
 * The device test, in-process: demo data → sign in (upload) → erase → sign in on
 * an empty phone (restore). Everything this phone WROTE must come back.
 *
 * Run as the device runs it: the deployed Worker's query budget (Workers Free:
 * 50, less the 4 the route spends first), and ONE sync after the upload — the app
 * calls `runSync` once, not in a loop, so one sync has to finish the job.
 *
 * Entries the demo attributes to Aarav and Priya are theirs to send, from their
 * own phones; the server accepts a transaction only from its author. So they,
 * and the approvals and dispute that hang off them, are left out of the count.
 */

const FREE_PLAN_BUDGET = 50 - 4;

const MINE = 'is_deleted = 0 AND author_person_id IS NULL';
const COUNTS: Record<string, string> = {
  people: 'SELECT COUNT(*) AS n FROM person',
  groups: 'SELECT COUNT(*) AS n FROM budget_group',
  members: 'SELECT COUNT(*) AS n FROM group_member',
  txns: `SELECT COUNT(*) AS n FROM txn WHERE ${MINE}`,
  payers: `SELECT COUNT(*) AS n FROM txn_payment WHERE txn_id IN (SELECT id FROM txn WHERE ${MINE})`,
  shares: `SELECT COUNT(*) AS n FROM txn_share WHERE txn_id IN (SELECT id FROM txn WHERE ${MINE})`,
  items: 'SELECT COUNT(*) AS n FROM line_item',
  assets: 'SELECT COUNT(*) AS n FROM asset',
  goals: 'SELECT COUNT(*) AS n FROM savings_goal',
  goalMoves: 'SELECT COUNT(*) AS n FROM savings_txn',
  budgets: 'SELECT COUNT(*) AS n FROM category_budget',
  categories: 'SELECT COUNT(*) AS n FROM category',
  imports: 'SELECT COUNT(*) AS n FROM pending_txn',
  trust: 'SELECT COUNT(*) AS n FROM person_group_trust',
  money: "SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'money.%'",
};

async function counts(db: Db) {
  const out: Record<string, number> = {};
  for (const [k, sql] of Object.entries(COUNTS)) out[k] = (await db.getFirstAsync<{ n: number }>(sql))!.n;
  return out;
}

it('demo data survives upload → erase → restore, on the free-plan budget, in one sync', async () => {
  const d1 = await server();
  const net = transport(d1, { queryBudget: FREE_PLAN_BUDGET });
  const phone = await freshPhone();
  await loadDemoData(phone);
  const before = await counts(phone);

  await uploadToAccount(phone, ACCOUNT);
  await syncOnce(phone, net, USER);
  const rejections = (await d1.prepare('SELECT mutation_id, code, message FROM sync_rejections').all()).results;
  const queued = await queueCount(phone);

  const restored = await freshPhone('other-me');
  await replaceWithAccount(restored, net, ACCOUNT);

  expect({ rejections, queued, restored: await counts(restored) }).toEqual({ rejections: [], queued: 0, restored: before });
});

it('loading demo data over a synced phone forgets the old sync position', async () => {
  // Left behind, the cursor made the next sign-in restore only what changed
  // after it, and the link kept the phone "joined" to a ledger it had wiped.
  const d1 = await server();
  const phone = await freshPhone();
  await loadDemoData(phone);
  await uploadToAccount(phone, ACCOUNT);
  await syncOnce(phone, transport(d1), USER);
  expect(Object.keys(await cursors(phone)).length).toBeGreaterThan(0);

  await loadDemoData(phone);
  expect(await linkedUser(phone)).toBeNull();
  expect(await cursors(phone)).toEqual({});
  expect(await phone.getFirstAsync('SELECT COUNT(*) AS n FROM sync_version')).toEqual({ n: 0 });
});
