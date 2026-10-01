import { authenticate, json, methodNotAllowed, notFound, unauthorized } from '../utils/lib';
import type { Env } from '../types';
import { groupLedger, listGroups, myBalances } from './read';

/** `/v1/*` (`DQ-104`): read-only, signed in. Null when the path is not one of these. */
export async function handleV1(request: Request, env: Env, path: string, url: URL): Promise<Response | null> {
  if (!path.startsWith('/v1/')) return null;
  if (request.method.toUpperCase() !== 'GET') return methodNotAllowed('GET');
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const user = auth.user.id;

  if (path === '/v1/groups') return json(await listGroups(env.DB, user));
  if (path === '/v1/me/balances') return json(await myBalances(env.DB, user));
  const ledger = /^\/v1\/groups\/([^/]+)\/transactions$/.exec(path);
  if (ledger) {
    const page = await groupLedger(env.DB, user, decodeURIComponent(ledger[1]), {
      before: url.searchParams.get('before'),
      limit: Number(url.searchParams.get('limit') ?? 50),
    });
    return page ? json(page) : notFound('No such group');
  }
  return notFound();
}
