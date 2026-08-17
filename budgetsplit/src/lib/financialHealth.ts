/**
 * Financial health engine — four equal-weighted pillars in the structure the
 * validated instruments use (Financial Health Network's FinHealth Score®,
 * CFPB Financial Well-Being Scale): **Spend / Save / Borrow / Plan**, each
 * scored 0–100 from real ledger data, overall = plain average, tiers named
 * Vulnerable (0–39) / Coping (40–79) / Healthy (80–100).
 *
 * Two rules carried over from those instruments, because they are what
 * separates a measurement from a vibe:
 *
 * 1. **Equal weights.** No published instrument justifies unequal ones, so we
 *    don't invent any. A pillar is the average of its factors; the score is
 *    the average of every factor that could be computed.
 * 2. **No score on insufficient data.** Both instruments refuse to score an
 *    incomplete questionnaire. Our analog: fewer than `GATE_MIN_DAYS` days of
 *    ledger history, no income ever logged, or fewer than `GATE_MIN_TXNS`
 *    transactions → `gate.ok === false`, no number, and `gate.needs` is the
 *    "add X to unlock" checklist. (The old rubric paid an empty database
 *    59/100 "Fair" out of neutral defaults — a confident number manufactured
 *    from silence.)
 *
 * Factors that genuinely don't apply (no budget set, no goals with a funding
 * rate, no recurring bills known) are EXCLUDED from numerator and denominator
 * alike — absence of data is never worth points in either direction.
 * Every factor explains itself with a plain-language detail string.
 */
import { formatCompact } from './money';

export type HealthBand = 'healthy' | 'coping' | 'vulnerable';

/** Tier boundaries, straight from the FinHealth Score. */
export const HEALTH_TIER_HEALTHY = 80;
export const HEALTH_TIER_COPING = 40;

/** Minimum ledger history before a score is shown. */
export const GATE_MIN_DAYS = 30;
export const GATE_MIN_TXNS = 10;

export type HealthInputs = {
  // ── Spend ──
  /** My income over the last 90 days (paise). */
  income90: number;
  /** My spend (my share) over the last 90 days (paise). */
  spend90: number;
  /** My Budget: total monthly allocation (paise; 0 = no budget set). */
  budgetAllocated: number;
  /** Spend against those budgeted categories this month (paise). */
  budgetSpent: number;
  dayOfMonth: number;
  daysInMonth: number;

  // ── Save ──
  /** Liquid cash right now (paise) — `getCashPosition().available`. */
  liquid: number;
  /** Monthly goal-funding commitment across active goals (paise). */
  goalCommitMonthly: number;
  /** Allocated to goals so far this month (paise). */
  goalFundedThisMonth: number;

  // ── Borrow ──
  /** Credit-card balance currently used (paise). */
  creditUsed: number;
  /** What I owe people net of settlements (paise, ≥ 0). */
  netIOwe: number;

  // ── Plan ──
  /** My share of bills still due before month-end (paise). */
  upcomingBills: number;
  /** Active savings goals. */
  goalsCount: number;
  /** Is any budget set at all? */
  hasBudget: boolean;

  // ── Gate ──
  /** Days since the first ledger transaction. */
  dataDays: number;
  /** Has any income ever been logged (row or recurring rule)? */
  hasIncome: boolean;
  /** Ledger transactions (excluding rule templates). */
  txnCount: number;
};

export type HealthFactor = {
  label: string;
  /** Concise sentence explaining the score for this factor. */
  detail: string;
  /** 0–100. */
  points: number;
  /** Always 100 — kept so existing meters render unchanged. */
  max: number;
  severity: 'good' | 'warn' | 'bad' | 'neutral';
};

export type HealthDimension = {
  /** Pillar label: Spend / Save / Borrow / Plan. */
  label: string;
  score: number;
  max: number;
  /** 0–100 fill for the pillar meter. */
  pct: number;
  severity: 'good' | 'warn' | 'bad' | 'neutral';
  factors: HealthFactor[];
};

export type HealthGateNeed = { label: string; done: boolean };

export type HealthResult = {
  /** 0–100. Meaningless when `gate.ok` is false — UIs must not show it then. */
  score: number;
  band: HealthBand;
  factors: HealthFactor[];
  /** The four pillars driving the UI. */
  dimensions: HealthDimension[];
  /** Minimum-data gate. `ok: false` → show `needs` as the unlock checklist. */
  gate: { ok: boolean; needs: HealthGateNeed[] };
};

