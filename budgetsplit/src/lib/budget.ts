import * as SQLite from 'expo-sqlite';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  startOfYear, endOfYear, getDaysInMonth, getDaysInYear,
} from 'date-fns';
import type { BudgetGroup } from '../db/queries/groups';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getCategoryBudgets, getMyGlobalBudgetRows } from '../db/queries/categoryBudgets';
import { OTHERS_LABEL } from './categoryFold';
import type { BudgetCadence, CategoryBudget } from '../db/queries/categoryBudgets';

export type Period = 'daily' | 'monthly' | 'yearly';

export type BudgetHealth = 'green' | 'amber' | 'red' | 'none';

/*
 * THREE BUDGET CONCEPTS, TWO STORAGE LEVELS.
 *
 * 1. MY BUDGET (global) — Personal group, `person_id IS NULL`. Measured against my
 *    share of spend across ALL groups. The Personal group has no separate group
 *    budget; this row set is always read as global.
 * 2. GROUP BUDGET — shared group, `person_id IS NULL`. A per-person allowance every
 *    member inherits (`4c7ee45`), against my share of that group's spend.
 * 3. MY OVERRIDE — shared group, `person_id = me`. Beats the default per category,
 *    for me only, and private.
 *
 * (1) and (2) must never share a total — the global cap already covers the spend
 * happening inside every group. So cross-group rollups map over `sharedGroupsOf`,
 * and "how am I doing against my budget?" has one answer, `getMyGlobalBudgetSummary`.
 */

/** Whether this group's default lines are My Budget rather than a group budget. */
export const isGlobalBudgetGroup = (g: Pick<BudgetGroup, 'is_personal'>) => g.is_personal === 1;

/**
 * Collapse two-level budget rows into the one line that applies to `meId`.
 *
 * `category_budget.person_id` is NULL for the group's default — the line every
 * member inherits — and set for a personal override. An override wins for its
 * owner and for nobody else; everything else falls through to the default.
 *
 * Resolution is by `(category, cadence)`, not by category alone: a category can
 * legitimately carry a monthly line and a yearly one, and an override of the
 * monthly must not silently discard the yearly default.
 *
 * **Every reader goes through this.** A reader that queries the rows directly
 * would ignore overrides while looking like it worked — the same shape of bug as
 * the nine rollups that each answered "what is my budget" differently.
 */
export function resolveBudgetLines<T extends { category: string; cadence: BudgetCadence; person_id: string | null }>(
  lines: T[],
  meId?: string,
): T[] {
  const byKey = new Map<string, T>();
  for (const l of lines) {
    // Someone else's override is not mine to inherit, and not a default either.
    if (l.person_id !== null && l.person_id !== meId) continue;
    const key = `${l.category}|${l.cadence}`;
    const existing = byKey.get(key);
    // Mine beats the default; order of arrival must not decide it.
    if (!existing || (l.person_id !== null && existing.person_id === null)) byKey.set(key, l);
  }
  return Array.from(byKey.values());
}

/**
 * A budget line is either a **rate** (a limit that resets at least as often as
 * the headline you are showing) or a **pool** (a lump sum drawn down over a
 * longer window than that headline covers).
 *
 * This is the distinction the eight disagreeing rollups were missing. ₹24,000/yr
 * for Trips is not ₹2,000/month: a trip spends the whole pool in one month, and
 * a rollup that divided by 12 would report "over budget" in precisely the month
 * the money was meant to be spent. Only rates sum into a headline; pools have to
 * be shown as pools.
 */
export type BudgetKind = 'rate' | 'pool';

/**
 * Cadences ordered fine → coarse. `once` is coarser than everything: it has no
 * period at all, so it can never roll up into one.
 */
const CADENCE_RANK: Record<BudgetCadence, number> = { daily: 0, monthly: 1, yearly: 2, once: 3 };
const PERIOD_RANK: Record<Period, number> = { daily: 0, monthly: 1, yearly: 2 };

