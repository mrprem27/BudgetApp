/**
 * E2 — statistics over this person's own history (`SPEC-ENGINE.md` §4).
 *
 * First slice (`EN2`): the everyday rate only. Pure — no React, no database.
 */
import type { FinanceSnapshot, Behaviour, IncomeModel, RepaymentModel, TrueExpense, MonthlyAffordability } from './types';
import { dailySpendTotals, typicalDailySpend, EVERYDAY_WINDOW_DAYS, EVERYDAY_MIN_DAYS } from '../safeToSpend';
import { nextUnskippedOccurrence, materializeInstances, recurringMonthlyEquivalent } from '../recurrence';
import { myShareOrTotal } from '../splitMath';

const DAY_MS = 86_400_000;

/**
 * `dailySpendTotals` wants the raw shape it already knows how to filter
 * (`kind`, `is_deleted`, `parent_recur_id`, `recur_freq`, `date`); `history`
 * rows have already been reduced to their engine shape, so they're adapted back
 * into just enough of that shape to qualify — `isRecurringLinked` standing in
 * for the two columns it was computed from.
 */
function toQualifyingRows(rows: FinanceSnapshot['history']) {
  return rows.map(h => ({
    kind: h.kind,
    is_deleted: 0,
    parent_recur_id: h.isRecurringLinked ? 'linked' : null,
    recur_freq: null,
    date: h.date,
    amountPaise: h.amountPaise,
  }));
}

/**
 * The person's own everyday-spend sample, one entry per day over the trailing
 * `EVERYDAY_WINDOW_DAYS`, zero-spend days included — the raw material E3's
 * 7-day block bootstrap draws from (§4 E2, "a 7-day block sample for the
 * bootstrap, keeping the weekday rhythm"). Empty below the earliest qualifying
 * transaction (same clipping `dailySpendTotals` itself does).
 */
export function dailySample(snapshot: FinanceSnapshot): number[] {
  const fromMs = snapshot.asOf - EVERYDAY_WINDOW_DAYS * 86_400_000;
  return dailySpendTotals(toQualifyingRows(snapshot.history), r => r.amountPaise, fromMs, snapshot.asOf);
}

/**
 * The everyday (variable) spend rate: the trimmed mean of my-share, non-recurring
 * expense over the trailing `EVERYDAY_WINDOW_DAYS` — the exact rule
 * `getSafeToSpend` already uses (`typicalDailySpend`, "moved unchanged" per
 * `SPEC-ENGINE.md` §6), reused rather than re-derived so the two can never drift.
 */
export function everydayRate(snapshot: FinanceSnapshot): number | null {
  return typicalDailySpend(dailySample(snapshot));
}

/**
 * Default Need/Want classification by category name (`SPEC-ENGINE.md` §5) —
 * the seed used until the person picks differently for a category (that choice
 * lands with `EN4`; this list is only ever the fallback, and today's only
 * caller). Matches the spec's own worked examples (Groceries, Rent, Medical,
 * Bills → Need; Dining, Shopping, Entertainment → Want) against
 * `constants/categories.ts`'s actual catalog names, plus the generic
 * "Food"/"Medical" synonyms free-text categories (and the fixture personas)
 * use. Everything unlisted defaults to Want, matching the spec's own examples.
 */
export const NEED_CATEGORY_SEED: ReadonlySet<string> = new Set([
  'Rent', 'Maintenance', 'Household Help', 'Home Supplies',
  'Groceries', 'Food',
  'Electricity', 'Mobile Recharge', 'WiFi & Broadband', 'Bills',
  'Health & Pharmacy', 'Medical', 'Insurance',
  'EMI & Loans', 'Education', 'Taxes', 'Fuel',
]);

export function isNeedCategory(category: string): boolean {
  return NEED_CATEGORY_SEED.has(category);
}

/**
 * The Afford screen's pre-filled Kind chip (§5): "your own last choice for this
 * category, else the category's seed". Only the seed half is built here —
 * nothing yet stores a per-category override (that lands with the real Afford
 * screen, `EN10`/`EN11`), so this is always the seed today.
 */