const F = (label: string, detail: string, points: number, severity: HealthFactor['severity']): HealthFactor =>
  ({ label, detail, points: Math.max(0, Math.min(100, Math.round(points))), max: 100, severity });

// ── Spend ────────────────────────────────────────────────────────────────────

/** Spend < income — the most basic FinHealth indicator, over a 90-day window. */
function spendVsIncome(i: HealthInputs): HealthFactor | null {
  if (i.income90 <= 0) return null; // gate requires income *ever*; window can still be empty
  const rate = (i.income90 - i.spend90) / i.income90;
  const pct = Math.round(rate * 100);
  if (rate >= 0.2) return F('Spending vs income', `Keeping ${pct}% of income over 90 days — healthy.`, 100, 'good');
  if (rate >= 0.1) return F('Spending vs income', `Keeping ${pct}% of income over 90 days.`, 75, 'good');
  if (rate >= 0)   return F('Spending vs income', `Keeping only ${pct}% of income — spending nearly all of it.`, 50, 'warn');
  return F('Spending vs income', `Spending ${formatCompact(i.spend90 - i.income90)} more than income over 90 days.`, 15, 'bad');
}

/** Pace against the budget the user set. N/A without a budget. */
function budgetPace(i: HealthInputs): HealthFactor | null {
  if (i.budgetAllocated <= 0) return null;
  const paceExpected = Math.round((i.dayOfMonth / i.daysInMonth) * i.budgetAllocated);
  if (paceExpected === 0) return F('Budget pace', 'Too early in the month to gauge pace.', 80, 'neutral');
  const ratio = i.budgetSpent / paceExpected;
  const headroom = paceExpected - i.budgetSpent;
  if (ratio <= 0.75) return F('Budget pace', `${formatCompact(Math.abs(headroom))} under pace — well ahead of budget.`, 100, 'good');
  if (ratio <= 1.0)  return F('Budget pace', `${formatCompact(Math.abs(headroom))} under pace — on track.`, 80, 'good');
  if (ratio <= 1.2)  return F('Budget pace', `${formatCompact(-headroom)} over pace with ${i.daysInMonth - i.dayOfMonth} days left.`, 45, 'warn');
  return F('Budget pace', `${formatCompact(-headroom)} over pace — running significantly hot.`, 10, 'bad');
}

// ── Save ─────────────────────────────────────────────────────────────────────

/** Liquid runway in months of typical spend — FinHealth's liquid-savings indicator. */
function runway(i: HealthInputs): HealthFactor | null {
  const monthlySpend = i.spend90 / 3;
  if (monthlySpend <= 0) return null;
  const months = i.liquid / monthlySpend;
  const label = 'Cash runway';
  const m = months.toFixed(1).replace(/\.0$/, '');
  if (months >= 6) return F(label, `${m} months of spending in cash — a real cushion.`, 100, 'good');
  if (months >= 3) return F(label, `${m} months of spending in cash.`, 80, 'good');
  if (months >= 1) return F(label, `${m} months of spending in cash — thin cushion.`, 55, 'warn');
  if (months > 0)  return F(label, `Less than a month of spending in cash.`, 30, 'bad');
  return F(label, 'No cash cushion — spending would go straight to debt.', 10, 'bad');
}

/** Are this cycle's goal contributions actually happening? N/A without a rate. */
function goalFunding(i: HealthInputs): HealthFactor | null {
  if (i.goalCommitMonthly <= 0) return null;
  const ratio = i.goalFundedThisMonth / i.goalCommitMonthly;
  const label = 'Goal funding';
  if (ratio >= 1)   return F(label, 'This month’s goal contributions are fully set aside.', 100, 'good');
  if (ratio >= 0.5) return F(label, `${Math.round(ratio * 100)}% of this month’s goal funding set aside.`, 70, 'good');
  if (ratio > 0)    return F(label, `Only ${Math.round(ratio * 100)}% of this month’s goal funding set aside so far.`, 40, 'warn');
  return F(label, `None of this month’s ${formatCompact(i.goalCommitMonthly)} goal funding set aside yet.`, 20, 'warn');
}

