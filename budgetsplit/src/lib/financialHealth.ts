/**
 * Financial health engine — five independent signals derived from real
 * transaction data (no pre-calculations, no generalised summaries).
 * Each signal explains itself with a plain-language detail string so the
 * user understands exactly why their score is what it is.
 */
import { formatCompact } from './money';

export type HealthBand = 'great' | 'good' | 'fair' | 'poor';

export type HealthInputs = {
  /** My total spending this period (paise). */
  spendPaise: number;
  /** My total income this period (paise). */
  incomePaise: number;
  /** My total spending the previous equivalent period (paise). */
  prevSpendPaise: number;

  /** Sum of all budget allocations across groups (paise; 0 = no budget set). */
  budgetAllocated: number;
  /** Sum of spending against budgeted categories (paise). */
  budgetSpent: number;
  /** Number of budget categories currently over 100 % utilisation. */
  categoriesOver: number;
  /** Number of budget categories between 80–100 % utilisation. */
  categoriesNear: number;
  /** Total number of categories that have a budget set. */
  totalBudgeted: number;
  /** Worst single category utilisation % (null when no budgets). */
  worstCategoryPct: number | null;
  /** Name of the worst category (null when no budgets). */
  worstCategoryName: string | null;

  /** Positive = you owe others; negative = others owe you (paise). */
  netOwedPaise: number;

  /** Current day of the month (1–31). */
  dayOfMonth: number;
  /** Total days in the current month (28–31). */
  daysInMonth: number;
};

export type HealthFactor = {
  label: string;
  /** Concise sentence explaining the score for this dimension. */
  detail: string;
  points: number;
  max: number;
  severity: 'good' | 'warn' | 'bad' | 'neutral';
};

export type HealthDimension = {
  /** Short label shown under the ring (e.g. "Spending"). */
  label: string;
  score: number;
  max: number;
  /** 0–100 percentage fill for the circular ring. */
  pct: number;
  severity: 'good' | 'warn' | 'bad' | 'neutral';
  /** Constituent signals, shown when the user taps the ring. */
  factors: HealthFactor[];
};

export type HealthResult = {
  score: number;
  band: HealthBand;
  factors: HealthFactor[];
  /** Three grouped dimensions driving the ring UI. */
  dimensions: HealthDimension[];
};

// ─── Signal 1: Spend pace (max 25) ───────────────────────────────────────────
// Compares actual spend against the time-weighted expected spend for this point
// in the month. Tells you whether you're running hot or cold relative to pace.

function spendPaceFactor(input: HealthInputs): HealthFactor {
  const { spendPaise, incomePaise, budgetAllocated, budgetSpent, dayOfMonth, daysInMonth } = input;

  if (budgetAllocated > 0) {
    const paceExpected = Math.round((dayOfMonth / daysInMonth) * budgetAllocated);
    if (paceExpected === 0) {
      return { label: 'Spend pace', detail: 'Too early in the month to gauge pace.', points: 14, max: 25, severity: 'neutral' };
    }
    const ratio = budgetSpent / paceExpected;
    const headroom = paceExpected - budgetSpent;
    const over = budgetSpent - paceExpected;

    if (ratio <= 0.75) {
      return { label: 'Spend pace', detail: `${formatCompact(Math.abs(headroom))} under pace — well ahead of budget.`, points: 25, max: 25, severity: 'good' };
    }
    if (ratio <= 1.0) {
      return { label: 'Spend pace', detail: `${formatCompact(Math.abs(headroom))} under pace — on track.`, points: 18, max: 25, severity: 'good' };
    }
    if (ratio <= 1.2) {
      return { label: 'Spend pace', detail: `${formatCompact(over)} over pace with ${daysInMonth - dayOfMonth} days left.`, points: 9, max: 25, severity: 'warn' };
    }
    return { label: 'Spend pace', detail: `${formatCompact(over)} ahead of pace — running significantly hot.`, points: 2, max: 25, severity: 'bad' };
  }

  // No budget — use income as the reference.
  if (incomePaise > 0) {
    const ratio = spendPaise / incomePaise;
    if (ratio <= 0.5) {
      return { label: 'Spend pace', detail: `Spent ${Math.round(ratio * 100)}% of income — healthy.`, points: 22, max: 25, severity: 'good' };
    }
    if (ratio <= 0.8) {
      return { label: 'Spend pace', detail: `Spent ${Math.round(ratio * 100)}% of income so far.`, points: 16, max: 25, severity: 'good' };
    }
    if (ratio <= 1.0) {
      return { label: 'Spend pace', detail: `Spent ${Math.round(ratio * 100)}% of income — approaching the limit.`, points: 10, max: 25, severity: 'warn' };
    }
    return { label: 'Spend pace', detail: `Spending exceeds income by ${formatCompact(spendPaise - incomePaise)}.`, points: 2, max: 25, severity: 'bad' };
  }

  return { label: 'Spend pace', detail: 'No budget or income to compare against.', points: 12, max: 25, severity: 'neutral' };
}

