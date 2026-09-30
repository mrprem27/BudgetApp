import type { Db } from './sync/utils/access';

/**
 * Nightly cleanup (`DQ-107`, the part that needs no Workers Paid): what has expired goes, by the
 * same rules the routes already apply when they read it. Sync refusals are kept on purpose: a
 * phone offline for months still has to read why its change was refused.
 */
export async function cleanupExpired(db: Db, now: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM magic_links WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM invites WHERE expires_at < ? AND state IS NULL').bind(now),
  ]);
}
