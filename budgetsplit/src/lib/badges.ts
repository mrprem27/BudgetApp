import type { FeatherName } from '../constants/palette';
import { dayKey } from './streak';

/**
 * Badges (`U-59`, `U-65`): things the app has already worked out about you, as targets that stay
 * in play. Pure.
 *
 * Three kinds, so there is always something to aim at and nothing is won once and forgotten:
 * - **This month** — resets on the 1st. You earn it again, or not, every month.
 * - **Milestones** — levels. Reaching one shows the next, so they keep climbing; the yearly one
 *   starts over each January.
 * - **Right now** — true or not today, re-checked every time: covered to payday, all square…
 *
 * Every badge is a conclusion some engine already reaches for its own reasons — the streak, the
 * money engine's cash walk, its income model, the balance netting, goals, the budget — never a
 * separate scoring system with opinions of its own.
 */
export type BadgeGroup = 'month' | 'milestone' | 'now';

export type Badge = {
  id: string;
  title: string;
  icon: FeatherName;
  group: BadgeGroup;
  /** What it means and how to get it — shown behind the ⓘ. */
  explain: string;
  /** 0 = not yet. For a milestone, how many levels reached. */
  level: number;
  maxLevel: number;
  /** Where you stand, one line: "2 of 4 weeks", "Level 2 · next at 100". */
  status: string;
  /** 0–1 toward the next level (or this month's target). */
  progress: number;
};

export type BadgeRow = { date: number; spent: number; income: number };

export type BadgeInputs = {
  nowMs: number;
  /** My counted entries this year and before (dates + my spend / income on each). */
  rows: BadgeRow[];
  safeToSpend: number | null;
  lowSoon: boolean;
  incomeConsistency: 'regular' | 'variable' | 'irregular' | null;
  owe: number;
  owed: number;
  hasShared: boolean;
  goalsDone: number;
  goalsCount: number;
  budgetPct: number | null;
  assetCount: number;
};

const DAY = 86_400_000;

/** Longest run of consecutive days with an entry, ever. */
export function bestStreak(dates: readonly number[]): number {
  const days = [...new Set(dates.map(dayKey))].sort();
  let best = 0, run = 0, prev: number | null = null;
  for (const k of days) {
    const [y, m, d] = k.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    run = prev != null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/** The streak ending today (or yesterday while today is still empty). */
function currentStreak(dates: readonly number[], nowMs: number): number {
  const days = new Set(dates.map(dayKey));
  const now = new Date(nowMs);
  const at = (back: number) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).getTime());
  let n = 0;
  for (let back = days.has(at(0)) ? 0 : 1; back < 800 && days.has(at(back)); back++) n++;
  return n;
}

/** A month in four blocks — 1–7, 8–14, 15–21, 22–end — and which of them have an entry. */
function weeksCovered(days: Set<string>, year: number, month: number, uptoDay: number): { covered: number; elapsed: number } {
  const blocks = [[1, 7], [8, 14], [15, 21], [22, 31]];
  let covered = 0, elapsed = 0;
  for (const [a, b] of blocks) {
    if (a > uptoDay) break;
    elapsed++;
    for (let d = a; d <= Math.min(b, uptoDay); d++) {
      if (days.has(dayKey(new Date(year, month, d).getTime()))) { covered++; break; }
    }
  }
  return { covered, elapsed };
}

/** Spent and earned per month of `year`, up to `nowMs`. */
function monthTotals(rows: readonly BadgeRow[], year: number): { spent: number; income: number }[] {
  const out = Array.from({ length: 12 }, () => ({ spent: 0, income: 0 }));
  for (const r of rows) {
    const d = new Date(r.date);
    if (d.getFullYear() !== year) continue;
    out[d.getMonth()].spent += r.spent;
    out[d.getMonth()].income += r.income;
  }
  return out;
}