// ── Borrow ───────────────────────────────────────────────────────────────────

/** Debt load: card balance + what you owe people, against monthly income. */
function debtLoad(i: HealthInputs): HealthFactor {
  const debt = Math.max(0, i.creditUsed) + Math.max(0, i.netIOwe);
  const label = 'Debt load';
  if (debt === 0) {
    // Earned, not defaulted: the gate guarantees a real ledger exists.
    return F(label, 'No card balance and nothing owed — clear.', 100, 'good');
  }
  const monthlyIncome = i.income90 / 3;
  if (monthlyIncome <= 0) {
    return F(label, `Owing ${formatCompact(debt)} with no recent income logged.`, 25, 'warn');
  }
  const ratio = debt / monthlyIncome;
  if (ratio < 0.1) return F(label, `Owing ${formatCompact(debt)} — under 10% of a month's income.`, 85, 'good');
  if (ratio < 0.3) return F(label, `Owing ${formatCompact(debt)} — ${Math.round(ratio * 100)}% of a month's income.`, 55, 'warn');
  if (ratio < 0.6) return F(label, `Owing ${formatCompact(debt)} — ${Math.round(ratio * 100)}% of a month's income.`, 30, 'bad');
  return F(label, `Owing ${formatCompact(debt)} — more than half a month's income.`, 10, 'bad');
}

// ── Plan ─────────────────────────────────────────────────────────────────────

/** Are the bills you know about covered by the cash you actually have? */
function billsCovered(i: HealthInputs): HealthFactor | null {
  if (i.upcomingBills <= 0) return null; // no known bills → nothing to assess
  const label = 'Bills covered';
  if (i.liquid >= i.upcomingBills) {
    return F(label, `This month's remaining ${formatCompact(i.upcomingBills)} in bills is covered by cash on hand.`, 100, 'good');
  }
  const ratio = i.liquid > 0 ? i.liquid / i.upcomingBills : 0;
  if (ratio >= 0.5) return F(label, `Cash covers only ${Math.round(ratio * 100)}% of the bills still due this month.`, 50, 'warn');
  return F(label, `Bills still due (${formatCompact(i.upcomingBills)}) exceed the cash on hand.`, 15, 'bad');
}

/** Planning ahead: a budget and goals exist at all. Always computable. */
function plansAhead(i: HealthInputs): HealthFactor {
  const label = 'Plans ahead';
  const hasGoals = i.goalsCount > 0;
  if (i.hasBudget && hasGoals) return F(label, 'Budget set and savings goals defined.', 100, 'good');
  if (i.hasBudget) return F(label, 'Budget set — no savings goals yet.', 60, 'neutral');
  if (hasGoals) return F(label, 'Savings goals defined — no budget yet.', 60, 'neutral');
  return F(label, 'No budget and no savings goals yet.', 20, 'warn');
}

// ── Main entry point ─────────────────────────────────────────────────────────

function worstSev(fs: HealthFactor[]): HealthFactor['severity'] {
  if (fs.some(f => f.severity === 'bad')) return 'bad';
  if (fs.some(f => f.severity === 'warn')) return 'warn';
  if (fs.some(f => f.severity === 'good')) return 'good';
  return 'neutral';
}

export function healthGate(i: HealthInputs): HealthResult['gate'] {
  const needs: HealthGateNeed[] = [
    { label: `${GATE_MIN_DAYS} days of history (${Math.min(i.dataDays, GATE_MIN_DAYS)}/${GATE_MIN_DAYS})`, done: i.dataDays >= GATE_MIN_DAYS },
    { label: 'At least one income logged', done: i.hasIncome },
    { label: `${GATE_MIN_TXNS} transactions logged (${Math.min(i.txnCount, GATE_MIN_TXNS)}/${GATE_MIN_TXNS})`, done: i.txnCount >= GATE_MIN_TXNS },
  ];
  return { ok: needs.every(n => n.done), needs };
}

