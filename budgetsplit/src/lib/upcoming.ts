import { nextOccurrenceOnOrAfter } from './recurrence';
import type { TxnWithSplits } from '../db/queries/transactions';

const DAY_MS = 24 * 60 * 60 * 1000;

export type UpcomingItem = {
  /** Series id (stable) — safe for React keys. */
  id: string;
  /** What to show: the note if present, else the category. */
  name: string;
  category: string;
  /** My share of the occurrence, in paise (falls back to full amount if I'm not in the split). */
  amount: number;
  /** Projected next occurrence (ms). */
  dateMs: number;
  /** Whole days from now until the occurrence (0 = today). */
  daysUntil: number;
};

function myShareOf(txn: TxnWithSplits, meId: string): number {
  const mine = txn.shares.find(s => s.personId === meId)?.amount;
  if (mine !== undefined) return mine;
  // Not in the split (or income) — fall back to the full amount of the occurrence.
  return txn.shares.reduce((sum, s) => sum + s.amount, 0);
}

/**
 * Project the next upcoming expense occurrences from active recurring series,
 * soonest first. Pure and deterministic — `nowMs` is injected, never read from
 * the clock here. Series that can't be projected (ended, paused, no freq) are
 * omitted so we never show a wrong date (plan deviation D5).
 */
export function buildUpcoming(
  recurring: TxnWithSplits[],
  meId: string,
  nowMs: number,
  limit = 3,
  /** Only include occurrences due within this many days (e.g. 4 = "coming up soon"). */
  withinDays?: number,
): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const txn of recurring) {
    if (txn.is_deleted) continue;
    if (txn.kind !== 'expense') continue;
    if (!txn.recur_freq) continue;
    if (txn.recur_state && txn.recur_state !== 'active') continue;

    const next = nextOccurrenceOnOrAfter(txn, nowMs);
    if (next === null) continue;

    items.push({
      id: txn.id,
      name: (txn.note && txn.note.trim()) || txn.category,
      category: txn.category,
      amount: myShareOf(txn, meId),
      dateMs: next,
      daysUntil: Math.max(0, Math.round((next - nowMs) / DAY_MS)),
    });
  }
  items.sort((a, b) => a.dateMs - b.dateMs);
  const windowed = withinDays === undefined ? items : items.filter(i => i.daysUntil <= withinDays);
  return windowed.slice(0, limit);
}
