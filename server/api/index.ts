/**
 * BudgetSplit API Worker — phase S1: sign-in and encrypted backup/restore.
 *
 * What this server deliberately does NOT do: hold anyone's financial data. The
 * app stays local-first (each device's own SQLite, `budgetsplit/src/db/schema.ts`)
 * and the backup blobs stored here are already AES-encrypted on-device by
 * `budgetsplit/src/lib/backup.ts` with a passphrase this server never sees. A
 * leaked bucket is unreadable; a leaked D1 gives up email addresses and nothing
 * about anyone's money. Live sync (S2) and shared groups (S3) are separate
 * phases, not partially built here — see docs/V2_LAUNCH_CHECKLIST.md §6b.
 *
 * See README.md for deploy steps and the route table.
 */

import {
  INVITE_TTL_MS,
  MAGIC_LINK_TTL_MS,
  MAGIC_LINK_MAX_PER_WINDOW,
  MAGIC_LINK_WINDOW_MS,
  SESSION_TTL_MS,
  MAX_BACKUP_BYTES,
  MAX_BACKUPS_PER_USER,
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
    if (method === 'POST') return createBackup(request, env);
    return methodNotAllowed('GET, POST');
  }
  if (path.startsWith('/backups/')) {
    const id = decodeURIComponent(path.slice('/backups/'.length));
    if (!id || id.includes('/')) return notFound('No such backup');
    if (method === 'GET') return downloadBackup(request, env, id);
    if (method === 'DELETE') return deleteBackup(request, env, id);
    return methodNotAllowed('GET, DELETE');
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

  const [a, b] = orderPair(auth.user.id, invite.claimed_by);
  await env.DB.prepare(
    `INSERT INTO links (id, user_a, user_b, created_at, share_phone_a, share_phone_b)
     VALUES (?, ?, ?, ?, 0, 0)
     ON CONFLICT(user_a, user_b) DO NOTHING`,
  ).bind(newId(), a, b, Date.now()).run();

  return json({ state: 'approved' });
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
    `SELECT id, user_a, user_b, created_at, share_phone_a, share_phone_b
       FROM links WHERE user_a = ? OR user_b = ? ORDER BY created_at DESC`,
  ).bind(auth.user.id, auth.user.id).all<LinkRow>();

  const links: LinkDto[] = [];
  for (const row of rows.results ?? []) {
    const dto = await toLinkDto(env, row, auth.user.id, url.origin);
    if (dto) links.push(dto);
  }
  return json({ links });
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

/** Either side can unlink, and it removes the pair for both. */
async function deleteLink(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const result = await env.DB.prepare(
    'DELETE FROM links WHERE id = ? AND (user_a = ? OR user_b = ?)',
  ).bind(id, auth.user.id, auth.user.id).run();
  if ((result.meta?.changes ?? 0) === 0) return notFound('No such link');
  return json({ ok: true });
}

// --- Backups ---------------------------------------------------------------

/**
 * The body is stored byte-for-byte and never parsed: it's the encrypted
 * envelope `budgetsplit/src/lib/backup.ts` already produces, and the passphrase
 * that opens it stays on the user's device. Any content-type is accepted for
 * the same reason — this endpoint's job is to be blind.
 */
async function createBackup(request: Request, env: Env): Promise<Response> {
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
  await env.DB.prepare(
    'INSERT INTO backups (id, user_id, r2_key, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, auth.user.id, key, bytes.byteLength, createdAt).run();

  const pruned = await pruneOldBackups(env, auth.user.id);
  return json({
    backup: toBackupDto({ id, user_id: auth.user.id, r2_key: key, size_bytes: bytes.byteLength, created_at: createdAt }),
    pruned,
  }, 201);
}

/** Drops everything past the newest `MAX_BACKUPS_PER_USER`. Returns how many went. */
async function pruneOldBackups(env: Env, userId: string): Promise<number> {
  const stale = await env.DB.prepare(
    `SELECT id, r2_key FROM backups WHERE user_id = ?
      ORDER BY created_at DESC LIMIT -1 OFFSET ?`,
  ).bind(userId, MAX_BACKUPS_PER_USER).all<{ id: string; r2_key: string }>();
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
