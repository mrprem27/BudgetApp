import { addDays, addWeeks, addMonths, addYears, isAfter, isBefore, startOfDay } from 'date-fns';
import type { RecurFreq } from '../constants/enums';
import type { Txn, TxnWithSplits } from '../db/queries/transactions';

export function materializeInstances(
  txn: TxnWithSplits,
  fromMs: number,
  toMs: number,
  /** Occurrence dates (ms) to omit — e.g. user-skipped occurrences. */
  skips?: Set<number>,
): TxnWithSplits[] {
  if (!txn.recur_freq) return [];

  const instances: TxnWithSplits[] = [];
  let cursor = new Date(txn.date);
  const end = txn.recur_end ? new Date(txn.recur_end) : new Date(toMs);
  const rangeEnd = new Date(Math.min(end.getTime(), toMs));
  const rangeStart = new Date(fromMs);

  let n = 0;

  while (!isAfter(cursor, rangeEnd) && n < 1000) {
    const ms = cursor.getTime();
    if (!isBefore(cursor, rangeStart) && !skips?.has(ms)) {
      const virtualId = `${txn.id}_${ms}`;
      instances.push({
        ...txn,
        id: virtualId,
        date: ms,
        recur_override_date: null,
      });
    }
    cursor = occurrenceAt(txn.date, txn.recur_freq, txn.recur_interval ?? 1, ++n);
  }

  return instances;
}

/**
 * The next occurrence date (ms) of a series on or after `fromMs`, or null if the
 * series has ended before then. Used as the split boundary for "this & future"
 * edits and to identify which occurrence "Skip next" removes.
 */
export function nextOccurrenceOnOrAfter(txn: TxnWithSplits, fromMs: number): number | null {
  if (!txn.recur_freq) return null;
  const end = txn.recur_end ? new Date(txn.recur_end) : null;
  const from = new Date(fromMs);
  for (let n = 0; n < 10000; n++) {
    const cursor = occurrenceAt(txn.date, txn.recur_freq, txn.recur_interval ?? 1, n);
    if (end && isAfter(cursor, end)) return null;
    if (!isBefore(cursor, from)) return cursor.getTime();
  }
  return null;
}

/**
 * The next occurrence that is **not skipped** — the date any UI should show as
 * "next", and the one thing `nextOccurrenceOnOrAfter` alone cannot tell you.
 *
 * "Skip next" writes a `recur_skip` row, but every *display* of the next date used
 * the raw projection above, so a skipped bill kept showing its skipped date on Plan,
 * Home's "Coming up", `/plan/recurring` and Reminders. The skip only took effect much
 * later, when `materializeDueOccurrences` declined to create the row — so the feature
 * looked broken even though the data was correct.
 *
 * `skips` is the set of skipped occurrence timestamps for **this** series (see
 * `getSkipsMap`). Walks forward past every skipped date; returns null if the series
 * ends first. Pure, so the walk is unit-testable without a database.
 */
export function nextUnskippedOccurrence(
  txn: TxnWithSplits,
  fromMs: number,
  skips?: ReadonlySet<number>,
): number | null {
  let from = fromMs;
  let date = nextOccurrenceOnOrAfter(txn, from);
  if (!skips || skips.size === 0) return date;
  // Bounded by the skip count: each iteration consumes one skipped date, so this
  // can't spin even on a pathological series.
  let guard = skips.size + 1;
  while (date !== null && skips.has(date) && guard-- > 0) {
    from = date + 1;
    date = nextOccurrenceOnOrAfter(txn, from);
  }
  return date !== null && skips.has(date) ? null : date;
}

/**
 * All occurrence dates (ms) of a series from its start up to and including
 * `untilMs` (clamped to `recur_end`). Used by the materialize job to turn due
 * occurrences into real, editable transactions. Pure — easy to test.
 */
export function occurrenceDatesUpTo(
  startMs: number,
  freq: NonNullable<Txn['recur_freq']>,
  interval: number,
  untilMs: number,
  recurEnd: number | null,
): number[] {
  const out: number[] = [];
  const hardEnd = new Date(recurEnd !== null ? Math.min(recurEnd, untilMs) : untilMs);
  for (let n = 0; n < 10000; n++) {
    const cursor = occurrenceAt(startMs, freq, interval, n);
    if (isAfter(cursor, hardEnd)) break;
    out.push(cursor.getTime());
  }
  return out;
}

/**
 * The date (ms) of the Nth occurrence of a series (1-based), counting the start
 * date as occurrence #1. Used to show "next charge" (n=2) and to convert an
 * "ends after N times" choice into a concrete `recur_end` date. Pure.
 */
