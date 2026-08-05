import { wordsOf } from './smartCategoryLearn';

/**
 * Recurring-bill suggestion detection, scoped to a single just-committed
 * import batch (not a lifetime history scan) — a from-scratch build, not a
 * wire-up of any prior detector (none exists in this codebase). Deliberately
 * narrow: monthly-interval only, a flat amount tolerance, no auto-creation —
 * this surfaces a suggestion for the user to confirm, never a silent rule.
 */

export type RecurRow = { id: string; description: string; amountPaise: number; date: number; category: string };

export type RecurringCandidate = {
  key: string;
  description: string;
  category: string;
  amountPaise: number;
  occurrences: number;
  /** The most recent already-committed transaction in the group — converting
   *  a suggestion into a rule UPDATEs this row rather than inserting a new one. */
  mostRecentTxnId: string;
};

const DAY = 24 * 60 * 60 * 1000;
const MIN_GAP_DAYS = 24;
const MAX_GAP_DAYS = 37;
const AMOUNT_TOLERANCE = 0.05; // 5%

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Groups rows by normalized description, then flags groups of 2+ whose
 * amounts cluster within `AMOUNT_TOLERANCE` of the median and whose
 * consecutive dates land 24-37 days apart (roughly monthly) as candidates.
 */
/**
 * Committed Review rows → detector input.
 *
 * Only **imported expenses with a category** qualify. A manually-typed row is not
 * evidence of a repeating bill (you'd have used the recurring toggle), and an
 * uncategorised one has nothing to group by.
 *
 * Pure, and lives here rather than in the screen because it is the detector's own
 * input contract — `review.tsx` had it inline while every other rule sat in this file.
 */
export function toRecurRows(
  done: { txnId: string; snap: { kind: string; source?: string | null; category?: string | null; description: string; amount: number; date: number } }[],
): RecurRow[] {
  return done
    .filter(d => d.snap.kind === 'expense' && (d.snap.source ?? 'manual') !== 'manual' && d.snap.category)
    .map(d => ({ id: d.txnId, description: d.snap.description, amountPaise: d.snap.amount, date: d.snap.date, category: d.snap.category! }));
}

export function detectRecurringCandidates(rows: RecurRow[]): RecurringCandidate[] {
  const groups = new Map<string, RecurRow[]>();
  for (const r of rows) {
    const key = wordsOf(r.description).sort().join(' ');
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const candidates: RecurringCandidate[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.date - b.date);

    const med = median(sorted.map(r => r.amountPaise));
    if (med <= 0) continue;
    const amountsClose = sorted.every(r => Math.abs(r.amountPaise - med) <= med * AMOUNT_TOLERANCE);
    if (!amountsClose) continue;

    const gapsMonthly = sorted.slice(1).every((r, i) => {
      const gapDays = (r.date - sorted[i].date) / DAY;
      return gapDays >= MIN_GAP_DAYS && gapDays <= MAX_GAP_DAYS;
    });
    if (!gapsMonthly) continue;

    const mostRecent = sorted[sorted.length - 1];
    candidates.push({
      key,
      description: mostRecent.description,
      category: mostRecent.category,
      amountPaise: Math.round(med),
      occurrences: sorted.length,
      mostRecentTxnId: mostRecent.id,
    });
  }

  return candidates.sort((a, b) => b.occurrences - a.occurrences);
}
