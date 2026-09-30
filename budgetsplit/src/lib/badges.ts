import type { FeatherName } from '../constants/palette';

/**
 * Profile badges (`U-59`): small, honest acknowledgements of things the app has already worked
 * out about you. Every badge is a conclusion some engine reached for its own reasons — the
 * streak Home counts, the money engine's cash walk, its income model, the balance netting, the
 * goals, the budget — never a separate scoring system with its own opinions. Pure.
 *
 * A locked badge says what is left (`progress`), so the row reads as "what next", not as a
 * scoreboard of failures.
 */
export type BadgeInputs = {
  /** Days logged in a row (`streakFrom`). */
  streak: number;
  /** Entries I am on, ever. */
  txnCount: number;
  /** The engine's safe-to-spend, or null while it is still learning (`explain`). */
  safeToSpend: number | null;
  /** The engine warned the balance runs low soon (`lowPointWarning`). */
  lowSoon: boolean;
  /** The engine's income reading (`incomeModel`), or null with no income. */
  incomeConsistency: 'regular' | 'variable' | 'irregular' | null;
  /** Netted balances with people (`getMyExposure`). */
  owe: number;
  owed: number;
  /** Anyone to be square with — shared groups or friends with history. */
  hasShared: boolean;
  goalsDone: number;
  goalsCount: number;
  /** This month's budget use, or null with no budget. */
  budgetPct: number | null;
  dayOfMonth: number;
  assetCount: number;
};

export type Badge = {
  id: string;
  title: string;
  /** What earned it — one line. */
  detail: string;
  icon: FeatherName;
  earned: boolean;
  /** For a locked badge: what is left, in the user's terms. */
  progress?: string;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function computeBadges(i: BadgeInputs): Badge[] {
  const badges: Badge[] = [];

  // Logging habit — the streak Home already counts.
  badges.push(i.streak >= 30
    ? { id: 'streak30', title: 'Habit formed', detail: 'Logged something 30 days in a row.', icon: 'award', earned: true }
    : { id: 'streak7', title: 'On a roll', detail: 'Logged something 7 days in a row.', icon: 'zap',
        earned: i.streak >= 7, progress: i.streak >= 7 ? undefined : `${plural(7 - i.streak, 'more day')} in a row` });

  badges.push(i.txnCount >= 100
    ? { id: 'entries100', title: 'Committed', detail: '100 entries logged.', icon: 'book', earned: true }
    : { id: 'entries25', title: 'Getting the picture', detail: '25 entries logged.', icon: 'edit-3',
        earned: i.txnCount >= 25, progress: i.txnCount >= 25 ? undefined : `${plural(25 - i.txnCount, 'more entry', 'more entries')}` });

  // The money engine: every known bill covered to payday without dipping low.
  badges.push({
    id: 'covered', title: 'Covered to payday', icon: 'shield',
    detail: 'Every known bill is covered until your next income, with room to spare.',
    earned: i.safeToSpend != null && i.safeToSpend >= 0 && !i.lowSoon,
    progress: i.safeToSpend == null ? 'Needs a few weeks of history' : 'Not every bill is covered yet',
  });

  if (i.incomeConsistency) {
    badges.push({
      id: 'steadyIncome', title: 'Steady income', icon: 'trending-up',
      detail: 'Your income arrives on a regular rhythm.',
      earned: i.incomeConsistency === 'regular',
      progress: 'Income varies month to month',
    });
  }

  if (i.hasShared) {
    badges.push({
      id: 'allSquare', title: 'All square', icon: 'check-circle',
      detail: 'Nobody owes anybody: every balance with people is settled.',
      earned: i.owe === 0 && i.owed === 0,
      progress: i.owe > 0 ? 'Settle what you owe' : 'Collect what you are owed',
    });
  }

  if (i.goalsCount > 0) {
    badges.push({
      id: 'goal', title: 'Goal reached', icon: 'target',
      detail: `Reached ${plural(i.goalsDone, 'savings goal')}.`,
      earned: i.goalsDone > 0, progress: 'Fund a goal to its target',
    });
  }

  // Only once most of the month is behind you — "on budget" on the 3rd means nothing.
  if (i.budgetPct != null) {
    badges.push({
      id: 'onBudget', title: 'On budget', icon: 'pie-chart',
      detail: 'Past the 20th and still within this month’s budget.',
      earned: i.dayOfMonth >= 20 && i.budgetPct <= 100,
      progress: i.budgetPct > 100 ? 'Over this month’s budget' : 'Stay within budget past the 20th',
    });
  }

  badges.push({
    id: 'investor', title: 'Building wealth', icon: 'bar-chart-2',
    detail: 'You track what you own, not only what you spend.',
    earned: i.assetCount > 0, progress: 'Add an asset under Money',
  });

  // Earned first: the row opens on what you have done.
  return badges.map(b => (b.earned ? { ...b, progress: undefined } : b))
    .sort((a, b) => Number(b.earned) - Number(a.earned));
}
