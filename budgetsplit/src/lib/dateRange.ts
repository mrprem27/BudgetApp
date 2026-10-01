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

/** `'yyyy-MM'` → the first of that month, local time. Anything else → now. */
export function parseMonthKey(m?: string | null): Date {
  const parts = (m ?? '').split('-');
  if (parts.length === 2) {
    const y = Number(parts[0]); const mo = Number(parts[1]);
    if (Number.isInteger(y) && Number.isInteger(mo) && mo >= 1 && mo <= 12) return new Date(y, mo - 1, 1);
  }
  return new Date();
}

/**
 * The month a date filter covers, as `'yyyy-MM'`, when it sits inside one calendar month —
 * so a filtered ledger can open Reports on that month. `null` when it is unbounded or spans
 * more than one month (Reports is month by month).
 */
export function singleMonthKey(from: number | null, to: number | null): string | null {
  if (from == null || to == null) return null;
  const a = new Date(from), b = new Date(to);
  if (a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth()) return null;
  return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}`;
}

/** A report's custom period (`U-60`): inclusive epoch-ms bounds. */
export type ReportRange = { from: number; to: number };

/** The same length of time immediately before a range — what "vs before" compares with. */
export function previousRange(r: ReportRange): ReportRange {
  const len = r.to - r.from;
  return { from: r.from - len - 1, to: r.from - 1 };
}

/**
 * What a report's period is measured against: the month (or the equal span) before it. While the
 * period is still running, only the same stretch of that one: ten days of October against all of
 * September reads as a 70% saving every month. One rule for the Reports screen and its PDF, which
 * compared differently for a day.
 */
export function comparisonRange(month: Date, range: ReportRange | undefined, nowMs: number = Date.now()): ReportRange {
  const cur: ReportRange = range ?? {
    from: new Date(month.getFullYear(), month.getMonth(), 1).getTime(),
    to: new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() - 1,
  };
  const whole: ReportRange = range ? previousRange(range) : {
    from: new Date(month.getFullYear(), month.getMonth() - 1, 1).getTime(),
    to: cur.from - 1,
  };
  return cur.to > nowMs && nowMs >= cur.from ? { from: whole.from, to: Math.min(whole.to, whole.from + (nowMs - cur.from)) } : whole;
}
