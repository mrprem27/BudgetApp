/**
 * BudgetSplit API Worker — phase S1: sign-in and encrypted backup/restore.
 *
 * What this server deliberately does NOT do: hold anyone's financial data. The
 * app stays local-first (each device's own SQLite, `budgetsplit/src/db/schema.ts`)
 * and the backup blobs stored here are already AES-encrypted on-device by
 * `budgetsplit/src/lib/backup.ts` with a passphrase this server never sees. A
 * leaked bucket is unreadable; a leaked D1 gives up email addresses and nothing
 * about anyone's money.
 *
 * Stage C adds sync for SHARED groups, and does not change that: entries are
 * sealed on the device with a per-group key this Worker never receives, and the
 * key is stored only as per-device wraps it cannot open. What the server gains is
 * knowledge of who is in which group and how many entries changed when — not what
 * any of them say. Personal spending, income, goals, budgets and net worth are
 * never sent at all.
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
  MAX_BACKUP_BYTES,
  MAX_BACKUPS_PER_USER,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_URL_LEN,
  MAX_NAME_LEN,
  MAX_ENTRY_BYTES,
  SYNC_PAGE_SIZE,
  SYNC_WRITES_PER_WINDOW,
  SYNC_WRITE_WINDOW_MS,
  authenticate,
  badRequest,
  conflict,
  forbidden,
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
  type AuthedUser,
} from './lib';
import {
  avatarKey,
  isAvatarKey,
  orderPair,
  toBackupDto,
  toUserDto,
  type BackupRow,
  type Env,
  type InviteRow,
  type LinkDto,
  type LinkRow,
  type PendingClaimDto,
  type SyncEntryDto,
  type SyncEntryRow,
  type UserRow,
} from './types';
import { mailProvider, sendMail } from './mailer';
import { storage } from './storage';

const USER_COLUMNS = 'id, email, name, phone, avatar_url, created_at';

/**
 * Backups and avatars need R2; sign-in and linking do not. R2 must be enabled
 * once on the Cloudflare dashboard before a bucket can be created, so a Worker
 * can legitimately be live before storage exists. Say so precisely instead of
 * failing in a way that reads like a bug.
 */
