import { authenticate, json, methodNotAllowed, notFound, unauthorized } from '../lib';
import type { Env } from '../types';
import { canReadScope } from './utils/access';

type Db = D1Database;

export type HistoryEntry = {
  version: number;
  editedAt: number;
  /** Account id of whoever saved this version. */
  editedBy: string;
  editorName: string | null;
  /** The whole bundle at this version, as the phone receives a transaction. */
  snapshot: Record<string, unknown>;
};

/**
 * A transaction's History (SPEC-SERVER.md §6.4): every saved version, oldest
 * first, readable by exactly the people who can read the transaction. Null when
 * it doesn't exist OR the caller can't read it — the two are indistinguishable
 * on purpose, so the endpoint can't be used to probe for ids.
 */
export async function transactionHistory(db: Db, userId: string, transactionId: string): Promise<HistoryEntry[] | null> {
  const t = await db.prepare('SELECT scope_id FROM transactions WHERE id = ?').bind(transactionId).first<{ scope_id: string }>();
  if (!t || !(await canReadScope(db, userId, t.scope_id))) return null;
  const { results } = await db.prepare(
    `SELECT h.version, h.snapshot, h.edited_at, h.edited_by, u.name AS editor_name
       FROM transaction_history h LEFT JOIN users u ON u.id = h.edited_by
      WHERE h.transaction_id = ? ORDER BY h.version`,
  ).bind(transactionId).all<{ version: number; snapshot: string; edited_at: number; edited_by: string; editor_name: string | null }>();
  return results.map(r => ({
    version: r.version, editedAt: r.edited_at, editedBy: r.edited_by, editorName: r.editor_name,
    snapshot: JSON.parse(r.snapshot) as Record<string, unknown>,
  }));
}

/** `GET /transactions/:id/history`. Loaded when a transaction is opened, never synced. */
export async function handleHistory(request: Request, env: Env, transactionId: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return methodNotAllowed('GET');
  const auth = await authenticate(request, env);
  if (!auth) return unauthorized();
  const entries = await transactionHistory(env.DB, auth.user.id, transactionId);
  return entries ? json({ entries }) : notFound();
}
