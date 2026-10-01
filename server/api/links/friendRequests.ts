/** Friend requests by email, and the email they send. */

import {
  FRIEND_REQUEST_TTL_MS,
  FRIEND_REQUEST_WINDOW_MS,
  FRIEND_REQUEST_RESEND_GAP_MS,
  FRIEND_REQUESTS_PER_SENDER_DAY,
  FRIEND_REQUESTS_PER_RECIPIENT_DAY,
  MAX_REQUEST_NOTE,
  authenticate,
  badRequest,
  json,
  newId,
  normalizeEmail,
  notFound,
  parseJsonObject,
  unauthorized,
  USER_COLUMNS,
} from '../utils/lib';
import {
  type Env,
  type UserRow,
} from '../types';
import { sendMail } from '../utils/mailer';
import { linkUsers } from './routes';

/**
 * The rule this whole section is shaped around: **the response must not reveal
 * whether an address has an account.**
 *
 * Three files here say there is no directory and no search, because a lookup
 * turns the user table into a way to check whether an address belongs to somebody
 * using a finance app. That rule is intact. A route leaks only if its *response*
 * differs, so this one answers an identical `202` in every case — account, no
 * account, blocked, rate-limited — and sends one email either way. The email BODY
 * differs, and that is visible only to whoever holds the inbox, which is exactly
 * who is entitled to know.
 *
 * `POST /auth/request-link` already works this way and its comment says so. The
 * lookup below is done UNCONDITIONALLY and used only to pick a template, so the
 * query count and shape are the same on both branches too.
 *
 * Never answer 429 here. "This address is worth rate-limiting" is information
 * about the address.
 */
