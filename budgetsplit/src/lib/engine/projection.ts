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
import type { FinanceSnapshot, KnownEvent, PercentileDay, Projection, UncertaintyBand } from './types';
import { expandUpcoming } from '../upcoming';
import { STS_HORIZON_DAYS } from '../safeToSpend';
import { dailySample, essentialFloor, everydayRate } from './behaviour';
import { hashSnapshot, mulberry32 } from './rng';

const DAY_MS = 86_400_000;
/** §4 E3: "500 paths". */
const SIMULATION_PATHS = 500;
/** §4 E2: "a 7-day block sample for the bootstrap, keeping the weekday rhythm." */
const BLOCK_DAYS = 7;

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

/**
 * Every known event's amount, bucketed to its day index (0-based, matching
 * `projectKnown`'s own day windows: `[asOf, asOf+1day)` … with the horizon's
 * last instant inclusive). `knownEvents` already clips to `horizonEndMs`, so
 * the only out-of-range case is an event dated exactly on `horizonEndMs`
 * itself, which belongs to the final day.
 */
function eventDeltaByDay(events: KnownEvent[], asOf: number, horizonDays: number): number[] {
  const totals = new Array<number>(horizonDays).fill(0);
  for (const e of events) {
    // Plain floor division reproduces `projectKnown`'s exclusive-at-top day
    // windows exactly; clamping to the last index is what reproduces its one
    // exception, the horizon's own top instant, which that day claims inclusively.
    const idx = Math.min(horizonDays - 1, Math.max(0, Math.floor((e.date - asOf) / DAY_MS)));
    totals[idx] += e.amountPaise;
  }
  return totals;
}

/** One 7-day block, drawn (with replacement) from `sample` starting at a random offset — wrapping circularly, so a short sample still yields a full block. */
function drawBlock(rng: () => number, sample: number[]): number[] {
  const start = Math.floor(rng() * sample.length);
  const block = new Array<number>(BLOCK_DAYS);
  for (let i = 0; i < BLOCK_DAYS; i++) block[i] = sample[(start + i) % sample.length];
  return block;
}

/** Nearest-rank percentile over an already-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * E3, second slice (`EN3`): the uncertainty band around `projectKnown`'s
 * deterministic path. Every path shares the same known events (§4 E3's
 * "known events" are, by definition, not uncertain); only the everyday-spend
 * draw for each day differs, one 7-day block at a time, from the person's own
 * sample (§4 E2). The PRNG is seeded from the snapshot itself
 * (`hashSnapshot`), so the same ledger always simulates the same 500 futures.
 *
 * **Thin data** (§4 E3): below `everydayRate`'s own 30-day minimum, there is
 * no sample to bootstrap from, so no simulation runs — the band collapses
 * onto the known path exactly, and `cautiousLowPoint` is that path's own low
 * point.
 */
export function projectBand(
  snapshot: FinanceSnapshot,
  horizonDays: number = STS_HORIZON_DAYS,
  paths: number = SIMULATION_PATHS,
): UncertaintyBand {
  const known = projectKnown(snapshot, horizonDays);
  const floor = essentialFloor(snapshot);
  const sample = dailySample(snapshot);

  if (everydayRate(snapshot) == null || sample.length === 0) {
    return {
      paths: 0,
      days: known.days.map(d => ({ date: d.date, p10: d.balance, p50: d.balance, p90: d.balance })),
      cautiousLowPoint: known.lowPoint.amount,
      floor,
    };
  }

  const horizonEndMs = snapshot.asOf + horizonDays * DAY_MS;
  const deltas = eventDeltaByDay(knownEvents(snapshot, horizonEndMs), snapshot.asOf, horizonDays);
  const rng = mulberry32(hashSnapshot(snapshot));

  const balancesByDay: number[][] = Array.from({ length: horizonDays }, () => []);
  const lowPoints: number[] = [];

  for (let p = 0; p < paths; p++) {
    let balance = snapshot.cash.available;
    let low = balance;
    let block: number[] = [];
    let blockPos = BLOCK_DAYS;

    for (let d = 0; d < horizonDays; d++) {
      balance += deltas[d];
      if (blockPos >= BLOCK_DAYS) {
        block = drawBlock(rng, sample);
        blockPos = 0;
      }
      balance -= block[blockPos++];

      if (balance < low) low = balance;
      balancesByDay[d].push(balance);
    }
    lowPoints.push(low);
  }

  const days: PercentileDay[] = known.days.map((d, i) => {
    const sorted = [...balancesByDay[i]].sort((a, b) => a - b);
    return { date: d.date, p10: percentile(sorted, 10), p50: percentile(sorted, 50), p90: percentile(sorted, 90) };
  });

  const sortedLows = [...lowPoints].sort((a, b) => a - b);
  return { paths, days, cautiousLowPoint: percentile(sortedLows, 20), floor };
}
