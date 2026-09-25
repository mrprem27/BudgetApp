import { createTestDb, addSimpleExpense, type TestDb } from './testDb';
import { createD1, type TestD1 } from '../server/helpers/d1';
import { applyPush, ensureDevice } from '../../../../server/api/sync/push';
import { pull } from '../../../../server/api/sync/pull';
import { ENTITIES } from '../../../../server/api/sync/routes';
import type { Transport } from '../../lib/sync/engine';
import { readAllTables } from '../../db/queries/backup';
import { seedGlobalCategories } from '../../db/seedCategories';
import type * as SQLite from 'expo-sqlite';

/**
 * One account on the real Worker push/pull (in-process D1), and phones to point
 * at it — shared by the first-sign-in and sign-out tests. Callers mock
 * `expo-file-system` themselves (`db/queries/backup` imports it).
 */

export const USER = 'u-first';
export const ACCOUNT = { userId: USER, email: 'prem@x.in', name: 'Prem' };
export type Db = TestDb & SQLite.SQLiteDatabase;

export const NOW = Date.now();

/**
 * `queryBudget` runs the push under the Worker's per-request D1 query budget, as
 * the deployed server does (`D1_QUERY_BUDGET`), so a push stops part-way.
 */
export function transport(d1: TestD1, opts: { failPullAfter?: number; failPush?: boolean; queryBudget?: number } = {}): Transport {
  let pulls = 0;
  return {
    async push(body) {
      if (opts.failPush) throw new Error('network: gone');
      const now = Date.now();
      const last = (await ensureDevice(d1, USER, body.deviceId, now))!;
      return { lastMutationId: await applyPush({ db: d1, userId: USER, deviceId: body.deviceId, now }, body.mutations, last, ENTITIES, { queryBudget: opts.queryBudget }) };
    },
    async pull(body) {
      if (opts.failPullAfter !== undefined && ++pulls > opts.failPullAfter) throw new Error('network: gone');
      await ensureDevice(d1, USER, body.deviceId, Date.now());
      return pull(d1, USER, body.deviceId, body.cursors, body.rejectionsAfter) as never;
    },
  };
}

export async function server(): Promise<TestD1> {
  const d1 = createD1();
  await d1.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(USER, 'prem@x.in', 'Prem', 1).run();
  await d1.prepare("INSERT INTO sync_scopes (id, kind, seq, created_at) VALUES (?, 'user', 0, 1)").bind(USER).run();
  return d1;
}

/** A phone straight out of the box: what `seedIfNeeded` writes, under a random id. */
export async function freshPhone(meId = 'local-me'): Promise<Db> {
  const db = createTestDb() as Db;
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'iPhone', '#4F46E5', 1)").run(meId);
  db.raw.prepare(`INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
                  VALUES (?, 'Personal', 'credit-card', '#4F46E5', 1, 1, ?)`).run(`personal-${meId}`, meId);
  db.raw.prepare("INSERT INTO group_member (group_id, person_id, joined_at, role) VALUES (?, ?, 1, 'admin')").run(`personal-${meId}`, meId);
  await seedGlobalCategories(db);
  return db;
}

/**
 * A phone with months of use from BEFORE the queue existed: rows written raw, so
 * none of them is queued — the case "Upload" must not silently skip.
 */
export async function usedPhone(meId = 'local-me'): Promise<Db> {
  const db = await freshPhone(meId);
  const g = `personal-${meId}`;
  addSimpleExpense(db, { groupId: g, personId: meId, amount: 45000, date: Date.now() - 86_400_000 });
  db.raw.prepare("INSERT INTO settings (key, value) VALUES ('money.opening_cash', '5000000')").run();
  return db;
}

export const tables = async (db: Db) => {
  const t = await readAllTables(db);
  // Device-only bookkeeping, minted by the read-only decision (a device id).
  return { ...t, settings: t.settings.filter(r => !String(r.key).startsWith('sync2.')) };
};
