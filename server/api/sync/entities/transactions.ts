import { canReadScope, myPersonId } from '../utils/access';
import { guard, versionIs } from '../utils/guard';
import { bumpScope, clean, createdAt, Rejected, SCOPE_SEQ, type CustomSpec, type Mutation, type PushContext } from '../utils/mutation';
import { validateShares } from '../rules';
import { activity } from './groups';
import { transactionBundle } from '../pull';
import { approvalsForDelete, approvalsForWrite } from './approvals';

/**
 * One transaction, written as ONE bundle: the row, its payers, splits, items,
 * tags and repeat rule, validated together and committed in one D1 batch
 * (SPEC-SERVER.md §2.7). The children never change apart from their parent.
 *
 * What the server enforces, whatever a client sends:
 *   * the author is the session's own person — a body cannot claim to be anyone;
 *   * only the author may send a new version or delete it (SYNC-F15, DQ-96);
 *   * amount > 0, Σ payers = amount, and `validateShares` — the app's own function;
 *   * every payer and split is an ACTIVE member of the group, checked inside the batch;
 *   * compare-and-set on `version`: never silent last-write-wins on money (SYNC-F3);
 *   * income and asset movements only in a personal group (a schema trigger);
 *   * a transaction never moves between groups — that is a delete plus a create.
 *
 *   * everyone else it names who has an account gets an approval, decided by the
 *     app's own trust rules (`approvals.ts`, S19) — it counts for the author at
 *     once and for nobody else until they say so.
 */

const COLUMNS = [
  'group_id', 'kind', 'entry_mode', 'amount', 'date', 'timezone', 'category', 'note', 'pay_method', 'source',
  'currency', 'asset_id', 'latitude', 'longitude', 'place_label', 'adjustments', 'recurring_rule_id', 'occurrence_date',
] as const;
const RULE_COLUMNS = ['frequency', 'interval', 'ends_at', 'status', 'mode', 'paused_at'] as const;
const ITEM_COLUMNS = ['id', 'name', 'quantity', 'unit_price', 'assigned_to', 'split_mode', 'split_values'] as const;

type Share = { person_id: string; amount: number };

function shares(raw: unknown, label: string): Share[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Rejected('invalid', `transactions.${label}: a list is required`);
  return raw.map(r => {
    const x = r as Record<string, unknown>;
    if (typeof x.person_id !== 'string' || !x.person_id) throw new Rejected('invalid', `transactions.${label}: person_id is required`);
    if (!Number.isInteger(x.amount) || (x.amount as number) <= 0) {
      throw new Rejected('invalid', `transactions.${label}: every amount is a positive whole number of paise`);
    }
    return { person_id: x.person_id, amount: x.amount as number };
  });
}

