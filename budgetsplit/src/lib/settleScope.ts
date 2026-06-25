import * as SQLite from 'expo-sqlite';
import { getGroupNet, getGlobalNet } from '../db/queries/balances';
import { getGroupMembers } from '../db/queries/persons';
import { getAllGroups } from '../db/queries/groups';
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
  const all = await getAllGroups(db);
  const groups: ScopeEntry[] = [];
  for (const g of all) {
    if (g.is_personal === 1) continue; // personal group has no counterpart
    const ids = new Set((await getGroupMembers(db, g.id)).map(m => m.id));
    if (!ids.has(meId) || !ids.has(otherId)) continue;
    const pair = pairBetween(await getGroupNet(db, g.id), meId, otherId);
    groups.push({
      groupId: g.id, name: g.name,
      amount: pair?.amount ?? 0,
      from: pair?.from ?? meId,
      to: pair?.to ?? otherId,
    });
  }
  const gpair = pairBetween(await getGlobalNet(db), meId, otherId);
  return {
    groups,
    all: { amount: gpair?.amount ?? 0, from: gpair?.from ?? meId, to: gpair?.to ?? otherId },
  };
}

/** One settlement row to write. */
export type SettlementPlan = { groupId: string; from: string; to: string; amount: number };

/**
 * Distribute `amount` across shared groups, largest balance first, all in the
 * caller-chosen `fromId → toId` direction. Used when transferring "All groups":
 * each group gets its own row so per-group balances stay correct. Any remainder
 * beyond the known balances lands on the largest group.
 */
export function planAllGroupsSettlement(
  scopes: TransferScopes,
  amount: number,
  fromId: string,
  toId: string,
): SettlementPlan[] {
  const ranked = scopes.groups
    .filter(g => g.amount > 0)
    .sort((a, b) => b.amount - a.amount);
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
