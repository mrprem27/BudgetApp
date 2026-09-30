import type { Db } from '../sync/utils/access';

/** Where a "something changed" goes: one user's hub (`UserHub`), skipping the device that wrote it. */
export type Hubs = { notify(userId: string, exceptDevice: string | null): Promise<void> };

/** A push that touches more people than this tells the first ones; the rest catch up on their next sync. */
export const MAX_RECIPIENTS = 25;

/**
 * Who has to hear about a push (`DQ-108`): the owner of every personal scope it touched, and
 * everyone who has a membership row in every group scope it touched — a member just removed or
 * left included, so their phone learns it now rather than at its next open.
 */
export async function recipients(db: Db, touched: ReadonlySet<string>): Promise<string[]> {
  const ids = [...touched];
  if (ids.length === 0) return [];
  const marks = ids.map(() => '?').join(',');
  const rows = await db.prepare(
    `SELECT id AS u FROM sync_scopes WHERE kind = 'user' AND id IN (${marks})
     UNION
     SELECT p.user_id AS u FROM group_members m JOIN people p ON p.id = m.person_id
      WHERE m.group_id IN (${marks}) AND p.user_id IS NOT NULL`,
  ).bind(...ids, ...ids).all<{ u: string }>();
  return (rows.results ?? []).map(r => r.u).slice(0, MAX_RECIPIENTS);
}

/** Tell every recipient's open apps. Best effort: a failure here never fails the push. */
export async function fanOut(db: Db, hubs: Hubs, touched: ReadonlySet<string>, fromDevice: string): Promise<void> {
  try {
    const users = await recipients(db, touched);
    await Promise.allSettled(users.map(u => hubs.notify(u, fromDevice)));
  } catch {
    // Phones still sync on their own schedule; a missed nudge only delays them.
  }
}
