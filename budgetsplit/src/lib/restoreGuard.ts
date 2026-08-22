/**
 * "A restore is happening — do not touch the database."
 *
 * The app holds **two** connections to `budgetsplit.db`: the root layout opens
 * one for its background maintenance, and `SQLiteProvider` opens another that
 * every screen uses. A restore runs on the second and takes it exclusively, which
 * protects it from everything except the first.
 *
 * That is not theoretical. A restore is started from a document picker or a share
 * sheet, and both of those *background the app* — so returning from one fires the
 * foreground handler, which runs four write paths on the other connection:
 * materializing recurring occurrences, savings maintenance, rescheduling
 * reminders and reaping attachments. Any of them can land in the middle of a
 * wipe-and-replace, writing rows into a half-empty database or taking the WAL
 * write lock and failing the restore outright.
 *
 * A module flag rather than anything cleverer, because both readers are in the
 * same JS context and the window is seconds long. It is deliberately not stored:
 * a crash mid-restore must not leave maintenance disabled forever.
 */

let restoring = false;

export function beginRestore(): void {
  restoring = true;
}

/**
 * Always call this from a `finally`. A restore that throws still has to release
 * the flag — leaving it set would silently stop recurring bills from posting for
 * the rest of the session, with no symptom pointing back here.
 */
export function endRestore(): void {
  restoring = false;
}

/** Background maintenance checks this before touching the other connection. */
export const isRestoring = (): boolean => restoring;
