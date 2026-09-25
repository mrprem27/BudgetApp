import { bumpScope, Rejected, SCOPE_SEQ, type CustomSpec, type Mutation, type PushContext } from '../utils/mutation';
import { requiresMyApproval } from '../rules';
import { activity } from './groups';

/**
 * Approvals and disputes (SPEC-SERVER.md §5, task S19): the trust model, moved to
 * the server and unchanged. An entry takes effect at once for whoever wrote it,
 * and waits for everyone else it names who has an account (AGENTS.md §13).
 *
 *   * WHETHER it waits is the app's own `requiresMyApproval`, imported, run
 *     against the recipient's trust in the author (per group first, then
 *     everywhere). "I paid you" — a settlement, or any entry naming them as a
 *     payer — always waits, whatever the trust (`DQ-28`).
 *   * An approval lives in the RECIPIENT's own scope: it is their decision.
 *   * Approve, reject and reopen are the recipient's mutations. A rejection
 *     raises a dispute in the group, which the author pulls (`DQ-07`).
 *   * The author deleting an entry I accepted doesn't unwind it on its own: the
 *     approval re-opens as a pending delete, and it keeps counting until I agree
 *     (`DQ-31`). One still waiting simply goes.
 */

type Share = { person_id: string; amount: number };

/** One recipient's approval row for a transaction. Deterministic, so a retry lands on the same row. */
export const approvalId = (txnId: string, userId: string) => `${txnId}:${userId}`;

/** The approval rows a written transaction needs — created, re-asked, or withdrawn. */
export async function approvalsForWrite(
  ctx: PushContext,
  t: { txnId: string; groupId: string; kind: string; payers: Share[]; splits: Share[]; authorPerson: string },
): Promise<D1PreparedStatement[]> {
  const { db, userId, now } = ctx;
  const named = [...new Set([...t.payers, ...t.splits].map(p => p.person_id))].filter(p => p !== t.authorPerson);
  const accounts = (await db.prepare(
    `SELECT id, user_id FROM people WHERE id IN (SELECT value FROM json_each(?)) AND user_id IS NOT NULL AND user_id <> ?`,
  ).bind(JSON.stringify(named), userId).all<{ id: string; user_id: string }>()).results ?? [];

  const out: D1PreparedStatement[] = [];
  for (const r of accounts) out.push(...(await askOne(ctx, t, r)));

  // Someone the edit no longer names has nothing left to decide.
  const stillNamed = new Set(accounts.map(a => a.user_id));
  const gone = (await db.prepare('SELECT user_id FROM approvals WHERE transaction_id = ? AND deleted_at IS NULL')
    .bind(t.txnId).all<{ user_id: string }>()).results?.filter(a => !stillNamed.has(a.user_id)) ?? [];
  for (const g of gone) out.push(...withdraw(ctx, t.txnId, g.user_id));
  return out;
}

/**
 * Ask one account holder about one transaction: pending, or approved at once when
 * their trust in its author says so. Every write re-asks: a changed entry is a new
 * question, and the previous answer was to a different one. A previous "no" is
 * the exception to trust: it comes back as pending, never approved (MW-22).
 */