export function defaultNecessity(category?: string): 'need' | 'want' {
  return category != null && isNeedCategory(category) ? 'need' : 'want';
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/**
 * The floor E3 protects: one week of this person's essential spending — the
 * P50 (median, not the trimmed mean `everydayRate` uses) of Need-category
 * daily spend, zero-spend days included, × 7 (§4 E3). Cold start (fewer than
 * `EVERYDAY_MIN_DAYS` qualifying days): 0, never a guess — matching every
 * other E2 model's own minimum-data rule.
 */
export function essentialFloor(snapshot: FinanceSnapshot): number {
  // What you chose to keep aside (§10b); a week of essentials when you have not said.
  const keep = snapshot.settings?.keepAside ?? 'week';
  if (keep === 'none') return 0;
  if (keep === 'custom') return Math.max(0, snapshot.settings?.keepAsideAmount ?? 0);
  const fromMs = snapshot.asOf - EVERYDAY_WINDOW_DAYS * 86_400_000;
  const needRows = snapshot.history.filter(h => h.kind === 'expense' && isNeedCategory(h.category));
  const buckets = dailySpendTotals(toQualifyingRows(needRows), r => r.amountPaise, fromMs, snapshot.asOf);
  if (buckets.length < EVERYDAY_MIN_DAYS) return 0;
  return median(buckets) * (keep === 'month' ? 30 : 7);
}

export function behaviourOf(snapshot: FinanceSnapshot): Behaviour {
  return { everydayRatePaise: everydayRate(snapshot), essentialFloorPaise: essentialFloor(snapshot) };
}

/** Minimum months of income *rows* (no rule) to compute a consistency reading from — the "3 months of income rows" half of §4 E2's own minimum. */
const INCOME_HISTORY_MIN_MONTHS = 3;
/** Trailing months of income considered when computing the coefficient of variation. */
const INCOME_HISTORY_WINDOW_MONTHS = 12;

function monthKey(dateMs: number): string {
  const d = new Date(dateMs);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

/** Coefficient of variation (stdev / mean) — `null` below 2 data points or a non-positive mean, where "spread relative to the average" is meaningless. */
function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** My amount on an income rule/row: income reads `payments` only, never split (AGENTS.md §12, `myAmount` in `engineSnapshot.ts`). */
function myIncomeAmount(row: { payments: ReadonlyArray<{ personId: string; amount: number }> }, meId: string): number {
  return row.payments.find(p => p.personId === meId)?.amount ?? 0;
}

/**
 * E2's income model (§4): an active recurring income rule is trusted directly
 * (its own date and amount); absent one, consistency comes from the
 * coefficient of variation of trailing monthly income totals, and — only when
 * that reads `variable` — a next date is inferred from the median gap between
 * recent income rows (the closest read of "the 20th percentile of recent
 * amounts... [on] the expected date" §4 E3 can give without a rule to name an
 * actual date). Below both minimums (no rule, fewer than
 * `INCOME_HISTORY_MIN_MONTHS` months of rows): `irregular` with nothing
 * knowable, matching every other E2 model's "return null, never guess" rule.
 *
 * Already the densest function in this file (four-way consistency read, a
 * rule-present branch, two early returns, an inferred-date fallback) — flagged
 * in review, not as a defect, but as the natural place a fifth branch would
 * hide. Resist adding one here; extract a table first.
 */
/** Every live recurring income rule — approved, not paused or ended. */
export function activeIncomeRules(snapshot: FinanceSnapshot): FinanceSnapshot['recurring']['rules'] {
  return snapshot.recurring.rules.filter(
    r => r.kind === 'income' && r.recur_freq && !r.pendingApproval && (!r.recur_state || r.recur_state === 'active'),
  );
}

export function incomeModel(snapshot: FinanceSnapshot): IncomeModel {
  // Several income rules are normal (salary, a yearly bonus, rent). The one that sizes the horizon
  // and names the "next payday" is the one that pays SOONEST — taking the first found let a yearly
  // bonus stretch "safe until" to next year.
  const rule = activeIncomeRules(snapshot)
    .map(r => ({ r, next: nextUnskippedOccurrence(r, snapshot.asOf, new Set(snapshot.recurring.skips[r.id] ?? [])) }))
    .sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity))[0]?.r;

  const incomeRows = snapshot.history.filter(h => h.kind === 'income').sort((a, b) => a.date - b.date);
  const fromMs = snapshot.asOf - INCOME_HISTORY_WINDOW_MONTHS * 30 * DAY_MS;
  const byMonth = new Map<string, number>();
  for (const h of incomeRows) {
    if (h.date < fromMs) continue;
    byMonth.set(monthKey(h.date), (byMonth.get(monthKey(h.date)) ?? 0) + h.amountPaise);
  }
  const monthlyTotals = [...byMonth.values()];
  const cv = coefficientOfVariation(monthlyTotals);
  const hasHistory = monthlyTotals.length >= INCOME_HISTORY_MIN_MONTHS;
  const spread = { spreadPct: cv == null ? null : Math.round(cv * 100), incomeMonths: monthlyTotals.length };

  const last3 = incomeRows.slice(-3).map(h => h.amountPaise);
  const medianRecentPaise = last3.length > 0 ? median(last3) : null;
  // §4 E3: variable income's known-event amount is the 20th percentile of
  // recent amounts, a conservative read — never the median above, which is
  // display-only ("what do you typically get paid").
  const recentSorted = [...last3].sort((a, b) => a - b);
  const p20RecentPaise = recentSorted.length > 0
    ? recentSorted[Math.max(0, Math.min(recentSorted.length - 1, Math.round(0.2 * (recentSorted.length - 1))))]
    : null;

  if (!rule && !hasHistory) {
    return { consistency: 'irregular', nextDate: null, eventAmountPaise: null, medianRecentPaise, ...spread };
  }

  const consistency = rule && cv == null
    ? 'regular' // a rule with too little history yet to compute a CV: trust the rule itself.
    : cv == null ? 'irregular' : cv < 0.15 ? 'regular' : cv < 0.5 ? 'variable' : 'irregular';

  if (rule) {
    const skips = new Set(snapshot.recurring.skips[rule.id] ?? []);
    return {
      consistency,
      nextDate: nextUnskippedOccurrence(rule, snapshot.asOf, skips),
      eventAmountPaise: myIncomeAmount(rule, snapshot.meId),
      medianRecentPaise,
      ...spread,
    };
  }

  if (consistency === 'irregular' || incomeRows.length < 2) {
    return { consistency, nextDate: null, eventAmountPaise: null, medianRecentPaise, ...spread };
  }

  // No rule, but a `variable` reading: infer a next date from the median gap
  // between the last few income rows (own history, not a promise) — the
  // closest this slice gets to "the expected date" without one being written
  // down anywhere.
  const recent = incomeRows.slice(-4);
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) gaps.push(recent[i].date - recent[i - 1].date);
  const gapDays = gaps.length > 0 ? median(gaps) / DAY_MS : null;
  const lastDate = incomeRows[incomeRows.length - 1].date;
  const inferredNext = gapDays != null ? lastDate + Math.round(gapDays) * DAY_MS : null;

  return {
    consistency,
    nextDate: inferredNext != null && inferredNext > snapshot.asOf ? inferredNext : null,
    eventAmountPaise: p20RecentPaise,
    medianRecentPaise,
    ...spread,
  };
}

