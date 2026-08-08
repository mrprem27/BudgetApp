import { isSameDay, isSameYear, format, subDays } from 'date-fns';

/**
 * Label for a date section header: "Today", "Yesterday", "14 Jun", or
 * "14 Jun 2025" once it's outside the current year (AGENTS.md §12).
 *
 * The year is dropped for the current year because it's noise on the rows you
 * scroll past most, and kept otherwise because "14 Jun" with no year is genuinely
 * ambiguous in a ledger you keep for more than twelve months.
 */
export function dateSectionLabel(date: Date, now: Date = new Date()): string {
  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, subDays(now, 1))) return 'Yesterday';
  return isSameYear(date, now) ? format(date, 'd MMM') : format(date, 'd MMM yyyy');
}

/**
 * Group dated items into sections for a SectionList, preserving the incoming
 * order. Generic over anything with a `date` (epoch ms), so it serves both group
 * transactions and the unified Personal activity list.
 */
export function groupByDate<T extends { date: number }>(items: T[]): Array<{ title: string; data: T[] }> {
  const now = new Date();
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = dateSectionLabel(new Date(item.date), now);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}