const noStorage = () => json(
  { error: 'Backup storage is not configured on this server yet.', code: 'E_STORAGE_UNCONFIGURED' },
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
    return methodNotAllowed('GET, PATCH');
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

  if (path === '/backups') {
    if (method === 'GET') return listBackups(request, env);
    if (method === 'POST') return createBackup(request, env, url);
    return methodNotAllowed('GET, POST');
  }
  if (path.startsWith('/backups/')) {
    const id = decodeURIComponent(path.slice('/backups/'.length));
    if (!id || id.includes('/')) return notFound('No such backup');
    if (method === 'GET') return downloadBackup(request, env, id);
    if (method === 'DELETE') return deleteBackup(request, env, id);
    return methodNotAllowed('GET, DELETE');
  }

  if (path === '/sync/devices') {
    if (method === 'POST') return registerDevice(request, env);
    if (method === 'GET') return listDeviceKeys(request, env, url);
    return methodNotAllowed('GET, POST');
  }
  if (path === '/sync/groups') {
    if (method === 'GET') return listSyncGroups(request, env, url);
    if (method === 'POST') return publishSyncGroup(request, env);
    return methodNotAllowed('GET, POST');
  }
  if (path.startsWith('/sync/groups/') && path.endsWith('/members')) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const id = decodeURIComponent(path.slice('/sync/groups/'.length, -'/members'.length));
    if (!id || id.includes('/')) return notFound('No such group');
    return inviteSyncMember(request, env, id);
  }
  if (path.startsWith('/sync/groups/') && path.endsWith('/wraps')) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const id = decodeURIComponent(path.slice('/sync/groups/'.length, -'/wraps'.length));
    if (!id || id.includes('/')) return notFound('No such group');
    return addSyncWraps(request, env, id);
  }
  if (path.startsWith('/sync/groups/') && path.endsWith('/join')) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const id = decodeURIComponent(path.slice('/sync/groups/'.length, -'/join'.length));
    if (!id || id.includes('/')) return notFound('No such group');
    return joinSyncGroup(request, env, id);
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
  if (path === '/sync/entries') {
    if (method === 'GET') return pullEntries(request, env, url);
    if (method === 'PUT') return pushEntry(request, env);
    return methodNotAllowed('GET, PUT');
  }
  if (path === '/sync/disputes') {
    if (method === 'GET') return pullDisputes(request, env, url);
    if (method === 'PUT') return pushDispute(request, env);
    return methodNotAllowed('GET, PUT');
  }
  if (path.startsWith('/sync/groups/') && path.endsWith('/leave')) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const id = decodeURIComponent(path.slice('/sync/groups/'.length, -'/leave'.length));
    if (!id || id.includes('/')) return notFound('No such group');
    return leaveSyncGroup(request, env, id);
  }
  if (path.startsWith('/sync/groups/')) {
    const id = decodeURIComponent(path.slice('/sync/groups/'.length));
    if (!id || id.includes('/')) return notFound('No such group');
    if (method === 'DELETE') return deleteSyncGroup(request, env, id);
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
  return {
    id: link.id,
    createdAt: link.created_at,
    sharingMyPhone: (viewerIsA ? link.share_phone_a : link.share_phone_b) === 1,
    person: {
      id: dto.id,
      name: dto.name,
      email: dto.email,
      phone: otherShares ? dto.phone : null,
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
  const outgoing = await env.DB.prepare(
    `SELECT id, to_email, state, created_at, decided_at FROM friend_request
      WHERE from_user = ? AND (state != 'pending' OR expires_at > ?)
      ORDER BY created_at DESC LIMIT 50`,
  ).bind(auth.user.id, Date.now())
    .all<{ id: string; to_email: string; state: string; created_at: number; decided_at: number | null }>();

  return json({
    incoming: (incoming.results ?? []).map(r => ({
      id: r.id,
      note: r.note,
      createdAt: r.created_at,
      from: { name: r.from_name, email: r.from_email },
    })),
    outgoing: (outgoing.results ?? []).map(r => ({
      id: r.id, email: r.to_email, state: r.state, createdAt: r.created_at, decidedAt: r.decided_at,
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

// --- Backups ---------------------------------------------------------------

/**
 * The body is stored byte-for-byte and never parsed: it's the encrypted
 * envelope `budgetsplit/src/lib/backup.ts` already produces, and the passphrase
 * that opens it stays on the user's device. Any content-type is accepted for
 * the same reason — this endpoint's job is to be blind.
 */
async function createBackup(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const files = storage(env);
  if (!files) return noStorage();

  // The cap is whatever THIS deployment's backend accepts, not a constant: KV
  // stops at 25 MiB where R2 keeps going, and discovering that *after* a
  // successful upload would be the worst possible moment to learn it.
  const limit = Math.min(MAX_BACKUP_BYTES, files.maxBytes);
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > limit) {
    return payloadTooLarge(`Backup is larger than ${limit} bytes`);
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return badRequest('Empty backup body');
  if (bytes.byteLength > limit) {
    return payloadTooLarge(`Backup is larger than ${limit} bytes`);
  }

  const id = newId();
  const createdAt = Date.now();
  const key = `backups/${auth.user.id}/${createdAt}-${id}.enc`;
  await files.put(key, bytes, 'application/octet-stream');
  // R2 first, then D1: an object with no row is invisible dead storage the prune
  // below will never see, but a row with no object is a restore that 404s at the
  // worst possible moment. Prefer the leak.
  // `?kind=snapshot` marks an automatic one. Anything else is manual, which is
  // the safe default: a mislabelled manual backup is merely kept longer, while a
  // mislabelled snapshot could push a deliberate backup out.
  const kind = url.searchParams.get('kind') === 'snapshot' ? 'snapshot' : 'manual';
  await env.DB.prepare(
    'INSERT INTO backups (id, user_id, r2_key, size_bytes, created_at, kind) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, auth.user.id, key, bytes.byteLength, createdAt, kind).run();

  const pruned = await pruneOldBackups(env, auth.user.id, kind);
  return json({
    backup: toBackupDto({ id, user_id: auth.user.id, r2_key: key, size_bytes: bytes.byteLength, created_at: createdAt }),
    pruned,
  }, 201);
}

/**
 * Drops everything past the newest N **of the same kind**. Returns how many went.
 *
 * Scoped to one kind because they answer different questions. A snapshot is a
 * rolling window of "this phone, recently"; a manual backup is a point somebody
 * chose. Pruned together — which is what happened — the four-a-day snapshots
 * filled all ten slots in about 60 hours and the careful backup made before a
 * risky change was gone, with the deletion count returned by the API and
 * discarded by the client.
 */
async function pruneOldBackups(env: Env, userId: string, kind: string): Promise<number> {
  const stale = await env.DB.prepare(
    `SELECT id, r2_key FROM backups WHERE user_id = ? AND kind = ?
      ORDER BY created_at DESC LIMIT -1 OFFSET ?`,
  ).bind(userId, kind, MAX_BACKUPS_PER_USER).all<{ id: string; r2_key: string }>();
  const rows = stale.results ?? [];
  if (rows.length === 0) return 0;

  await storage(env)?.delete(rows.map(r => r.r2_key));
  await env.DB.prepare(
    `DELETE FROM backups WHERE id IN (${rows.map(() => '?').join(',')})`,
  ).bind(...rows.map(r => r.id)).run();
  return rows.length;
}

async function listBackups(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const rows = await env.DB.prepare(
    'SELECT id, user_id, r2_key, size_bytes, created_at FROM backups WHERE user_id = ? ORDER BY created_at DESC',
  ).bind(auth.user.id).all<BackupRow>();
  return json({ backups: (rows.results ?? []).map(toBackupDto) });
}

async function downloadBackup(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const files = storage(env);
  if (!files) return noStorage();
  const row = await ownedBackup(env, auth, id);
  if (!row) return notFound('No such backup');

  const object = await files.get(row.r2_key);
  // Row without object: only reachable if a put succeeded and its object was
  // later removed out of band. Report it as gone rather than serving an empty file.
  if (!object) return notFound('That backup is no longer stored');
  return new Response(object.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(row.size_bytes),
      'cache-control': 'no-store',
    },
  });
}

async function deleteBackup(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const row = await ownedBackup(env, auth, id);
  if (!row) return notFound('No such backup');

  await storage(env)?.delete(row.r2_key);
  await env.DB.prepare('DELETE FROM backups WHERE id = ?').bind(row.id).run();
  return json({ ok: true });
}

/**
 * Always scoped by `user_id`, never by id alone — this is the only thing
 * standing between one account's backups and another's, so it lives in one
 * function that every backup route goes through rather than being re-typed.
 */
function ownedBackup(env: Env, auth: AuthedUser, id: string): Promise<BackupRow | null> {
  return env.DB.prepare(
    'SELECT id, user_id, r2_key, size_bytes, created_at FROM backups WHERE id = ? AND user_id = ?',
  ).bind(id, auth.user.id).first<BackupRow>();
}

// --- Sync (Stage C) --------------------------------------------------------
//
// The mailbox. Everything below stores or serves bytes it cannot read: entries
// are sealed with a per-group key that never reaches this Worker, and the wraps
// of that key are themselves sealed to a device. What the server does know is
// who may read which mailbox, and which version of an entry is current.
//
// ⚠️ NOT RATE LIMITED. `/auth/request-link` is the only route here with a
// limiter, and `PUT /sync/entries` is the first write route with a real abuse
// profile — an authenticated member of one group can fill D1. Bounded per
// request (MAX_ENTRY_BYTES) but not per account per hour. Stated rather than
// implied to be handled.

/**
 * Register (or refresh) this device's public key.
 *
 * Upsert on device_id: reinstalling mints a new secret and therefore a new
 * public key, and the old wraps become unopenable. That is F12 working as
 * intended — the wraps get reissued by a member who still holds the group key —
 * not a case to paper over by keeping the old key alive.
 */
async function registerDevice(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
  const publicKey = typeof body.publicKey === 'string' ? body.publicKey.trim() : '';
  if (!deviceId || !publicKey) return badRequest('deviceId and publicKey are required');
  if (!/^[0-9a-f]{32,128}$/i.test(publicKey)) return badRequest('publicKey must be hex');

  const label = typeof body.label === 'string' ? body.label.slice(0, MAX_NAME_LEN) : null;
  const now = Date.now();
  // Scoped by user_id in the WHERE of the update half: without it, knowing
  // someone's device id would let another account overwrite their public key and
  // have every future wrap issued to itself.
  const written = await env.DB.prepare(
    `INSERT INTO device_key (device_id, user_id, public_key, label, created_at, seen_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET
       public_key = excluded.public_key,
       label      = excluded.label,
       seen_at    = excluded.seen_at
     WHERE device_key.user_id = excluded.user_id`,
  ).bind(deviceId, auth.user.id, publicKey, label, now, now).run();

  /*
   * The guard above correctly refuses to overwrite another account's device, but
   * saying so is the other half. Returning the caller's own input regardless made
   * a refused write look like a successful one — and a device that believes it is
   * registered would try to sync forever against a public key the server never
   * accepted, failing silently every time.
   *
   * Only reachable on a device-id collision, which random 32-hex makes vanishingly
   * unlikely. Reported anyway: a silent wrong answer costs far more to diagnose
   * than this costs to write.
   */
  if ((written.meta?.changes ?? 0) === 0) {
    return forbidden('That device id is registered to another account');
  }

  return json({ device: { deviceId, publicKey, label } });
}

/**
 * The public keys of someone you are linked with — or your own.
 *
 * Wrapping a group key to another person's devices requires knowing what to wrap
 * it to, and nothing else here would tell you. **Gated on an existing link**, and
 * that gate is the whole security of this route: without it, a user id would be
 * enough to enumerate someone's devices, which is a rough count of their phones
 * and a fingerprint that survives them changing their name and email.
 *
 * There is still no directory. You can only ask about someone who has already
 * approved a link with you.
 */
async function listDeviceKeys(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  const userId = (url.searchParams.get('userId') ?? '').trim() || auth.user.id;
  if (userId !== auth.user.id && !(await findLink(env, auth.user.id, userId))) {
    return forbidden('You are not linked with that person');
  }

  const rows = await env.DB.prepare(
    'SELECT device_id, public_key, label FROM device_key WHERE user_id = ? ORDER BY created_at ASC',
  ).bind(userId).all<{ device_id: string; public_key: string; label: string | null }>();

  return json({
    devices: (rows.results ?? []).map(r => ({
      deviceId: r.device_id, publicKey: r.public_key, label: r.label,
    })),
  });
}

/**
 * The one isolation check, in one place.
 *
 * Every route above this section answers "is this row yours" with
 * `WHERE user_id = ?`. A shared group is the first thing here that belongs to
 * several people, so the question changes shape — and a wrong join exposes one
 * household's ledger to another. It is a single function for exactly that reason:
 * re-typing this per route is how one copy eventually forgets `state='approved'`
 * or `removed_at IS NULL`.
 *
 * 'pending' is not membership. An invitation grants nothing until accepted.
 */
async function approvedMember(env: Env, groupId: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM sync_member m JOIN sync_group g ON g.id = m.group_id
      WHERE m.group_id = ? AND m.user_id = ? AND m.state = 'approved'
        AND m.removed_at IS NULL AND g.deleted_at IS NULL`,
  ).bind(groupId, userId).first<{ ok: number }>();
  return !!row;
}

/**
 * Publish a group under the id it already has on this phone.
 *
 * Adoption rather than creation: the client keeps its local uuid. A server-minted
 * id would put a mapping between two ids on every device, and every bug in that
 * mapping attaches a ledger to the wrong household.
 *
 * Idempotent, because a drain that fails after publishing must be safe to retry.
 */
async function publishSyncGroup(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
  if (!groupId) return badRequest('groupId is required');

  const existing = await env.DB.prepare('SELECT id, owner_user FROM sync_group WHERE id = ?')
    .bind(groupId).first<{ id: string; owner_user: string }>();
  if (existing) {
    // Someone else's group under an id we happen to share is not ours to take
    // over. Local uuids collide only by accident or on purpose; both answer 403.
    if (existing.owner_user !== auth.user.id) return forbidden('That group id belongs to another account');
    /*
     * Idempotent, but NOT a no-op: the wraps still land.
     *
     * Returning here without running them was half of why sharing a group with a
     * second person was broken. The owner re-shares, sends wraps for their own
     * devices, and this dropped them on the floor — so a second phone, or a
     * reinstalled one, could never be given the key it was just handed, and the
     * client had no way to tell that from success.
     *
     * `wrapStatements` upserts and refuses any wrap aimed at a device that is not
     * theirs, so re-sending the same wrap is free and sending someone else's is
     * still refused.
     */
    const again = await wrapStatements(env, groupId, auth.user.id, body.wraps, Date.now());
    if (typeof again === 'string') return badRequest(again);
    if (again.length > 0) await env.DB.batch(again);
    return json({ group: { id: groupId, owner: auth.user.id } });
  }

  const now = Date.now();
  const statements = [
    env.DB.prepare('INSERT INTO sync_group (id, owner_user, created_at) VALUES (?, ?, ?)')
      .bind(groupId, auth.user.id, now),
    env.DB.prepare(
      `INSERT INTO sync_member (group_id, user_id, state, joined_at) VALUES (?, ?, 'approved', ?)`,
    ).bind(groupId, auth.user.id, now),
  ];

  /*
   * The publisher's OWN wraps, sent with the publish.
   *
   * Without them the owner publishes a group they cannot read: the key exists
   * only in the memory of the device that generated it, and is gone the moment
   * that app is backgrounded. Their own second phone would never get it either.
   * The wraps are made on the device, so this Worker still never sees the key.
   */
  const own = await wrapStatements(env, groupId, auth.user.id, body.wraps, now);
  if (typeof own === 'string') return badRequest(own);
  statements.push(...own);

  await env.DB.batch(statements);
  return json({ group: { id: groupId, owner: auth.user.id } }, 201);
}

/**
 * `{ wraps }` → give MY OWN devices the key to a group I am already in.
 *
 * The hole this closes: a wrap is made per DEVICE, and nothing anywhere created
 * one for a device that appeared later. Sign in on a second phone, or reinstall on
 * the same one, and `listSyncGroups` returns every group with `wrappedKey: null`
 * — forever. The group is listed, is approved, and cannot be read, and the only
 * escape was for another member to re-share it, which (before this change) minted
 * a new key and broke everyone else instead.
 *
 * The key never reaches this Worker. A device that can already open the group
 * wraps it for the caller's other devices and posts the results.
 *
 * `wrapStatements` is what keeps this safe, and it is the same function the
 * publish and invite paths use: a wrap naming a device that is not the caller's is
 * refused. So the worst this can do is give me access I already have.
 */
async function addSyncWraps(request: Request, env: Env, groupId: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');

  // Membership, not ownership: anyone in the group holds the key already, so
  // there is nothing here an approved member could learn that they could not.
  if (!(await approvedMember(env, groupId, auth.user.id))) {
    return forbidden('You are not a member of that group');
  }

  const statements = await wrapStatements(env, groupId, auth.user.id, body.wraps, Date.now());
  if (typeof statements === 'string') return badRequest(statements);
  if (statements.length > 0) await env.DB.batch(statements);
  return json({ wraps: statements.length });
}

/**
 * Turn a `wraps` array into statements, refusing any wrap aimed at a device that
 * does not belong to `userId`.
 *
 * That check is not incidental. Without it an inviter could name their own device
 * and be handed a wrap for a group they were invited to but never joined — and
 * shared by both routes, it cannot be present in one and forgotten in the other.
 */
async function wrapStatements(
  env: Env, groupId: string, userId: string, raw: unknown, now: number,
): Promise<D1PreparedStatement[] | string> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return 'wraps must be an array';

  const out: D1PreparedStatement[] = [];
  for (const w of raw) {
    const entry = w as Record<string, unknown>;
    const deviceId = typeof entry.deviceId === 'string' ? entry.deviceId : '';
    const wrappedKey = typeof entry.wrappedKey === 'string' ? entry.wrappedKey : '';
    if (!deviceId || !wrappedKey) return 'each wrap needs deviceId and wrappedKey';
    const owns = await env.DB.prepare('SELECT 1 AS ok FROM device_key WHERE device_id = ? AND user_id = ?')
      .bind(deviceId, userId).first<{ ok: number }>();
    if (!owns) return 'a wrap names a device that is not theirs';
    out.push(env.DB.prepare(
      `INSERT INTO sync_wrap (group_id, device_id, wrapped_key, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(group_id, device_id) DO UPDATE SET wrapped_key = excluded.wrapped_key`,
    ).bind(groupId, deviceId, wrappedKey, now));
  }
  return out;
}

/**
 * My groups, each with the wrap for THIS device.
 *
 * `deviceId` is required rather than optional: a listing without it would be a
 * list of groups whose keys this device cannot open, which is not useful to
 * anyone and invites a caller to fall back on some other device's wrap.
 */
async function listSyncGroups(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const deviceId = (url.searchParams.get('deviceId') ?? '').trim();
  if (!deviceId) return badRequest('deviceId is required');

  /*
   * Deleted and removed groups are REPORTED, not filtered out.
   *
   * They used to be dropped from this list, which made "the owner deleted this
   * group" indistinguishable from "you were never in it" and from "the request
   * failed" — so the other members' devices kept a group that had ceased to
   * exist, quietly syncing nothing, forever. A tombstone is only useful if
   * somebody is told about it.
   *
   * The membership row is still what decides access: `approvedMember` is
   * unchanged and refuses reads and writes for both states. This route is the one
   * place that says *why*.
   */
  const rows = await env.DB.prepare(
    `SELECT g.id, g.owner_user, m.state, m.removed_at, g.deleted_at, w.wrapped_key
       FROM sync_member m
       JOIN sync_group g ON g.id = m.group_id
       LEFT JOIN sync_wrap w ON w.group_id = g.id AND w.device_id = ?
      WHERE m.user_id = ?
      ORDER BY g.created_at ASC`,
  ).bind(deviceId, auth.user.id)
    .all<{
      id: string; owner_user: string; state: string;
      removed_at: number | null; deleted_at: number | null; wrapped_key: string | null;
    }>();

  return json({
    groups: (rows.results ?? []).map(r => ({
      id: r.id,
      owner: r.owner_user,
      // Deletion outranks removal: if the group is gone for everyone, that is the
      // more useful thing to say to someone who also happens to have left it.
      state: r.deleted_at !== null ? 'deleted' : r.removed_at !== null ? 'removed' : r.state,
      // Null means this device has no wrap yet — it is invited, or it re-installed
      // and its old wraps died with its old key. Either way the client cannot read
      // the group and must be told so plainly rather than shown an empty ledger.
      wrappedKey: r.wrapped_key,
    })),
  });
}

/**
 * Invite someone, handing over the group key wrapped to each of their devices.
 *
 * Only an approved member may invite, and the wraps are produced on the
 * inviter's phone — the server never sees an unwrapped key and could not produce
 * one if it wanted to.
 *
 * The invitee lands as 'pending'. They are not a member until they accept, which
 * keeps "someone added me to a group" from being something that happens TO you.
 */
async function inviteSyncMember(request: Request, env: Env, groupId: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  if (!(await approvedMember(env, groupId, auth.user.id))) return forbidden('Not a member of that group');

  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const wraps = Array.isArray(body.wraps) ? body.wraps : null;
  if (!userId || !wraps) return badRequest('userId and wraps are required');

  // Only someone already linked can be invited. There is no directory and no
  // search anywhere in this API, and an invite route that accepts a bare user id
  // would quietly become one.
  if (!(await findLink(env, auth.user.id, userId))) {
    return forbidden('You are not linked with that person');
  }

  const now = Date.now();
  const statements = [
    env.DB.prepare(
      `INSERT INTO sync_member (group_id, user_id, state, joined_at) VALUES (?, ?, 'pending', ?)
       ON CONFLICT(group_id, user_id) DO UPDATE SET removed_at = NULL`,
    ).bind(groupId, userId, now),
  ];
  const wrapRows = await wrapStatements(env, groupId, userId, wraps, now);
  if (typeof wrapRows === 'string') return badRequest(wrapRows);
  statements.push(...wrapRows);
  await env.DB.batch(statements);

  return json({ invited: userId, wraps: wraps.length });
}

/** Accept an invitation. Only the invitee can do this, and only from 'pending'. */
async function joinSyncGroup(request: Request, env: Env, groupId: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  const joined = await env.DB.prepare(
    `UPDATE sync_member SET state = 'approved', joined_at = ?, removed_at = NULL
      WHERE group_id = ? AND user_id = ? AND state = 'pending'`,
  ).bind(Date.now(), groupId, auth.user.id).run();
  if ((joined.meta?.changes ?? 0) !== 1) return notFound('No invitation to that group');

  return json({ state: 'approved' });
}

/**
 * Push one sealed entry. Compare-and-set on `version`.
 *
 * This is the whole reason `version` is in the clear. Last-write-wins on a ledger
 * is the lost-update problem with money in it: two people edit the same bill from
 * their own phones, both writes succeed, and the second silently erases the
 * first. Nobody is told, and the number that survives is whichever request
 * happened to arrive later.
 *
 * So a write must state the version it was based on, and a stale one is refused
 * with 409 and the current row attached, for a human to resolve. The guarded
 * UPDATE + `meta.changes` idiom is the same one `claimInvite` uses.
 */
async function pushEntry(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');

  const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
  const entryId = typeof body.entryId === 'string' ? body.entryId.trim() : '';
  const ciphertext = typeof body.ciphertext === 'string' ? body.ciphertext : '';
  const version = typeof body.version === 'number' ? body.version : NaN;
  if (!groupId || !entryId || !ciphertext) return badRequest('groupId, entryId and ciphertext are required');
  if (!Number.isInteger(version) || version < 1) return badRequest('version must be a positive integer');
  if (ciphertext.length > MAX_ENTRY_BYTES) return payloadTooLarge('Entry is too large');

  if (!(await approvedMember(env, groupId, auth.user.id))) return forbidden('Not a member of that group');

  /*
   * The volume guard, checked after membership so a stranger's requests are
   * refused by the cheaper test first.
   *
   * Counts entries this account has TOUCHED in the window, not requests made:
   * rewriting one entry repeatedly costs one, which is right, because that burns
   * requests rather than storage and Cloudflare's own request cap already covers
   * it. What this bounds is D1 filling up an entry at a time.
   */
  const since = Date.now() - SYNC_WRITE_WINDOW_MS;
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM sync_entry WHERE author_user = ? AND updated_at > ?',
  ).bind(auth.user.id, since).first<{ n: number }>();
  if ((recent?.n ?? 0) >= SYNC_WRITES_PER_WINDOW) {
    return tooManyRequests('Too many changes at once. Sync will carry on shortly.');
  }

  const isDeleted = body.isDeleted === true ? 1 : 0;
  const now = Date.now();

  // v1 is a create; anything higher must replace exactly its predecessor. Both
  // are one guarded statement so two devices racing the same version cannot both
  // win — `changes` is 0 for the loser.
  const written = version === 1
    ? await env.DB.prepare(
      `INSERT INTO sync_entry (group_id, entry_id, version, ciphertext, author_user, is_deleted, updated_at)
       VALUES (?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(group_id, entry_id) DO NOTHING`,
    ).bind(groupId, entryId, ciphertext, auth.user.id, isDeleted, now).run()
    : await env.DB.prepare(
      `UPDATE sync_entry SET version = ?, ciphertext = ?, author_user = ?, is_deleted = ?, updated_at = ?
        WHERE group_id = ? AND entry_id = ? AND version = ?`,
    ).bind(version, ciphertext, auth.user.id, isDeleted, now, groupId, entryId, version - 1).run();

  if ((written.meta?.changes ?? 0) === 1) return json({ entryId, version, updatedAt: now });

  // Lost the race, or based on a version that is no longer current. Hand back
  // what IS current so the client can show both rather than guess between them.
  const current = await env.DB.prepare(
    `SELECT version, ciphertext, author_user, is_deleted, updated_at
       FROM sync_entry WHERE group_id = ? AND entry_id = ?`,
  ).bind(groupId, entryId).first<SyncEntryRow>();

  return conflict({
    error: 'That entry changed on another device',
    entryId,
    current: current ? toSyncEntryDto(entryId, current) : null,
  });
}

/**
 * Pull everything in a group that changed after `since`.
 *
 * The cursor is `updated_at`, and the bound is EXCLUSIVE with the returned
 * cursor being the last row's own timestamp — so a client that stores it and
 * comes back gets each change once. Two rows written in the same millisecond are
 * the ordering hazard here; `entry_id` is the tiebreak in the sort so the page
 * boundary is at least deterministic, and the client is idempotent regardless
 * because `ingestPeerTxn` treats re-delivery as normal.
 */
async function pullEntries(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  const groupId = (url.searchParams.get('groupId') ?? '').trim();
  if (!groupId) return badRequest('groupId is required');
  if (!(await approvedMember(env, groupId, auth.user.id))) return forbidden('Not a member of that group');

  const rawSince = Number(url.searchParams.get('since') ?? '0');
  const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : 0;

  const rows = await env.DB.prepare(
    `SELECT entry_id, version, ciphertext, author_user, is_deleted, updated_at
       FROM sync_entry
      WHERE group_id = ? AND updated_at > ?
      ORDER BY updated_at ASC, entry_id ASC
      LIMIT ?`,
  ).bind(groupId, since, SYNC_PAGE_SIZE).all<SyncEntryRow & { entry_id: string }>();

  const results = rows.results ?? [];
  const entries = results.map(r => toSyncEntryDto(r.entry_id, r));
  return json({
    entries,
    cursor: results.length ? results[results.length - 1].updated_at : since,
    // The client must come straight back rather than wait for the next launch:
    // a first sync of a busy group is several pages, and stopping halfway would
    // leave a ledger that is missing its most recent half.
    more: results.length === SYNC_PAGE_SIZE,
  });
}

function toSyncEntryDto(entryId: string, r: SyncEntryRow): SyncEntryDto {
  return {
    entryId,
    version: r.version,
    ciphertext: r.ciphertext,
    author: r.author_user,
    isDeleted: r.is_deleted === 1,
    updatedAt: r.updated_at,
  };
}

/**
 * Record that I object to someone else's entry — F10.
 *
 * A dispute is my OPINION of their entry, never a new version of it. Writing it
 * as a version would let one person overwrite another's record of what happened,
 * which is precisely the authority the approval model withholds. The author is
 * shown the objection and decides; nobody edits anyone else's entry.
 *
 * Withdrawing is the same route with `cleared: true`, so reopening an entry I had
 * rejected takes the objection back rather than leaving it standing forever.
 */
async function pushDispute(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const body = await parseJsonObject(request);
  if (!body) return badRequest('Invalid JSON body');

  const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
  const entryId = typeof body.entryId === 'string' ? body.entryId.trim() : '';
  const version = typeof body.version === 'number' ? body.version : NaN;
  if (!groupId || !entryId) return badRequest('groupId and entryId are required');
  if (!Number.isInteger(version) || version < 1) return badRequest('version must be a positive integer');
  if (!(await approvedMember(env, groupId, auth.user.id))) return forbidden('Not a member of that group');

  const now = Date.now();
  const cleared = body.cleared === true ? now : null;
  await env.DB.prepare(
    `INSERT INTO sync_dispute (group_id, entry_id, by_user, version, created_at, cleared_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_id, entry_id, by_user) DO UPDATE SET
       version = excluded.version, created_at = excluded.created_at, cleared_at = excluded.cleared_at`,
  ).bind(groupId, entryId, auth.user.id, version, now, cleared).run();

  return json({ entryId, cleared: cleared !== null });
}

/** Objections raised in a group since a cursor. Same shape as entry pulls. */
async function pullDisputes(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const groupId = (url.searchParams.get('groupId') ?? '').trim();
  if (!groupId) return badRequest('groupId is required');
  if (!(await approvedMember(env, groupId, auth.user.id))) return forbidden('Not a member of that group');

  const rawSince = Number(url.searchParams.get('since') ?? '0');
  const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : 0;

  const rows = await env.DB.prepare(
    `SELECT entry_id, by_user, version, created_at, cleared_at
       FROM sync_dispute
      WHERE group_id = ? AND created_at > ?
      ORDER BY created_at ASC, entry_id ASC
      LIMIT ?`,
  ).bind(groupId, since, SYNC_PAGE_SIZE)
    .all<{ entry_id: string; by_user: string; version: number; created_at: number; cleared_at: number | null }>();

  const results = rows.results ?? [];
  return json({
    disputes: results.map(r => ({
      entryId: r.entry_id,
      byUser: r.by_user,
      version: r.version,
      createdAt: r.created_at,
      cleared: r.cleared_at !== null,
    })),
    cursor: results.length ? results[results.length - 1].created_at : since,
    more: results.length === SYNC_PAGE_SIZE,
  });
}

/**
 * Leave a group — F11, the half that is not deletion.
 *
 * Sets `removed_at` rather than deleting the row, so leaving is auditable and a
 * re-invite is an ordinary state change instead of a resurrection. Their wraps go,
 * because a device that has left must not keep being handed the key.
 *
 * What is deliberately NOT done: removing their entries. They happened, the rest
 * of the group still owes or is owed against them, and rewriting history because
 * somebody walked away is how a ledger stops being trustworthy.
 */
async function leaveSyncGroup(request: Request, env: Env, groupId: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  const left = await env.DB.prepare(
    `UPDATE sync_member SET removed_at = ? WHERE group_id = ? AND user_id = ? AND removed_at IS NULL`,
  ).bind(Date.now(), groupId, auth.user.id).run();
  if ((left.meta?.changes ?? 0) !== 1) return notFound('You are not in that group');

  await env.DB.prepare(
    `DELETE FROM sync_wrap WHERE group_id = ?
      AND device_id IN (SELECT device_id FROM device_key WHERE user_id = ?)`,
  ).bind(groupId, auth.user.id).run();

  return json({ state: 'left' });
}

/**
 * Delete a group for everyone — F11.
 *
 * **Owner only.** This is the one destructive action here that reaches other
 * people's phones, and the local rule already matches: `canDeleteGroup` is
 * `isCreator`, so a member who wants out leaves instead.
 *
 * A tombstone, not a DELETE. `deleted_at` is what `approvedMember` already checks,
 * so setting it stops every read and write in one place — and it leaves something
 * for other devices to SEE. Hard-deleting the rows would make the group simply
 * stop existing, which is indistinguishable from a network failure on every other
 * phone: the whole reason this was a divergence hole.
 */
async function deleteSyncGroup(request: Request, env: Env, groupId: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  const deleted = await env.DB.prepare(
    'UPDATE sync_group SET deleted_at = ? WHERE id = ? AND owner_user = ? AND deleted_at IS NULL',
  ).bind(Date.now(), groupId, auth.user.id).run();
  if ((deleted.meta?.changes ?? 0) !== 1) {
    // Either not theirs or already gone. Both answer the same way rather than
    // confirming that a group they do not own exists.
    return forbidden('Only the person who created a group can delete it for everyone');
  }
  return json({ state: 'deleted' });
}

// --- Email bodies ----------------------------------------------------------

const MINUTES = Math.round(MAGIC_LINK_TTL_MS / 60000);

/** The one line Gmail shows next to the subject. Wasted if left to chance. */
const PREHEADER = `Tap to sign in. The link works once and expires in ${MINUTES} minutes.`;

export const SIGN_IN_SUBJECT = 'Sign in to BudgetSplit';

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
            BudgetSplit keeps your money on your phone. An account only adds an encrypted backup.
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