/** §4 E3: irregular income gets a 60-day safety horizon instead of 30 ("freelancer 60 d") — there is no known next payday to size the horizon to, so the floor itself is wider. */
export const IRREGULAR_MIN_HORIZON_DAYS = 60;

/**
 * §4 E2's repayment-likelihood model, one friend at a time: Beta-binomial,
 * prior Beta(1, 2) (≈33% before any history — cautious, not neutral). Every
 * past settlement with this person counts as a success; this app's data model
 * has no representation of a debt that was *never* repaid (there is no
 * "forgiven"/written-off state), so there is nothing to count as a failure —
 * the honest limit that follows is that "always eventually settles, just
 * slowly" and "reliably settles fast" read identically here. Telling them
 * apart needs each settlement paired with the debt date it closes, which
 * isn't part of `FinanceSnapshot.receivables` (only settlement dates/amounts
 * are) — a real, scoped-out follow-up, not silently assumed away.
 *
 * `delayDays` — "the median days-to-settle" (§4 E2) — is approximated as the
 * median gap between this person's own past settlements (a typical cycle
 * length), for the same reason: no paired debt date to measure the true delay
 * from. Default 30, per spec, below 2 settlements.
 *
 * **Never synced, never shown as a score** (§4 E2) — this function is pure,
 * reads only from an in-memory `FinanceSnapshot`, and nothing under
 * `db/queries/`, `lib/sync/` or `server/` may import it
 * (`repaymentNeverSyncs.test.ts` is the guard).
 */