/**
 * Is this line a rate or a pool **relative to the headline being shown**?
 *
 * Rate/pool is not a property of the cadence alone — it depends on what you are
 * rolling up into. A monthly budget is a rate in a monthly headline and a pool
 * in a daily one. The rule is one line: a cadence at or finer than the target
 * rolls up; anything coarser is a pool, because rolling *down* is the error.
 */
export function budgetKind(cadence: BudgetCadence, target: Period): BudgetKind {
  return CADENCE_RANK[cadence] <= PERIOD_RANK[target] ? 'rate' : 'pool';
}

/**
 * A rate budget line expressed as its cost over one `target` period, or `null`
 * for a pool, which has no equivalent at that period at all.
 *
 * `null` rather than `0` on purpose: `0` reads as "budgeted nothing" and lets a
 * caller silently drop an annual budget out of a total it presents as complete.
 * `null` forces the decision to the surface — see `rollUpBudgets`.
 *
 * Every multiplier is a **real calendar count**. The old ×30 vs ×daysInMonth
 * split was the visible half of this bug (a daily ₹500 line read ₹15,000 on one
 * screen and ₹15,500 on another); rolling *up* into a concrete month or year
 * means that period's actual length is simply the right number.
 *
 * Deliberately separate from `recurringMonthlyEquivalent` (`lib/recurrence.ts`):
 * a recurring *charge* is money that will certainly move, a budget line is a cap
 * that may not be reached, so they normalise differently on purpose.
 */
export function budgetEquivalent(
  cadence: BudgetCadence,
  paise: number,
  target: Period,
  /** Which month/year we are rolling up into — its real length is the multiplier. */
  on: Date,
): number | null {
  if (budgetKind(cadence, target) === 'pool') return null;
  // `daysInMonth × 12` would be the same mistake as `×30` wearing a different
  // hat (February → 336 days, January → 372), so the yearly target measures a year.
  switch (target) {
    case 'daily':
      return paise; // only `daily` reaches here
    case 'monthly':
      return cadence === 'daily' ? Math.round(paise * getDaysInMonth(on)) : paise;
    case 'yearly':
      if (cadence === 'daily') return Math.round(paise * getDaysInYear(on));
      return cadence === 'monthly' ? paise * 12 : paise;
  }
}

export type BudgetRollup = {
  /** Summed cost of every line that rolls up into `target`. */
  amount: number;
  /** Total of the pool lines — NOT in `amount`, and must be shown separately. */
  pooled: number;
  /** How many pool lines, so the UI can say "plus 2 yearly budgets". */
  pooledCount: number;
};

/**
 * The single answer to "what do all my budgets add up to over <period>?".
 *
 * Eight call sites answered this differently — three of them (`homeData`,
 * `insightsData`, `analytics`) summed raw line amounts with no conversion at all,
 * so a daily ₹500 budget contributed ₹500 to a figure labelled "monthly", 30× under.
 *
 * `src/lib/rebalance.ts` already worked this way ("a yearly budget's headroom is
 * not spendable this month"); this is the rest of the app agreeing with it.
 *
 * Returns both halves. A caller rendering only `amount` while pool lines exist is
 * showing an incomplete total, which is why `pooledCount` is here: ₹24,000/yr for
 * Trips must not silently vanish from a monthly headline — it is a pool spent
 * when the trip happens, not ₹2,000 every month.
 */
export function rollUpBudgets(
  lines: Array<{ cadence: BudgetCadence; amount: number }>,
  target: Period,
  on: Date,
): BudgetRollup {
  let amount = 0, pooled = 0, pooledCount = 0;
  for (const l of lines) {
    const v = budgetEquivalent(l.cadence, l.amount, target, on);
    if (v === null) { pooled += l.amount; pooledCount++; } else { amount += v; }
  }
  return { amount, pooled, pooledCount };
}

/**
 * Canonical budget-utilisation band from a percentage (null pct → 'none').
 * The single source for the 80% / 100% thresholds — was duplicated inline in
 * group detail, reports, and analytics.
 */
export function budgetHealth(pct: number | null): BudgetHealth {
  if (pct === null) return 'none';
  return pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'green';
}

/**
 * Canonical utilisation label: "75%", "1.2×" when over budget, "—" when
 * unknown. One source (was copied with a glyph drift — ASCII "X" vs "×").
 */
