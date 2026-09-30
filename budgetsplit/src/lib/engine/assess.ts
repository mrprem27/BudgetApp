/**
 * E4 — the questions, answered on the projection (`SPEC-ENGINE.md` §4). Pure.
 *
 * Both answers default to the v1 policy (spec §2): the horizon runs to the next
 * payday (`horizonDaysFor`, at least 30 days) and the salary is counted. Same
 * defaults on both, so Safe-to-Spend and Afford can't disagree.
 */
import type { AffordReason, AffordVerdict, FinanceSnapshot, KnownEvent, Projection, Purchase, AffordResult, TippingReceivable, MonthlyAffordability } from './types';
import { projectKnown, horizonDaysFor, utcMonthDay } from './projection';
import { essentialFloor, defaultNecessity, repaymentModel, monthlyAffordability } from './behaviour';
import { explain } from './explain';
import { recurringMonthlyEquivalent } from '../recurrence';
import { windowForCadence } from '../budget';
import { formatRupees } from '../money';

const DAY_MS = 86_400_000;

export type SafeToSpendV2 = {
  /** The largest amount spendable today while the projected path never goes
   *  below zero — the path's own low point. May be negative: already
   *  over-committed is the honest answer, not an error (matches today's `SafeToSpend`). */
  amount: number;
  lowPoint: Projection['lowPoint'];
  dailyRate: number | null;
  projection: Projection;
};

/**
 * `safeToSpend()` = the largest `x` such that spending `x` today keeps the
 * projected low point ≥ 0. Spending `x` today only shifts the starting
 * balance, so the whole path — and its low point — shifts down by exactly
 * `x`: the answer is the unshifted path's own low point.
 */
export function safeToSpendV2(
  snapshot: FinanceSnapshot,
  horizonDays: number = horizonDaysFor(snapshot),
  withIncome = true,
): SafeToSpendV2 {
  const projection = projectKnown(snapshot, horizonDays, [], withIncome);
  return {
    amount: projection.lowPoint.amount,
    lowPoint: projection.lowPoint,
    dailyRate: projection.dailyRate,
    projection,
  };
}

/**
 * `afford()`, first slice (`EN4`). A prospective purchase's own events (§4 E4:
 * "adds the purchase as an event ... and re-projects").
 *
 * Recurring purchases repeat at their own interval up to the horizon — the
 * exact mechanism real recurring bills already use (`expandUpcoming`), just
 * for a purchase that doesn't exist as a transaction yet. `startMs` is
 * `snapshot.asOf` for the purchase actually happening now; `earliestComfortableDate`
 * below calls this with a later `startMs` to ask "what if it happened then instead".
 *
 * A `yearly` recurrence only ever lands once inside the 30-day safety horizon
 * — telling it apart from a one-time purchase needs the 12-month commitment
 * view, which is `EN6`'s sinking-fund machinery, not built yet.
 */
export function purchaseEvents(purchase: Purchase, startMs: number, horizonEndMs: number): KnownEvent[] {
  const label = purchase.category ?? 'Purchase';
  const events: KnownEvent[] = [];
  if (startMs > horizonEndMs) return events;

  if (purchase.recurrence === 'weekly') {
    for (let d = startMs; d <= horizonEndMs; d += 7 * DAY_MS) events.push({ date: d, amountPaise: -purchase.amountPaise, label, kind: 'purchase' });
  } else if (purchase.recurrence === 'monthly') {
    // Each month is worked out from the first date, not from the previous one, so a 31st that
    // lands on a short month's last day comes back to the 31st the month after.
    const first = new Date(startMs);
    for (let k = 0; ; k++) {
      const d = k === 0 ? startMs : utcMonthDay(first.getUTCFullYear(), first.getUTCMonth() + k, first.getUTCDate());
      if (d > horizonEndMs) break;
      events.push({ date: d, amountPaise: -purchase.amountPaise, label, kind: 'purchase' });
    }
  } else {
    // No recurrence, or `yearly` — see the file-header note above.
    events.push({ date: startMs, amountPaise: -purchase.amountPaise, label, kind: 'purchase' });
  }
  return events;
}

