/**
 * How long each screen's last loads took, for the dev screen (`U-02`). In memory only: it is
 * there to say which screens are slow on a real phone, in milliseconds, not to be kept.
 */
export type LoadTime = { path: string; ms: number; at: number };

const KEEP = 60;
const recent: LoadTime[] = [];

export function recordLoad(path: string, ms: number, at: number = Date.now()): void {
  recent.push({ path, ms, at });
  if (recent.length > KEEP) recent.shift();
}

/** One line per screen, slowest first: its worst load, its latest, and how many were recorded. */
export function loadTimeSummary(): { path: string; worst: number; last: number; count: number }[] {
  const by = new Map<string, { worst: number; last: number; count: number }>();
  for (const r of recent) {
    const s = by.get(r.path) ?? { worst: 0, last: 0, count: 0 };
    by.set(r.path, { worst: Math.max(s.worst, r.ms), last: r.ms, count: s.count + 1 });
  }
  return [...by.entries()].map(([path, s]) => ({ path, ...s })).sort((a, b) => b.worst - a.worst);
}

export function clearLoadTimes(): void { recent.length = 0; }