export function utilLabel(pct: number | null): string {
  if (pct === null) return '—';
  if (pct > 100) return `${(pct / 100).toFixed(1)}×`;
  return `${pct}%`;
}

export function getPeriodRange(period: Period, date: Date): { from: number; to: number } {
  switch (period) {
    case 'daily':
      return { from: startOfDay(date).getTime(), to: endOfDay(date).getTime() };
    case 'monthly':
      return { from: startOfMonth(date).getTime(), to: endOfMonth(date).getTime() };
    case 'yearly':
      return { from: startOfYear(date).getTime(), to: endOfYear(date).getTime() };
  }
}

/*
 * REMOVED: `getBudgetUsage`, `getSpentInRange`, `getPriorPeriodRange`, `BudgetUsage`.
 *
 * They implemented group-level budgets with carry-over on
 * `budget_group.limit_daily/monthly/yearly` — a second, contradictory answer to
 * "does unused budget roll over?" alongside category budgets, which explicitly
 * have none (see getCategoryBudgetStatus below).
 *
 * The path was already unreachable: nothing in the app ever writes those three
 * columns, so `limit` was always null and the carry-over branch could not run.
 * Its one caller (`app/group/[id].tsx`) then dropped the result without
 * rendering it — a wasted query on every group open. Category budgets are the
 * only budgeting mechanism now.
 */

/**
 * Expense per category within a period. Pass `groupId = null` to span all groups
 * (for a global budget). Pass `meId` to count only **my share** of each expense
 * (individual budget); omit it for the full bill amount (group total).
 */
export async function getCategorySpending(
  db: SQLite.SQLiteDatabase,
  groupId: string | null,
  fromMs: number,
  toMs: number,
  meId?: string,
): Promise<Record<string, number>> {
  const txns = await getTransactionsInRange(db, groupId, fromMs, toMs);
  const map: Record<string, number> = {};
  for (const t of txns) {
    if (t.kind !== 'expense') continue;
    const amt = meId
      ? (t.shares.find(sh => sh.personId === meId)?.amount ?? 0)
      : t.shares.reduce((s, sh) => s + sh.amount, 0);
    if (amt === 0) continue;
    map[t.category] = (map[t.category] ?? 0) + amt;
  }
  return map;
}

export type CategoryBudgetStatus = {
  category: string;
  cadence: BudgetCadence;
  allocated: number;   // paise
  spent: number;       // paise in the current window of this cadence
  remaining: number;   // allocated - spent (can be negative)
  pct: number | null;
  health: 'green' | 'amber' | 'red' | 'none';
};

/**
 * The spend window for a budget line, based on its cadence.
 *
 * The window **ends at `now`, not at the end of the period**: "spent" means what
 * has happened, never what is scheduled. A ₹50,000 fee dated the 28th and logged
 * on the 2nd used to count as already spent, so a budget read as blown four
 * weeks before the money moved. Future-dated commitments are a separate idea and
 * already have a home — `upcomingBills` in `getAffordSnapshot`.
 *
 * Also serves an *aggregate* at a target `Period`, since `Period` is a subset of
 * `BudgetCadence` and the rule is the same one. `analytics.ts` had this written out
 * twice more (`currentWindow`, `targetWindow`) before they were folded in here.
 */
export function windowForCadence(cadence: BudgetCadence, now: Date): { from: number; to: number } {
  const to = now.getTime();
  switch (cadence) {
    case 'daily':   return { from: getPeriodRange('daily', now).from, to };
    case 'monthly': return { from: getPeriodRange('monthly', now).from, to };
    case 'yearly':  return { from: getPeriodRange('yearly', now).from, to };
    case 'once':    return { from: 0, to }; // cumulative, all-time
  }
}

/**
 * Per-category budget status. Each budgeted category is compared against
 * spending in the current window of ITS cadence (today / this month / this year
 * / all-time). Daily/monthly/yearly lines repeat each period because the line
 * itself persists and only the window moves — the limit resets each period and
 * unused amount does NOT carry over (no rollover).
 */
