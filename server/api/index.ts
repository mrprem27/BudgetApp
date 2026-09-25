/**
 * BudgetSplit API Worker: sign-in, linking, and the account's copy of the ledger.
 *
 * The app stays offline-first (each phone's own SQLite,
 * `budgetsplit/src/db/schema.ts`), and a signed-in phone keeps this server's copy
 * of EVERYTHING the account owns up to date — personal money and shared groups
 * alike (`DQ-93`). That copy is readable, not sealed: the server checks every write
 * against the app's own rules, and a new phone gets it all back by signing in.
 * Sync lives in `./sync`, reached through its barrel. Receipt photos and the
 * passphrase-encrypted backup file never come here.
 *
 * See README.md for deploy steps and the route table.
 */

import {
  INVITE_TTL_MS,
  ENDED_LINK_WINDOW_MS,
  FRIEND_REQUEST_TTL_MS,
  FRIEND_REQUEST_WINDOW_MS,
  FRIEND_REQUEST_RESEND_GAP_MS,
  FRIEND_REQUESTS_PER_SENDER_DAY,
  FRIEND_REQUESTS_PER_RECIPIENT_DAY,
  MAX_REQUEST_NOTE,
  MAGIC_LINK_TTL_MS,
  MAGIC_LINK_MAX_PER_WINDOW,
  MAGIC_LINK_WINDOW_MS,
  SESSION_TTL_MS,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_URL_LEN,
  MAX_NAME_LEN,
  authenticate,
  badRequest,
  json,
  methodNotAllowed,
  newId,
  normalizeEmail,
  normalizePhone,
  notFound,
  parseJsonObject,
  payloadTooLarge,
  randomToken,
  tooManyRequests,
  unauthorized,
} from './lib';
import {
  avatarKey,
  isAvatarKey,
  orderPair,
  toUserDto,
  type Env,
  type InviteRow,
  type LinkDto,
  type LinkRow,
  type PendingClaimDto,
  type UserRow,
} from './types';
import { mailProvider, sendMail } from './mailer';
import { storage } from './storage';
import { handleSync, handleHistory, eraseAccount } from './sync';

const USER_COLUMNS = 'id, email, name, phone, avatar_url, created_at, deleted_at';

/**
 * Avatars need R2; sign-in, linking and sync do not. R2 must be enabled
 * once on the Cloudflare dashboard before a bucket can be created, so a Worker
 * can legitimately be live before storage exists. Say so precisely instead of
 * failing in a way that reads like a bug.
 */
