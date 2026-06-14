import { addDays, addWeeks, addMonths, addYears, isAfter, isBefore, startOfDay } from 'date-fns';
import type { Txn, TxnWithSplits } from '../db/queries/transactions';

export function materializeInstances(
  txn: TxnWithSplits,
  fromMs: number,
  toMs: number,
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
    if (!isBefore(cursor, rangeStart)) {
      const virtualId = `${txn.id}_${cursor.getTime()}`;
      instances.push({
        ...txn,
        id: virtualId,
        date: cursor.getTime(),
        recur_override_date: null,
      });
    }
    cursor = advance(cursor, txn.recur_freq, txn.recur_interval ?? 1);
  }

  return instances;
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
    case 'custom':  return addDays(date, interval);
    default:        return addMonths(date, 1);
  }
}
