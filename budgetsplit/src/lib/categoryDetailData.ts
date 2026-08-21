import type * as SQLite from 'expo-sqlite';
import { getTransactionsInRange, getActiveRecurringRules, type TxnWithSplits } from '../db/queries/transactions';
import { getCategoryBudgets, getMyGlobalBudgetRows, type CategoryBudget } from '../db/queries/categoryBudgets';
import { getMe } from '../db/queries/persons';
import { getAllGroups, personalGroupOf, sharedGroupsOf, groupRefs, type GroupRef } from '../db/queries/groups';
import { getGoals, type SavingsGoal } from '../db/queries/savings';
import { budgetEquivalent, type Period } from './budget';

/** One shared group's limit for the category being shown. */
export type GroupLimit = { groupId: string; name: string; lines: CategoryBudget[] };

export type CategoryDetail = {
  myId: string;
  personalGroupId: string | null;
  groupRefs: Record<string, GroupRef>;
  yearExpenses: TxnWithSplits[];
  /** My Budget's lines for this category — the hero figure. */
  globalLines: CategoryBudget[];
  /** Each shared group's own limit for it. Never summed with `globalLines`. */
  groupLimits: GroupLimit[];
  recurRules: TxnWithSplits[];
  goals: SavingsGoal[];
};

/**
 * Data for one category's detail screen.
 *
 * The hero used to sum `getCategoryBudgets` over **every** group, so My Budget's
 * ₹8,000 for Groceries plus a group's ₹6,000 rendered as "₹14,000 your budget" —
 * two incompatible bases in one total, and the global cap already covers the spend
 * inside that group. The two are kept apart here and presented as two things.
 */
export async function loadCategoryDetail(
  db: SQLite.SQLiteDatabase,
  opts: { category: string; from: number; to: number },
): Promise<CategoryDetail> {
  const { category } = opts;
  const [me, groups] = await Promise.all([getMe(db), getAllGroups(db)]);
  const myId = me?.id ?? '';

  const [yearTxns, rules, allGoals, globalRows, ...sharedRows] = await Promise.all([
    getTransactionsInRange(db, null, opts.from, opts.to),
    getActiveRecurringRules(db),
    getGoals(db),
    getMyGlobalBudgetRows(db, myId),
    ...sharedGroupsOf(groups).map(g => getCategoryBudgets(db, g.id, myId)),
  ]);

  return {
    myId,
    personalGroupId: personalGroupOf(groups)?.id ?? null,
    groupRefs: groupRefs(groups),
    yearExpenses: yearTxns.filter(t => t.kind === 'expense' && !t.is_deleted),
    globalLines: globalRows.filter(b => b.category === category),
    groupLimits: sharedGroupsOf(groups)
      .map((g, i) => ({ groupId: g.id, name: g.name, lines: sharedRows[i].filter(b => b.category === category) }))
      .filter(gl => gl.lines.length > 0),
    recurRules: rules.filter(r => r.category === category),
    goals: allGoals.filter(g => g.category === category),
  };
}

/**
 * A set of budget lines expressed over the selected period, or 0 when they are all
 * pools relative to it.
 *
 * `budgetEquivalent` only rolls *up* and returns null for a pool, so a ₹24,000/yr
 * line has no Month figure rather than a prorated ₹2,000 the trip would blow.
 * `hasAny` is "a budget exists at some period", which is what decides whether to
 * offer the set-a-budget prompt.
 */
export function categoryPeriodBudget(
  lines: Array<{ cadence: CategoryBudget['cadence']; amount: number }>,
  target: Period,
  now: Date,
): { amount: number; matched: number; hasAny: boolean } {
  let amount = 0;
  let matched = 0;
  for (const b of lines) {
    const v = budgetEquivalent(b.cadence, b.amount, target, now);
    if (v !== null) { amount += v; matched++; }
  }
  return { amount, matched, hasAny: lines.length > 0 };
}