export function repaymentModel(snapshot: FinanceSnapshot, personId: string): RepaymentModel {
  const settlements = snapshot.receivables.find(r => r.personId === personId)?.settlements ?? [];
  const successes = settlements.length;
  const probability = (1 + successes) / (1 + 2 + successes);

  if (settlements.length < 2) return { probability, delayDays: 30 };
  const sorted = [...settlements].sort((a, b) => a.date - b.date);
  const gapsDays: number[] = [];
  for (let i = 1; i < sorted.length; i++) gapsDays.push((sorted[i].date - sorted[i - 1].date) / DAY_MS);
  return { probability, delayDays: Math.max(1, Math.round(median(gapsDays))) };
}

const MONTH_MS = 30 * DAY_MS;

/**
 * §4 E2 "True expenses": yearly commitments + dated goals due within `months`,
 * spread as a monthly set-aside (a sinking fund) — so a ₹60k yearly fee claims
 * only its accrual (60k / months-until-due) each month, never the lump sum,
 * until it's actually due. Quarterly/custom cadences are cut (no `'quarterly'`
 * in `RecurFreq` to tell them from a plain custom rule) — yearly + goals only.
 */
export function trueExpenses(snapshot: FinanceSnapshot, months = 12): TrueExpense[] {
  const horizonEnd = snapshot.asOf + months * MONTH_MS;
  const out: TrueExpense[] = [];

  for (const r of snapshot.recurring.rules) {
    if (r.kind !== 'expense' || r.recur_freq !== 'yearly' || r.pendingApproval) continue;
    if (r.recur_state && r.recur_state !== 'active') continue;
    const due = nextUnskippedOccurrence(r, snapshot.asOf, new Set(snapshot.recurring.skips[r.id] ?? []));
    if (due == null || due > horizonEnd) continue;
    const monthsUntil = Math.max(1, Math.ceil((due - snapshot.asOf) / MONTH_MS));
    out.push({ label: r.note?.trim() || r.category, dueDate: due, monthlyAccrualPaise: Math.round(myShareOrTotal(r, snapshot.meId) / monthsUntil) });
  }

  for (const g of snapshot.goals.list) {
    if (!g.target_date || g.target_date > horizonEnd || g.target_date <= snapshot.asOf) continue;
    const remaining = g.target - (snapshot.goals.savedByGoal[g.id] ?? 0);
    if (remaining <= 0) continue;
    const monthsUntil = Math.max(1, Math.ceil((g.target_date - snapshot.asOf) / MONTH_MS));
    out.push({ label: g.name, dueDate: g.target_date, monthlyAccrualPaise: Math.round(remaining / monthsUntil) });
  }

  return out;
}

/**
 * Coarse monthly view over the 12-month commitment horizon (§4 E3/E4) —
 * separate from the daily safety-horizon walk (`projectKnown`),
 * never summed into it. `surplusPaise` is `null` (nothing judgeable) when
 * income is `irregular` — no monthly income figure to compare against.
 */
export function monthlyAffordability(snapshot: FinanceSnapshot, months = 12): MonthlyAffordability[] {
  const expenses = trueExpenses(snapshot, months);
  const income = incomeModel(snapshot);
  const rate = everydayRate(snapshot) ?? 0;
  const monthlyIncome = income.consistency === 'irregular' ? null : (income.eventAmountPaise ?? income.medianRecentPaise);
  const monthlyBills = snapshot.recurring.rules
    // Every cadence, at its monthly equivalent — a weekly or every-N-days bill is as real a claim on
    // income as a monthly one. Yearly is left out: `trueExpenses` already accrues it.
    .filter(r => r.kind === 'expense' && r.recur_freq && r.recur_freq !== 'yearly' && !r.pendingApproval && (!r.recur_state || r.recur_state === 'active'))
    .reduce((s, r) => s + recurringMonthlyEquivalent(myShareOrTotal(r, snapshot.meId), r.recur_freq, r.recur_interval), 0);

  const out: MonthlyAffordability[] = [];
  for (let m = 0; m < months; m++) {
    const monthStart = snapshot.asOf + m * MONTH_MS;
    const requiredPaise = expenses.filter(e => e.dueDate >= monthStart).reduce((s, e) => s + e.monthlyAccrualPaise, 0);
    const surplusPaise = monthlyIncome != null ? monthlyIncome - monthlyBills - rate * 30 : null;
    out.push({
      monthIndex: m, monthStart, requiredPaise, surplusPaise, unfundable: surplusPaise != null && requiredPaise > surplusPaise,
      incomePaise: monthlyIncome, billsPaise: monthlyBills, everydayPaise: rate * 30,
    });
  }
  return out;
}