// ─── Signal 2: Category discipline (max 20) ───────────────────────────────────
// Looks at each budgeted category individually — the worst offender matters most.
// A single runaway category tanks this signal even if the aggregate looks fine.

function categoryFactor(input: HealthInputs): HealthFactor {
  const { categoriesOver, categoriesNear, totalBudgeted, worstCategoryPct, worstCategoryName } = input;

  if (totalBudgeted === 0) {
    return { label: 'Category budgets', detail: 'No category budgets set yet.', points: 10, max: 20, severity: 'neutral' };
  }
  if (categoriesOver === 0 && categoriesNear === 0) {
    return { label: 'Category budgets', detail: `All ${totalBudgeted} budgeted categories on track.`, points: 20, max: 20, severity: 'good' };
  }
  if (categoriesOver === 0) {
    const nearText = categoriesNear === 1 ? '1 category near limit' : `${categoriesNear} categories near limit`;
    return { label: 'Category budgets', detail: `${nearText} — watch your spending.`, points: 14, max: 20, severity: 'warn' };
  }
  if (categoriesOver === 1 && worstCategoryName) {
    const pct = worstCategoryPct !== null ? ` (${worstCategoryPct}%)` : '';
    return { label: 'Category budgets', detail: `${worstCategoryName}${pct} is over budget.`, points: 8, max: 20, severity: 'bad' };
  }
  const worstText = worstCategoryName && worstCategoryPct !== null ? ` — worst: ${worstCategoryName} at ${worstCategoryPct}%` : '';
  return { label: 'Category budgets', detail: `${categoriesOver} categories over budget${worstText}.`, points: 2, max: 20, severity: 'bad' };
}

// ─── Signal 3: Cash flow / savings rate (max 20) ──────────────────────────────
// (income − spending) ÷ income — the most direct measure of whether money is
// accumulating or evaporating. No income = penalise only lightly.

function cashFlowFactor(input: HealthInputs): HealthFactor {
  const { spendPaise, incomePaise } = input;

  if (incomePaise === 0) {
    if (spendPaise === 0) {
      return { label: 'Cash flow', detail: 'No income or spending recorded yet.', points: 10, max: 20, severity: 'neutral' };
    }
    return { label: 'Cash flow', detail: `${formatCompact(spendPaise)} spent with no income logged.`, points: 5, max: 20, severity: 'warn' };
  }

  const rate = Math.round(((incomePaise - spendPaise) / incomePaise) * 100);
  if (rate >= 20) {
    return { label: 'Cash flow', detail: `Saving ${rate}% of income — excellent.`, points: 20, max: 20, severity: 'good' };
  }
  if (rate >= 10) {
    return { label: 'Cash flow', detail: `Saving ${rate}% of income.`, points: 15, max: 20, severity: 'good' };
  }
  if (rate >= 0) {
    return { label: 'Cash flow', detail: `Saving ${rate}% of income — try to push above 10%.`, points: 10, max: 20, severity: 'warn' };
  }
  const overBy = formatCompact(spendPaise - incomePaise);
  return { label: 'Cash flow', detail: `Spending ${overBy} more than income.`, points: 2, max: 20, severity: 'bad' };
}

// ─── Signal 4: Spending momentum (max 20) ────────────────────────────────────
// Period-over-period delta: are you improving or worsening? Rewards consistent
// downward movement; penalises sharp spikes.

