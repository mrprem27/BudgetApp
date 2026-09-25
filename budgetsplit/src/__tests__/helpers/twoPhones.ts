import { createTestDb, type TestDb } from './testDb';
import { createD1, type TestD1 } from '../server/helpers/d1';
import { applyPush, ensureDevice } from '../../../../server/api/sync/push';
import { pull } from '../../../../server/api/sync/pull';
import { ENTITIES } from '../../../../server/api/sync/routes';
import { syncOnce, type Transport } from '../../lib/sync/engine';
import { selfPersonId } from '../../lib/sync/ids';
import { setLinkedUser, pendingInvites, answerInvite } from '../../db/queries/syncApply';
import { queueUpsert } from '../../db/queries/syncQueue';
import { insertGroup } from '../../db/queries/groups';
import { insertPerson, setRemoteUid } from '../../db/queries/persons';

/**
 * Two accounts on the real Worker push/pull (in-process D1), a phone each — the
 * group-flow and approval round trips (S20, S21). `syncWorld` is the one-account
 * sibling. Nothing about the server is mocked.
 */

export const A = 'u-prem';
export const B = 'u-aarav';
export const ME_A = selfPersonId(A);
export const ME_B = selfPersonId(B);
export type Db = TestDb & Parameters<typeof syncOnce>[0];

export function transport(d1: TestD1, userId: string): Transport {
  return {
    async push(body) {
      const now = Date.now();
      const last = (await ensureDevice(d1, userId, body.deviceId, now))!;
      return { lastMutationId: await applyPush({ db: d1, userId, deviceId: body.deviceId, now }, body.mutations, last, ENTITIES) };
    },
    async pull(body) {
      await ensureDevice(d1, userId, body.deviceId, Date.now());
      return pull(d1, userId, body.deviceId, body.cursors, body.rejectionsAfter) as never;
    },
  };
}

export async function server(): Promise<TestD1> {
  const d1 = createD1();
  for (const [id, name] of [[A, 'Prem'], [B, 'Aarav']]) {
    await d1.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(id, `${id}@x.in`, name, 1).run();
    await d1.prepare("INSERT INTO sync_scopes (id, kind, seq, created_at) VALUES (?, 'user', 0, 1)").bind(id).run();
  }
  // Linked, as they are before either can match the other on Linked people.
  const [a, b] = A < B ? [A, B] : [B, A];
  await d1.prepare('INSERT INTO links (id, user_a, user_b, created_at) VALUES (?, ?, ?, 1)').bind(`${a}|${b}`, a, b).run();
  return d1;
}

/** A phone joined to its account, with its "me" and personal group queued. */
export async function phone(userId: string, name: string): Promise<Db> {
  const db = createTestDb() as Db;
  const me = selfPersonId(userId);
  const personal = `personal-${userId}`;
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, ?, '#20C4B8', 1)").run(me, name);
  db.raw.prepare(`INSERT INTO budget_group (id, name, icon, color, is_personal, created_at, created_by)
                  VALUES (?, 'Personal', 'user', '#20C4B8', 1, 1, ?)`).run(personal, me);
  db.raw.prepare("INSERT INTO group_member (group_id, person_id, joined_at, role) VALUES (?, ?, 1, 'admin')").run(personal, me);
  await queueUpsert(db, 'person', me);
  await queueUpsert(db, 'budget_group', personal);
  await setLinkedUser(db, userId);
  return db;
}

export const sync = (db: Db, d1: TestD1, userId: string) => syncOnce(db, transport(d1, userId), userId);
export const serverMember = (d1: TestD1, groupId: string, personId: string) =>
  d1.prepare('SELECT status, role FROM group_members WHERE id = ?').bind(`${groupId}:${personId}`).first<{ status: string; role: string }>();
export const localMember = (db: Db, groupId: string, personId: string) =>
  db.raw.prepare('SELECT role, deleted_at FROM group_member WHERE group_id = ? AND person_id = ?').get(groupId, personId) as
    { role: string; deleted_at: number | null } | undefined;

/** Prem's phone makes "Flat" with Aarav, a friend Prem has linked to Aarav's account. */
export async function flatWithAarav() {
  const d1 = await server();
  const a = await phone(A, 'Prem');
  const b = await phone(B, 'Aarav');
  const friend = await insertPerson(a, 'Aarav', '#E57373');
  const aaravOnA = await setRemoteUid(a, friend.id, B);
  const flat = await insertGroup(a, 'Flat', 'home', '#20C4B8', [aaravOnA], 'equal', ME_A);
  await sync(a, d1, A);
  await sync(b, d1, B);
  return { d1, a, b, flat: flat.id, aaravOnA };
}

/** …and Aarav accepts. */
export async function aaravJoined() {
  const w = await flatWithAarav();
  const [invite] = await pendingInvites(w.b);
  await answerInvite(w.b, invite, true);
  await sync(w.b, w.d1, B);
  await sync(w.a, w.d1, A);
  return w;
}
