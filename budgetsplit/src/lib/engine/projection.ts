/**
 * E3 — the balance, day by day (`SPEC-ENGINE.md` §4). Pure.
 *
 * First slice (`EN2`): the deterministic path only — known events plus the
 * everyday rate, over a fixed 30-day horizon. No uncertainty band yet (that's
 * `EN3`); no income or receivables as events yet (that's `EN5` — matching
 * today's `upcomingBills`, which is bills only, on purpose: crediting a payday
 * that hasn't happened as money "safe to spend today" is a different, larger
 * claim than this slice makes, and it's the one this task's own accept
 * criterion is written against — every persona in `enginePersonas.ts` has a
 * payday inside 30 days, so income counting here would make it impossible to
 * satisfy).
 */
import type { FinanceSnapshot, KnownEvent, Projection } from './types';
import { expandUpcoming } from '../upcoming';
import { STS_HORIZON_DAYS } from '../safeToSpend';
import { everydayRate } from './behaviour';

const DAY_MS = 86_400_000;

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
 * Income (regular, variable or irregular) and receivables are deliberately
 * absent — see the file header — as is everything EN5's income model would add.
 */
export function knownEvents(snapshot: FinanceSnapshot, horizonEndMs: number): KnownEvent[] {
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
  return events.sort((a, b) => a.date - b.date);
}

/**
 * The deterministic path: `available` today, walked forward one day at a time,
 * each day taking its known events and the everyday rate. `lowPoint` is the
 * path's minimum — with no income modelled yet (see the file header) every
 * event only ever takes money out, so the path never rises and the low point
 * is always the final day. Found by walking rather than assumed, so this
 * keeps working unchanged once `EN5` adds events that DO raise the balance.
 */
export function projectKnown(snapshot: FinanceSnapshot, horizonDays: number = STS_HORIZON_DAYS): Projection {
  const horizonEndMs = snapshot.asOf + horizonDays * DAY_MS;
  const events = knownEvents(snapshot, horizonEndMs);
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