async function writeTransaction(ctx: PushContext, m: Mutation): Promise<D1PreparedStatement[]> {
  const { db, userId, now } = ctx;
  const id = m.entityId;
  const me = await myPersonId(db, userId);
  const existing = await db.prepare('SELECT group_id, author_id, version, deleted_at, kind, amount FROM transactions WHERE id = ?')
    .bind(id).first<{ group_id: string; author_id: string; version: number; deleted_at: number | null; kind: string; amount: number }>();

  const groupId = m.op === 'delete' ? existing?.group_id : (m.data ?? {}).group_id;
  if (typeof groupId !== 'string' || !groupId) throw new Rejected(existing ? 'invalid' : 'not_found', 'transactions.group_id is required');
  if (!(await canReadScope(db, userId, groupId))) throw new Rejected('forbidden', 'transactions: not a member of that group');

  if (existing) {
    if (existing.author_id !== me) throw new Rejected('forbidden', "Only the person who wrote a transaction can change it");
    if (existing.group_id !== groupId) throw new Rejected('invalid', 'A transaction never moves between groups — delete it and add it again');
  }

  const fences = [
    // The writer is an active member, and it is still their transaction to change.
    guard(db, `EXISTS (SELECT 1 FROM group_members WHERE group_id = ? AND person_id = ? AND status = 'active' AND deleted_at IS NULL)`, groupId, me),
    guard(db, 'NOT EXISTS (SELECT 1 FROM transactions WHERE id = ? AND author_id <> ?)', id, me),
    versionIs(db, 'transactions', id, m.baseVersion),
  ];

  if (m.op === 'delete') {
    if (!existing || existing.deleted_at !== null) throw new Rejected('not_found', 'transactions: nothing to delete');
    return [
      ...fences,
      bumpScope(ctx, groupId),
      db.prepare(`UPDATE transactions SET deleted_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
                   WHERE id = ?`).bind(now, groupId, now, userId, id),
      history(ctx, id, existing.version + 1, { id, deleted: true }),
      ...(await approvalsForDelete(ctx, id)),
      activity(ctx, groupId, existing.kind === 'settlement' ? 'settlement' : 'txn', id, 'deleted', 'Deleted a transaction', existing.amount, m.data),
    ];
  }

  const raw = m.data ?? {};
  const data = clean('transactions', COLUMNS, raw);
  if (!Number.isInteger(data.amount) || (data.amount as number) <= 0) {
    throw new Rejected('invalid', 'transactions.amount is a positive whole number of paise');
  }
  const amount = data.amount as number;
  const payers = shares(raw.payers, 'payers');
  const splits = shares(raw.splits, 'splits');
  /*
   * The shapes the app writes (`DQ-26`, AGENTS §12): an expense has both sides;
   * income is paid in and consumed by nobody, so it has no splits; a transfer can
   * be one-sided — money into an asset has no splits, money out of one has no
   * payers. Whichever sides exist must add up to the amount.
   */
  const kind = String(data.kind ?? existing?.kind ?? 'expense');
  const required = kind === 'expense' ? ['payers', 'splits'] : kind === 'income' ? ['payers'] : [];
  if (required.includes('payers') && payers.length === 0) throw new Rejected('invalid', 'transactions.payers: at least one is required');
  if (required.includes('splits') && splits.length === 0) throw new Rejected('invalid', 'transactions.splits: at least one is required');
  if (payers.length === 0 && splits.length === 0) throw new Rejected('invalid', 'transactions: a payer or a split is required');
  if (payers.length > 0 && payers.reduce((a, p) => a + p.amount, 0) !== amount) {
    throw new Rejected('invalid', 'transactions: payers must add up to the amount');
  }
  if (splits.length > 0 && !validateShares(amount, splits.map(s => ({ personId: s.person_id, amount: s.amount }))).ok) {
    throw new Rejected('invalid', 'transactions: splits must add up to the amount');
  }
  const people = [...new Set([...payers, ...splits].map(p => p.person_id))];
  // Invited counts: adding a friend and splitting the bill with them is one
  // motion, and on the adder's phone they are already a member. Their consent is
  // still theirs — they read nothing until they accept, and an entry naming them
  // waits for their approval like any other. Someone who left or was removed
  // can't be named.
  fences.push(guard(db,
    `NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE j.value NOT IN
       (SELECT person_id FROM group_members WHERE group_id = ? AND status IN ('active', 'invited') AND deleted_at IS NULL))`,
    JSON.stringify(people), groupId));

  const tags = Array.isArray(raw.tags) ? [...new Set(raw.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0))] : [];
  const items = Array.isArray(raw.items) ? raw.items.map(i => clean('transaction_items', ITEM_COLUMNS, i as Record<string, unknown>)) : [];
  const rule = raw.recurrence && typeof raw.recurrence === 'object'
    ? clean('recurring_rules', RULE_COLUMNS, raw.recurrence as Record<string, unknown>) : null;
  const skips = rule && Array.isArray(raw.skips) ? raw.skips.filter((d): d is number => Number.isInteger(d)) : [];

  const cols = Object.keys(data);
  const version = (existing?.version ?? 0) + 1;
  const write = existing
    ? db.prepare(`UPDATE transactions SET ${[...cols.map(c => `${c} = ?`), 'deleted_at = NULL', 'version = version + 1',
        `seq = ${SCOPE_SEQ}`, 'updated_at = ?', 'updated_by = ?'].join(', ')} WHERE id = ?`)
      .bind(...cols.map(c => data[c]), groupId, now, userId, id)
    : (() => {
      const all = ['id', 'scope_id', 'version', 'created_at', 'updated_at', 'created_by', 'updated_by', 'author_id', ...cols];
      return db.prepare(`INSERT INTO transactions (${all.join(', ')}, seq) VALUES (${all.map(() => '?').join(', ')}, ${SCOPE_SEQ})`)
        .bind(id, groupId, 1, createdAt(raw, now), now, userId, userId, me, ...cols.map(c => data[c]), groupId);
    })();

  const approvals = await approvalsForWrite(ctx, {
    txnId: id, groupId, kind: String(data.kind ?? existing?.kind ?? 'expense'), payers, splits, authorPerson: me,
  });

  const statements: D1PreparedStatement[] = [
    ...fences,
    bumpScope(ctx, groupId),
    write,
    // Children are replaced wholesale, as the phone's own edit path does.
    db.prepare('DELETE FROM transaction_payers WHERE transaction_id = ?').bind(id),
    db.prepare('DELETE FROM transaction_splits WHERE transaction_id = ?').bind(id),
    db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').bind(id),
    db.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').bind(id),
    ...payers.map(p => db.prepare('INSERT INTO transaction_payers (transaction_id, person_id, amount) VALUES (?, ?, ?)').bind(id, p.person_id, p.amount)),
    ...splits.map(s => db.prepare('INSERT INTO transaction_splits (transaction_id, person_id, amount) VALUES (?, ?, ?)').bind(id, s.person_id, s.amount)),
    ...items.map(i => {
      const ic = Object.keys(i);
      return db.prepare(`INSERT INTO transaction_items (transaction_id, ${ic.join(', ')}) VALUES (?, ${ic.map(() => '?').join(', ')})`)
        .bind(id, ...ic.map(c => i[c]));
    }),
    ...tags.map((t, i) => db.prepare('INSERT INTO transaction_tags (transaction_id, tag, position) VALUES (?, ?, ?)').bind(id, t, i)),
  ];
  if (rule) {
    const rc = Object.keys(rule);
    statements.push(
      // An upsert, never a delete-and-insert: occurrences reference the rule.
      db.prepare(`INSERT INTO recurring_rules (transaction_id, ${rc.join(', ')}) VALUES (?, ${rc.map(() => '?').join(', ')})
                  ON CONFLICT (transaction_id) DO UPDATE SET ${rc.map(c => `${c} = excluded.${c}`).join(', ')}`)
        .bind(id, ...rc.map(c => rule[c])),
      db.prepare('DELETE FROM recurring_skips WHERE rule_id = ?').bind(id),
      ...skips.map(d => db.prepare('INSERT INTO recurring_skips (rule_id, occurrence_date, created_at) VALUES (?, ?, ?)').bind(id, d, now)),
    );
  }
  statements.push(
    history(ctx, id, version, { id, ...data, author_id: existing?.author_id ?? me, payers, splits, items, tags, recurrence: rule, skips }),
    activity(ctx, groupId, data.kind === 'settlement' ? 'settlement' : 'txn', id, existing ? 'updated' : 'created',
      existing ? 'Changed a transaction' : 'Added a transaction', amount, raw),
    // After the row: an approval references the transaction.
    ...approvals,
  );
  return statements;
}

