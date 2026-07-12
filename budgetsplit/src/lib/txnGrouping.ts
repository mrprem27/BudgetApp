import { isSameDay, format } from 'date-fns';

/**
 * Group dated items into "Today" / "dd MMM yyyy" sections for a SectionList,
 * preserving the incoming order. Generic over anything with a `date` (epoch ms),
 * so it serves both group transactions and the unified Personal activity list.
 */
export function groupByDate<T extends { date: number }>(items: T[]): Array<{ title: string; data: T[] }> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const d = new Date(item.date);
    const key = isSameDay(d, new Date()) ? 'Today' : format(d, 'dd MMM yyyy');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}
