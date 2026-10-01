/** The signed-in account: profile, avatar, deletion. */

import {
  MAX_AVATAR_BYTES,
  MAX_NAME_LEN,
  authenticate,
  badRequest,
  json,
  normalizePhone,
  notFound,
  parseJsonObject,
  payloadTooLarge,
  unauthorized,
  noStorage,
} from '../utils/lib';
import {
  avatarKey,
  isAvatarKey,
  toUserDto,
  type Env,
  type UserRow,
} from '../types';
import { storage } from '../utils/storage';
import { eraseAccount } from '../sync';

export async function getMe(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  return json({ user: toUserDto(auth.user, url.origin) });
}

/** `{ name?, avatarUrl? }` — either may be `null` to clear it. */
export async function patchMe(request: Request, env: Env, url: URL): Promise<Response> {
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
    // Clearing is the only thing this field does. A picture is uploaded with
    // `PUT /me/avatar`; a URL of the caller's choosing would be a link the server
    // stores and hands to whoever renders this profile — an address it never vetted.
    if (body.avatarUrl !== null) return badRequest('avatarUrl can only be cleared (null). Upload a picture with PUT /me/avatar.');
    // Clearing orphans our own R2 object.
    const files = storage(env);
    if (files && auth.user.avatar_url && isAvatarKey(auth.user.avatar_url)) {
      await files.delete(auth.user.avatar_url);
    }
    sets.push('avatar_url = ?');
    binds.push(null);
    next.avatar_url = null;
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
export async function deleteAccount(request: Request, env: Env): Promise<Response> {
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
export async function putAvatar(request: Request, env: Env, url: URL): Promise<Response> {
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
export function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function getAvatar(request: Request, env: Env): Promise<Response> {
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