export async function createFriendRequest(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');

  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
  // A malformed address is the caller's own typo, not a fact about anyone else,
  // so this one CAN be a real error.
  if (!email) return badRequest('That doesn’t look like an email address.');
  if (email === auth.user.email) {
    return badRequest('That’s your own address.');
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_REQUEST_NOTE) : null;

  const now = Date.now();
  // Opportunistic sweep, the same pattern `requestLink` and `createInvite` use.
  // No cron on this deployment, and expiry that only happens when somebody looks
  // is expiry enough for a 30-day window.
  await env.DB.prepare("DELETE FROM friend_request WHERE state = 'pending' AND expires_at < ?")
    .bind(now).run();

  // Everything below returns this. Built once so no branch can accidentally
  // answer something subtly different.
  const accepted = () => json({ state: 'sent', expiresAt: now + FRIEND_REQUEST_TTL_MS }, 202);

  const windowStart = now - FRIEND_REQUEST_WINDOW_MS;
  const [blocked, existing, fromMe, toThem] = await Promise.all([
    env.DB.prepare('SELECT 1 AS ok FROM friend_block WHERE blocked_email = ? AND owner_user IN (SELECT id FROM users WHERE email = ?)')
      .bind(auth.user.email, email).first<{ ok: number }>(),
    env.DB.prepare("SELECT id, last_sent_at FROM friend_request WHERE from_user = ? AND to_email = ? AND state = 'pending'")
      .bind(auth.user.id, email).first<{ id: string; last_sent_at: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM friend_request WHERE from_user = ? AND last_sent_at > ?')
      .bind(auth.user.id, windowStart).first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM friend_request WHERE to_email = ? AND last_sent_at > ?')
      .bind(email, windowStart).first<{ n: number }>(),
  ]);

  // They blocked this address. The one place lying to the caller is right, and it
  // is the same lie the no-account case already tells.
  if (blocked) return accepted();
  if ((fromMe?.n ?? 0) >= FRIEND_REQUESTS_PER_SENDER_DAY) return accepted();
  // Across ALL senders — without this, twenty accounts each spending their own
  // budget at one victim is twenty times the mail and no rule broken.
  if ((toThem?.n ?? 0) >= FRIEND_REQUESTS_PER_RECIPIENT_DAY) return accepted();
  // Already asked, recently. Silently the same answer rather than a second email.
  if (existing && now - existing.last_sent_at < FRIEND_REQUEST_RESEND_GAP_MS) return accepted();

  // UNCONDITIONAL, and used only to choose which email to send. Doing it inside
  // one branch would make the query shape itself the tell.
  const recipient = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email).first<{ id: string }>();

  const id = existing?.id ?? newId();
  if (existing) {
    await env.DB.prepare('UPDATE friend_request SET last_sent_at = ?, expires_at = ?, note = ? WHERE id = ?')
      .bind(now, now + FRIEND_REQUEST_TTL_MS, note, id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO friend_request (id, from_user, to_email, to_user, state, note, created_at, last_sent_at, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    ).bind(id, auth.user.id, email, recipient?.id ?? null, note, now, now, now + FRIEND_REQUEST_TTL_MS).run();
  }

  const who = auth.user.name?.trim() || auth.user.email;
  try {
    await sendMail(env, {
      to: email,
      subject: `${who} wants to split expenses with you`,
      html: friendRequestHtml(who, note, !!recipient, url.origin),
      text: friendRequestText(who, note, !!recipient),
    });
  } catch {
    // Swallowed on purpose, and this is the one place that is right.
    //
    // `requestLink` deletes its row and surfaces the provider's error, because
    // there the mail IS the feature and a caller who never gets it is stuck. Here
    // the request is real and now stored: they will see it in the app whenever
    // they next open it, whether or not the email arrived. Reporting the failure
    // would also make a send error into a signal about the address.
  }

  return accepted();
}

/** Requests waiting on me, and ones I have sent. */
export async function listFriendRequests(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  // Matched on `to_user` OR the address, because a request sent before this
  // account existed is attached at sign-in — but one sent since is not, until
  // somebody looks.
  const incoming = await env.DB.prepare(
    `SELECT r.id, r.note, r.created_at, u.name AS from_name, u.email AS from_email
       FROM friend_request r JOIN users u ON u.id = r.from_user
      WHERE (r.to_user = ? OR r.to_email = ?) AND r.state = 'pending' AND r.expires_at > ?
      ORDER BY r.created_at DESC`,
  ).bind(auth.user.id, auth.user.email, Date.now())
    .all<{ id: string; note: string | null; created_at: number; from_name: string | null; from_email: string }>();

  // My own outgoing ones, INCLUDING declines. A decline the sender never sees
  // means they ask again forever; silence is what blocking is for, and blocking
  // is a separate deliberate act.
  /*
   * `to_user` rides along, and it is the whole point of the outgoing list.
   *
   * The sending device recorded WHICH LOCAL PERSON it meant when it sent the
   * request; folding the answer back is what binds that person's `remote_uid`, so
   * their entries can reach this phone. Without the account id there is nothing to
   * bind, the local row stays "Invited · waiting" forever, and the only way to
   * connect them is the manual Match screen — which is the flow email requests
   * exist to replace.
   *
   * Disclosed only to the sender, only after that person chose to accept, and only
   * an opaque id. It is not a lookup: the request had to be sent and answered.
   */
  const outgoing = await env.DB.prepare(
    `SELECT id, to_email, to_user, state, created_at, decided_at FROM friend_request
      WHERE from_user = ? AND (state != 'pending' OR expires_at > ?)
      ORDER BY created_at DESC LIMIT 50`,
  ).bind(auth.user.id, Date.now())
    .all<{ id: string; to_email: string; to_user: string | null; state: string; created_at: number; decided_at: number | null }>();

  return json({
    incoming: (incoming.results ?? []).map(r => ({
      id: r.id,
      note: r.note,
      createdAt: r.created_at,
      from: { name: r.from_name, email: r.from_email },
    })),
    outgoing: (outgoing.results ?? []).map(r => ({
      id: r.id, email: r.to_email, state: r.state, createdAt: r.created_at, decidedAt: r.decided_at,
      // Only ever set once they accepted — see the query above.
      accountId: r.state === 'accepted' ? r.to_user : null,
    })),
  });
}

/** Accept — the only path that creates a link from an email request. */
export async function acceptFriendRequest(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  // Guarded UPDATE plus `meta.changes`, the same idiom every single-use
  // transition here uses: two taps cannot both accept.
  const claimed = await env.DB.prepare(
    `UPDATE friend_request SET state = 'accepted', decided_at = ?, to_user = ?
      WHERE id = ? AND state = 'pending' AND expires_at > ? AND (to_user = ? OR to_email = ?)`,
  ).bind(Date.now(), auth.user.id, id, Date.now(), auth.user.id, auth.user.email).run();
  if ((claimed.meta?.changes ?? 0) !== 1) return notFound('No such request');

  const row = await env.DB.prepare('SELECT from_user FROM friend_request WHERE id = ?')
    .bind(id).first<{ from_user: string }>();
  if (!row) return notFound('No such request');

  await linkUsers(env, auth.user.id, row.from_user);

  // The sender's account id comes back so their device can bind it to the person
  // row it already has — they typed the address and chose the person, so there is
  // nothing left to guess.
  const me = await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(auth.user.id).first<UserRow>();
  return json({ state: 'accepted', person: me ? { id: me.id, name: me.name, email: me.email } : null });
}

/** Decline, optionally blocking. */
export async function declineFriendRequest(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);

  const row = await env.DB.prepare(
    `SELECT r.id, u.email AS from_email FROM friend_request r JOIN users u ON u.id = r.from_user
      WHERE r.id = ? AND r.state = 'pending' AND (r.to_user = ? OR r.to_email = ?)`,
  ).bind(id, auth.user.id, auth.user.email).first<{ id: string; from_email: string }>();
  if (!row) return notFound('No such request');

  await env.DB.prepare("UPDATE friend_request SET state = 'declined', decided_at = ? WHERE id = ?")
    .bind(Date.now(), id).run();

  // Blocking is the deliberate, separate act — declining alone is not silence.
  if (body?.block === true) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO friend_block (owner_user, blocked_email, created_at) VALUES (?, ?, ?)',
    ).bind(auth.user.id, row.from_email, Date.now()).run();
  }
  return json({ state: 'declined', blocked: body?.block === true });
}

