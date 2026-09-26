/**
 * E3 — the balance, day by day (`SPEC-ENGINE.md` §4). Pure.
 *
 * `EN2` built the deterministic path over a fixed 30-day horizon, with no
 * income or receivables as events — crediting a payday that hasn't happened
 * as money "safe to spend today" is a bigger claim than that slice made, and
 * every persona in `enginePersonas.ts` has a payday inside 30 days, which made
 * counting it there impossible to satisfy against EN2's own accept criterion.
 * `EN5` adds income — opt-in behind `withIncome` (default `false`), so EN2's
 * parity numbers stay put until a real screen switches over (`EN10`/`EN11`).
 *
 * **Deterministic only, on purpose.** A 500-path bootstrap band (`EN3`) was
 * built and then removed: a back-test showed it miscalibrated on every seed
 * tried, and synthetic fixtures can't honestly validate one — §8 says that
 * takes real pilot data. Until then the floor (a week of essentials) is the
 * cushion against a bad week, and every number here can be explained.
 * `SPEC-ENGINE.md` §12b L7 has the evidence; git history has the code.
 */
import type { FinanceSnapshot, KnownEvent, Projection } from './types';
import { expandUpcoming } from '../upcoming';
import { STS_HORIZON_DAYS } from '../safeToSpend';
import { materializeInstances } from '../recurrence';
import { everydayRate, incomeModel, IRREGULAR_MIN_HORIZON_DAYS } from './behaviour';

const DAY_MS = 86_400_000;

/**
 * The safety horizon, sized to the next payday rather than a flat 30 days
 * (`EN5`, "horizon to next income"): at least 30 days regardless, extended to
 * cover a known/inferred payday further out, and at least
 * `IRREGULAR_MIN_HORIZON_DAYS` (60) when income is `irregular` — there is no
 * next date to size to, so the floor widens instead ("freelancer 60 d").
 * Callers opt into this explicitly (see the file header) rather than it
 * becoming every function's default.
 */
export function horizonDaysFor(snapshot: FinanceSnapshot): number {
  const income = incomeModel(snapshot);
  if (income.consistency === 'irregular') return Math.max(STS_HORIZON_DAYS, IRREGULAR_MIN_HORIZON_DAYS);
  if (income.nextDate == null) return STS_HORIZON_DAYS;
  const daysUntil = Math.ceil((income.nextDate - snapshot.asOf) / DAY_MS);
  return Math.max(STS_HORIZON_DAYS, daysUntil);
}

/**
 * Income's own known events (§4 E3): every occurrence of an active recurring
 * income rule inside the horizon, my-share amount. `irregular` contributes
 * nothing, matching §4 E3's own rule ("nothing, unless a rule exists").
 *
 * A `variable` reading with **no rule** also contributes nothing here, on
 * purpose — narrower than the spec's own "20th percentile of recent amounts"
 * line reads. `incomeModel`'s inferred next date, for that case, comes from
 * the median gap between a handful of irregular income rows: a genuinely
 * thin basis for a specific claimed DATE. `horizonDaysFor` still uses it, but
 * only to widen the safety window — the conservative direction, since a wrong
 * guess there just means looking further ahead than strictly needed. Placing
 * a dated, positive event on the projection from the same guess is the other
 * direction: a wrong guess would silently relieve a real low-point warning.
 * That asymmetry is why the two uses were split rather than sharing one gate.
 */
function incomeEvents(snapshot: FinanceSnapshot, horizonEndMs: number): KnownEvent[] {
  const rule = snapshot.recurring.rules.find(
    r => r.kind === 'income' && r.recur_freq && !r.pendingApproval && (!r.recur_state || r.recur_state === 'active'),
  );
  if (!rule) return [];
  const skips = new Set(snapshot.recurring.skips[rule.id] ?? []);
  const amount = rule.payments.find(p => p.personId === snapshot.meId)?.amount ?? 0;
  return materializeInstances(rule, snapshot.asOf, horizonEndMs, skips)
    .map(inst => ({ date: inst.date, amountPaise: amount, label: 'Income' }));
}

function skipsToMap(skips: Record<string, number[]>): Map<string, Set<number>> {
  return new Map(Object.entries(skips).map(([id, dates]) => [id, new Set(dates)]));
}

/**
 * The day of `dueDay` on or after `fromMs`, in the same month if it hasn't
 * passed yet this month, else the next one. UTC, matching how the rest of the
 * engine treats dates (§4 E1's snapshot carries epoch ms throughout).
 */
function nextDueDate(fromMs: number, dueDay: number): number {
  const d = new Date(fromMs);
  const thisMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), dueDay);
  if (thisMonth >= fromMs) return thisMonth;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, dueDay);
}