function momentumFactor(input: HealthInputs): HealthFactor {
  const { spendPaise, prevSpendPaise } = input;

  if (prevSpendPaise === 0) {
    if (spendPaise === 0) {
      return { label: 'Spending trend', detail: 'No prior period to compare against.', points: 12, max: 20, severity: 'neutral' };
    }
    return { label: 'Spending trend', detail: 'First period with spending recorded.', points: 12, max: 20, severity: 'neutral' };
  }

  const delta = Math.round(((spendPaise - prevSpendPaise) / prevSpendPaise) * 100);
  const absDelta = Math.abs(delta);

  if (delta <= -15) {
    return { label: 'Spending trend', detail: `Down ${absDelta}% from last period — great improvement.`, points: 20, max: 20, severity: 'good' };
  }
  if (delta <= -5) {
    return { label: 'Spending trend', detail: `Down ${absDelta}% from last period.`, points: 16, max: 20, severity: 'good' };
  }
  if (delta <= 5) {
    return { label: 'Spending trend', detail: `Similar to last period (${delta > 0 ? '+' : ''}${delta}%).`, points: 12, max: 20, severity: 'neutral' };
  }
  if (delta <= 20) {
    return { label: 'Spending trend', detail: `Up ${delta}% from last period — spending is rising.`, points: 7, max: 20, severity: 'warn' };
  }
  return { label: 'Spending trend', detail: `Up ${delta}% from last period — sharp increase.`, points: 2, max: 20, severity: 'bad' };
}

// ─── Signal 5: Debt burden (max 15) ──────────────────────────────────────────
// How much you owe others relative to your income. Owing a lot relative to what
// you earn is a stress indicator. Being owed is a positive signal.

