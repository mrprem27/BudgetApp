import { canRead, ensurePerson, liveAccount, meOf, myPersonId } from '../utils/access';
import { bumpScope, Rejected, SCOPE_SEQ, type CustomSpec, type Mutation, type PushContext } from '../utils/mutation';
import { askOne } from './approvals';

/**
 * A friend with no account turns out to be an account (SPEC-SERVER.md §2.2, S21) —
 * OR two placeholders turn out to be the same human, picked by hand ("Same person
 * as…", `DQ-94` part 2). Either way one person folds INTO the other, never the
 * other way round, with every reference re-pointed in one batch:
 *
 *   * memberships move, keeping their status: the placeholder was already in the
 *     group, and the account consented to me by linking;
 *   * payers, splits and itemised lines move, and every entry that changed is
 *     re-sent to every phone (a version bump), so nobody keeps a split naming a
 *     ghost; the account is asked about each, as for any entry that names them;
 *   * trust, budget lines and friend rows move for whoever held them.
 *
 * `into_user` (a placeholder becomes an account it's linked with) and
 * `into_person` (two placeholders picked by hand) are different consents:
 *
 *   * `into_user` — whoever made the placeholder, or shares a group with it — and
 *     only into an account they have a live link with. Linking is the consent;
 *     without it anyone could attach strangers' money to an account.
 *   * `into_person` — both people must be mine to connect: whoever made each one,
 *     or shares a group with each. No account is involved, so no link check —
 *     it's still refused for a stranger's placeholder on either side.
 *
 * A placeholder the server never saw is nothing to merge: acknowledged, no write.
 */

type Named = { transaction_id: string; group_id: string; kind: string; author_id: string; author_user: string | null };

/** Whoever made this placeholder, or shares a readable group with it — the one authority check, on either side of a merge. */
async function mayConnect(ctx: PushContext, personId: string, createdBy: string): Promise<boolean> {
  if (createdBy === ctx.userId) return true;
  const groups = (await ctx.db.prepare(
    'SELECT DISTINCT group_id FROM group_members WHERE person_id = ? AND deleted_at IS NULL',
  ).bind(personId).all<{ group_id: string }>()).results?.map(r => r.group_id) ?? [];
  for (const g of groups) if (await canRead(ctx, g)) return true;
  return false;
}

