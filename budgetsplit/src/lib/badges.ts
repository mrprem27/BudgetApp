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

export type BadgeRow = {
  date: number; spent: number; income: number;
  /** The rest are optional so older callers and tests still build a row from three fields. */
  kind?: 'expense' | 'income' | 'settlement';
  category?: string;
  /** In a shared group, not Personal. */
  shared?: boolean;
  hasNote?: boolean;
  hasReceipt?: boolean;
  tagCount?: number;
};

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
  /** Everything below is optional: a caller that does not know it simply earns none of these. */
  goalsSaved?: number;
  /** An emergency goal's saved / target, when one exists. */
  emergency?: { saved: number; target: number } | null;
  recurringRules?: number;
  /** Card owed now, and whether there is a card at all. */
  card?: { used: number; limit: number } | null;
  cashAvailable?: number | null;
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

  // ── More, 2026-09-30: every one a fact the ledger already holds ──────────────────
  const inMonth = (d: number, y: number, mo: number) => { const x = new Date(d); return x.getFullYear() === y && x.getMonth() === mo; };
  const thisMonth = i.rows.filter(r => inMonth(r.date, year, month));
  const prevY = month === 0 ? year - 1 : year, prevM = month === 0 ? 11 : month - 1;

  // This month
  const spendDays = new Set(thisMonth.filter(r => r.spent > 0).map(r => dayKey(r.date)));
  const noSpend = Math.max(0, today - spendDays.size);
  badges.push({
    id: 'noSpendDays', title: 'No-spend days', icon: 'moon', group: 'month',
    explain: 'Days this month with no spending at all. Earned at 5. Starts again on the 1st.',
    level: noSpend >= 5 ? 1 : 0, maxLevel: 1,
    status: `${plural(noSpend, 'day')} without spending`, progress: Math.min(1, noSpend / 5),
  });
  const sameDayLast = i.rows.filter(r => inMonth(r.date, prevY, prevM) && new Date(r.date).getDate() <= today).reduce((t, r) => t + r.spent, 0);
  const soFar = thisMonth.reduce((t, r) => t + r.spent, 0);
  if (sameDayLast > 0) {
    badges.push({
      id: 'underLast', title: 'Less than last month', icon: 'trending-down', group: 'month',
      explain: 'Your share of spending so far this month is below last month’s by the same date. Starts again on the 1st.',
      level: soFar <= sameDayLast ? 1 : 0, maxLevel: 1,
      status: soFar <= sameDayLast ? `${rupees(sameDayLast - soFar)} under last month` : `${rupees(soFar - sameDayLast)} over last month`,
      progress: soFar <= sameDayLast ? 1 : Math.max(0, 1 - (soFar - sameDayLast) / sameDayLast),
    });
  }
  const loggedDays = new Set(thisMonth.map(r => dayKey(r.date))).size;
  badges.push({
    id: 'dailyLogger', title: 'Twenty days logged', icon: 'check-square', group: 'month',
    explain: 'An entry on 20 different days this month. Starts again on the 1st.',
    level: loggedDays >= 20 ? 1 : 0, maxLevel: 1,
    status: `${plural(loggedDays, 'day')} this month`, progress: Math.min(1, loggedDays / 20),
  });
  const noted = thisMonth.filter(r => r.hasNote).length;
  badges.push({
    id: 'explained', title: 'Every entry explained', icon: 'file-text', group: 'month',
    explain: 'Most of this month’s entries (at least 8 in 10, from 5 entries) carry a note. Starts again on the 1st.',
    level: thisMonth.length >= 5 && noted / thisMonth.length >= 0.8 ? 1 : 0, maxLevel: 1,
    status: thisMonth.length === 0 ? 'No entries this month yet' : `${noted} of ${thisMonth.length} with a note`,
    progress: thisMonth.length === 0 ? 0 : Math.min(1, noted / thisMonth.length / 0.8),
  });
  const receiptsMonth = thisMonth.filter(r => r.hasReceipt).length;
  badges.push({
    id: 'receiptsMonth', title: 'Receipts kept', icon: 'camera', group: 'month',
    explain: 'Three entries this month with a photo of the receipt. Starts again on the 1st.',
    level: receiptsMonth >= 3 ? 1 : 0, maxLevel: 1,
    status: `${plural(receiptsMonth, 'receipt')} this month`, progress: Math.min(1, receiptsMonth / 3),
  });
  const incomeMonth = thisMonth.some(r => r.income > 0);
  badges.push({
    id: 'incomeLogged', title: 'Income logged', icon: 'download', group: 'month',
    explain: 'At least one income entry this month, so the month has both sides. Starts again on the 1st.',
    level: incomeMonth ? 1 : 0, maxLevel: 1,
    status: incomeMonth ? 'Logged this month' : 'None this month yet', progress: incomeMonth ? 1 : 0,
  });
  if (i.hasShared) {
    const settledMonth = thisMonth.some(r => r.kind === 'settlement' && r.shared);
    badges.push({
      id: 'settledMonth', title: 'Settled this month', icon: 'repeat', group: 'month',
      explain: 'You paid someone back, or were paid back, this month. Starts again on the 1st.',
      level: settledMonth ? 1 : 0, maxLevel: 1,
      status: settledMonth ? 'Settled with someone' : 'No settle-up this month yet', progress: settledMonth ? 1 : 0,
    });
  }

  // Milestones
  const months = new Set(i.rows.map(r => { const d = new Date(r.date); return `${d.getFullYear()}-${d.getMonth()}`; })).size;
  const mo = tiered(months, [3, 6, 12, 24]);
  badges.push({
    id: 'monthsTracked', title: 'Months tracked', icon: 'book-open', group: 'milestone',
    explain: 'Months with at least one entry. Levels at 3, 6, 12 and 24.',
    level: mo.level, maxLevel: 4, status: `${plural(months, 'month')}${mo.next ? ` · next at ${mo.next}` : ''}`, progress: mo.progress,
  });
  const cats = new Set(i.rows.filter(r => r.category && r.kind === 'expense').map(r => r.category)).size;
  const ca = tiered(cats, [5, 10, 20]);
  badges.push({
    id: 'categories', title: 'Full picture', icon: 'grid', group: 'milestone',
    explain: 'Different spending categories you have used. Levels at 5, 10 and 20.',
    level: ca.level, maxLevel: 3, status: `${plural(cats, 'category', 'categories')}${ca.next ? ` · next at ${ca.next}` : ''}`, progress: ca.progress,
  });
  const tagged = i.rows.filter(r => (r.tagCount ?? 0) > 0).length;
  const tg = tiered(tagged, [10, 50, 200]);
  badges.push({
    id: 'tagger', title: 'Tagger', icon: 'tag', group: 'milestone',
    explain: 'Entries with at least one tag. Levels at 10, 50 and 200.',
    level: tg.level, maxLevel: 3, status: `${plural(tagged, 'tagged entry', 'tagged entries')}${tg.next ? ` · next at ${tg.next}` : ''}`, progress: tg.progress,
  });
  const receipts = i.rows.filter(r => r.hasReceipt).length;
  const rc = tiered(receipts, [5, 25, 100]);
  badges.push({
    id: 'receipts', title: 'Paper trail', icon: 'paperclip', group: 'milestone',
    explain: 'Entries with a receipt photo. Levels at 5, 25 and 100.',
    level: rc.level, maxLevel: 3, status: `${plural(receipts, 'receipt')}${rc.next ? ` · next at ${rc.next}` : ''}`, progress: rc.progress,
  });
  if (i.hasShared) {
    const splits = i.rows.filter(r => r.shared && r.kind === 'expense').length;
    const sp = tiered(splits, [5, 25, 100]);
    badges.push({
      id: 'splitter', title: 'Fair splitter', icon: 'users', group: 'milestone',
      explain: 'Shared expenses you are part of. Levels at 5, 25 and 100.',
      level: sp.level, maxLevel: 3, status: `${plural(splits, 'shared expense')}${sp.next ? ` · next at ${sp.next}` : ''}`, progress: sp.progress,
    });
    const settles = i.rows.filter(r => r.shared && r.kind === 'settlement').length;
    const se = tiered(settles, [3, 10, 30]);
    badges.push({
      id: 'settler', title: 'Keeps it square', icon: 'check', group: 'milestone',
      explain: 'Settle-ups with people. Levels at 3, 10 and 30.',
      level: se.level, maxLevel: 3, status: `${plural(settles, 'settle-up')}${se.next ? ` · next at ${se.next}` : ''}`, progress: se.progress,
    });
  }
  const gs = tiered(i.goalsCount, [1, 3, 5]);
  badges.push({
    id: 'goalSetter', title: 'Goal setter', icon: 'flag', group: 'milestone',
    explain: 'Savings goals you have set. Levels at 1, 3 and 5.',
    level: gs.level, maxLevel: 3, status: i.goalsCount === 0 ? 'Set a goal under Money' : plural(i.goalsCount, 'goal'), progress: gs.progress,
  });
  if (i.goalsSaved != null) {
    const sv = tiered(i.goalsSaved, [1_000_000, 5_000_000, 10_000_000]);
    badges.push({
      id: 'saved', title: 'Saver', icon: 'dollar-sign', group: 'milestone',
      explain: 'Put aside across your goals. Levels at ₹10,000, ₹50,000 and ₹1,00,000.',
      level: sv.level, maxLevel: 3, status: `${rupees(i.goalsSaved)} in goals`, progress: sv.progress,
    });
  }
  if (i.recurringRules != null) {
    const ru = tiered(i.recurringRules, [1, 3, 5]);
    badges.push({
      id: 'autopilot', title: 'On autopilot', icon: 'refresh-cw', group: 'milestone',
      explain: 'Bills and income set to repeat, so the app logs them for you. Levels at 1, 3 and 5.',
      level: ru.level, maxLevel: 3, status: plural(i.recurringRules, 'repeating entry', 'repeating entries'), progress: ru.progress,
    });
  }

  // Right now
  if (i.emergency) {
    const done = i.emergency.target > 0 && i.emergency.saved >= i.emergency.target;
    badges.push({
      id: 'emergency', title: 'Rainy-day fund', icon: 'umbrella', group: 'now',
      explain: 'Your emergency goal is fully funded. Checked again every day.',
      level: done ? 1 : 0, maxLevel: 1,
      status: `${rupees(i.emergency.saved)} of ${rupees(i.emergency.target)}`,
      progress: i.emergency.target > 0 ? Math.min(1, i.emergency.saved / i.emergency.target) : 0,
    });
  }
  if (i.card && i.card.limit > 0) {
    const clear = i.card.used <= 0;
    badges.push({
      id: 'cardClear', title: 'Card clear', icon: 'credit-card', group: 'now',
      explain: 'Nothing owed on your credit card right now. Checked again every day.',
      level: clear ? 1 : 0, maxLevel: 1,
      status: clear ? 'Nothing owed' : `${rupees(i.card.used)} owed`,
      progress: Math.max(0, 1 - i.card.used / i.card.limit),
    });
  }
  if (i.cashAvailable != null) {
    const black = i.cashAvailable >= 0;
    badges.push({
      id: 'inTheBlack', title: 'In the black', icon: 'thumbs-up', group: 'now',
      explain: 'What you can spend is above zero: you have not spent past your cash. Checked again every day.',
      level: black ? 1 : 0, maxLevel: 1,
      status: black ? `${rupees(i.cashAvailable)} available` : `${rupees(i.cashAvailable)} past your cash`, progress: black ? 1 : 0,
    });
  }
  badges.push({
    id: 'planner', title: 'Planner', icon: 'sliders', group: 'now',
    explain: 'A budget is set for this month, so spending has something to be measured against.',
    level: i.budgetPct != null ? 1 : 0, maxLevel: 1,
    status: i.budgetPct != null ? 'Budget set' : 'Set a budget under Money', progress: i.budgetPct != null ? 1 : 0,
  });

  // ── More, 2026-10-01: six more, still only what the ledger and balances already say ──
  const keptPct = m.income > 0 ? Math.round(((m.income - m.spent) / m.income) * 100) : 0;
  badges.push({
    id: 'keptFifth', title: 'Kept a fifth', icon: 'percent', group: 'month',
    explain: 'This month you kept at least 20% of the money that came in. Starts again on the 1st.',
    level: m.income > 0 && keptPct >= 20 ? 1 : 0, maxLevel: 1,
    status: m.income === 0 ? 'No income logged this month yet' : keptPct >= 0 ? `${keptPct}% kept so far` : 'Spent more than came in',
    progress: Math.max(0, Math.min(1, keptPct / 20)),
  });

  const allDays = days.size;
  const dl = tiered(allDays, [30, 100, 365]);
  badges.push({
    id: 'daysLogged', title: 'Days on record', icon: 'sun', group: 'milestone',
    explain: 'Different days with at least one entry, in a row or not. Levels at 30, 100 and 365.',
    level: dl.level, maxLevel: 3, status: `${plural(allDays, 'day')}${dl.next ? ` · next at ${dl.next}` : ''}`, progress: dl.progress,
  });
  const notes = i.rows.filter(r => r.hasNote).length;
  const nt = tiered(notes, [10, 50, 200]);
  badges.push({
    id: 'noteTaker', title: 'Note taker', icon: 'message-square', group: 'milestone',
    explain: 'Entries that carry a note saying what they were. Levels at 10, 50 and 200.',
    level: nt.level, maxLevel: 3, status: `${plural(notes, 'note')}${nt.next ? ` · next at ${nt.next}` : ''}`, progress: nt.progress,
  });
  const paydays = i.rows.filter(r => r.income > 0).length;
  const pd = tiered(paydays, [3, 12, 36]);
  badges.push({
    id: 'paydays', title: 'Paydays logged', icon: 'inbox', group: 'milestone',
    explain: 'Income entries you have logged. Levels at 3, 12 and 36.',
    level: pd.level, maxLevel: 3, status: `${plural(paydays, 'income entry', 'income entries')}${pd.next ? ` · next at ${pd.next}` : ''}`, progress: pd.progress,
  });

  // Months in a row, ending now, where money in covered your share of spending. `goodYear` counts
  // them anywhere in the year; this is the run, which one bad month ends. A month still under way
  // that is not ahead yet does not break it: the run is counted to last month until it is.
  const byMonth = new Map<number, { spent: number; income: number }>();
  for (const r of i.rows) {
    const d = new Date(r.date);
    const k = d.getFullYear() * 12 + d.getMonth();
    const t = byMonth.get(k) ?? { spent: 0, income: 0 };
    byMonth.set(k, { spent: t.spent + r.spent, income: t.income + r.income });
  }
  const good = (k: number) => { const t = byMonth.get(k); return !!t && t.income > 0 && t.income >= t.spent; };
  const monthNow = year * 12 + month;
  let run = 0;
  for (let k = good(monthNow) ? monthNow : monthNow - 1; good(k); k--) run++;
  const rn = tiered(run, [2, 3, 6, 12]);
  badges.push({
    id: 'monthsInRow', title: 'Months in a row', icon: 'bar-chart', group: 'milestone',
    explain: 'Months in a row, up to now, where money in covered your share of spending. One month behind ends the run. Levels at 2, 3, 6 and 12.',
    level: rn.level, maxLevel: 4, status: `${plural(run, 'month')} running${rn.next ? ` · next at ${rn.next}` : ''}`, progress: rn.progress,
  });

  // Different kinds of income you have logged: a salary alone is one.
  const sources = new Set(i.rows.filter(r => r.income > 0 && r.category).map(r => r.category)).size;
  const sr = tiered(sources, [2, 3, 4]);
  badges.push({
    id: 'incomeSources', title: 'More than one income', icon: 'layers', group: 'milestone',
    explain: 'Different kinds of income you have logged: salary, freelance, interest and so on. Levels at 2, 3 and 4.',
    level: sr.level, maxLevel: 3, status: `${plural(sources, 'kind')} of income${sr.next ? ` · next at ${sr.next}` : ''}`, progress: sr.progress,
  });

  const loggedToday = days.has(dayKey(i.nowMs));
  badges.push({
    id: 'loggedToday', title: 'Logged today', icon: 'edit', group: 'now',
    explain: 'Today has at least one entry. Checked again every day.',
    level: loggedToday ? 1 : 0, maxLevel: 1,
    status: loggedToday ? 'Done for today' : 'Nothing logged today yet', progress: loggedToday ? 1 : 0,
  });
  if (i.hasShared) {
    const clear = i.owe === 0;
    badges.push({
      id: 'oweNobody', title: 'Owe nobody', icon: 'smile', group: 'now',
      explain: 'You owe nothing to anyone right now, whatever others still owe you. Checked again every day.',
      level: clear ? 1 : 0, maxLevel: 1,
      status: clear ? 'Nothing to pay back' : `You owe ${rupees(i.owe)}`, progress: clear ? 1 : 0,
    });
  }

  return badges;
}