export async function getCategoryBudgetStatus(
  db: SQLite.SQLiteDatabase,
  group: BudgetGroup,
  /** `meId` is required for the reason spelled out on `getBudgetAnalytics`. */
  opts: { meId: string; now?: Date },
): Promise<CategoryBudgetStatus[]> {
  const { meId } = opts;
  const now = opts.now ?? new Date();
  const budgets = await getCategoryBudgets(db, group.id, meId);
  if (budgets.length === 0) return [];

  // One spending query per distinct cadence window.
  const cadences = Array.from(new Set(budgets.map(b => b.cadence)));
  const spendByCadence: Record<string, Record<string, number>> = {};
  await Promise.all(cadences.map(async cad => {
    const w = windowForCadence(cad, now);
    spendByCadence[cad] = await getCategorySpending(db, group.id, w.from, w.to, meId);
  }));

  // Budget lines follow the same catalog rule as spend: a line for a category you
  // do not have shows as Others until you adopt it. See `foldBudgetStatuses`.
  return foldBudgetStatuses(statusRows(budgets, spendByCadence), await knownCategoryNames(db));
}

/** Expense category names in the catalog — the set the Others fold is measured against. */
async function knownCategoryNames(db: SQLite.SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM category WHERE kind = 'expense'",
  );
  return new Set(rows.map(r => r.name));
}

/** Build + sort CategoryBudgetStatus rows from budgets and per-cadence spend maps. */
/**
 * Merge budget lines for categories that are not in the reader's catalog into a
 * single `Others` row — the same rule `foldUncategorized` already applies to
 * **spend**.
 *
 * Without this the two disagreed. `category_budget.category` is a loose name, not
 * a foreign key, so a group default can budget "Gym" while your catalog has no
 * Gym: your *spend* on Gym folded into Others, and its *budget* sat in the list
 * as a category you do not have. Adopting the category un-folds the line with its
 * amount intact — nothing is redistributed, and the total is identical either way.
 *
 * Folded **per cadence**, because a daily ₹100 and a monthly ₹2,000 do not share a
 * window and a single merged row could not state a meaningful percentage. In
 * practice that is almost always one row.
 *
 * Pure. `known` is the set of category names in the catalog.
 */
export function foldBudgetStatuses(
  rows: CategoryBudgetStatus[],
  known: ReadonlySet<string>,
): CategoryBudgetStatus[] {
  const kept: CategoryBudgetStatus[] = [];
  const byCadence = new Map<BudgetCadence, { allocated: number; spent: number }>();

  for (const r of rows) {
    // An existing `Others` category in the catalog is a real category and stays.
    if (known.has(r.category)) { kept.push(r); continue; }
    const acc = byCadence.get(r.cadence) ?? { allocated: 0, spent: 0 };
    acc.allocated += r.allocated;
    acc.spent += r.spent;
    byCadence.set(r.cadence, acc);
  }

  for (const [cadence, { allocated, spent }] of byCadence) {
    const pct = allocated > 0 ? Math.round((spent / allocated) * 100) : null;
    kept.push({
      category: OTHERS_LABEL, cadence, allocated, spent,
      remaining: allocated - spent, pct, health: budgetHealth(pct),
    });
  }
  return sortStatusRows(kept);
}

/** Shared ordering: coarser cadence later, most-used first inside a cadence. */
function sortStatusRows(rows: CategoryBudgetStatus[]): CategoryBudgetStatus[] {
  const order: Record<BudgetCadence, number> = { daily: 0, monthly: 1, yearly: 2, once: 3 };
  return rows.sort((a, b) => order[a.cadence] - order[b.cadence] || (b.pct ?? 0) - (a.pct ?? 0));
}

function statusRows(budgets: CategoryBudget[], spendByCadence: Record<string, Record<string, number>>): CategoryBudgetStatus[] {
  const rows: CategoryBudgetStatus[] = budgets.map(b => {
    const spent = spendByCadence[b.cadence]?.[b.category] ?? 0;
    const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : null;
    return { category: b.category, cadence: b.cadence, allocated: b.amount, spent, remaining: b.amount - spent, pct, health: budgetHealth(pct) };
  });
  return sortStatusRows(rows);
}