const noStorage = () => json(
  { error: 'File storage is not configured on this server yet.', code: 'E_STORAGE_UNCONFIGURED' },
  503,
);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      // Anything reaching here is a bug or an outage, not a client mistake —
      // answer 500 with a short detail rather than letting the runtime return
      // an opaque 1101 that tells the app nothing.
      const detail = err instanceof Error ? err.message : String(err);
      return json({ error: 'Server error', detail: detail.slice(0, 300) }, 500);
    }
  },
};

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  // Trailing slashes are a client typo, not a distinct route.
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  // No CORS headers anywhere on purpose: the only client is a native app, which
  // isn't subject to the same-origin policy. Emitting `Access-Control-Allow-*`
  // would only widen who can call this from a browser.

  if (path === '/' || path === '/health') {
    // `mail` is included so a deploy that can't actually send is visible from a
    // curl rather than from a user's failed sign-in.
    return method === 'GET'
      ? json({ ok: true, mail: mailProvider(env), storage: storage(env)?.kind ?? 'none' })
      : methodNotAllowed('GET');
  }

  if (path === '/sync/push' || path === '/sync/pull') {
    return handleSync(request, env, path);
  }
  const historyMatch = /^\/transactions\/([^/]+)\/history$/.exec(path);
  if (historyMatch) return handleHistory(request, env, decodeURIComponent(historyMatch[1]));

  if (path === '/auth/request-link') {
    return method === 'POST' ? requestLink(request, env, url) : methodNotAllowed('POST');
  }
  if (path === '/auth/open') {
    return method === 'GET' ? openLink(url, env) : methodNotAllowed('GET');
  }
  if (path === '/auth/verify') {
    return method === 'POST' ? verifyLink(request, env, url) : methodNotAllowed('POST');
  }
  if (path === '/auth/logout') {
    return method === 'POST' ? logout(request, env) : methodNotAllowed('POST');
  }

  if (path === '/me') {
    if (method === 'GET') return getMe(request, env, url);
    if (method === 'PATCH') return patchMe(request, env, url);
    if (method === 'DELETE') return deleteAccount(request, env);
    return methodNotAllowed('GET, PATCH, DELETE');
  }
  if (path === '/me/avatar') {
    if (method === 'GET') return getAvatar(request, env);
    if (method === 'PUT') return putAvatar(request, env, url);
    return methodNotAllowed('GET, PUT');
  }

  if (path === '/invites') {
    if (method === 'POST') return createInvite(request, env, url);
    if (method === 'GET') return listPendingClaims(request, env);
    return methodNotAllowed('GET, POST');
  }
  if (path === '/invite/open') {
    return method === 'GET' ? openInvite(url, env) : methodNotAllowed('GET');
  }
  if (path === '/invites/claim') {
    return method === 'POST' ? claimInvite(request, env) : methodNotAllowed('POST');
  }
  if (path.startsWith('/invites/') && (path.endsWith('/approve') || path.endsWith('/decline'))) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const token = path.slice('/invites/'.length, path.lastIndexOf('/'));
    return decideClaim(request, env, token, path.endsWith('/approve'));
  }

  if (path === '/links') {
    if (method === 'GET') return listLinks(request, env, url);
    return methodNotAllowed('GET');
  }
  if (path.startsWith('/links/')) {
    const id = decodeURIComponent(path.slice('/links/'.length));
    if (!id || id.includes('/')) return notFound('No such link');
    if (method === 'PATCH') return patchLink(request, env, id);
    if (method === 'DELETE') return deleteLink(request, env, id);
    return methodNotAllowed('PATCH, DELETE');
  }

  if (path === '/friend-requests') {
    if (method === 'POST') return createFriendRequest(request, env, url);
    if (method === 'GET') return listFriendRequests(request, env);
    return methodNotAllowed('GET, POST');
  }
  if (path.startsWith('/friend-requests/') && path.endsWith('/accept')) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const id = decodeURIComponent(path.slice('/friend-requests/'.length, -'/accept'.length));
    if (!id || id.includes('/')) return notFound('No such request');
    return acceptFriendRequest(request, env, id);
  }
  if (path.startsWith('/friend-requests/') && path.endsWith('/decline')) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const id = decodeURIComponent(path.slice('/friend-requests/'.length, -'/decline'.length));
    if (!id || id.includes('/')) return notFound('No such request');
    return declineFriendRequest(request, env, id);
  }
  if (path.startsWith('/friend-requests/')) {
    const id = decodeURIComponent(path.slice('/friend-requests/'.length));
    if (!id || id.includes('/')) return notFound('No such request');
    if (method === 'DELETE') return cancelFriendRequest(request, env, id);
    return methodNotAllowed('DELETE');
  }
  return notFound('No such route');
}

// --- Auth -----------------------------------------------------------------

/**
 * `{ email }` → emails a single-use sign-in link.
 *
 * Answers `{ ok: true }` whether or not that email already has an account —
 * accounts are created on verify, so there is no "user exists" signal to leak
 * here, and the response must not become one.
 */
