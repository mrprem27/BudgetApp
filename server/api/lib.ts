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

/**
 * How long an ended link is still reported, so the other device can explain the
 * disappearance once.
 *
 * Long enough to survive somebody not opening the app for a while, short enough
 * that it stays an explanation rather than becoming a permanent list of people
 * you are no longer connected to.
 */
export const ENDED_LINK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a friend request waits.
 *
 * 30 days, not `INVITE_TTL_MS`'s 7. An invite is handed over in a conversation
 * that is already happening; a request to an email address may be waiting for
 * somebody to install the app and sign up at all, and expiring before they do
 * would make "email is the unifier" a promise that quietly does not hold.
 */
export const FRIEND_REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A greeting, not a message. Long enough for "hey, it's Prem from the flat". */
export const MAX_REQUEST_NOTE = 140;

/**
 * Three limits, and each stops a different thing.
 *
 * This is the only route in the API that sends mail to an address the CALLER
 * chose, so the third one matters most: without a per-recipient cap, twenty
 * accounts each spending their own daily budget at one victim is twenty times the
 * mail and no rule broken.
 *
 * All of them answer the same `202` as a success. A `429` here would be an
 * oracle — "this address is worth rate-limiting" is information about the
 * address.
 */
export const FRIEND_REQUESTS_PER_SENDER_DAY = 20;
export const FRIEND_REQUESTS_PER_RECIPIENT_DAY = 5;
/** A resend inside this window is silently a no-op rather than a second email. */
export const FRIEND_REQUEST_RESEND_GAP_MS = 24 * 60 * 60 * 1000;
export const FRIEND_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
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

/**
 * A sealed transaction — amount, payer, shares, line items — is well under a
 * kilobyte. 64 KiB is a sanity ceiling that rejects a wrong-endpoint upload
 * before it becomes a D1 row, not a real budget.
 */
export const MAX_ENTRY_BYTES = 64 * 1024;
/**
 * Entries returned by one pull. The client's own drain sends 50 at a time
 * (`MAX_PER_DRAIN`), and a bounded page is what keeps a first sync on a large
 * group from being one request that either times out or blows the memory limit.
 */
export const SYNC_PAGE_SIZE = 200;

/**
 * Ceiling on entries one account may write per hour, across all its groups.
 *
 * `PUT /sync/entries` is the first write route here with a real abuse profile: an
 * authenticated member of one group can fill D1 an entry at a time, and the
 * per-request size cap does nothing about volume.
 *
 * 500/hour is far above any genuine use — a busy household logs perhaps thirty
 * expenses a day — while bounding a runaway client or a malicious one to
 * something the free tier absorbs. It counts entries TOUCHED in the window, so
 * repeatedly rewriting one entry costs one, which is correct: that burns
 * requests, not storage, and Cloudflare's own request cap covers it.
 */
export const SYNC_WRITES_PER_WINDOW = 500;
export const SYNC_WRITE_WINDOW_MS = 60 * 60 * 1000;

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
export const forbidden = (error = 'Not yours') => json({ error }, 403);
/**
 * A write that lost a race. 409 is not an error to swallow: it means someone
 * else's version of this entry is now current, so the client must pull and let a
 * human decide. Merging two versions of a money row automatically is how a figure
 * nobody typed ends up in a ledger.
 */
export const conflict = (body: Record<string, unknown>) => json(body, 409);
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