/**
 * "Takes a category over a budget the person set themselves" (§4 E4's "Tight"
 * row) — checked only against an explicit **monthly** budget for the
 * purchase's category. Daily/yearly-cadence budgets aren't handled yet
 * (`windowForCadence` + `budgetEquivalent`, `lib/budget.ts`, already generalize
 * this for the Budget screen; wiring the same generalization here is
 * straightforward follow-up, not done in this slice since nothing in `EN4`'s
 * own accept criteria exercises it). No budget for the category, or no
 * category on the purchase at all: no reason.
 */
function overBudgetReason(snapshot: FinanceSnapshot, purchase: Purchase): AffordReason | null {
  const check = budgetCheck(snapshot, purchase);
  if (!check || check.afterPaise <= check.budgetPaise) return null;
  return { code: 'over_budget', amountPaise: check.afterPaise - check.budgetPaise, label: `Over your ${purchase.category} budget` };
}

/**
 * The numbers `overBudgetReason` judges on — exported so `affordTrace` shows the
 * very figures the verdict read, not a re-derivation of them. `null` when there
 * is no category, or no monthly budget for it.
 */
export function budgetCheck(snapshot: FinanceSnapshot, purchase: Purchase): {
  budgetPaise: number; spentPaise: number; effectPaise: number; afterPaise: number;
} | null {
  if (!purchase.category) return null;
  const budget = snapshot.budgets.find(b => b.category === purchase.category && b.cadence === 'monthly');
  if (!budget) return null;

  const { from, to } = windowForCadence('monthly', new Date(snapshot.asOf));
  const spent = snapshot.history
    .filter(h => h.kind === 'expense' && h.category === purchase.category && h.date >= from && h.date <= to)
    .reduce((s, h) => s + h.amountPaise, 0);

  const effect = purchase.recurrence
    ? recurringMonthlyEquivalent(purchase.amountPaise, purchase.recurrence)
    : purchase.amountPaise;

  return { budgetPaise: budget.amount, spentPaise: spent, effectPaise: effect, afterPaise: spent + effect };
}

/**
 * What every `evaluate()` call in one `afford()` invocation shares: the
 * snapshot, the horizon and the one already-computed "is a future month
 * unfundable" fact. `monthlyAffordability(snapshot)` depends on nothing the
 * purchase amount or date can change, but `evaluate()` is called up to ~90
 * times by `largestComfortableAmount`'s binary search and up to `horizonDays`
 * times by `findEarliestComfortableDate` — computing it once here and passing
 * it through, instead of inside `evaluate()`, is the difference between one
 * pass over income/expense history and ~90 identical ones.
 */
type EvalContext = {
  snapshot: FinanceSnapshot;
  horizonDays: number;
  horizonEndMs: number;
  floor: number;
  withIncome: boolean;
  brokenMonth: MonthlyAffordability | undefined;
};

function evalContext(snapshot: FinanceSnapshot, horizonDays: number, floor: number, withIncome: boolean): EvalContext {
  return {
    snapshot,
    horizonDays,
    horizonEndMs: snapshot.asOf + horizonDays * DAY_MS,
    floor,
    withIncome,
    brokenMonth: withIncome ? monthlyAffordability(snapshot).find(m => m.unfundable) : undefined,
  };
}

type Evaluation = {
  lowPointAfter: number;
  lowPointAfterDate: number;
  overBudget: AffordReason | null;
  unfundable: AffordReason | null;
  cashShort: boolean;
  belowFloor: boolean;
  verdict: AffordVerdict;
};