async function requestLink(request: Request, env: Env, url: URL): Promise<Response> {
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

  // A row's `expires_at` is its creation time + MAGIC_LINK_TTL_MS, and that TTL
  // equals the rate-limit window, so "still unexpired" is exactly "requested
  // within the window" — no extra column needed, and it uses the email index.
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM magic_links WHERE email = ? AND expires_at > ?',
  ).bind(email, now).first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAGIC_LINK_MAX_PER_WINDOW) {
    return tooManyRequests('Too many sign-in links requested for that address. Try again in a few minutes.');
  }

  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO magic_links (token, email, expires_at, used_at) VALUES (?, ?, ?, NULL)',
  ).bind(token, email, now + MAGIC_LINK_TTL_MS).run();

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
    const detail = err instanceof Error ? err.message : String(err);
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
function openLink(url: URL, env: Env): Response {
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
async function verifyLink(request: Request, env: Env, url: URL): Promise<Response> {
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

async function logout(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  // An unknown token is already logged out — say so as success rather than 401,
  // so a client holding a stale token can still clear its local state cleanly.
  if (!auth) return json({ ok: true });
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(auth.sessionToken).run();
  return json({ ok: true });
}

// --- Profile ---------------------------------------------------------------

async function getMe(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  return json({ user: toUserDto(auth.user, url.origin) });
}

/** `{ name?, avatarUrl? }` — either may be `null` to clear it. */
async function patchMe(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');

  const sets: string[] = [];
  const binds: (string | null)[] = [];
  const next: UserRow = { ...auth.user };

  if ('name' in body) {
    const raw = body.name;
    if (raw !== null && typeof raw !== 'string') return badRequest('name must be a string or null');
    const name = raw === null ? null : raw.trim().slice(0, MAX_NAME_LEN) || null;
    sets.push('name = ?');
    binds.push(name);
    next.name = name;
  }

  if ('phone' in body) {
    const raw = body.phone;
    if (raw !== null && typeof raw !== 'string') return badRequest('phone must be a string or null');
    const phone = raw === null ? null : normalizePhone(raw);
    if (raw !== null && raw.trim() !== '' && phone === null) {
      return badRequest('That phone number doesn\u2019t look right');
    }
    sets.push('phone = ?');
    binds.push(phone);
    next.phone = phone;
  }

  if ('avatarUrl' in body) {
    const raw = body.avatarUrl;
    if (raw !== null && typeof raw !== 'string') return badRequest('avatarUrl must be a string or null');
    const value = raw === null ? null : raw.trim() || null;
    if (value !== null) {
      if (value.length > MAX_AVATAR_URL_LEN) return badRequest('avatarUrl is too long');
      // Only absolute https URLs: an on-device `file://` path means nothing to
      // any other device, which is the whole reason this field exists. Upload
      // the image itself with `PUT /me/avatar` instead.
      if (!/^https:\/\//i.test(value)) return badRequest('avatarUrl must be an absolute https URL, or null');
    }
    // Clearing (or replacing with an external URL) orphans our own R2 object.
    const files = storage(env);
    if (files && auth.user.avatar_url && isAvatarKey(auth.user.avatar_url) && value !== auth.user.avatar_url) {
      await files.delete(auth.user.avatar_url);
    }
    sets.push('avatar_url = ?');
    binds.push(value);
    next.avatar_url = value;
  }

  if (sets.length === 0) return badRequest('Nothing to update: send name, phone and/or avatarUrl');

  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, auth.user.id).run();
  return json({ user: toUserDto(next, url.origin) });
}

/**
 * `DELETE /me` — close the account.
 *
 * Required by App Store Review 5.1.1(v): an app that creates an account must let
 * the user delete it from inside the app. There was no route at all.
 *
 * ## What is destroyed
 *
 * Everything that identifies the person, everything the account kept for them,
 * and everything that gives anything access:
 *
 * - the email, name, phone and avatar URL, overwritten in place on `users`;
 * - the account's copy of their ledger — their own scope and every group that is
 *   theirs alone (`sync/erase.ts`, which says exactly what and why);
 * - every session and device, so every signed-in phone is signed out at once;
 * - every unused magic link for that address, so a link already in an inbox
 *   cannot resurrect the account.
 *
 * ## What survives, and why
 *
 * Their entries in groups other people are in, and their objections to them.
 * Those are not the account's data, they are the GROUP's record of what was
 * spent, already on the other members' phones. Erasing them would rewrite other
 * people's ledgers because one person closed their account — the same rule
 * removal follows everywhere else here: it ends a relationship, never a record.
 * Their membership there ends (`left`), and live links are tombstoned with
 * `ended_by` set to them, so the other side is told once instead of quietly
 * finding somebody gone.
 *
 * ## Ordering
 *
 * R2 first (the avatar), then D1 in one batch. D1 has no cross-binding
 * transaction with R2, so one of the two orders leaves garbage on a failure and
 * the other loses the only pointer to it. Deleting the blob first means a failure
 * leaves a row pointing at an object already gone — recoverable, and the retry is
 * idempotent. The reverse would orphan bytes nothing can ever name again.
 */
async function deleteAccount(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const userId = auth.user.id;
  const now = Date.now();

  // 1. R2 first (see Ordering above): the avatar.
  const files = storage(env);
  if (files && auth.user.avatar_url && isAvatarKey(auth.user.avatar_url)) {
    await files.delete(auth.user.avatar_url);
  }

  // 2. D1, in one batch so a failure part-way leaves the account intact and
  // signed in rather than half-erased and unusable.
  await env.DB.batch([
    // The account's copy of the ledger (DQ-93): everything that was theirs alone.
    ...(await eraseAccount(env.DB, userId, now)),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM magic_links WHERE email = ?').bind(auth.user.email),
    // Requests they sent, and blocks they set: both are theirs alone.
    env.DB.prepare("DELETE FROM friend_request WHERE from_user = ?").bind(userId),
    env.DB.prepare('DELETE FROM friend_block WHERE owner_user = ?').bind(userId),
    // Requests addressed TO them are cancelled, not deleted: the sender's list
    // has to be able to say what happened to a request they made.
    env.DB.prepare("UPDATE friend_request SET state = 'cancelled', decided_at = ? WHERE to_user = ? AND state = 'pending'")
      .bind(now, userId),
    // Unclaimed invites go; a claimed one is half of somebody else's pending
    // decision, so it is left for `decideClaim` to find gone-quiet.
    env.DB.prepare('DELETE FROM invites WHERE from_user = ? AND claimed_by IS NULL').bind(userId),
    // Live links end, attributed, exactly as an unlink does.
    env.DB.prepare('UPDATE links SET ended_at = ?, ended_by = ? WHERE (user_a = ? OR user_b = ?) AND ended_at IS NULL')
      .bind(now, userId, userId, userId),
    // Finally the identity itself. The email is replaced rather than nulled
    // (NOT NULL UNIQUE) with a value nobody can type, which also frees the real
    // address for a genuinely new account.
    env.DB.prepare(
      'UPDATE users SET email = ?, name = NULL, phone = NULL, avatar_url = NULL, deleted_at = ? WHERE id = ?',
    ).bind(`deleted+${userId}@account.invalid`, now, userId),
  ]);

  return json({ ok: true });
}

/**
 * Image in, stored in R2 under a per-user key that overwrites itself.
 *
 * Two accepted shapes: raw `image/*` bytes (what any HTTP client would send),
 * or `application/json` `{contentType, base64}`. The JSON shape exists because
 * React Native's `fetch` has no dependable binary-body support — a `Uint8Array`
 * body silently stringifies — so the app sends base64 instead of finding that
 * out as a corrupted avatar.
 */
async function putAvatar(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const files = storage(env);
  if (!files) return noStorage();

  const declaredType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  let contentType: string;
  let bytes: ArrayBuffer | Uint8Array;

  if (declaredType === 'application/json') {
    const body = await parseJsonObject(request);
    if (!body) return badRequest('Invalid JSON body');
    const declared = typeof body.contentType === 'string' ? body.contentType.trim().toLowerCase() : '';
    if (!declared.startsWith('image/')) return badRequest('contentType must be an image/* type');
    if (typeof body.base64 !== 'string' || !body.base64) return badRequest('base64 is required');
    const decoded = decodeBase64(body.base64);
    if (!decoded) return badRequest('base64 is not valid base64');
    contentType = declared;
    bytes = decoded;
  } else if (declaredType.startsWith('image/')) {
    contentType = declaredType;
    bytes = await request.arrayBuffer();
  } else {
    return badRequest('content-type must be an image/* type, or application/json with {contentType, base64}');
  }

  if (bytes.byteLength === 0) return badRequest('Empty body');
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    return payloadTooLarge(`Avatar is larger than ${MAX_AVATAR_BYTES} bytes`);
  }

  const key = avatarKey(auth.user.id);
  await files.put(key, bytes, contentType);
  await env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(key, auth.user.id).run();
  return json({ user: toUserDto({ ...auth.user, avatar_url: key }, url.origin) });
}

/** `null` on anything `atob` rejects — a truncated or url-safe-encoded string. */
function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function getAvatar(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const files = storage(env);
  if (!files) return noStorage();
  const stored = auth.user.avatar_url;
  if (!stored || !isAvatarKey(stored)) return notFound('No uploaded avatar');

  const object = await files.get(stored);
  if (!object) return notFound('No uploaded avatar');
  return new Response(object.body, {
    headers: {
      'content-type': object.contentType,
      // The key is stable across replacements, so a cached copy would go stale
      // the moment the user changes their picture.
      'cache-control': 'no-cache',
    },
  });
}

// --- Linking (Stage B) -----------------------------------------------------

/**
 * Mints a link to hand to one person.
 *
 * Short-lived and single-use like a magic link, but with one critical difference:
 * a sign-in link goes to your own inbox, while this one is *made* to be forwarded
 * over WhatsApp. So claiming it binds nothing — see `claimInvite`.
 */
async function createInvite(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  const now = Date.now();
  await env.DB.prepare('DELETE FROM invites WHERE expires_at < ? AND state IS NULL')
    .bind(now).run();

  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO invites (token, from_user, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).bind(token, auth.user.id, now + INVITE_TTL_MS, now).run();

  return json({ token, url: `${url.origin}/invite/open?token=${token}`, expiresAt: now + INVITE_TTL_MS }, 201);
}

/** Same https→app-scheme bounce as `/auth/open`, and equally must not touch the DB. */
function openInvite(url: URL, env: Env): Response {
  const token = url.searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{16,256}$/.test(token)) return badRequest('Malformed invite link');

  const target = `${env.APP_LINK_URL}?token=${token}`;
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Opening BudgetSplit…</title>`
    + `<p>Opening BudgetSplit… <a href="${target}">Tap here if nothing happens.</a></p>`,
    { status: 302, headers: { location: target, 'content-type': 'text/html; charset=utf-8' } },
  );
}

/**
 * Records that someone opened the link — and deliberately links nothing.
 *
 * The sender decides who they meant. Without this step, forwarding an invite into
 * a group chat hands the first stranger who taps it a link to your account, and
 * your phone number with it if you had that switched on.
 */
async function claimInvite(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return badRequest('token is required');

  const invite = await env.DB.prepare(
    'SELECT token, from_user, expires_at, created_at, claimed_by, claimed_at, state FROM invites WHERE token = ?',
  ).bind(token).first<InviteRow>();

  const now = Date.now();
  if (!invite || invite.expires_at <= now || invite.state === 'approved' || invite.state === 'declined') {
    return unauthorized('That invite is no longer valid. Ask them for a new one.');
  }
  if (invite.from_user === auth.user.id) return badRequest('That is your own invite link.');

  const existing = await findLink(env, auth.user.id, invite.from_user);
  if (existing) return json({ state: 'already-linked', link: await toLinkDto(env, existing, auth.user.id, new URL(request.url).origin) });

  // Guarded so two people tapping a forwarded link can't both become "the" claim.
  const claimed = await env.DB.prepare(
    `UPDATE invites SET claimed_by = ?, claimed_at = ?, state = 'pending'
      WHERE token = ? AND state IS NULL`,
  ).bind(auth.user.id, now, token).run();
  if ((claimed.meta?.changes ?? 0) !== 1) {
    return unauthorized('Someone already opened that invite. Ask them for a new one.');
  }

  return json({ state: 'pending' });
}

/** What the sender sees: who claimed which invite, awaiting a yes or no. */
async function listPendingClaims(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const rows = await env.DB.prepare(
    `SELECT i.token, i.claimed_at, u.id, u.name, u.email
       FROM invites i JOIN users u ON u.id = i.claimed_by
      WHERE i.from_user = ? AND i.state = 'pending'
      ORDER BY i.claimed_at DESC`,
  ).bind(auth.user.id).all<{ token: string; claimed_at: number; id: string; name: string | null; email: string }>();

  const claims: PendingClaimDto[] = (rows.results ?? []).map(r => ({
    token: r.token,
    claimedAt: r.claimed_at,
    from: { id: r.id, name: r.name, email: r.email },
  }));
  return json({ claims });
}

/** The sender's decision. Only approval writes a `links` row. */
async function decideClaim(request: Request, env: Env, token: string, approve: boolean): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  const invite = await env.DB.prepare(
    `SELECT token, from_user, expires_at, created_at, claimed_by, claimed_at, state
       FROM invites WHERE token = ? AND from_user = ? AND state = 'pending'`,
  ).bind(token, auth.user.id).first<InviteRow>();
  if (!invite || !invite.claimed_by) return notFound('No such pending invite');

  await env.DB.prepare('UPDATE invites SET state = ? WHERE token = ?')
    .bind(approve ? 'approved' : 'declined', token).run();
  if (!approve) return json({ state: 'declined' });

  await linkUsers(env, auth.user.id, invite.claimed_by);
  return json({ state: 'approved' });
}

/**
 * Connect two accounts. The one place a `links` row is created.
 *
 * Extracted because there are two ways in now — an approved invite claim and an
 * accepted email request — and two hand-written inserts is how the pair ordering
 * or the phone-sharing defaults drift apart between them.
 *
 * Re-linking after an unlink clears `ended_at`: the row is a tombstone, not a
 * gravestone, and `ON CONFLICT DO NOTHING` would have left a re-connected pair
 * looking permanently ended.
 */
async function linkUsers(env: Env, one: string, two: string): Promise<void> {
  const [a, b] = orderPair(one, two);
  await env.DB.prepare(
    `INSERT INTO links (id, user_a, user_b, created_at, share_phone_a, share_phone_b)
     VALUES (?, ?, ?, ?, 0, 0)
     ON CONFLICT(user_a, user_b) DO UPDATE SET ended_at = NULL, ended_by = NULL`,
  ).bind(newId(), a, b, Date.now()).run();
}

function findLink(env: Env, x: string, y: string): Promise<LinkRow | null> {
  const [a, b] = orderPair(x, y);
  return env.DB.prepare(
    'SELECT id, user_a, user_b, created_at, share_phone_a, share_phone_b FROM links WHERE user_a = ? AND user_b = ?',
  ).bind(a, b).first<LinkRow>();
}

/**
 * Resolves the other person for one link.
 *
 * Their phone is included **only** if their own flag is on — read live, never
 * copied onto the viewer's row, so switching it off stops future reads.
 */
async function toLinkDto(env: Env, link: LinkRow, viewerId: string, origin: string): Promise<LinkDto | null> {
  const otherId = link.user_a === viewerId ? link.user_b : link.user_a;
  const viewerIsA = link.user_a === viewerId;
  const other = await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(otherId).first<UserRow>();
  if (!other) return null;

  const otherShares = (viewerIsA ? link.share_phone_b : link.share_phone_a) === 1;
  const dto = toUserDto(other, origin);
  /*
   * A closed account has a scrubbed row, and the scrubbed email is a synthetic
   * `deleted+<id>@account.invalid` that must never reach a screen. This link is
   * already ended (closing an account ends every live link, attributed), so it
   * only appears in the recently-ended list — which exists precisely to explain
   * a disappearance. Say what happened instead of showing a placeholder address.
   */
  const gone = other.deleted_at != null;
  return {
    id: link.id,
    createdAt: link.created_at,
    sharingMyPhone: (viewerIsA ? link.share_phone_a : link.share_phone_b) === 1,
    person: {
      id: dto.id,
      name: gone ? 'Deleted account' : dto.name,
      email: gone ? '' : dto.email,
      phone: gone || !otherShares ? null : dto.phone,
      // The avatar URL is bearer-authed against *my* session and would 404 for
      // someone else's picture, so it isn't offered for a linked person yet.
      avatarUrl: null,
    },
  };
}

async function listLinks(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const rows = await env.DB.prepare(
    `SELECT id, user_a, user_b, created_at, share_phone_a, share_phone_b, ended_at, ended_by
       FROM links WHERE (user_a = ? OR user_b = ?) AND ended_at IS NULL
      ORDER BY created_at DESC`,
  ).bind(auth.user.id, auth.user.id).all<LinkRow>();

  const links: LinkDto[] = [];
  for (const row of rows.results ?? []) {
    const dto = await toLinkDto(env, row, auth.user.id, url.origin);
    if (dto) links.push(dto);
  }

  /*
   * What ended recently, separately — so the other device can say it ONCE.
   *
   * Windowed rather than forever: this exists to explain a disappearance while
   * the disappearance is still surprising. After that it is just history, and a
   * permanently growing list of people who are no longer connected to you is not
   * something anybody asked for.
   */
  const endedRows = await env.DB.prepare(
    `SELECT id, user_a, user_b, created_at, share_phone_a, share_phone_b, ended_at, ended_by
       FROM links WHERE (user_a = ? OR user_b = ?) AND ended_at > ?
      ORDER BY ended_at DESC`,
  ).bind(auth.user.id, auth.user.id, Date.now() - ENDED_LINK_WINDOW_MS).all<LinkRow>();

  const ended: Array<LinkDto & { endedAt: number; endedByMe: boolean }> = [];
  for (const row of endedRows.results ?? []) {
    const dto = await toLinkDto(env, row, auth.user.id, url.origin);
    // "You unlinked" and "they unlinked" are different sentences; guessing wrong
    // is worse than saying nothing, so which it was travels with it.
    if (dto) ended.push({ ...dto, endedAt: row.ended_at!, endedByMe: row.ended_by === auth.user.id });
  }

  return json({ links, ended });
}

/** `{ sharePhone: boolean }` — flips only the caller's own side of the link. */
async function patchLink(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  if (typeof body.sharePhone !== 'boolean') return badRequest('sharePhone (boolean) is required');

  const link = await env.DB.prepare(
    `SELECT id, user_a, user_b, created_at, share_phone_a, share_phone_b
       FROM links WHERE id = ? AND (user_a = ? OR user_b = ?)`,
  ).bind(id, auth.user.id, auth.user.id).first<LinkRow>();
  if (!link) return notFound('No such link');

  // Each side owns its own column — you can never change what *they* disclose.
  const column = link.user_a === auth.user.id ? 'share_phone_a' : 'share_phone_b';
  await env.DB.prepare(`UPDATE links SET ${column} = ? WHERE id = ?`)
    .bind(body.sharePhone ? 1 : 0, id).run();
  return json({ ok: true, sharingMyPhone: body.sharePhone });
}

/**
 * Either side can unlink, and it ends the pair for both.
 *
 * A tombstone rather than a DELETE. Removing the row told the other person
 * nothing: their app just stopped listing you one day, with no reason and no
 * date, which reads as data loss rather than as a decision somebody made. Keeping
 * it lets their device say it once and then stop, and `ended_by` is recorded
 * because "you unlinked" and "they unlinked" are different sentences.
 *
 * Guarded on `ended_at IS NULL` so unlinking twice answers 404 rather than
 * silently re-stamping a newer date on something already over.
 */
async function deleteLink(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const result = await env.DB.prepare(
    `UPDATE links SET ended_at = ?, ended_by = ?
      WHERE id = ? AND (user_a = ? OR user_b = ?) AND ended_at IS NULL`,
  ).bind(Date.now(), auth.user.id, id, auth.user.id, auth.user.id).run();
  if ((result.meta?.changes ?? 0) === 0) return notFound('No such link');
  return json({ ok: true });
}

// --- Friend requests, by email ---------------------------------------------

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
async function createFriendRequest(request: Request, env: Env, url: URL): Promise<Response> {
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
async function listFriendRequests(request: Request, env: Env): Promise<Response> {
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
async function acceptFriendRequest(request: Request, env: Env, id: string): Promise<Response> {
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
async function declineFriendRequest(request: Request, env: Env, id: string): Promise<Response> {
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
async function cancelFriendRequest(request: Request, env: Env, id: string): Promise<Response> {
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
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function friendRequestText(who: string, note: string | null, hasAccount: boolean): string {
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

function friendRequestHtml(who: string, note: string | null, hasAccount: boolean, origin: string): string {
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

// --- Email bodies ----------------------------------------------------------

const MINUTES = Math.round(MAGIC_LINK_TTL_MS / 60000);

/** The one line Gmail shows next to the subject. Wasted if left to chance. */
const PREHEADER = `Tap to sign in. The link works once and expires in ${MINUTES} minutes.`;

// Not exported: every named export of a Worker's main module is treated as an
// entrypoint, and a string there stops the runtime from starting at all.
const SIGN_IN_SUBJECT = 'Sign in to BudgetSplit';

/**
 * The sign-in email.
 *
 * Written to the constraints email actually has, not the ones a web page has:
 * tables rather than flexbox, inline styles rather than a stylesheet, a
 * `bgcolor` attribute beside every background colour so Outlook renders the
 * button, and no images — an image-based header would break the moment a client
 * blocks remote content, which most do by default.
 *
 * The token is printed as well as linked because the button only works on the
 * phone that has the app; opening the mail on a laptop otherwise dead-ends.
 */
function signInHtml(openUrl: string, token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${SIGN_IN_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F4;">
<div style="display:none;font-size:1px;color:#F1F5F4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${PREHEADER}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F5F4" style="background-color:#F1F5F4;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;background-color:#FFFFFF;border-radius:16px;border:1px solid #E3EAE9;">
        <tr>
          <td style="padding:32px 28px 8px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#15A89D;">BudgetSplit</div>
            <h1 style="margin:12px 0 0 0;font-size:24px;line-height:32px;font-weight:600;color:#0A0F11;">Sign in</h1>
            <p style="margin:12px 0 0 0;font-size:15px;line-height:23px;color:#4A5A58;">
              Tap the button below on the phone where BudgetSplit is installed, and you're in. No password to remember.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 8px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" bgcolor="#20C4B8" style="background-color:#20C4B8;border-radius:12px;">
                  <a href="${openUrl}" style="display:block;padding:15px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#04211F;text-decoration:none;">Sign in to BudgetSplit</a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#7C918E;text-align:center;">
              Works once &middot; expires in ${MINUTES} minutes
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 0 28px;">
            <div style="height:1px;background-color:#E3EAE9;line-height:1px;font-size:0;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:14px;line-height:21px;color:#4A5A58;">
              <strong style="color:#0A0F11;">Reading this on a computer?</strong><br>
              The button only works on your phone. Open BudgetSplit &rarr; Settings &rarr; Account, and paste this code instead:
            </p>
            <div style="margin:12px 0 0 0;padding:12px 14px;background-color:#F1F5F4;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:19px;color:#0A0F11;word-break:break-all;">${token}</div>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;">
        <tr>
          <td style="padding:20px 28px 0 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;color:#7C918E;text-align:center;">
            Didn't ask to sign in? Ignore this email &mdash; nothing happens until the link is used.
            <br><br>
            Your account keeps a copy of your BudgetSplit data, so signing in on a new phone brings it all back.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function signInText(openUrl: string, token: string): string {
  return `Sign in to BudgetSplit\n\n`
    + `Tap this link on the phone where BudgetSplit is installed:\n${openUrl}\n\n`
    + `It works once and expires in ${MINUTES} minutes.\n\n`
    + `Reading this on a computer? The link only works on your phone. Open\n`
    + `BudgetSplit > Settings > Account and paste this code instead:\n\n${token}\n\n`
    + `Didn't ask to sign in? Ignore this email - nothing happens until the link\n`
    + `is used.\n`;
}