/** Levels from thresholds: how many reached, and progress toward the next. */
function tiered(value: number, steps: readonly number[]): { level: number; progress: number; next: number | null } {
  const level = steps.filter(s => value >= s).length;
  const next = steps[level] ?? null;
  const from = level > 0 ? steps[level - 1] : 0;
  return { level, next, progress: next == null ? 1 : Math.max(0, Math.min(1, (value - from) / (next - from))) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rupees = (p: number) => `₹${Math.round(Math.abs(p) / 100).toLocaleString('en-IN')}`;

export function computeBadges(i: BadgeInputs): Badge[] {
  const now = new Date(i.nowMs);
  const year = now.getFullYear(), month = now.getMonth(), today = now.getDate();
  const dates = i.rows.map(r => r.date);
  const days = new Set(dates.map(dayKey));
  const totals = monthTotals(i.rows, year);
  const badges: Badge[] = [];

  // ── This month ──────────────────────────────────────────────────────────────
  const wk = weeksCovered(days, year, month, today);
  badges.push({
    id: 'everyWeek', title: 'Every week', icon: 'calendar', group: 'month',
    explain: 'Log at least one entry in each week of the month (1–7, 8–14, 15–21, 22–end). Starts again on the 1st.',
    level: wk.covered === 4 ? 1 : 0, maxLevel: 1,
    status: `${wk.covered} of 4 weeks this month`,
    progress: wk.covered / 4,
  });

  const m = totals[month];
  const ahead = m.income - m.spent;
  badges.push({
    id: 'keptMore', title: 'Kept more than spent', icon: 'trending-up', group: 'month',
    explain: 'This month, money in is more than your share of spending. Starts again on the 1st.',
    level: m.income > 0 && ahead >= 0 ? 1 : 0, maxLevel: 1,
    status: m.income === 0 ? 'No income logged this month yet'
      : ahead >= 0 ? `${rupees(ahead)} ahead this month` : `${rupees(ahead)} behind this month`,
    // How much of your spending this month's income covers.
    progress: m.income <= 0 ? 0 : m.spent <= 0 ? 1 : Math.min(1, m.income / m.spent),
  });

  if (i.budgetPct != null) {
    badges.push({
      id: 'onBudget', title: 'On budget', icon: 'pie-chart', group: 'month',
      explain: 'Past the 20th and still within this month’s budget. "On budget" on the 3rd means little, so it waits. Starts again on the 1st.',
      level: today >= 20 && i.budgetPct <= 100 ? 1 : 0, maxLevel: 1,
      status: i.budgetPct > 100 ? `Over: ${i.budgetPct}% used` : today < 20 ? `${i.budgetPct}% used · counts from the 20th` : `${i.budgetPct}% used`,
      progress: Math.max(0, Math.min(1, 1 - i.budgetPct / 100)),
    });
  }

  // ── Milestones ──────────────────────────────────────────────────────────────
  const best = bestStreak(dates);
  const cur = currentStreak(dates, i.nowMs);
  const st = tiered(best, [7, 30, 100, 365]);
  badges.push({
    id: 'streak', title: 'Logging streak', icon: 'zap', group: 'milestone',
    explain: 'Days in a row with at least one entry. Levels at 7, 30, 100 and 365 days, from your best run ever; your current run is shown too.',
    level: st.level, maxLevel: 4,
    status: `Now ${plural(cur, 'day')} · best ${plural(best, 'day')}${st.next ? ` · next at ${st.next}` : ''}`,
    progress: st.next ? Math.min(1, cur / st.next) : 1,
  });

  const en = tiered(dates.length, [25, 100, 500, 1000]);
  badges.push({
    id: 'entries', title: 'Record keeper', icon: 'edit-3', group: 'milestone',
    explain: 'Entries you have logged. Levels at 25, 100, 500 and 1,000.',
    level: en.level, maxLevel: 4,
    status: `${plural(dates.length, 'entry', 'entries')}${en.next ? ` · next at ${en.next}` : ''}`,
    progress: en.progress,
  });

  const goodMonths = totals.slice(0, month + 1).filter(t => t.income > 0 && t.income >= t.spent).length;
  const gy = tiered(goodMonths, [3, 6, 9, 12]);
  badges.push({
    id: 'goodYear', title: `Good months of ${year}`, icon: 'award', group: 'milestone',
    explain: 'Months this year where money in beat your share of spending. Levels at 3, 6, 9 and 12. Starts again each January.',
    level: gy.level, maxLevel: 4,
    status: `${plural(goodMonths, 'month')} so far${gy.next ? ` · next at ${gy.next}` : ''}`,
    progress: gy.progress,
  });

  const gl = tiered(i.goalsDone, [1, 3, 10]);
  badges.push({
    id: 'goals', title: 'Goal getter', icon: 'target', group: 'milestone',
    explain: 'Savings goals funded all the way to their target. Levels at 1, 3 and 10.',
    level: gl.level, maxLevel: 3,
    status: i.goalsCount === 0 ? 'Set a goal under Money' : `${plural(i.goalsDone, 'goal')} reached${gl.next ? ` · next at ${gl.next}` : ''}`,
    progress: gl.progress,
  });

  // ── Right now ───────────────────────────────────────────────────────────────
  const covered = i.safeToSpend != null && i.safeToSpend >= 0 && !i.lowSoon;
  badges.push({
    id: 'covered', title: 'Covered to payday', icon: 'shield', group: 'now',
    explain: 'Every bill the app knows about is covered until your next income, without your cash running low on the way. Checked again every day.',
    level: covered ? 1 : 0, maxLevel: 1,
    status: i.safeToSpend == null ? 'Needs a few weeks of history' : covered ? 'Covered today' : 'Not every bill is covered yet',
    progress: covered ? 1 : 0,
  });

  if (i.incomeConsistency) {
    badges.push({
      id: 'steadyIncome', title: 'Steady income', icon: 'activity', group: 'now',
      explain: 'Your income arrives on a regular rhythm, so projections can lean on it.',
      level: i.incomeConsistency === 'regular' ? 1 : 0, maxLevel: 1,
      status: i.incomeConsistency === 'regular' ? 'Regular' : 'Varies month to month',
      progress: i.incomeConsistency === 'regular' ? 1 : i.incomeConsistency === 'variable' ? 0.5 : 0,
    });
  }

  if (i.hasShared) {
    const square = i.owe === 0 && i.owed === 0;
    badges.push({
      id: 'allSquare', title: 'All square', icon: 'check-circle', group: 'now',
      explain: 'Nobody owes anybody: every balance with people is settled. Checked again every day.',
      level: square ? 1 : 0, maxLevel: 1,
      status: square ? 'Settled with everyone' : i.owe > 0 ? `You owe ${rupees(i.owe)}` : `You’re owed ${rupees(i.owed)}`,
      progress: square ? 1 : 0,
    });
  }

  const as = tiered(i.assetCount, [1, 3, 5]);
  badges.push({
    id: 'wealth', title: 'Building wealth', icon: 'bar-chart-2', group: 'now',
    explain: 'You track what you own, not only what you spend. Levels at 1, 3 and 5 assets.',
    level: as.level, maxLevel: 3,
    status: i.assetCount === 0 ? 'Add an asset under Money' : plural(i.assetCount, 'asset'),
    progress: as.progress,
  });

  return badges;
}
