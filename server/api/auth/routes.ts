/** Sign-in by emailed link: request, open, verify, sign out. */

import {
  MAGIC_LINK_WINDOW_MS,
  SESSION_TTL_MS,
  authenticate,
  badRequest,
  errorMessage,
  json,
  newId,
  normalizeEmail,
  parseJsonObject,
  randomToken,
  tooManyRequests,
  unauthorized,
  USER_COLUMNS,
} from '../utils/lib';
import {
  toUserDto,
  type Env,
  type UserRow,
} from '../types';
import { sendMail } from '../utils/mailer';
import { callerIp, magicLinkAllowed, recordMagicLink } from '../utils/rateLimit';
import { SIGN_IN_SUBJECT, signInHtml, signInText } from './emails';

/**
 * `{ email }` → emails a single-use sign-in link.
 *
 * Answers `{ ok: true }` whether or not that email already has an account —
 * accounts are created on verify, so there is no "user exists" signal to leak
 * here, and the response must not become one.
 */
export async function requestLink(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.EMAIL_FROM || env.EMAIL_FROM.startsWith('REPLACE_WITH')) {
    return json({ error: 'Server misconfigured: EMAIL_FROM is not set' }, 500);
  }

  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  const email = normalizeEmail(body.email);
  if (!email) return badRequest('A valid email address is required');

  const now = Date.now();
  // Opportunistic sweep: rows are only ever read while unexpired, so anything
  // older than one window is dead weight. Cheaper here than a cron trigger.
  await env.DB.prepare('DELETE FROM magic_links WHERE expires_at < ?')
    .bind(now - MAGIC_LINK_WINDOW_MS).run();

  const ip = callerIp(request);
  const verdict = await magicLinkAllowed(env.DB, email, ip, now);
  if (verdict === 'email') {
    return tooManyRequests('Too many sign-in links requested for that address. Try again in a few minutes.');
  }
  if (verdict === 'caller') {
    return tooManyRequests('Too many sign-in links requested from here. Try again in a few minutes.');
  }

  const token = randomToken();
  await recordMagicLink(env.DB, token, email, ip, now).run();

  const openUrl = `${url.origin}/auth/open?token=${token}`;
  try {
    await sendMail(env, {
      to: email,
      subject: SIGN_IN_SUBJECT,
      html: signInHtml(openUrl, token),
      text: signInText(openUrl, token),
    });
  } catch (err) {
    // A send that failed leaves a live token nobody received and a rate-limit
    // slot spent on nothing — drop the row so the user's retry isn't punished.
    await env.DB.prepare('DELETE FROM magic_links WHERE token = ?').bind(token).run();
    const code = (err as { code?: string }).code;
    const detail = errorMessage(err);
    return json({ error: 'Could not send the sign-in email', code, detail: detail.slice(0, 300) }, 502);
  }

  return json({ ok: true });
}

/**
 * Bridges the email into the app.
 *
 * The email can't link straight to `budgetsplit://` — mail clients strip or
 * refuse to render custom schemes — so it links here, on https, and this
 * redirects. Deliberately does NOT touch the database: link scanners and
 * "safe browsing" prefetchers hit this URL, and burning the token before the
 * human taps it would break sign-in for exactly the users whose mail provider
 * is most careful. The token is only consumed by `POST /auth/verify`.
 */
export function openLink(url: URL, env: Env): Response {
  const token = url.searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{16,256}$/.test(token)) return badRequest('Malformed sign-in link');

  const target = `${env.APP_AUTH_URL}?token=${token}`;
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Opening BudgetSplit…</title>`
    + `<p>Opening BudgetSplit… <a href="${target}">Tap here if nothing happens.</a></p>`,
    { status: 302, headers: { location: target, 'content-type': 'text/html; charset=utf-8' } },
  );
}

/** `{ token, deviceLabel? }` → `{ sessionToken, user }`. Creates the account on first use. */
export async function verifyLink(request: Request, env: Env, url: URL): Promise<Response> {
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return badRequest('token is required');

  const link = await env.DB.prepare(
    'SELECT token, email, expires_at, used_at FROM magic_links WHERE token = ?',
  ).bind(token).first<{ token: string; email: string; expires_at: number; used_at: number | null }>();

  const now = Date.now();
  // One message for every failure mode. "Already used" vs "never existed" is
  // information about someone else's inbox, not about this caller's mistake.
  if (!link || link.used_at !== null || link.expires_at <= now) {
    return unauthorized('That sign-in link is no longer valid. Request a new one.');
  }

  // Guarded UPDATE rather than a read-then-write: two taps on the same link
  // arriving together would otherwise both pass the check above and mint two
  // sessions. Whoever loses the `used_at IS NULL` race gets the same 401.
  const claimed = await env.DB.prepare(
    'UPDATE magic_links SET used_at = ? WHERE token = ? AND used_at IS NULL',
  ).bind(now, token).run();
  if ((claimed.meta?.changes ?? 0) !== 1) {
    return unauthorized('That sign-in link is no longer valid. Request a new one.');
  }

  let user = await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`)
    .bind(link.email).first<UserRow>();
  if (!user) {
    user = { id: newId(), email: link.email, name: null, phone: null, avatar_url: null, created_at: now };
    await env.DB.prepare(
      'INSERT INTO users (id, email, name, avatar_url, created_at) VALUES (?, ?, NULL, NULL, ?)',
    ).bind(user.id, user.email, user.created_at).run();
  }

  /*
   * Anything already waiting for this address is now waiting for this ACCOUNT.
   *
   * This one statement is the whole "email is the unifier" mechanism. A friend
   * request sent to somebody who had no account is stored against the address —
   * `to_email` is deliberately not a foreign key — and the moment they sign up it
   * attaches itself, so the request is simply there in the app. No second flow,
   * no second email, and nothing that had to guess whether they existed at the
   * time it was sent.
   *
   * Runs on every sign-in, not only on account creation: a request can arrive
   * between two sessions of somebody who already has an account.
   */
  await env.DB.prepare(
    `UPDATE friend_request SET to_user = ?
      WHERE to_email = ? AND to_user IS NULL AND state = 'pending'`,
  ).bind(user.id, user.email).run();

  const deviceLabel = typeof body.deviceLabel === 'string' && body.deviceLabel.trim()
    ? body.deviceLabel.trim().slice(0, 64)
    : null;
  const sessionToken = randomToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at, device_label) VALUES (?, ?, ?, ?, ?)',
  ).bind(sessionToken, user.id, now, now + SESSION_TTL_MS, deviceLabel).run();

  return json({ sessionToken, user: toUserDto(user, url.origin) });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  // An unknown token is already logged out — say so as success rather than 401,
  // so a client holding a stale token can still clear its local state cleanly.
  if (!auth) return json({ ok: true });
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(auth.sessionToken).run();
  return json({ ok: true });
}
