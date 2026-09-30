/** `YYYY-MM-DD` in local time — the day a person means by "today". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Days logged in a row, and which days those were (`U-40`). Counts back from **today, or from
 * yesterday while today is still empty** — a streak does not break at midnight, it breaks when a
 * whole day passes with nothing. It read 0 every morning until the first entry, and it was built
 * from whichever period tab was open, so on Today it could never pass 1.
 */
export function streakFrom(dates: readonly number[], nowMs: number): { streak: number; days: Set<string> } {
  const days = new Set<string>();
  for (const t of dates) if (Number.isFinite(t)) days.add(dayKey(t));
  const now = new Date(nowMs);
  const at = (back: number) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).getTime());
  let streak = 0;
  for (let back = days.has(at(0)) ? 0 : 1; back < 400 && days.has(at(back)); back++) streak++;
  return { streak, days };
}
