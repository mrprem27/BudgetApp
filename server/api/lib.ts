/** Small shared helpers: JSON responses, tokens, session lookup, rate limiting. */

import type { Env, UserRow } from './types';

// --- Lifetimes ------------------------------------------------------------

/** A magic link is single-use and short-lived: long enough to switch to the
 *  mail app and back, short enough that a leaked link is usually already dead. */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
/** Sessions are long-lived (a phone shouldn't ask monthly) but revocable —
 *  they're rows in `sessions`, not stateless JWTs, so logout genuinely ends them. */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Refresh the rolling expiry at most once a day — a write per request would be
 *  pure D1 traffic for no benefit. */
export const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
/**
 * How long an invite link lives. Longer than a magic link (that one goes to your
 * own inbox and is used within a minute); this one is sent to a person who may
 * not open WhatsApp for a while. Still short enough that a link forwarded onward
 * weeks later is dead — and even inside the window, claiming it only creates a
 * request the sender must approve.
 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Magic-link requests allowed per email per window. Stops an email-bomb. */
export const MAGIC_LINK_MAX_PER_WINDOW = 5;
export const MAGIC_LINK_WINDOW_MS = 15 * 60 * 1000;
/** Encrypted DB blobs are small (a personal ledger), so this is a sanity cap,
 *  well under R2's limits — it exists to reject a wrong-endpoint upload early. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
/** Avatars are displayed at ~64px; anything larger than this is a mistake. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
/**
 * Snapshots kept per user — older ones are pruned on upload. Backup/restore is
 * a manual "I lost my phone" safety net, not version history, and a device that
 * backs up weekly would otherwise grow this bucket forever. Ten is generous for
 * that purpose while keeping storage bounded per account.
 */
export const MAX_BACKUPS_PER_USER = 10;
/** `users.name` is a display name, not prose. */
export const MAX_NAME_LEN = 80;
/** Long enough for any real avatar URL, short enough to not be an upload. */
export const MAX_AVATAR_URL_LEN = 2048;

// --- Responses ------------------------------------------------------------

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const badRequest = (error: string) => json({ error }, 400);
export const unauthorized = (error = 'Not signed in') => json({ error }, 401);
export const notFound = (error = 'Not found') => json({ error }, 404);
export const methodNotAllowed = (allow: string) =>
  new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow },
  });
export const payloadTooLarge = (error: string) => json({ error }, 413);
export const tooManyRequests = (error: string) => json({ error }, 429);

/** `null` on anything that isn't a JSON object — callers answer 400. */
export async function parseJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// --- Tokens ---------------------------------------------------------------

/**
 * A URL-safe random token. 32 bytes from the platform CSPRNG, hex-encoded —
 * these are bearer credentials and sign-in links, so `Math.random` is not an
 * option and the encoding has to survive being pasted into a URL.
 */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** UUID for row ids. Distinct from `randomToken` — ids are not secrets. */
export const newId = (): string => crypto.randomUUID();

// --- Email normalisation --------------------------------------------------

/**
 * Lowercased and trimmed, because `users.email` is UNIQUE and an address that
 * differs only in case is the same person — without this, `Prem@x.com` and
 * `prem@x.com` become two accounts with two separate sets of backups.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  // Deliberately permissive: the real proof an address exists is that the
  // magic link arrives. This only rejects obvious nonsense.
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// --- Phone normalisation --------------------------------------------------

/**
 * Keeps digits and a leading `+`, drops the spaces, dashes and brackets people
 * type. Returns `null` for anything that can't be a phone number.
 *
 * Deliberately does NOT canonicalise to E.164 or assume a country: this number
 * is self-declared, never verified, and never used as a key or a lookup — it
 * exists so a friend can call you. Rewriting what someone typed into a form they
 * didn't choose would be the app being clever about the one field where being
 * clever has no payoff.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  // 7 is shorter than any national number in use; 15 is E.164's ceiling.
  if (digits.length < 7 || digits.length > 15) return null;
  return (plus ? '+' : '') + digits;
}

// --- Auth ----------------------------------------------------------------

export type AuthedUser = { user: UserRow; sessionToken: string };

/**
 * Resolve the `Authorization: Bearer <token>` header to a live session's user,
 * refreshing the rolling expiry when it's a day stale. Returns null for a
 * missing, unknown or expired session — the caller answers 401.
 */
export async function authenticate(request: Request, env: Env): Promise<AuthedUser | null> {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice('bearer '.length).trim();
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT s.token AS session_token, s.expires_at, s.created_at AS session_created_at,
            u.id, u.email, u.name, u.phone, u.avatar_url, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`,
  ).bind(token).first<UserRow & { session_token: string; expires_at: number; session_created_at: number }>();

  if (!row) return null;

  const now = Date.now();
  if (row.expires_at <= now) {
    // Expired sessions are deleted on the way past rather than left to
    // accumulate — there's no cron here, and this is the only code that ever
    // looks at them again.
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }

  if (row.expires_at - now < SESSION_TTL_MS - SESSION_REFRESH_AFTER_MS) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
      .bind(now + SESSION_TTL_MS, token).run();
  }

  return {
    sessionToken: token,
    user: {
      id: row.id, email: row.email, name: row.name, phone: row.phone,
      avatar_url: row.avatar_url, created_at: row.created_at,
    },
  };
}