export async function askOne(
  ctx: PushContext,
  t: { txnId: string; groupId: string; kind: string; payers: Share[]; authorPerson: string },
  r: { id: string; user_id: string },
): Promise<D1PreparedStatement[]> {
  const { db, userId, now } = ctx;
  const trust = (await db.prepare(
    `SELECT group_id, level FROM trust_settings
      WHERE user_id = ? AND person_id = ? AND deleted_at IS NULL AND (group_id IS NULL OR group_id = ?)`,
  ).bind(r.user_id, t.authorPerson, t.groupId).all<{ group_id: string | null; level: string }>()).results ?? [];
  const waits = requiresMyApproval(
    { is_me: 0, remote_uid: t.authorPerson, trust_state: trust.find(x => x.group_id === null)?.level ?? 'review' },
    { kind: t.kind as 'expense' | 'income' | 'settlement', touchesMe: true, assertsIPaid: t.payers.some(p => p.person_id === r.id) },
    trust.find(x => x.group_id === t.groupId)?.level ?? null,
  );
  const status = waits ? 'pending' : 'approved';
  // A refusal outranks trust (MW-22). Trust decides whether a NEW entry waits;
  // once I have said no, an edit is a new question to me, never an override.
  const refusedBefore = `approvals.status = 'rejected' AND excluded.status = 'approved'`;
  return [
    db.prepare("INSERT OR IGNORE INTO sync_scopes (id, kind, seq, created_at) VALUES (?, 'user', 0, ?)").bind(r.user_id, now),
    bumpScope(ctx, r.user_id),
    db.prepare(
      `INSERT INTO approvals (id, scope_id, version, seq, created_at, updated_at, created_by, updated_by,
                              transaction_id, user_id, status, arrived_at, decided_at)
       VALUES (?, ?, 1, ${SCOPE_SEQ}, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         status = CASE WHEN ${refusedBefore} THEN 'pending' ELSE excluded.status END,
         decided_at = CASE WHEN ${refusedBefore} THEN NULL ELSE excluded.decided_at END,
         is_pending_delete = 0, deleted_at = NULL, arrived_at = excluded.arrived_at,
         version = approvals.version + 1, seq = excluded.seq, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).bind(approvalId(t.txnId, r.user_id), r.user_id, r.user_id, now, now, userId, userId, t.txnId, r.user_id,
      status, now, waits ? null : now),
  ];
}

function withdraw(ctx: PushContext, txnId: string, recipient: string): D1PreparedStatement[] {
  return [
    bumpScope(ctx, recipient),
    ctx.db.prepare(`UPDATE approvals SET deleted_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
                     WHERE id = ?`).bind(ctx.now, recipient, ctx.now, ctx.userId, approvalId(txnId, recipient)),
  ];
}

/**
 * The author deleted the transaction. An approval still waiting goes with it; one
 * I had accepted re-opens as a pending delete — the entry keeps counting until I
 * agree it's gone (`DQ-31`).
 */
export async function approvalsForDelete(ctx: PushContext, txnId: string): Promise<D1PreparedStatement[]> {
  const rows = (await ctx.db.prepare('SELECT user_id, status FROM approvals WHERE transaction_id = ? AND deleted_at IS NULL')
    .bind(txnId).all<{ user_id: string; status: string }>()).results ?? [];
  const out: D1PreparedStatement[] = [];
  for (const r of rows) {
    if (r.status !== 'approved') { out.push(...withdraw(ctx, txnId, r.user_id)); continue; }
    out.push(
      bumpScope(ctx, r.user_id),
      ctx.db.prepare(`UPDATE approvals SET is_pending_delete = 1, status = 'pending', decided_at = NULL, arrived_at = ?,
                        version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ? WHERE id = ?`)
        .bind(ctx.now, r.user_id, ctx.now, ctx.userId, approvalId(txnId, r.user_id)),
    );
  }
  return out;
}

/** My answer to someone else's entry: approve, reject, or reopen (take it back to undecided). */
async function writeApproval(ctx: PushContext, m: Mutation): Promise<D1PreparedStatement[]> {
  const { db, userId, now } = ctx;
  if (m.op === 'delete') throw new Rejected('invalid', 'approvals: answer, don’t delete');
  const a = await db.prepare(
    `SELECT a.user_id, a.status, a.is_pending_delete, a.deleted_at, a.transaction_id,
            t.group_id, t.version AS txn_version
       FROM approvals a JOIN transactions t ON t.id = a.transaction_id WHERE a.id = ?`,
  ).bind(m.entityId).first<{
    user_id: string; status: string; is_pending_delete: number; deleted_at: number | null;
    transaction_id: string; group_id: string; txn_version: number;
  }>();
  if (!a || a.deleted_at !== null) throw new Rejected('not_found', 'There is nothing to decide here any more');
  if (a.user_id !== userId) throw new Rejected('forbidden', 'Only the person asked can answer');
  const answer = m.data?.status;
  if (answer !== 'approved' && answer !== 'rejected' && answer !== 'pending') throw new Rejected('invalid', 'approvals: approved, rejected or pending');
  const pay = typeof m.data?.landed_pay_method === 'string' ? m.data.landed_pay_method : null;

  // A retraction: agreeing lets it go; refusing keeps the entry counting, as it was.
  if (a.is_pending_delete === 1 && answer !== 'pending') {
    return [
      bumpScope(ctx, userId),
      answer === 'approved'
        ? db.prepare(`UPDATE approvals SET deleted_at = ?, decided_at = ?, version = version + 1, seq = ${SCOPE_SEQ},
                        updated_at = ?, updated_by = ? WHERE id = ?`).bind(now, now, userId, now, userId, m.entityId)
        : db.prepare(`UPDATE approvals SET is_pending_delete = 0, status = 'approved', decided_at = ?, version = version + 1,
                        seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ? WHERE id = ?`).bind(now, userId, now, userId, m.entityId),
    ];
  }

  const disputeId = approvalId(a.transaction_id, userId);
  const out: D1PreparedStatement[] = [
    bumpScope(ctx, userId),
    db.prepare(`UPDATE approvals SET status = ?, decided_at = ?, landed_pay_method = COALESCE(?, landed_pay_method),
                  version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ? WHERE id = ?`)
      .bind(answer, answer === 'pending' ? null : now, pay, userId, now, userId, m.entityId),
    bumpScope(ctx, a.group_id),
  ];
  if (answer === 'rejected') {
    // The objection travels to the author, in the group (`DQ-07`).
    out.push(
      db.prepare(
        `INSERT INTO disputes (id, scope_id, version, seq, created_at, updated_at, created_by, updated_by,
                               group_id, transaction_id, user_id, transaction_version, raised_at)
         VALUES (?, ?, 1, ${SCOPE_SEQ}, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET withdrawn_at = NULL, raised_at = excluded.raised_at,
           transaction_version = excluded.transaction_version, deleted_at = NULL,
           version = disputes.version + 1, seq = excluded.seq, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      ).bind(disputeId, a.group_id, a.group_id, now, now, userId, userId, a.group_id, a.transaction_id, userId, a.txn_version, now),
      activity(ctx, a.group_id, 'txn', a.transaction_id, 'updated', 'Said this isn’t right', null, m.data),
    );
  } else {
    // Approving or reopening withdraws any objection I had raised.
    out.push(
      db.prepare(`UPDATE disputes SET withdrawn_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
                   WHERE id = ? AND withdrawn_at IS NULL`).bind(now, a.group_id, now, userId, disputeId),
      activity(ctx, a.group_id, 'txn', a.transaction_id, 'updated', answer === 'approved' ? 'Accepted a transaction' : 'Took back an answer', null, m.data),
    );
  }
  return out;
}

export const APPROVAL_ENTITIES: Record<string, CustomSpec> = {
  approvals: { table: 'approvals', money: false, custom: writeApproval },
};
