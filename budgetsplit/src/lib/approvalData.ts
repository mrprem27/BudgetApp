import { formatRupees } from './money';

/** One entry awaiting a decision, already resolved against people and groups. */
export type PendingEntry = {
  txnId: string;
  authorId: string;
  authorName: string;
  groupName: string;
  category: string;
  note: string | null;
  date: number;
  arrivedAt: number;
  kind: 'expense' | 'settlement';
  /** The whole bill. */
  total: number;
  /** What it would cost me if I accept it. */
  myShare: number;
  /** What it claims I paid — the number that could drain my cash. */
  myPaid: number;
};

/**
 * What this entry would do to me, in one sentence.
 *
 * Deliberately conditional throughout — "would", not "did". Nothing here has
 * happened to my numbers yet, and copy that reads like a receipt would undo the
 * point of asking.
 *
 * Pure and testable: no React, no db, no formatting decisions in the screen.
 */
export function describeImpact(e: PendingEntry): string {
  const what = e.kind === 'settlement' ? 'a transfer' : e.category.toLowerCase();
  const parts: string[] = [`${e.authorName} added ${formatRupees(e.total)} for ${what} in ${e.groupName}`];

  if (e.myShare > 0) parts.push(`Your share would be ${formatRupees(e.myShare)}`);
  else parts.push('None of it is yours');

  // The claim worth reading twice. Someone else saying you paid is the only shape
  // that can take money out of your cash position, so it is never left implicit.
  if (e.myPaid > 0) parts.push(`and it says you paid ${formatRupees(e.myPaid)}`);

  return `${parts.join('. ')}.`;
}

/**
 * Group the queue by who is asking, because that is the decision being made.
 *
 * Sorting by author rather than by date is the whole reason "trust this person"
 * can sit at the bottom of a group: after the second or third entry from the same
 * person, the honest answer is not to keep tapping Approve.
 *
 * Order is by first arrival, so the oldest unanswered person stays at the top and
 * a burst from someone new cannot push them down.
 */
export function groupByAuthor(entries: PendingEntry[]): Array<{
  authorId: string;
  authorName: string;
  entries: PendingEntry[];
  total: number;
}> {
  const byAuthor = new Map<string, PendingEntry[]>();
  for (const e of entries) {
    const arr = byAuthor.get(e.authorId);
    if (arr) arr.push(e);
    else byAuthor.set(e.authorId, [e]);
  }
  return Array.from(byAuthor.entries())
    .map(([authorId, list]) => ({
      authorId,
      authorName: list[0].authorName,
      entries: list,
      // What accepting all of theirs would cost me — the figure that makes
      // "approve all" a considered act rather than a convenience.
      total: list.reduce((s, e) => s + e.myShare, 0),
    }))
    .sort((a, b) => Math.min(...a.entries.map(e => e.arrivedAt)) - Math.min(...b.entries.map(e => e.arrivedAt)));
}
