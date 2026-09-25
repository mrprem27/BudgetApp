import { isAdmin, selfPersonId, type GroupContext } from '../rules';

/**
 * Who may read which scope — the ONE place that decides it (SPEC-SERVER.md §3.1).
 *
 * v1 had exactly this discipline in `approvedMember`, and it is kept for the same
 * reason: a join re-typed per route is how one copy forgets `status = 'active'` or
 * `deleted_at IS NULL`, and a wrong answer here hands one household's ledger to
 * another. Every sync read and write goes through these functions and nothing else.
 *
 *   * A USER scope (its id is the user's id) is readable by that user alone.
 *   * A GROUP scope is readable while the user's person is an `active` member and
 *     the group is not deleted. `invited` grants nothing until accepted; `left`
 *     and `removed` end access, and the pull reports those groups as revoked.
 */

/** Minimal D1 surface, so the same code runs against the test harness. */
export type Db = Pick<D1Database, 'prepare' | 'batch'>;

const ACTIVE_MEMBER_OF_LIVE_GROUP = `
  SELECT 1 FROM group_members m
    JOIN people p ON p.id = m.person_id
    JOIN groups g ON g.id = m.group_id
   WHERE m.group_id = ? AND p.user_id = ?
     AND m.status = 'active' AND m.deleted_at IS NULL
     AND g.deleted_at IS NULL`;

export async function canReadScope(db: Db, userId: string, scopeId: string): Promise<boolean> {
  if (scopeId === userId) return true;
  const row = await db.prepare(ACTIVE_MEMBER_OF_LIVE_GROUP).bind(scopeId, userId).first();
  return row !== null;
}

/**
 * Every scope this user can read now, and every group scope they used to be able
 * to read but no longer can — so the phone can archive those, never silently keep
 * syncing nothing (the v1 lesson: a group that simply vanishes from a list is
 * indistinguishable from a failed request).
 */
/** Why a group stopped being readable — the phone says different things for each. */
export type RevokedWhy = 'deleted' | 'removed' | 'left';

export async function scopesFor(db: Db, userId: string): Promise<{
  readable: string[]; revoked: string[]; revokedWhy: Record<string, RevokedWhy>;
}> {
  const rows = await db.prepare(`
    SELECT m.group_id AS id,
           (m.status = 'active' AND m.deleted_at IS NULL AND g.deleted_at IS NULL) AS live,
           CASE WHEN g.deleted_at IS NOT NULL THEN 'deleted'
                WHEN m.status = 'removed' THEN 'removed' ELSE 'left' END AS why
      FROM group_members m
      JOIN people p ON p.id = m.person_id
      JOIN groups g ON g.id = m.group_id
     WHERE p.user_id = ? AND m.status <> 'invited'
     ORDER BY m.group_id`).bind(userId).all<{ id: string; live: number; why: RevokedWhy }>();
  const readable = [userId];
  const revoked: string[] = [];
  const revokedWhy: Record<string, RevokedWhy> = {};
  for (const r of rows.results ?? []) {
    if (r.live) { readable.push(r.id); continue; }
    revoked.push(r.id);
    revokedWhy[r.id] = r.why;
  }
  return { readable, revoked, revokedWhy };
}

/** This user's person id. Every account has exactly one. */
export async function personOf(db: Db, userId: string): Promise<string | null> {
  return (await db.prepare('SELECT id FROM people WHERE user_id = ?').bind(userId).first<string>('id')) ?? null;
}

/**
 * The app's own `GroupContext`, built from server rows — so the Worker's role
 * checks call the SAME `isAdmin` / `canRemoveMember` the phone does.
 *
 * The group's permanent owner (`groups.owner_id`, a user) maps to the app's
 * `createdBy` (a person), which is what makes the owner an admin by definition
 * and un-removable, exactly as `permissions.ts` states it.
 */
export async function groupContext(db: Db, groupId: string, userId: string): Promise<GroupContext | null> {
  const row = await db.prepare(`
    SELECT me.id AS actor_id,
           owner.id AS owner_person_id,
           (SELECT m.role FROM group_members m
             WHERE m.group_id = g.id AND m.person_id = me.id
               AND m.status = 'active' AND m.deleted_at IS NULL) AS role
      FROM groups g
      JOIN people owner ON owner.user_id = g.owner_id
      JOIN people me ON me.user_id = ?
     WHERE g.id = ? AND g.deleted_at IS NULL`)
    .bind(userId, groupId)
    .first<{ actor_id: string; owner_person_id: string; role: 'admin' | 'member' | null }>();
  if (!row) return null;
  return { createdBy: row.owner_person_id, actorId: row.actor_id, actorRole: row.role ?? null };
}

/** May this user administer the group? The app's own `isAdmin`, on server rows. */
export async function mayAdminister(db: Db, groupId: string, userId: string): Promise<boolean> {
  const ctx = await groupContext(db, groupId, userId);
  return ctx !== null && isAdmin(ctx);
}

/**
 * An account's person id, derived from the account.
 *
 * Deterministic on purpose: any phone signed in as this user can compute its own
 * person id with no round trip, which is what the first-sign-in remap re-points
 * the local `is_me` row to (SPEC-SERVER.md §4). A placeholder that later turns out
 * to be this user is merged INTO this id, never the other way round.
 */
export { selfPersonId };

/** Make sure this user's person exists. Idempotent; safe in any batch. */
export function ensureSelfPerson(db: Db, userId: string, now: number): D1PreparedStatement {
  return ensurePerson(db, selfPersonId(userId), userId, userId, now);
}

/**
 * Make sure a person exists — and that an account's person says whose it is.
 *
 * `user:<X>` IS account X's person by construction (`selfPersonId`), whichever
 * write names it first. A phone that has linked a friend sends them under that id
 * — as a friend, a payer, a member — and the first of those used to create the row
 * with no account, after which `INSERT OR IGNORE` kept it that way: the invitation
 * was then invisible to X, because an invite is found by `people.user_id` (S20).
 *
 * `account` is the caller's answer when it has one; otherwise it is derived from
 * the id — and only for an account that exists and has no person yet (`user_id`
 * is unique). Idempotent; safe in any batch.
 */
export function ensurePerson(db: Db, personId: string, account: string | null, by: string, now: number): D1PreparedStatement {
  return db.prepare(
    `INSERT OR IGNORE INTO people (id, user_id, created_by, created_at)
     VALUES (?1, (SELECT u.id FROM users u
                   WHERE u.id = COALESCE(?2, CASE WHEN ?1 LIKE 'user:%' THEN substr(?1, 6) END)
                     AND NOT EXISTS (SELECT 1 FROM people WHERE user_id = u.id)), ?3, ?4)`,
  ).bind(personId, account, by, now);
}

/** This user's person id — the stored one, or the derived one if none exists yet. */
export async function myPersonId(db: Db, userId: string): Promise<string> {
  return (await personOf(db, userId)) ?? selfPersonId(userId);
}