export function computeHealthScore(input: HealthInputs): HealthResult {
  const gate = healthGate(input);

  const pillarDefs: Array<{ label: string; factors: Array<HealthFactor | null> }> = [
    { label: 'Spend',  factors: [spendVsIncome(input), budgetPace(input)] },
    { label: 'Save',   factors: [runway(input), goalFunding(input)] },
    { label: 'Borrow', factors: [debtLoad(input)] },
    { label: 'Plan',   factors: [billsCovered(input), plansAhead(input)] },
  ];

  const dimensions: HealthDimension[] = [];
  const allFactors: HealthFactor[] = [];
  for (const p of pillarDefs) {
    const fs = p.factors.filter((f): f is HealthFactor => f !== null);
    if (fs.length === 0) continue; // absent pillar: out of numerator AND denominator
    const pct = Math.round(fs.reduce((s, f) => s + f.points, 0) / fs.length);
    dimensions.push({ label: p.label, score: pct, max: 100, pct, severity: worstSev(fs), factors: fs });
    allFactors.push(...fs);
  }

  // Equal-weighted average of the pillars (FinHealth's structure: each pillar
  // counts the same, however many of its indicators were computable).
  const score = dimensions.length > 0
    ? Math.max(0, Math.min(100, Math.round(dimensions.reduce((s, d) => s + d.pct, 0) / dimensions.length)))
    : 0;
  const band: HealthBand = score >= HEALTH_TIER_HEALTHY ? 'healthy' : score >= HEALTH_TIER_COPING ? 'coping' : 'vulnerable';

  return { score, band, factors: allFactors, dimensions, gate };
}

// ── Improvement projection ───────────────────────────────────────────────────
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
    case 'Spending vs income':
    case 'Budget pace': {
      const cut = Math.round((input.spend90 / 3) * 0.12); // a concrete ~12% monthly trim
      if (cut <= 0) return null;
      const to = project({
        spend90: Math.max(0, input.spend90 - cut * 3),
        budgetSpent: Math.max(0, input.budgetSpent - cut),
      });
      if (to <= fromScore) return null;
      return {
        factorLabel: label,
        title: 'Biggest lever: trim spending',
        detail: `Spending ${formatCompact(cut)} less a month would lift your score from ${fromScore} to ${to}.`,
        fromScore, toScore: to,
      };
    }
    case 'Debt load': {
      const debt = Math.max(0, input.creditUsed) + Math.max(0, input.netIOwe);
      if (debt <= 0) return null;
      const to = project({ creditUsed: 0, netIOwe: 0 });
      if (to <= fromScore) return null;
      return {
        factorLabel: label,
        title: 'Clear what you owe',
        detail: `Settling the ${formatCompact(debt)} you owe would lift your score from ${fromScore} to ${to}.`,
        fromScore, toScore: to,
      };
    }
    case 'Goal funding': {
      if (input.goalCommitMonthly <= 0 || input.goalFundedThisMonth >= input.goalCommitMonthly) return null;
      const to = project({ goalFundedThisMonth: input.goalCommitMonthly });
      if (to <= fromScore) return null;
      const gap = input.goalCommitMonthly - input.goalFundedThisMonth;
      return {
        factorLabel: label,
        title: 'Fund this month’s goals',
        detail: `Setting aside the remaining ${formatCompact(gap)} for goals would lift your score from ${fromScore} to ${to}.`,
        fromScore, toScore: to,
      };
    }
    case 'Plans ahead': {
      if (input.hasBudget) return null;
      const to = project({ hasBudget: true });
      if (to <= fromScore) return null;
      return {
        factorLabel: label,
        title: 'Set a monthly budget',
        detail: `Setting a budget would lift your score from ${fromScore} to ${to} — and make the pace line real.`,
        fromScore, toScore: to,
      };
    }
    default:
      return null; // Runway / bills-covered move by saving, which the levers above already cover.
  }
}

/**
 * The single highest-impact, achievable improvement — or null when the score is
 * already strong / nothing actionable moves it. The projected score is computed
 * by re-running the real scoring formula, so it can never be a fake figure.
 */
export function suggestImprovement(input: HealthInputs, result: HealthResult): HealthImprovement | null {
  if (!result.gate.ok) return null;
  const ranked = result.factors
    .map(f => ({ f, gap: f.max - f.points }))
    .filter(x => x.gap >= 20)
    .sort((a, b) => b.gap - a.gap);

  for (const { f } of ranked) {
    const built = buildLever(f.label, input, result.score);
    // A lever must be material: nudging 95→98 is noise, not advice.
    if (built && built.toScore - built.fromScore >= 5) return built;
  }
  return null;
}
