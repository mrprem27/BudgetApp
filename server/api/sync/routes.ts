import {
  authenticate, badRequest, forbidden, json, methodNotAllowed, parseJsonObject, payloadTooLarge, unauthorized,
} from '../lib';
import type { Env } from '../types';
import { BUDGET_ENTITIES } from './entities/budgets';
import { GROUP_ENTITIES } from './entities/groups';
import { MEMBER_ENTITIES } from './entities/members';
import { APPROVAL_ENTITIES } from './entities/approvals';
import { MERGE_ENTITIES } from './entities/merges';
import { PERSONAL_ENTITIES } from './entities/personal';
import { TRANSACTION_ENTITIES } from './entities/transactions';
import { parsePull, pull } from './pull';
import { applyPush, ensureDevice, parsePush, type EntitySpec } from './push';

/** Every entity a push may carry. A dispute is never pushed: rejecting an approval raises it. */
export const ENTITIES: Record<string, EntitySpec> = {
  ...PERSONAL_ENTITIES, ...GROUP_ENTITIES, ...MEMBER_ENTITIES, ...BUDGET_ENTITIES, ...TRANSACTION_ENTITIES,
  ...APPROVAL_ENTITIES, ...MERGE_ENTITIES,
};

/** A push is at most 100 mutations; this bounds the body before parsing it. */
const MAX_PUSH_BYTES = 2 * 1024 * 1024;

/**
 * `/sync/push` and `/sync/pull` (SPEC-SERVER.md §3.2–3.3). Both are POST and
 * both need a session.
 */
export async function handleSync(request: Request, env: Env, path: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return methodNotAllowed('POST');
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();

  if (path === '/sync/push') {
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > MAX_PUSH_BYTES) return payloadTooLarge('Push is too large');
    const parsed = parsePush(await parseJsonObject(request));
    if (typeof parsed === 'string') return badRequest(parsed);

    const now = Date.now();
    const last = await ensureDevice(env.DB, auth.user.id, parsed.deviceId, now);
    if (last === null) return forbidden('That device is registered to another account');

    const lastMutationId = await applyPush(
      { db: env.DB, userId: auth.user.id, deviceId: parsed.deviceId, now },
      parsed.mutations, last, ENTITIES, { resumable: parsed.resumable },
    );
    // A receipt only. What happened to each mutation is read on the next pull.
    return json({ lastMutationId });
  }

  const parsed = parsePull(await parseJsonObject(request));
  if (typeof parsed === 'string') return badRequest(parsed);
  const last = await ensureDevice(env.DB, auth.user.id, parsed.deviceId, Date.now());
  if (last === null) return forbidden('That device is registered to another account');
  return json(await pull(env.DB, auth.user.id, parsed.deviceId, parsed.cursors, parsed.rejectionsAfter));
}
