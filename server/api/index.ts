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
  authenticate,
  errorMessage,
  json,
  methodNotAllowed,
  notFound,
  unauthorized,
} from './utils/lib';
import {
  type Env,
} from './types';
import { mailProvider } from './utils/mailer';
import { storage } from './utils/storage';
import { handleSync, handleHistory } from './sync';
import { hubsOf } from './realtime/UserHub';
import { cleanupExpired } from './maintenance';
import { handleV1 } from './v1/routes';
import { requestLink, openLink, verifyLink, logout } from './auth/routes';
import { getMe, patchMe, deleteAccount, getAvatar, putAvatar } from './account/routes';
import { createInvite, listPendingClaims, openInvite, claimInvite, decideClaim, listLinks, patchLink, deleteLink } from './links/routes';
import { createFriendRequest, listFriendRequests, acceptFriendRequest, declineFriendRequest, cancelFriendRequest } from './links/friendRequests';

export { UserHub } from './realtime/UserHub';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      // Anything reaching here is a bug or an outage, not a client mistake —
      // answer 500 with a short detail rather than letting the runtime return
      // an opaque 1101 that tells the app nothing.
      const detail = errorMessage(err);
      return json({ error: 'Server error', detail: detail.slice(0, 300) }, 500);
    }
  },

  /** The nightly cron (`wrangler.toml` `[triggers]`). */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupExpired(env.DB, Date.now()));
  },
};

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    return handleSync(request, env, path, { hubs: hubsOf(env), waitUntil: p => ctx.waitUntil(p) });
  }
  // One live connection per open app (`DQ-108`): the user's hub says when to sync.
  if (path === '/sync/live') {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket upgrade' }, 426);
    const auth = await authenticate(request, env);
    if (!auth) return unauthorized();
    if (!env.USER_HUB) return json({ error: 'Live updates are not configured on this server.' }, 503);
    return env.USER_HUB.get(env.USER_HUB.idFromName(auth.user.id)).fetch(request);
  }
  const v1 = await handleV1(request, env, path, url);
  if (v1) return v1;
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
