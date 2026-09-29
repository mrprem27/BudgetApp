/**
 * The tap rules of the range calendar (`ui/DateRangeSheet`), kept pure so they can be
 * tested without a device.
 *
 * Days are start-of-day epoch ms. A range is `{ from, to }` where `to` is `null` while
 * only the first end has been chosen.
 *
 * - First tap, or a tap when a full range is already set: start over from that day.
 * - Second tap on/after the start: that day closes the range.
 * - Second tap before the start: the two swap, so you never have to think about order.
 */
export type DayRange = { from: number | null; to: number | null };

export function nextRange(cur: DayRange, day: number): DayRange {
  if (cur.from == null || cur.to != null) return { from: day, to: null };
  if (day < cur.from) return { from: day, to: cur.from };
  return { from: cur.from, to: day };
}

/** Is `day` inside the (possibly half-open) range, endpoints included? */
export function inRange(r: DayRange, day: number): boolean {
  if (r.from == null) return false;
  return day >= r.from && day <= (r.to ?? r.from);
}