/** Per-category rows for a set of global lines. Split out so the summary below
 *  and the status list share one definition of "my spend for this line". */
async function globalStatusRows(
  db: SQLite.SQLiteDatabase,
  meId: string,
  budgets: CategoryBudget[],
  now: Date,
): Promise<CategoryBudgetStatus[]> {
  const cadences = Array.from(new Set(budgets.map(b => b.cadence)));
  const spendByCadence: Record<string, Record<string, number>> = {};
  await Promise.all(cadences.map(async cad => {
    const w = windowForCadence(cad, now);
    // null group → every group; meId → my share only.
    spendByCadence[cad] = await getCategorySpending(db, null, w.from, w.to, meId);
  }));
  return foldBudgetStatuses(statusRows(budgets, spendByCadence), await knownCategoryNames(db));
}

/**
 * MY BUDGET, per category: the global lines measured against MY share of spending
 * across ALL groups (personal + shared). Powers the Personal → Budget tab.
 */
export async function getMyGlobalBudgetStatus(
  db: SQLite.SQLiteDatabase,
  meId: string,
  now = new Date(),
): Promise<CategoryBudgetStatus[]> {
  const budgets = await getMyGlobalBudgetRows(db, meId);
  if (budgets.length === 0) return [];
  return globalStatusRows(db, meId, budgets, now);
}

/** My Budget as one figure plus its rows. See `getMyGlobalBudgetSummary`. */
export type GlobalBudgetSummary = {
  /** Rate lines rolled up to `target`. */
  allocated: number;
  /** Pool lines (longer than `target`) — reported separately, never added in. */
  pooled: number;
  pooledCount: number;
  /** My share, all groups, over `target`'s window, restricted to the rate categories. */
  spent: number;
  remaining: number;
  pct: number | null;
  health: BudgetHealth;
  /** How many categories I have budgeted (rate + pool). */
  categoryCount: number;
  rows: CategoryBudgetStatus[];
};

/**
 * **The** answer to "how am I doing against my budget?".
 *
 * Home, Insights, Plan, the Groups list and Reports each rolled their own, and four
 * summed every group's allocation — including the Personal group's, which IS this
 * cap — against whole-group bills rather than my share. Here numerator and
 * denominator share one window and one basis by construction.
 *
 * Mirrors the aggregate half of `getBudgetAnalytics`: same rate/pool split, same
 * "window ends at now", same health bands. Only the scope differs.
 */
export async function getMyGlobalBudgetSummary(
  db: SQLite.SQLiteDatabase,
  meId: string,
  opts: { now?: Date; target?: Period } = {},
): Promise<GlobalBudgetSummary> {
  const now = opts.now ?? new Date();
  const target = opts.target ?? 'monthly';
  const budgets = await getMyGlobalBudgetRows(db, meId);
  const empty: GlobalBudgetSummary = {
    allocated: 0, pooled: 0, pooledCount: 0, spent: 0, remaining: 0,
    pct: null, health: 'none', categoryCount: 0, rows: [],
  };
  if (budgets.length === 0) return empty;

  const roll = rollUpBudgets(budgets, target, now);
  // Pools are excluded from BOTH halves. Dropping the allocation but keeping the
  // spend would inflate utilisation rather than fix it (same rule as analytics).
  const rateCategories = new Set(
    budgets.filter(b => budgetKind(b.cadence, target) === 'rate').map(b => b.category),
  );
  const w = windowForCadence(target, now);
  const spendByCat = await getCategorySpending(db, null, w.from, w.to, meId);
  const spent = Object.entries(spendByCat)
    .reduce((s, [cat, amt]) => (rateCategories.has(cat) ? s + amt : s), 0);
  const pct = roll.amount > 0 ? Math.round((spent / roll.amount) * 100) : null;

  return {
    allocated: roll.amount,
    pooled: roll.pooled,
    pooledCount: roll.pooledCount,
    spent,
    remaining: roll.amount - spent,
    pct,
    health: budgetHealth(pct),
    categoryCount: new Set(budgets.map(b => b.category)).size,
    rows: await globalStatusRows(db, meId, budgets, now),
  };
}