/**
 * The verdict table (§4 E4), minus one row: a Want pushing a dated goal past
 * its target needs `goalForecast`, not built yet. The other row — a known
 * commitment becoming unfundable within 12 months (`EN6`) — is checked here
 * from `ctx.brokenMonth`, computed once per `afford()` call (see `EvalContext`).
 * It's a property of the ledger itself, not of the purchase being asked
 * about — "already broken" makes today's answer No regardless of amount, and
 * its rupee figure is never the same money `cash_short`/`below_floor` already
 * counted.
 *
 * Returns `cashShort`/`belowFloor` rather than making the caller re-derive
 * them from `lowPointAfter` a second time — the verdict and the reasons it's
 * built from must read the exact same threshold check, not two copies of it.
 */
function evaluate(purchase: Purchase, startMs: number, ctx: EvalContext): Evaluation {
  const events = purchaseEvents(purchase, startMs, ctx.horizonEndMs);
  const projection = projectKnown(ctx.snapshot, ctx.horizonDays, events, ctx.withIncome);
  const lowPointAfter = projection.lowPoint.amount;
  const cashShort = lowPointAfter < 0;
  const overBudget = overBudgetReason(ctx.snapshot, purchase);
  const belowFloor = !cashShort && lowPointAfter < ctx.floor;

  const unfundable = ctx.brokenMonth
    ? { code: 'unfundable_commitment' as const, amountPaise: ctx.brokenMonth.requiredPaise - (ctx.brokenMonth.surplusPaise ?? 0), label: 'A commitment within 12 months can\'t be funded at this rate' }
    : null;

  const verdict: AffordVerdict = (cashShort || unfundable) ? 'not-affordable' : (belowFloor || overBudget) ? 'tight' : 'comfortable';
  return { lowPointAfter, lowPointAfterDate: projection.lowPoint.date, overBudget, unfundable, cashShort, belowFloor, verdict };
}

/**
 * `safeToSpend()` = the largest `x` such that `afford(x, now, want)` keeps the
 * cautious low point ≥ the floor (§4 E4) — by binary search, since `evaluate`
 * is no longer linear in `x` once a budget line is in play (`overBudgetReason`
 * can start or stop applying as `x` grows, same direction as the cash test).
 * Holds the purchase's own category/recurrence/necessity fixed and varies only
 * the amount — "how much more of this same kind of purchase, comfortably".
 */
