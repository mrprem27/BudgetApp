import type { Db } from '../sync/utils/access';
import { canReadScope, personOf, scopesFor } from '../sync/utils/access';
import { simplify } from '../sync/rules';

/**
 * The `/v1` read API (`DQ-104`): what a web client needs to show the shared side of the app,
 * read from the same tables sync writes, with the same access rule (`scopesFor`) and the phone's
 * own debt math (`lib/settle`). Writes stay on `/sync/push`, where every rule already runs.
 *
 * An entry counts in YOUR figures the way it does on the phone: not deleted, not a repeat rule's
 * template, not income, and not waiting for your approval. A waiting entry is still listed in the
 * ledger, marked `pendingForMe`, because the group has to agree on what happened.
 */

/** The phone's `BALANCE_TXN_FILTER` and `NOT_AWAITING_APPROVAL`, over the server's tables. */
const COUNTS_FOR_ME = `t.deleted_at IS NULL AND t.kind <> 'income'
  AND NOT EXISTS (SELECT 1 FROM recurring_rules r WHERE r.transaction_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.transaction_id = t.id AND a.user_id = ? AND a.status = 'pending' AND a.deleted_at IS NULL)`;

type Net = Record<string, number>;

/** Paid minus share per person, per group: the phone's `getNetByGroup`. */
async function netByGroup(db: Db, userId: string, groupIds: string[]): Promise<Map<string, Net>> {
  const out = new Map<string, Net>();
  if (groupIds.length === 0) return out;
  const marks = groupIds.map(() => '?').join(',');
  const rows = await db.prepare(
    `SELECT t.group_id AS g, x.person_id AS p, SUM(x.amount) AS amt FROM transaction_payers x JOIN transactions t ON t.id = x.transaction_id
      WHERE t.group_id IN (${marks}) AND ${COUNTS_FOR_ME} GROUP BY 1, 2
     UNION ALL
     SELECT t.group_id, x.person_id, -SUM(x.amount) FROM transaction_splits x JOIN transactions t ON t.id = x.transaction_id
      WHERE t.group_id IN (${marks}) AND ${COUNTS_FOR_ME} GROUP BY 1, 2`,
  ).bind(...groupIds, userId, ...groupIds, userId).all<{ g: string; p: string; amt: number }>();
  for (const r of rows.results ?? []) {
    const net = out.get(r.g) ?? {};
    net[r.p] = (net[r.p] ?? 0) + r.amt;
    out.set(r.g, net);
  }
  return out;
}

/** The shared groups this user can read (their personal ledger is theirs alone, and not here). */
async function sharedGroups(db: Db, userId: string) {
  const { readable } = await scopesFor(db, userId);
  const ids = readable.filter(id => id !== userId);
  if (ids.length === 0) return [];
  const marks = ids.map(() => '?').join(',');
  const rows = await db.prepare(
    `SELECT id, kind, name, icon, color, simplify_debts AS simplifyDebts, currency FROM groups
      WHERE id IN (${marks}) AND deleted_at IS NULL AND kind <> 'personal' ORDER BY name`,
  ).bind(...ids).all<{ id: string; kind: string; name: string; icon: string; color: string; simplifyDebts: number; currency: string }>();
  return rows.results ?? [];
}

/** `GET /v1/groups`: my groups, their active members, and my position in each (+ owed to me). */
export async function listGroups(db: Db, userId: string) {
  const [groups, me] = await Promise.all([sharedGroups(db, userId), personOf(db, userId)]);
  const ids = groups.map(g => g.id);
  const nets = await netByGroup(db, userId, ids);
  const members = ids.length === 0 ? [] : ((await db.prepare(
    `SELECT group_id AS groupId, person_id AS personId, display_name AS name, role FROM group_members
      WHERE group_id IN (${ids.map(() => '?').join(',')}) AND status = 'active' AND deleted_at IS NULL ORDER BY display_name`,
  ).bind(...ids).all<{ groupId: string; personId: string; name: string; role: string }>()).results ?? []);
  return {
    me,
    groups: groups.map(g => ({
      ...g,
      simplifyDebts: g.simplifyDebts === 1,
      members: members.filter(m => m.groupId === g.id).map(({ groupId: _, ...m }) => m),
      myNet: me ? nets.get(g.id)?.[me] ?? 0 : 0,
    })),
  };
}

