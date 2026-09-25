/**
 * The sync API's public surface (SPEC-SERVER.md).
 *
 * `server/api/index.ts` (the Worker's router) reaches everything here through
 * this one file, rather than importing from individual sync/ modules directly —
 * so the internal layout below can change without touching the router.
 *
 * Layout:
 *   utils/      access control, D1 write-guards, shared mutation plumbing
 *   entities/   one file per entity family, each exporting a Record<string, EntitySpec>
 *   rules.ts    the app's own pure logic (splitMath, trust, permissions), imported — never re-implemented
 *   push.ts     POST /sync/push — apply a batch of mutations
 *   pull.ts     POST /sync/pull — everything changed since a cursor
 *   routes.ts   the route handler that ties push + pull to a request
 *   history.ts  GET /transactions/:id/history — a transaction's saved versions
 */

export { handleSync, ENTITIES } from './routes';
export { handleHistory, type HistoryEntry } from './history';
export { eraseAccount } from './erase';

export type { Mutation, EntitySpec, PushContext } from './push';
export type { PulledScope, PullResult } from './pull';
export type { GroupContext } from './rules';
