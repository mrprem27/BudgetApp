import type { Db } from './utils/access';

/**
 * Deleting an account erases its copy of the ledger (S22, `B-09`).
 *
 * v1 could promise that deleting an account left nothing readable behind,
 * because nothing readable was ever sent. Since `DQ-93` the account holds a real
 * copy of everything, so deleting it has to take that copy with it — or "Delete
 * account" would be the one button in the app that says more than it does.
 *
 * ## What goes
 *
 * - everything in the user's own scope: profile, friends, categories, money,
 *   goals, assets, imports, preferences, trust, their answers to other people's
 *   entries, their feed;
 * - every group that is theirs alone — the personal group, and any other group
 *   nobody else is (or was invited to be) in — with all its entries;
 * - their devices and what the server kept for each.
 *
 * ## What stays, and why
 *
 * A group other people are in is the GROUP's record, already on their phones.
 * Erasing an account's entries there would rewrite other people's ledgers because
 * one person left — removal ends a relationship, never a record, everywhere else
 * in this app. So their membership ends and the group carries on. Their `people`
 * row stays too, since those entries name it, but it no longer leads anywhere:
 * the `users` row it points at is anonymised by the caller.
 *
 * ## Order
 *
 * D1 enforces foreign keys, so children go before parents, and one cycle is cut
 * first: an occurrence names its repeat rule, and a rule names the entry it was
 * made from. Returned as statements for ONE batch — atomic, so a failure leaves
 * the account whole rather than half-erased.
 */
export async function eraseAccount(db: Db, userId: string, now: number): Promise<D1PreparedStatement[]> {
  const mine = (await db.prepare(
    `SELECT g.id FROM groups g
      WHERE g.owner_id = ?1
        AND NOT EXISTS (SELECT 1 FROM group_members m JOIN people p ON p.id = m.person_id
                         WHERE m.group_id = g.id AND m.status IN ('active', 'invited') AND m.deleted_at IS NULL
                           AND (p.user_id IS NULL OR p.user_id <> ?1))`,
  ).bind(userId).all<{ id: string }>()).results?.map(r => r.id) ?? [];
  const scopes = JSON.stringify([userId, ...mine]);
  const groups = JSON.stringify(mine);
  const inScopes = `(SELECT value FROM json_each(?))`;
  const txns = `(SELECT id FROM transactions WHERE scope_id IN ${inScopes})`;
  const del = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds);

  return [
    // Closing, from the first statement: the owner trigger lets a group pass to
    // its next member only once the owner's account is marked deleted. The caller
    // anonymises the row at the end of the same batch.
    del('UPDATE users SET deleted_at = COALESCE(deleted_at, ?1) WHERE id = ?2', now, userId),
    // The cycle: occurrences stop naming their rules, then the rules go.
    del(`UPDATE transactions SET recurring_rule_id = NULL WHERE scope_id IN ${inScopes}`, scopes),
    del(`DELETE FROM recurring_skips WHERE rule_id IN ${txns}`, scopes),
    del(`DELETE FROM recurring_rules WHERE transaction_id IN ${txns}`, scopes),
    // An entry's children, and anything anywhere that names one of these entries.
    ...['transaction_payers', 'transaction_splits', 'transaction_items', 'transaction_tags', 'transaction_history',
      'approvals', 'disputes'].map(t => del(`DELETE FROM ${t} WHERE transaction_id IN ${txns}`, scopes)),
    del(`DELETE FROM transactions WHERE scope_id IN ${inScopes}`, scopes),
    // Everything else in those scopes, children before parents.
    ...['savings_transactions', 'savings_goals', 'assets', 'budgets', 'disputes', 'approvals', 'trust_settings',
      'group_preferences', 'friends', 'categories', 'money_profiles', 'user_preferences', 'imported_transactions',
      'profiles', 'activity_log', 'group_members'].map(t => del(`DELETE FROM ${t} WHERE scope_id IN ${inScopes}`, scopes)),
    // Others' rows about a group that is going: their list preference, their trust in me there.
    del(`DELETE FROM group_preferences WHERE group_id IN (SELECT value FROM json_each(?))`, groups),
    del(`DELETE FROM trust_settings WHERE group_id IN (SELECT value FROM json_each(?))`, groups),
    del(`DELETE FROM groups WHERE id IN (SELECT value FROM json_each(?))`, groups),
    // Groups other people are in carry on without me — and are told, by seq.
    del(
      `UPDATE sync_scopes SET seq = seq + 1 WHERE id IN (
         SELECT m.scope_id FROM group_members m JOIN people p ON p.id = m.person_id
          WHERE p.user_id = ? AND m.status IN ('active', 'invited') AND m.deleted_at IS NULL)`,
      userId,
    ),
    // A group I own carries on with a new owner, or nobody could ever administer
    // it again (SYNC-F20). Their row becomes admin first, while I still own it.
    del(
      `UPDATE group_members SET role = 'admin', version = version + 1, updated_at = ?1, updated_by = ?2,
              seq = (SELECT s.seq FROM sync_scopes s WHERE s.id = group_members.scope_id)
        WHERE role = 'member'
          AND id IN (SELECT ${successor('g.id')} FROM groups g WHERE g.owner_id = ?2 AND g.deleted_at IS NULL)`,
      now, userId,
    ),
    del(
      `UPDATE groups SET version = version + 1, updated_at = ?1, updated_by = ?2,
              seq = (SELECT s.seq FROM sync_scopes s WHERE s.id = groups.scope_id),
              owner_id = (SELECT op.user_id FROM group_members om JOIN people op ON op.id = om.person_id
                           WHERE om.id = ${successor('groups.id')})
        WHERE owner_id = ?2 AND deleted_at IS NULL AND ${successor('groups.id')} IS NOT NULL`,
      now, userId,
    ),
    del(
      `UPDATE group_members SET status = 'left', left_at = ?, version = version + 1, updated_at = ?, updated_by = ?,
              seq = (SELECT s.seq FROM sync_scopes s WHERE s.id = group_members.scope_id)
        WHERE person_id IN (SELECT id FROM people WHERE user_id = ?) AND status IN ('active', 'invited') AND deleted_at IS NULL`,
      now, now, userId, userId,
    ),
    del('DELETE FROM sync_rejections WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)', userId),
    del('DELETE FROM devices WHERE user_id = ?', userId),
    del(`DELETE FROM sync_scopes WHERE id IN ${inScopes}`, scopes),
  ];
}

/**
 * Who takes over a group whose owner is leaving (`?2`): an admin first, else the
 * longest-standing active member — always someone with an account, since only an
 * account can administer anything. None, and the group simply keeps its owner id.
 */
function successor(groupId: string): string {
  return `(SELECT sm.id FROM group_members sm JOIN people sp ON sp.id = sm.person_id
            WHERE sm.group_id = ${groupId} AND sm.status = 'active' AND sm.deleted_at IS NULL
              AND sp.user_id IS NOT NULL AND sp.user_id <> ?2
            ORDER BY sm.role = 'admin' DESC, COALESCE(sm.joined_at, sm.created_at), sm.id LIMIT 1)`;
}