function debtFactor(input: HealthInputs): HealthFactor {
  const { netOwedPaise, incomePaise } = input;

  if (netOwedPaise < 0) {
    return { label: 'Debt position', detail: `Others owe you ${formatCompact(-netOwedPaise)} — positive.`, points: 15, max: 15, severity: 'good' };
  }
  if (netOwedPaise === 0) {
    return { label: 'Debt position', detail: 'All balances settled.', points: 15, max: 15, severity: 'good' };
  }

  if (incomePaise > 0) {
    const ratio = netOwedPaise / incomePaise;
    if (ratio < 0.1) {
      return { label: 'Debt position', detail: `You owe ${formatCompact(netOwedPaise)} — less than 10% of income.`, points: 12, max: 15, severity: 'good' };
    }
    if (ratio < 0.3) {
      return { label: 'Debt position', detail: `You owe ${formatCompact(netOwedPaise)} — ${Math.round(ratio * 100)}% of income.`, points: 7, max: 15, severity: 'warn' };
    }
    return { label: 'Debt position', detail: `You owe ${formatCompact(netOwedPaise)} — over 30% of income.`, points: 2, max: 15, severity: 'bad' };
  }

  // No income to ratio against — use absolute thresholds.
  const K = 100 * 100; // ₹100 in paise
  if (netOwedPaise <= 10 * K) {
    return { label: 'Debt position', detail: `You owe ${formatCompact(netOwedPaise)} — small balance.`, points: 11, max: 15, severity: 'neutral' };
  }
  return { label: 'Debt position', detail: `You owe ${formatCompact(netOwedPaise)}.`, points: 4, max: 15, severity: 'warn' };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

function worstSev(fs: HealthFactor[]): HealthFactor['severity'] {
  if (fs.some(f => f.severity === 'bad')) return 'bad';
  if (fs.some(f => f.severity === 'warn')) return 'warn';
  if (fs.some(f => f.severity === 'good')) return 'good';
  return 'neutral';
}

export function computeHealthScore(input: HealthInputs): HealthResult {
  const f1 = spendPaceFactor(input);
  const f2 = categoryFactor(input);
  const f3 = cashFlowFactor(input);
  const f4 = momentumFactor(input);
  const f5 = debtFactor(input);
  const factors: HealthFactor[] = [f1, f2, f3, f4, f5];

  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  const band: HealthBand = score >= 80 ? 'great' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor';

  const mkDim = (label: string, fs: HealthFactor[]): HealthDimension => {
    const s = fs.reduce((a, f) => a + f.points, 0);
    const m = fs.reduce((a, f) => a + f.max, 0);
    return { label, score: s, max: m, pct: Math.round((s / m) * 100), severity: worstSev(fs), factors: fs };
  };

  // 3 rings grouped by what they measure:
  //   Spending : spendPace (25) + cashFlow (20) = max 45
  //   Trend    : momentum (20)                  = max 20
  //   Budget   : category (20) + debt (15)      = max 35
  const dimensions: HealthDimension[] = [
    mkDim('Spending', [f1, f3]),
    mkDim('Trend', [f4]),
    mkDim('Budget', [f2, f5]),
  ];

  return { score, band, factors, dimensions };
}

// ─── Improvement projection ───────────────────────────────────────────────────
// A *real* "what would help most" — never a fabricated number. We take the
// weakest actionable factor, apply a concrete, achievable change, and re-run
// computeHealthScore() so the projected score is the true recomputed result.

export type HealthImprovement = {
  factorLabel: string;
  title: string;
  detail: string;
  fromScore: number;
  toScore: number;
};

function buildLever(label: string, input: HealthInputs, fromScore: number): HealthImprovement | null {
  const project = (patch: Partial<HealthInputs>): number => computeHealthScore({ ...input, ...patch }).score;

  switch (label) {
    case 'Cash flow':
    case 'Spend pace': {
      // Nothing to pace against → can't model honestly.
      if (input.incomePaise <= 0 && input.budgetAllocated <= 0) return null;
      const cut = Math.round(input.spendPaise * 0.12); // a concrete ~12% trim
      if (cut <= 0) return null;
      const to = project({
        spendPaise: Math.max(0, input.spendPaise - cut),
        budgetSpent: Math.max(0, input.budgetSpent - cut),
      });
      if (to <= fromScore) return null;
      return {
        factorLabel: label,
        title: 'Biggest lever: trim spending',
        detail: `Spending ${formatCompact(cut)} less this month would lift your score from ${fromScore} to ${to}.`,
        fromScore, toScore: to,
      };
    }
    case 'Category budgets': {
      if (input.totalBudgeted === 0) return null;
      if (input.categoriesOver === 0) {
        if (input.categoriesNear === 0) return null;
        const to = project({ categoriesNear: 0 });
        if (to <= fromScore) return null;
        return { factorLabel: label, title: 'Keep categories under budget', detail: `Keeping your near-limit categories under budget would lift your score from ${fromScore} to ${to}.`, fromScore, toScore: to };
      }
      const name = input.worstCategoryName;
      const onlyOne = input.categoriesOver === 1;
      const to = project({
        categoriesOver: input.categoriesOver - 1,
        worstCategoryPct: onlyOne ? null : input.worstCategoryPct,
        worstCategoryName: onlyOne ? null : input.worstCategoryName,
      });
      if (to <= fromScore) return null;
      return { factorLabel: label, title: name ? `Rein in ${name}` : 'Rein in over-budget spending', detail: `Bringing ${name ?? 'your worst category'} back under budget would lift your score from ${fromScore} to ${to}.`, fromScore, toScore: to };
    }
    case 'Debt position': {
      if (input.netOwedPaise <= 0) return null;
      const to = project({ netOwedPaise: 0 });
      if (to <= fromScore) return null;
      return { factorLabel: label, title: 'Settle what you owe', detail: `Settling the ${formatCompact(input.netOwedPaise)} you owe would lift your score from ${fromScore} to ${to}.`, fromScore, toScore: to };
    }
    default:
      return null; // Spending trend isn't directly actionable within the period.
  }
}

/**
 * The single highest-impact, achievable improvement — or null when the score is
 * already strong / nothing actionable moves it. The projected score is computed
 * by re-running the real scoring formula, so it can never be a fake figure.
 */
export function suggestImprovement(input: HealthInputs, result: HealthResult): HealthImprovement | null {
  const ranked = result.factors
    .map(f => ({ f, gap: f.max - f.points }))
    .filter(x => x.gap >= 3)
    .sort((a, b) => b.gap - a.gap);

  for (const { f } of ranked) {
    const built = buildLever(f.label, input, result.score);
    if (built && built.toScore > built.fromScore) return built;
  }
  return null;
}