export function nthOccurrenceMs(
  startMs: number,
  freq: NonNullable<Txn['recur_freq']>,
  interval: number,
  n: number,
): number {
  return occurrenceAt(startMs, freq, interval, Math.max(1, n) - 1).getTime();
}

/**
 * Normalize a recurring charge to its monthly-equivalent (paise) for "₹X/mo"
 * rollups. The single source of truth — three call sites previously disagreed
 * (a weekly charge was ×4 in one place and ×52/12 in others). Weekly uses
 * 52/12 (≈4.33 weeks per month); `custom` repeats every `interval` DAYS (that
 * is how `occurrenceAt` walks it), so its equivalent is ×30/interval.
 *
 * No cadence — null/undefined — is 0: nothing recurs, so it contributes
 * nothing to a monthly total. The `freq` param is typed so a foreign vocabulary
 * (budget cadences, `afford`'s purchase frequencies — which still have a 'once')
 * can't silently pass through and count a one-off as a monthly commitment.
 * Amounts are integer paise.
 */
export function recurringMonthlyEquivalent(
  amount: number,
  freq: RecurFreq | null | undefined,
  interval?: number | null,
): number {
  switch (freq) {
    case 'daily':   return Math.round(amount * 30);
    case 'weekly':  return Math.round((amount * 52) / 12);
    case 'monthly': return amount;
    case 'yearly':  return Math.round(amount / 12);
    case 'custom':  return interval && interval > 0 ? Math.round((amount * 30) / interval) : amount;
    default:        return 0; // no cadence — a one-off is not a monthly commitment
  }
}

/**
 * Human label for a recurrence: "Every month", "Every 3 weeks".
 *
 * Was a local helper inside `app/group/[id]/recurring.tsx`, which meant it wasn't
 * reusable (the Add screen needed the same sentence) and it was missing the
 * `yearly` case entirely — a yearly rule fell through to the bare word "Repeats".
 */
/**
 * Collapse "custom, every 1 day" to plain `daily`.
 *
 * `RECUR_FREQ` has `daily`, but `RECUR_FREQ_ADD_CHOICES` omits it — a fifth
 * segment made the switcher too tight — so the only way to reach a daily rule is
 * custom with interval 1, which `freqLabel` then renders as "Every day" anyway.
 * Two stored encodings for one cadence: identical on screen, different to any
 * code that groups or compares rules by frequency.
 */
export function normalizeRecurrence(
  freq: RecurFreq,
  interval: number,
): { freq: RecurFreq; interval: number | undefined } {
  if (freq === 'custom' && interval === 1) return { freq: 'daily', interval: undefined };
  return { freq, interval: freq === 'custom' ? interval : undefined };
}

export function freqLabel(freq: string | null | undefined, interval: number | null | undefined): string {
  const n = interval && interval > 0 ? interval : 1;
  switch (freq) {
    case 'daily':   return n === 1 ? 'Every day' : `Every ${n} days`;
    case 'weekly':  return n === 1 ? 'Every week' : `Every ${n} weeks`;
    case 'monthly': return n === 1 ? 'Every month' : `Every ${n} months`;
    case 'yearly':  return n === 1 ? 'Every year' : `Every ${n} years`;
    case 'custom':  return n === 1 ? 'Every day' : `Every ${n} days`;
    default:        return 'Repeats';
  }
}

/**
 * The `n`th occurrence (0-based) of a series, computed **from the start date**
 * rather than by stepping off the previous occurrence.
 *
 * The anchor matters. `addMonths` clamps to the length of the target month, so
 * stepping cursor-to-cursor made the clamp permanent: 31 Jan → 28 Feb → **28
 * Mar** → 28 Apr, because each step re-anchored on the already-clamped date. A
 * rent rule set to the 31st silently moved to the 28th after one February and
 * never came back; a yearly 29 Feb rule collapsed to the 28th after one leap
 * year. Anchoring on `startMs` clamps only where the month is genuinely short —
 * 31 Jan → 29 Feb → 31 Mar — which is what every calendar app does.
 */
function occurrenceAt(
  startMs: number,
  freq: NonNullable<Txn['recur_freq']>,
  interval: number,
  n: number,
): Date {
  const start = new Date(startMs);
  const step = n * interval;
  switch (freq) {
    case 'daily':   return addDays(start, step);
    case 'weekly':  return addWeeks(start, step);
    case 'monthly': return addMonths(start, step);
    case 'yearly':  return addYears(start, step);
    case 'custom':  return addDays(start, step);
    default:        return addMonths(start, n);
  }
}