function largestComfortableAmount(purchase: Purchase, ctx: EvalContext): number {
  const isOk = (amt: number) => evaluate({ ...purchase, amountPaise: Math.max(0, amt) }, ctx.snapshot.asOf, ctx).verdict === 'comfortable';
  if (!isOk(0)) return 0;

  let lo = 0;
  let hi = Math.max(ctx.snapshot.cash.available, 100);
  for (let guard = 0; guard < 60 && isOk(hi); guard++) hi *= 2;
  for (let i = 0; i < 30 && hi - lo > 1; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (isOk(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/** Only for `when: 'can-wait'`: the earliest day within the horizon this same purchase would be Comfortable, scanning forward one day at a time. `undefined` if none is. */
function findEarliestComfortableDate(purchase: Purchase, ctx: EvalContext): number | undefined {
  for (let d = ctx.snapshot.asOf; d <= ctx.horizonEndMs; d += DAY_MS) {
    if (evaluate(purchase, d, ctx).verdict === 'comfortable') return d;
  }
  return undefined;
}

/**
 * §4 E4: "receivables called out when they tip the answer". Reads as a
 * conditional promise ("Comfortable IF Aarav pays you") rather than the
 * probabilistic band itself, so it's checked on the DETERMINISTIC path
 * (`projectKnown`), not by re-running the stochastic band: assume this one
 * receivable arrives for certain, at its typical delay, and see whether that
 * alone is what closes the gap to the floor. Only meaningful — and only
 * checked — when `withIncome` is set; without it, receivables aren't in the
 * projection at all (see the file header).
 */
function tippingReceivables(purchase: Purchase, ctx: EvalContext, baselineLowPoint: number): TippingReceivable[] {
  if (!ctx.withIncome) return [];
  const owedToMe = ctx.snapshot.exposure.perPerson.filter(p => p.net > 0);
  if (owedToMe.length === 0) return [];
  if (baselineLowPoint >= ctx.floor) return []; // already fine without assuming any of them

  const purchaseEv = purchaseEvents(purchase, ctx.snapshot.asOf, ctx.horizonEndMs);
  const tipping: TippingReceivable[] = [];
  for (const p of owedToMe) {
    const model = repaymentModel(ctx.snapshot, p.personId);
    const arrival: KnownEvent = { date: ctx.snapshot.asOf + model.delayDays * DAY_MS, amountPaise: p.net, label: 'Receivable', kind: 'receivable', ref: p.personId };
    const withThis = projectKnown(ctx.snapshot, ctx.horizonDays, [...purchaseEv, arrival], ctx.withIncome);
    if (withThis.lowPoint.amount >= ctx.floor) {
      tipping.push({ personId: p.personId, amountPaise: p.net, probability: model.probability, delayDays: model.delayDays });
    }
  }
  return tipping;
}

function headlineFor(verdict: AffordVerdict, lowPointAfter: number): string {
  if (verdict === 'not-affordable') return `You'd be about ${formatRupees(Math.abs(lowPointAfter))} short at the low point`;
  if (verdict === 'tight') return `You'd have about ${formatRupees(lowPointAfter)} left at the low point`;
  return `You'd still have about ${formatRupees(lowPointAfter)} left at the low point`;
}

export function afford(
  snapshot: FinanceSnapshot,
  purchase: Purchase,
  horizonDays: number = horizonDaysFor(snapshot),
  /** Salary counted (spec §2). `false` is the cautious income-less path the
   *  EN2–EN7 tests were written against; `tippingReceivables` needs `true`. */
  withIncome = true,
): AffordResult {
  const resolved: Purchase = { ...purchase, necessity: purchase.necessity ?? defaultNecessity(purchase.category) };
  const floor = essentialFloor(snapshot);
  const ctx = evalContext(snapshot, horizonDays, floor, withIncome);

  const beforeKnown = projectKnown(snapshot, horizonDays, [], withIncome);
  const evalNow = evaluate(resolved, snapshot.asOf, ctx);

  const reasons: AffordReason[] = [];
  if (evalNow.verdict === 'not-affordable') {
    if (evalNow.cashShort) {
      reasons.push({ code: 'cash_short', amountPaise: Math.abs(evalNow.lowPointAfter), label: 'Would go below zero' });
    }
    if (evalNow.unfundable) reasons.push(evalNow.unfundable);
  } else if (evalNow.verdict === 'tight') {
    if (evalNow.belowFloor) {
      reasons.push({ code: 'below_floor', amountPaise: floor - evalNow.lowPointAfter, label: 'Leaves less than a safe week of essentials' });
    }
    if (evalNow.overBudget) reasons.push(evalNow.overBudget);
  }
  reasons.sort((a, b) => b.amountPaise - a.amountPaise);

  const explanation = explain(snapshot);

  const result: AffordResult = {
    verdict: explanation.suppressVerdict ? null : evalNow.verdict,
    explanation,
    headline: explanation.suppressVerdict
      ? `Not enough data yet, ${explanation.missing}`
      : headlineFor(evalNow.verdict, evalNow.lowPointAfter),
    lowPointBefore: { amount: beforeKnown.lowPoint.amount, date: beforeKnown.lowPoint.date },
    lowPointAfter: { amount: evalNow.lowPointAfter, date: evalNow.lowPointAfterDate },
    floor,
    reasons,
    largestComfortableAmount: largestComfortableAmount(resolved, ctx),
    tippingReceivables: tippingReceivables(resolved, ctx, evalNow.lowPointAfter),
  };

  if (resolved.when === 'can-wait' && evalNow.verdict !== 'comfortable') {
    result.earliestComfortableDate = findEarliestComfortableDate(resolved, ctx);
  }

  return result;
}
