/** Linking two accounts: invites, claims, and the links themselves. */

import {
  INVITE_TTL_MS,
  ENDED_LINK_WINDOW_MS,
  authenticate,
  badRequest,
  json,
  newId,
  notFound,
  parseJsonObject,
  randomToken,
  unauthorized,
  USER_COLUMNS,
} from '../utils/lib';
import {
  orderPair,
  toUserDto,
  type Env,
  type InviteRow,
  type LinkDto,
  type LinkRow,
  type PendingClaimDto,
  type UserRow,
} from '../types';
import { liveAccount } from '../sync';

/**
 * Mints a link to hand to one person.
 *
 * Short-lived and single-use like a magic link, but with one critical difference:
 * a sign-in link goes to your own inbox, while this one is *made* to be forwarded
 * over WhatsApp. So claiming it binds nothing — see `claimInvite`.
 */
export async function createInvite(request: Request, env: Env, url: URL): Promise<Response> {
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
export function openInvite(url: URL, env: Env): Response {
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
export async function claimInvite(request: Request, env: Env): Promise<Response> {
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
export async function listPendingClaims(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const rows = await env.DB.prepare(
    `SELECT i.token, i.claimed_at, u.id, u.name, u.email
       FROM invites i JOIN users u ON u.id = i.claimed_by
      WHERE i.from_user = ? AND i.state = 'pending' AND u.deleted_at IS NULL
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
export async function decideClaim(request: Request, env: Env, token: string, approve: boolean): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  const invite = await env.DB.prepare(
    `SELECT token, from_user, expires_at, created_at, claimed_by, claimed_at, state
       FROM invites WHERE token = ? AND from_user = ? AND state = 'pending'`,
  ).bind(token, auth.user.id).first<InviteRow>();
  if (!invite || !invite.claimed_by) return notFound('No such pending invite');
  // Their account may have been closed since they tapped the link (`deleteAccount`
  // leaves a claimed invite "for this to find gone-quiet"). There is nobody left
  // to link to, and approving would connect the sender to a scrubbed account.
  if (!(await liveAccount(env.DB, invite.claimed_by))) return notFound('No such pending invite');

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
export async function linkUsers(env: Env, one: string, two: string): Promise<void> {
  const [a, b] = orderPair(one, two);
  await env.DB.prepare(
    `INSERT INTO links (id, user_a, user_b, created_at, share_phone_a, share_phone_b)
     VALUES (?, ?, ?, ?, 0, 0)
     ON CONFLICT(user_a, user_b) DO UPDATE SET ended_at = NULL, ended_by = NULL`,
  ).bind(newId(), a, b, Date.now()).run();
}

/**
 * The LIVE link between two people, if any. An unlinked pair keeps its row as a
 * tombstone (`ended_at`), and that is not a link: treating it as one answered
 * "already linked" to a fresh invite from somebody you had unlinked, so the pair
 * could never be reconnected — while the list showed them as not linked at all.
 * `linkUsers` is what revives a tombstone, and only an approval reaches it.
 */
export function findLink(env: Env, x: string, y: string): Promise<LinkRow | null> {
  const [a, b] = orderPair(x, y);
  return env.DB.prepare(
    `SELECT id, user_a, user_b, created_at, share_phone_a, share_phone_b FROM links
      WHERE user_a = ? AND user_b = ? AND ended_at IS NULL`,
  ).bind(a, b).first<LinkRow>();
}

/**
 * Resolves the other person for one link.
 *
 * Their phone is included **only** if their own flag is on — read live, never
 * copied onto the viewer's row, so switching it off stops future reads.
 */
export async function toLinkDto(env: Env, link: LinkRow, viewerId: string, origin: string): Promise<LinkDto | null> {
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

export async function listLinks(request: Request, env: Env, url: URL): Promise<Response> {
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
export async function patchLink(request: Request, env: Env, id: string): Promise<Response> {
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
export async function deleteLink(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const result = await env.DB.prepare(
    `UPDATE links SET ended_at = ?, ended_by = ?
      WHERE id = ? AND (user_a = ? OR user_b = ?) AND ended_at IS NULL`,
  ).bind(Date.now(), auth.user.id, id, auth.user.id, auth.user.id).run();
  if ((result.meta?.changes ?? 0) === 0) return notFound('No such link');
  return json({ ok: true });
}