/** The sender withdrawing one. */
export async function cancelFriendRequest(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const result = await env.DB.prepare(
    "UPDATE friend_request SET state = 'cancelled', decided_at = ? WHERE id = ? AND from_user = ? AND state = 'pending'",
  ).bind(Date.now(), id, auth.user.id).run();
  if ((result.meta?.changes ?? 0) === 0) return notFound('No such request');
  return json({ state: 'cancelled' });
}

/**
 * The one place a stranger's text is rendered for somebody else, so it is escaped
 * rather than trusted. `note` is capped at `MAX_REQUEST_NOTE` on the way in; this
 * is the second half of that.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function friendRequestText(who: string, note: string | null, hasAccount: boolean): string {
  return [
    `${who} wants to split expenses with you on BudgetSplit.`,
    note ? `\n"${note}"\n` : '',
    hasAccount
      ? 'Open BudgetSplit — the request is waiting on your People screen.'
      : 'BudgetSplit splits bills with friends and keeps your money on your own phone.'
        + ' Install it and sign in with this address, and the request will be waiting for you.',
    '',
    'If you don’t know who this is, ignore this email — nothing is shared unless you accept.',
  ].join('\n');
}

export function friendRequestHtml(who: string, note: string | null, hasAccount: boolean, origin: string): string {
  const safeWho = escapeHtml(who);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px;background:#0A0F11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ECF3F1">
  <div style="max-width:480px;margin:0 auto">
    <h1 style="font-size:20px;margin:0 0 16px">${safeWho} wants to split expenses with you</h1>
    ${note ? `<p style="margin:0 0 16px;padding:12px 16px;background:#13201F;border-radius:12px;color:#8FA3A0">${escapeHtml(note)}</p>` : ''}
    <p style="margin:0 0 16px;color:#8FA3A0">${hasAccount
      ? 'Open BudgetSplit — the request is waiting on your People screen.'
      : 'BudgetSplit splits bills with friends and keeps your money on your own phone. '
        + 'Install it and sign in with this address, and the request will be waiting for you.'}</p>
    <p style="margin:0;color:#7C918E;font-size:12px">
      If you don’t know who this is, ignore this email — nothing is shared unless you accept.
    </p>
    <p style="margin:24px 0 0;color:#7C918E;font-size:12px">${escapeHtml(origin)}</p>
  </div>
</body></html>`;
}
