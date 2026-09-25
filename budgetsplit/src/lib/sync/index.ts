/**
 * The sync client's public surface (SPEC-SERVER.md §3.4).
 *
 * Screens and providers reach the engine through this one file rather than
 * individual modules below, so the internal layout can change without touching
 * call sites. All SQL for this feature lives in `src/db/queries/{syncQueue,
 * syncApply}.ts` (AGENTS.md's data-access rule); everything here is pure or
 * network orchestration.
 *
 * Layout:
 *   ids.ts      deterministic ids shared with the server (imported by the Worker too)
 *   rowMap.ts   the phone's rows ⇄ the server's rows, in both directions
 *   engine.ts   syncOnce: push the queue, pull, apply — network-injected for tests
 *   firstSignIn.ts  the first sign-in: upload, restore or ask — network-injected for tests
 *   signOut.ts  sign-out: upload first, then empty the phone
 *   run.ts      the app's entry point: the real transport, debounce, one-at-a-time
 */

export {
  runSync, scheduleSync, decideFirstSignInNow, uploadNow, restoreNow, planSignOutNow, wipeForSignOutNow,
  syncActivity, classifySyncError, type SyncActivity, type SyncFailure,
} from './run';
export type { SignOutPlan } from './signOut';
export { FirstSignInError, type FirstSignInCase, type Account } from './firstSignIn';
export { syncOnce, hasPendingChanges, type SyncOutcome, type Transport } from './engine';
export { selfPersonId, syncIds, isSyncedPreference } from './ids';
export type { Vanished } from '../../db/queries/syncApply';