/** A snapshot of the bundle at this version, for the transaction's History. */
function history(ctx: PushContext, transactionId: string, version: number, snapshot: unknown): D1PreparedStatement {
  return ctx.db.prepare(
    `INSERT INTO transaction_history (id, transaction_id, version, snapshot, edited_by, edited_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(`${transactionId}:v${version}`, transactionId, version, JSON.stringify(snapshot), ctx.userId, ctx.now);
}

/** Why a guard tripped: not yours, not a member, a stranger in the split, or a stale version. */
async function diagnose(ctx: PushContext, m: Mutation): Promise<Rejected> {
  const { db, userId } = ctx;
  const me = await myPersonId(db, userId);
  const row = await db.prepare('SELECT * FROM transactions WHERE id = ?').bind(m.entityId).first<Record<string, unknown>>();
  if (row && row.author_id !== me) return new Rejected('forbidden', 'Only the person who wrote a transaction can change it');
  if (row && row.version !== m.baseVersion) {
    return new Rejected('conflict', 'transactions: changed on another device', await transactionBundle(db, row));
  }
  if (!row && m.baseVersion !== 0) return new Rejected('not_found', 'transactions: nothing to update');
  return new Rejected('forbidden', 'transactions: everyone named must be in the group');
}

export const TRANSACTION_ENTITIES: Record<string, CustomSpec> = {
  transactions: { table: 'transactions', money: true, custom: writeTransaction, diagnose },
};