/**
 * Every deterministic, dated claim on cash between now and `horizonEndMs` (§4
 * E3 "known events", this slice's subset):
 *
 * - bills: my-share recurring-rule occurrences (`expandUpcoming` — expense
 *   only, exactly `getSafeToSpend`'s `upcomingBills` basis) plus already-logged
 *   future one-off expenses;
 * - the three claims today's Safe-to-Spend treats as due immediately, dated at
 *   `asOf` so a horizon with none of the above collapses to the same total
 *   this task's accept criterion checks: card repayment (or its due day, if
 *   known), goal contributions still due this cycle, and net money I owe.
 *
 * Income is added only when `withIncome` is true (file header) — absent that,
 * this is exactly `EN2`'s original subset. Receivables are never counted as
 * money (the cautious choice); `afford()` only names one when it would tip
 * the answer.
 */
export function knownEvents(snapshot: FinanceSnapshot, horizonEndMs: number, withIncome = false): KnownEvent[] {
  const events: KnownEvent[] = [];
  const skips = skipsToMap(snapshot.recurring.skips);

  for (const o of expandUpcoming(snapshot.recurring.rules, snapshot.meId, snapshot.asOf, horizonEndMs, skips)) {
    events.push({ date: o.dateMs, amountPaise: -o.amount, label: o.name });
  }
  for (const t of snapshot.futureOneOffs) {
    if (t.kind !== 'expense' || t.date > horizonEndMs) continue;
    events.push({ date: t.date, amountPaise: -t.amountPaise, label: t.category });
  }
  if (snapshot.cash.creditUsed > 0) {
    const due = snapshot.cash.cardDueDay != null ? nextDueDate(snapshot.asOf, snapshot.cash.cardDueDay) : snapshot.asOf;
    events.push({ date: Math.min(due, horizonEndMs), amountPaise: -snapshot.cash.creditUsed, label: 'Card repayment' });
  }
  if (snapshot.goals.funding.remaining > 0) {
    events.push({ date: snapshot.asOf, amountPaise: -snapshot.goals.funding.remaining, label: 'Goal contributions due' });
  }
  if (snapshot.exposure.owe > 0) {
    events.push({ date: snapshot.asOf, amountPaise: -snapshot.exposure.owe, label: 'What I owe' });
  }
  if (withIncome) events.push(...incomeEvents(snapshot, horizonEndMs));
  return events.sort((a, b) => a.date - b.date);
}

/**
 * The deterministic path: `available` today, walked forward one day at a time,
 * each day taking its known events and the everyday rate. `lowPoint` is found
 * by walking (the actual minimum balance seen), not assumed to be the final
 * day — true with `withIncome: false` (every event only takes money out, so
 * the path never rises), and still correct once `withIncome: true` lets a
 * payday raise it mid-horizon.
 */
export function projectKnown(
  snapshot: FinanceSnapshot,
  horizonDays: number = STS_HORIZON_DAYS,
  /** A hypothetical purchase's own events (§4 E4, `EN4`'s `afford()`) — merged
   *  in alongside the snapshot's real known events, never persisted anywhere. */
  extraEvents: KnownEvent[] = [],
  /** `EN5`, opt-in — see the file header. */
  withIncome = false,
): Projection {
  const horizonEndMs = snapshot.asOf + horizonDays * DAY_MS;
  const events = knownEvents(snapshot, horizonEndMs, withIncome).concat(extraEvents).sort((a, b) => a.date - b.date);
  const rate = everydayRate(snapshot);

  let balance = snapshot.cash.available;
  const days: Projection['days'] = [];
  let low: Projection['lowPoint'] = { amount: balance, date: snapshot.asOf, events: [] };

  for (let d = 1; d <= horizonDays; d++) {
    const windowStart = snapshot.asOf + (d - 1) * DAY_MS;
    const windowEnd = snapshot.asOf + d * DAY_MS;
    // The horizon's last instant is inclusive (matches `getTransactionsInRange`'s
    // own `<=`); every earlier boundary is exclusive at the top, so an event
    // dated exactly on a day's edge is never claimed by two days at once.
    const todays = events.filter(e => e.date >= windowStart && (d < horizonDays ? e.date < windowEnd : e.date <= windowEnd));
    for (const e of todays) balance += e.amountPaise;
    if (rate != null) balance -= rate;

    days.push({ date: windowEnd, balance, events: todays });
    if (balance < low.amount) low = { amount: balance, date: windowEnd, events: todays.map(e => e.label) };
  }

  return { horizonDays, dailyRate: rate, days, lowPoint: low };
}
