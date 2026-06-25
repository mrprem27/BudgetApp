import { addDays, addWeeks, addMonths, addYears, isAfter, isBefore, startOfDay } from 'date-fns';
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

  let safetyMax = 0;

  while (!isAfter(cursor, rangeEnd) && safetyMax < 1000) {
    safetyMax++;
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
    cursor = advance(cursor, txn.recur_freq, txn.recur_interval ?? 1);
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
  let cursor = new Date(txn.date);
  const end = txn.recur_end ? new Date(txn.recur_end) : null;
  let safetyMax = 0;
  while (safetyMax < 10000) {
    safetyMax++;
    if (end && isAfter(cursor, end)) return null;
    if (!isBefore(cursor, new Date(fromMs))) return cursor.getTime();
    cursor = advance(cursor, txn.recur_freq, txn.recur_interval ?? 1);
  }
  return null;
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
  const hardEnd = recurEnd !== null ? Math.min(recurEnd, untilMs) : untilMs;
  let cursor = new Date(startMs);
  let safetyMax = 0;
  while (!isAfter(cursor, new Date(hardEnd)) && safetyMax < 10000) {
    safetyMax++;
    out.push(cursor.getTime());
    cursor = advance(cursor, freq, interval);
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
  let cursor = new Date(startMs);
  for (let i = 1; i < Math.max(1, n); i++) cursor = advance(cursor, freq, interval);
  return cursor.getTime();
}

function advance(
  date: Date,
  freq: NonNullable<Txn['recur_freq']>,
  interval: number,
): Date {
  switch (freq) {
    case 'daily':   return addDays(date, interval);
    case 'weekly':  return addWeeks(date, interval);
    case 'monthly': return addMonths(date, interval);
    case 'yearly':  return addYears(date, interval);
    case 'custom':  return addDays(date, interval);
    default:        return addMonths(date, 1);
  }
}