export const MAX_PAGE = 100;

/**
 * `GET /v1/groups/:id/transactions`: newest first, `limit` at a time; pass the last row's
 * `cursor` back as `before` for the next page. Null when the group is not readable.
 */
export async function groupLedger(db: Db, userId: string, groupId: string, opts: { before?: string | null; limit?: number } = {}) {
  if (!(await canReadScope(db, userId, groupId))) return null;
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), MAX_PAGE);
  // The cursor is `<date>:<id>`, so rows on one day never skip or repeat across pages.
  const [bDate, bId] = (opts.before ?? '').split(':');
  const after = opts.before && Number.isFinite(Number(bDate)) && bId;
  const rows = ((await db.prepare(
    `SELECT t.id, t.kind, t.date, t.category, t.note, t.amount, t.currency, t.pay_method AS payMethod, t.created_by AS authorId,
            EXISTS (SELECT 1 FROM approvals a WHERE a.transaction_id = t.id AND a.user_id = ? AND a.status = 'pending' AND a.deleted_at IS NULL) AS pendingForMe
       FROM transactions t
      WHERE t.group_id = ? AND t.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM recurring_rules r WHERE r.transaction_id = t.id)
        ${after ? 'AND (t.date < ? OR (t.date = ? AND t.id < ?))' : ''}
      ORDER BY t.date DESC, t.id DESC LIMIT ?`,
  ).bind(userId, groupId, ...(after ? [Number(bDate), Number(bDate), bId] : []), limit + 1)
    .all<{ id: string; kind: string; date: number; category: string; note: string | null; amount: number; currency: string; payMethod: string | null; authorId: string; pendingForMe: number }>()).results ?? []);
  const page = rows.slice(0, limit);
  const ids = page.map(r => r.id);
  const sides = ids.length === 0 ? [] : ((await db.prepare(
    `SELECT 'payer' AS side, transaction_id AS t, person_id AS personId, amount FROM transaction_payers WHERE transaction_id IN (${ids.map(() => '?').join(',')})
     UNION ALL
     SELECT 'split', transaction_id, person_id, amount FROM transaction_splits WHERE transaction_id IN (${ids.map(() => '?').join(',')})`,
  ).bind(...ids, ...ids).all<{ side: string; t: string; personId: string; amount: number }>()).results ?? []);
  const of = (id: string, side: string) => sides.filter(s => s.t === id && s.side === side).map(({ personId, amount }) => ({ personId, amount }));
  const last = page[page.length - 1];
  return {
    transactions: page.map(r => ({ ...r, pendingForMe: r.pendingForMe === 1, payers: of(r.id, 'payer'), splits: of(r.id, 'split') })),
    next: rows.length > limit && last ? `${last.date}:${last.id}` : null,
  };
}

/**
 * `GET /v1/me/balances`: who owes whom, per person, across every shared group. Simplified per
 * group, then summed, never simplified across groups (the phone's `netPerPerson`, and why).
 */
export async function myBalances(db: Db, userId: string) {
  const [groups, me] = await Promise.all([sharedGroups(db, userId), personOf(db, userId)]);
  if (!me) return { me: null, people: [] };
  const nets = await netByGroup(db, userId, groups.map(g => g.id));
  const byPerson = new Map<string, number>();
  for (const net of nets.values()) {
    for (const s of simplify(net)) {
      if (s.from === me) byPerson.set(s.to, (byPerson.get(s.to) ?? 0) - s.amount);
      else if (s.to === me) byPerson.set(s.from, (byPerson.get(s.from) ?? 0) + s.amount);
    }
  }
  const ids = [...byPerson.keys()];
  const names = ids.length === 0 ? [] : ((await db.prepare(
    `SELECT person_id AS id, MIN(display_name) AS name FROM group_members WHERE person_id IN (${ids.map(() => '?').join(',')}) GROUP BY person_id`,
  ).bind(...ids).all<{ id: string; name: string }>()).results ?? []);
  return {
    me,
    people: ids
      .map(id => ({ personId: id, name: names.find(n => n.id === id)?.name ?? null, net: byPerson.get(id)! }))
      .filter(p => p.net !== 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
  };
}