async function writeMerge(ctx: PushContext, m: Mutation): Promise<D1PreparedStatement[]> {
  const { db, userId, now } = ctx;
  if (m.op === 'delete') throw new Rejected('invalid', 'person_merges: a merge is never undone');
  const from = m.entityId;
  const intoUser = typeof m.data?.into_user === 'string' ? m.data.into_user : null;
  const intoPerson = typeof m.data?.into_person === 'string' ? m.data.into_person : null;
  if (!intoUser && !intoPerson) throw new Rejected('invalid', 'person_merges: into_user or into_person is required');

  const placeholder = await db.prepare('SELECT user_id, merged_into, created_by FROM people WHERE id = ?')
    .bind(from).first<{ user_id: string | null; merged_into: string | null; created_by: string }>();
  if (!placeholder) return [];
  const into = intoUser ? await myPersonId(db, intoUser) : intoPerson!;
  if (placeholder.merged_into === into || from === into) return [];
  if (placeholder.user_id !== null || placeholder.merged_into !== null) {
    throw new Rejected('invalid', 'That person is already someone else');
  }

  if (intoUser) {
    if (into === (await meOf(ctx))) throw new Rejected('invalid', 'You can’t connect someone to your own account');
    if (!(await liveAccount(db, intoUser))) {
      throw new Rejected('not_found', 'No account with that id');
    }
    const [a, b] = userId < intoUser ? [userId, intoUser] : [intoUser, userId];
    if (!(await db.prepare('SELECT 1 AS n FROM links WHERE user_a = ? AND user_b = ? AND ended_at IS NULL').bind(a, b).first())) {
      throw new Rejected('forbidden', 'You can only connect someone to an account you’re linked with');
    }
  } else {
    const target = await db.prepare('SELECT user_id, merged_into, created_by FROM people WHERE id = ?')
      .bind(into).first<{ user_id: string | null; merged_into: string | null; created_by: string }>();
    if (!target) return [];
    if (target.user_id !== null) throw new Rejected('invalid', 'person_merges: into_person names an account; use into_user');
    if (target.merged_into !== null) throw new Rejected('invalid', 'That person is already someone else');
    if (!(await mayConnect(ctx, into, target.created_by))) throw new Rejected('forbidden', 'That person isn’t yours to connect');
  }

  const groups = (await db.prepare(
    'SELECT DISTINCT group_id FROM group_members WHERE person_id = ? AND deleted_at IS NULL',
  ).bind(from).all<{ group_id: string }>()).results?.map(r => r.group_id) ?? [];
  let mine = placeholder.created_by === userId;
  for (const g of groups) if (!mine && (await canRead(ctx, g))) mine = true;
  if (!mine) throw new Rejected('forbidden', 'That person isn’t yours to connect');

  // Every entry that names the placeholder, read before anything moves.
  const named = (await db.prepare(
    `SELECT DISTINCT t.id AS transaction_id, t.group_id, t.kind, t.author_id, p.user_id AS author_user
       FROM transactions t JOIN people p ON p.id = t.author_id
      WHERE t.deleted_at IS NULL AND t.id IN (
        SELECT transaction_id FROM transaction_payers WHERE person_id = ?1
        UNION SELECT transaction_id FROM transaction_splits WHERE person_id = ?1)`,
  ).bind(from).all<Named>()).results ?? [];

  const out: D1PreparedStatement[] = [
    ensurePerson(db, into, intoUser, userId, now),
    db.prepare('UPDATE people SET merged_into = ? WHERE id = ?').bind(into, from),
  ];

  // --- memberships ------------------------------------------------------------------
  for (const g of groups) {
    out.push(
      bumpScope(ctx, g),
      db.prepare(
        `INSERT OR IGNORE INTO group_members
           (id, scope_id, version, seq, created_at, updated_at, created_by, updated_by, group_id, person_id,
            display_name, avatar_color, role, status, joined_at, left_at, invited_by)
         SELECT ? || ':' || ?, scope_id, 1, ${SCOPE_SEQ}, created_at, ?, created_by, ?, group_id, ?,
                display_name, avatar_color, role, status, joined_at, left_at, invited_by
           FROM group_members WHERE group_id = ? AND person_id = ?`,
      ).bind(g, into, g, now, userId, into, g, from),
      db.prepare(`UPDATE group_members SET deleted_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
                   WHERE group_id = ? AND person_id = ?`).bind(now, g, now, userId, g, from),
    );
  }

  // --- money: payers, splits, items — folded into the account's row where both exist
  for (const table of ['transaction_payers', 'transaction_splits'] as const) {
    out.push(
      db.prepare(
        `UPDATE ${table} SET amount = amount + (SELECT x.amount FROM ${table} x WHERE x.transaction_id = ${table}.transaction_id AND x.person_id = ?1)
          WHERE person_id = ?2 AND transaction_id IN (SELECT transaction_id FROM ${table} WHERE person_id = ?1)`,
      ).bind(from, into),
      db.prepare(`DELETE FROM ${table} WHERE person_id = ?1 AND transaction_id IN (SELECT transaction_id FROM ${table} WHERE person_id = ?2)`)
        .bind(from, into),
      db.prepare(`UPDATE ${table} SET person_id = ?2 WHERE person_id = ?1`).bind(from, into),
    );
  }
  out.push(db.prepare(
    `UPDATE transaction_items SET assigned_to = replace(assigned_to, '"' || ?1 || '"', '"' || ?2 || '"')
      WHERE instr(assigned_to, '"' || ?1 || '"') > 0`,
  ).bind(from, into));
  for (const t of named) {
    out.push(
      bumpScope(ctx, t.group_id),
      db.prepare(`UPDATE transactions SET version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ? WHERE id = ?`)
        .bind(t.group_id, now, t.transaction_id),
    );
    // Now it names them, so they're asked — unless it's theirs, or there's nobody
    // to ask (into_person: two placeholders, neither with an account).
    if (intoUser && t.author_user !== intoUser) {
      const payers = (await db.prepare('SELECT person_id, amount FROM transaction_payers WHERE transaction_id = ?')
        .bind(t.transaction_id).all<{ person_id: string; amount: number }>()).results ?? [];
      out.push(...(await askOne(ctx, {
        txnId: t.transaction_id, groupId: t.group_id, kind: t.kind, authorPerson: t.author_id,
        payers: payers.map(p => ({ ...p, person_id: p.person_id === from ? into : p.person_id })),
      }, { id: into, user_id: intoUser })));
    }
  }

  // --- whoever held a trust setting, a budget line or a friend row for them --------
  const holders = async (table: string, scopeCol: string) =>
    (await db.prepare(`SELECT DISTINCT ${scopeCol} AS s FROM ${table} WHERE person_id = ? AND deleted_at IS NULL`)
      .bind(from).all<{ s: string }>()).results?.map(r => r.s) ?? [];
  for (const u of await holders('trust_settings', 'user_id')) {
    out.push(
      bumpScope(ctx, u),
      db.prepare(
        `INSERT OR IGNORE INTO trust_settings (id, scope_id, version, seq, created_at, updated_at, created_by, updated_by,
                                               user_id, person_id, group_id, level)
         SELECT user_id || ':' || ?1 || ':' || COALESCE(group_id, '*'), scope_id, 1, ${SCOPE_SEQ.replace('?', '?2')}, ?3, ?3, ?4, ?4,
                user_id, ?1, group_id, level
           FROM trust_settings t WHERE user_id = ?2 AND person_id = ?5 AND deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM trust_settings x WHERE x.user_id = t.user_id AND x.person_id = ?1
                              AND x.group_id IS t.group_id AND x.deleted_at IS NULL)`,
      ).bind(into, u, now, userId, from),
      db.prepare(`UPDATE trust_settings SET deleted_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
                   WHERE user_id = ? AND person_id = ? AND deleted_at IS NULL`).bind(now, u, now, userId, u, from),
    );
  }
  for (const g of await holders('budgets', 'group_id')) {
    out.push(
      bumpScope(ctx, g),
      db.prepare(
        `INSERT OR IGNORE INTO budgets (id, scope_id, version, seq, created_at, updated_at, created_by, updated_by,
                                        group_id, category, cadence, amount, person_id)
         SELECT group_id || ':' || category || ':' || ?1, scope_id, 1, ${SCOPE_SEQ.replace('?', '?2')}, ?3, ?3, ?4, ?4,
                group_id, category, cadence, amount, ?1
           FROM budgets b WHERE group_id = ?2 AND person_id = ?5 AND deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM budgets x WHERE x.group_id = b.group_id AND x.category = b.category
                              AND x.person_id = ?1 AND x.deleted_at IS NULL)`,
      ).bind(into, g, now, userId, from),
      db.prepare(`UPDATE budgets SET deleted_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
                   WHERE group_id = ? AND person_id = ? AND deleted_at IS NULL`).bind(now, g, now, userId, g, from),
    );
  }
  for (const u of await holders('friends', 'user_id')) {
    out.push(
      bumpScope(ctx, u),
      db.prepare(
        `INSERT OR IGNORE INTO friends (id, scope_id, version, seq, created_at, updated_at, created_by, updated_by, user_id, person_id,
                                        name, avatar_color, mobile, email, upi_vpa, receivable_status, receivable_status_at, is_archived)
         SELECT user_id || ':' || ?1, scope_id, 1, ${SCOPE_SEQ.replace('?', '?2')}, ?3, ?3, ?4, ?4, user_id, ?1,
                name, avatar_color, mobile, email, upi_vpa, receivable_status, receivable_status_at, is_archived
           FROM friends WHERE user_id = ?2 AND person_id = ?5 AND deleted_at IS NULL`,
      ).bind(into, u, now, userId, from),
      db.prepare(`UPDATE friends SET deleted_at = ?, version = version + 1, seq = ${SCOPE_SEQ}, updated_at = ?, updated_by = ?
                   WHERE user_id = ? AND person_id = ? AND deleted_at IS NULL`).bind(now, u, now, userId, u, from),
    );
  }
  return out;
}

export const MERGE_ENTITIES: Record<string, CustomSpec> = {
  // `table` is only read to explain a tripped guard, and a merge sets none; what
  // it mostly moves is memberships.
  person_merges: { table: 'group_members', money: false, custom: writeMerge },
};
