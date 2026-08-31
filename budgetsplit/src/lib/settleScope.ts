import * as SQLite from 'expo-sqlite';
import { getNetByGroup } from '../db/queries/balances';
import { getGroupMembers } from '../db/queries/persons';
import { simplify } from './settle';

/** A per-group settlement target between two people: how much, and which way. */
export type ScopeEntry = { groupId: string; name: string; amount: number; from: string; to: string };

/** The simplified pair (if any) directly between `meId` and `otherId` in a net map. */
function pairBetween(net: Record<string, number>, meId: string, otherId: string) {
  for (const s of simplify(net)) {
    if ((s.from === meId && s.to === otherId) || (s.from === otherId && s.to === meId)) return s;
  }
  return null;
}

export type TransferScopes = {
  /** Shared (non-personal) groups where me + other both belong, with their pair balance. */
  groups: ScopeEntry[];
  /** Combined ("All groups") pair balance from the global net. */
  all: { amount: number; from: string; to: string };
};

/**
 * Settlement targets between the current user and another person, both per shared
 * group and combined ("All groups"). Uses the same `simplify` the Settle-up screen
 * uses, so the suggested amounts/direction match the rest of the app.
 */
export async function computeTransferScopes(
  db: SQLite.SQLiteDatabase,
  meId: string,
  otherId: string,
): Promise<TransferScopes> {
  /*
   * ONE population, and the headline is the sum of the rows.
   *
   * These were computed from two different sets and disagreed. The per-group rows
   * came from `getAllGroups`, which excludes archived groups; the combined figure
   * came from `getGlobalNet`, whose only scope clause is `is_personal = 0` — so
   * archived balances were in the total and in no row.
   *
   * That is not a display quirk, it is a misdirected payment. Owing ₹5,000 in an
   * archived Goa trip and ₹2,000 in the live flat showed "All groups ₹7,000",
   * and `planAllGroupsSettlement` could only allocate to the ₹2,000 of live
   * scope — so the whole ₹7,000 landed in the flat, leaving it ₹5,000 in credit
   * while Goa still said ₹5,000 owed. The global net stayed right, so nothing
   * surfaced it.
   *
   * `getNetByGroup` is the same population every balance in the app is built on
   * (all non-personal groups, archived included), so using it here makes the
   * scopes agree with `getFriendBalances` by construction rather than by
   * coincidence.
   */
  const [byGroup, names] = await Promise.all([
    getNetByGroup(db),
    db.getAllAsync<{ id: string; name: string; is_archived: number }>(
      'SELECT id, name, is_archived FROM budget_group WHERE is_personal = 0 AND deleted_at IS NULL',
    ),
  ]);
  const nameOf = new Map(names.map(g => [g.id, g]));

  const groups: ScopeEntry[] = [];
  let net = 0;   // signed, positive = they owe me
  for (const [groupId, groupNet] of byGroup) {
    const meta = nameOf.get(groupId);
    if (!meta) continue;   // personal, or ended for everyone
    const ids = new Set((await getGroupMembers(db, groupId)).map(m => m.id));
    if (!ids.has(meId) || !ids.has(otherId)) continue;

    const pair = pairBetween(groupNet, meId, otherId);
    const amount = pair?.amount ?? 0;
    if (pair) net += pair.to === meId ? amount : -amount;
    groups.push({
      groupId,
      // Labelled, because an archived group appearing in a settle list is
      // otherwise a group the user cannot find anywhere else.
      name: meta.is_archived === 1 ? `${meta.name} · Archived` : meta.name,
      amount,
      from: pair?.from ?? meId,
      to: pair?.to ?? otherId,
    });
  }

  return {
    groups,
    all: {
      amount: Math.abs(net),
      from: net >= 0 ? otherId : meId,
      to: net >= 0 ? meId : otherId,
    },
  };
}

/** One settlement row to write. */
export type SettlementPlan = { groupId: string; from: string; to: string; amount: number };

/**
 * Distribute `amount` across shared groups, largest balance first, all in the
 * caller-chosen `fromId → toId` direction. Used when transferring "All groups":
 * each group gets its own row so per-group balances stay correct.
 *
 * No group is allocated more than it is owed, EXCEPT the last (smallest) one,
 * which absorbs any excess when the user pays more than the total outstanding.
 * Overpaying has to land somewhere and leave that group in credit; putting it on
 * the smallest balance keeps the larger, more meaningful balances exact. Pinned
 * by "puts an overpayment remainder on the last ranked group" in the tests.
 */
export function planAllGroupsSettlement(
  scopes: TransferScopes,
  amount: number,
  fromId: string,
  toId: string,
): SettlementPlan[] {
  const live = scopes.groups.filter(g => g.amount > 0);
  // Direction matters, and ranking by amount alone ignored it. A group where
  // *they* owe *you* was eligible for a payment *you* were making, so a settle-up
  // could land in the one group running the other way — increasing the balance it
  // was meant to clear. The global net still came out right, which is precisely
  // why nothing surfaced it: only the per-group figures were wrong.
  const aligned = live
    .filter(g => g.from === fromId && g.to === toId)
    .sort((a, b) => b.amount - a.amount);
  // Nothing owed in this direction anywhere — a prepayment. It has to land
  // somewhere, so it goes to the largest live balance and reads as credit there,
  // which is what a prepayment is. Better than dropping the row.
  const ranked = aligned.length > 0
    ? aligned
    : live.slice().sort((a, b) => b.amount - a.amount).slice(0, 1);
  if (ranked.length === 0) return [];

  const plan: SettlementPlan[] = [];
  let left = amount;
  ranked.forEach((g, i) => {
    if (left <= 0) return;
    const isLast = i === ranked.length - 1;
    const take = isLast ? left : Math.min(g.amount, left);
    if (take > 0) {
      plan.push({ groupId: g.groupId, from: fromId, to: toId, amount: take });
      left -= take;
    }
  });
  return plan;
}
