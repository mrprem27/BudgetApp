/**
 * E3 — the balance, day by day (`SPEC-ENGINE.md` §4). Pure.
 *
 * `EN2` built the deterministic path over a fixed 30-day horizon, with no
 * income or receivables as events — crediting a payday that hasn't happened
 * as money "safe to spend today" is a bigger claim than that slice made, and
 * every persona in `enginePersonas.ts` has a payday inside 30 days, which made
 * counting it there impossible to satisfy against EN2's own accept criterion.
 * `EN3` added the uncertainty band. `EN5` (this slice) adds both income and
 * receivables — but **opt-in**, behind `withIncome`, defaulting `false`:
 * `safeToSpendV2`/`afford()` (`EN2`/`EN4`) and their whole test suite are
 * built and locked against the income-less numbers, and changing the DEFAULT
 * would silently change what they compute. A future task (`EN10`/`EN11`,
 * "switch Safe-to-Spend"/"switch Afford") is where a real screen starts
 * passing `withIncome: true`; until then it's an explicit, tested opt-in.
 */
import type { FinanceSnapshot, KnownEvent, PercentileDay, Projection, UncertaintyBand } from './types';
import { expandUpcoming } from '../upcoming';
import { STS_HORIZON_DAYS } from '../safeToSpend';
import { materializeInstances } from '../recurrence';
import {
  dailySample, essentialFloor, everydayRate, incomeModel, repaymentModel, IRREGULAR_MIN_HORIZON_DAYS,
} from './behaviour';
import { hashSnapshot, mulberry32 } from './rng';

const DAY_MS = 86_400_000;
/** §4 E3: "500 paths". */
export const SIMULATION_PATHS = 500;
/** §4 E2: "a 7-day block sample for the bootstrap, keeping the weekday rhythm." */
const BLOCK_DAYS = 7;

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
 * Income and receivables are added only when `withIncome` is true (file
 * header) — absent that, this is exactly `EN2`'s original subset.
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

type ReceivableDraw = { personId: string; amountPaise: number; dayIndex: number; probability: number };

/**
 * Each net-positive per-person exposure (§4 E1's `exposure.perPerson`) becomes
 * one uncertain arrival (§4 E3): whether it lands in a given simulated path is
 * a Bernoulli draw at `repaymentModel`'s own probability, landing on the day
 * its typical delay implies — clamped into the horizon's last day if that
 * delay would fall past it, the same clamp `eventDeltaByDay` uses for a known
 * event on the horizon's own edge.
 */
function receivableDraws(snapshot: FinanceSnapshot, horizonDays: number): ReceivableDraw[] {
  return snapshot.exposure.perPerson
    .filter(p => p.net > 0)
    .map(p => {
      const model = repaymentModel(snapshot, p.personId);
      return {
        personId: p.personId,
        amountPaise: p.net,
        dayIndex: Math.min(horizonDays - 1, Math.max(0, model.delayDays)),
        probability: model.probability,
      };
    });
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
  extraEvents: KnownEvent[] = [],
  /** `EN5`, opt-in — see the file header. Also gates receivable arrivals
   *  (§4 E3's other uncertain event), bundled under this one switch since
   *  nothing needs one without the other yet — split them if that changes. */
  withIncome = false,
): UncertaintyBand {
  const known = projectKnown(snapshot, horizonDays, extraEvents, withIncome);
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
  const deltas = eventDeltaByDay(knownEvents(snapshot, horizonEndMs, withIncome).concat(extraEvents), snapshot.asOf, horizonDays);
  const rng = mulberry32(hashSnapshot(snapshot));
  const receivables = withIncome ? receivableDraws(snapshot, horizonDays) : [];

  const balancesByDay: number[][] = Array.from({ length: horizonDays }, () => []);
  const lowPoints: number[] = [];

  for (let p = 0; p < paths; p++) {
    let balance = snapshot.cash.available;
    let low = balance;
    let block: number[] = [];
    let blockPos = BLOCK_DAYS;

    // Each receivable's own Bernoulli draw for THIS path, before the day walk
    // so its arrival (if any) is already known when that day is reached.
    const arrivals = new Array<number>(horizonDays).fill(0);
    for (const r of receivables) {
      if (rng() < r.probability) arrivals[r.dayIndex] += r.amountPaise;
    }

    for (let d = 0; d < horizonDays; d++) {
      balance += deltas[d] + arrivals[d];
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
