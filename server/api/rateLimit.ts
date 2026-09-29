import {
  MAGIC_LINK_MAX_PER_WINDOW, MAGIC_LINK_MAX_PER_IP, MAGIC_LINK_TTL_MS,
} from './lib';

type Db = Pick<D1Database, 'prepare'>;

/** Who is asking, as Cloudflare reports it. Absent in local dev and in tests. */
export const callerIp = (request: Request): string | null =>
  request.headers.get('cf-connecting-ip')?.trim() || null;

/**
 * May this caller be sent another sign-in link?
 *
 * Two budgets, both over the same window (a row's `expires_at` is its creation
 * time + the TTL, and the TTL equals the window, so "unexpired" is exactly "asked
 * for within it"):
 *   * per ADDRESS — protects one inbox from being flooded;
 *   * per CALLER — protects the provider quota, and strangers, from one client
 *     asking for links to many different addresses.
 *
 * The per-caller number is generous on purpose. Mobile carriers here put many
 * phones behind one address, so a tight limit would lock out honest people who
 * merely share a network; it exists to stop a script, not a household.
 */
export async function magicLinkAllowed(
  db: Db, email: string, ip: string | null, now: number,
): Promise<'ok' | 'email' | 'caller'> {
  const byEmail = await db.prepare('SELECT COUNT(*) AS n FROM magic_links WHERE email = ? AND expires_at > ?')
    .bind(email, now).first<{ n: number }>();
  if ((byEmail?.n ?? 0) >= MAGIC_LINK_MAX_PER_WINDOW) return 'email';
  if (ip) {
    const byIp = await db.prepare('SELECT COUNT(*) AS n FROM magic_links WHERE ip = ? AND expires_at > ?')
      .bind(ip, now).first<{ n: number }>();
    if ((byIp?.n ?? 0) >= MAGIC_LINK_MAX_PER_IP) return 'caller';
  }
  return 'ok';
}

/** The row recording a request, so both budgets can see it. */
export function recordMagicLink(db: Db, token: string, email: string, ip: string | null, now: number): D1PreparedStatement {
  return db.prepare('INSERT INTO magic_links (token, email, expires_at, used_at, ip) VALUES (?, ?, ?, NULL, ?)')
    .bind(token, email, now + MAGIC_LINK_TTL_MS, ip);
}
