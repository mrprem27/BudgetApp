/**
 * "Can I afford this?" — a small, on-device decision engine. Pure + testable.
 *
 * It judges a prospective purchase on four independent axes, in order of how
 * hard each constraint is:
 *
 *   1. Cash         — would it overdraw the cash you actually have once the
 *                     bills already committed this month are set aside? (hard)
 *   2. Buffer       — does it leave a sensible safety cushion? (soft)
 *   3. Category     — does it blow past either an explicit budget for this
 *                     category or, failing that, the way you *normally* spend on
 *                     it (your own 30-day norm)? (soft)
 *   4. Income share — is a single purchase an outsized slice of your monthly
 *                     income? (soft)
 *
 * Only the cash test can produce a hard "no". Any soft strain downgrades a
 * "comfortable" to "tight" and is surfaced as a specific, honest reason — so the
 * verdict reflects *how* you spend and *what* you're buying, not just the
 * balance. All money is integer paise.
 */

export enum AffordVerdict {
  Comfortable = 'comfortable',
  Tight = 'tight',
  No = 'no',
}

/** Why the engine landed where it did — ordered most- to least-severe. */
export enum AffordReason {
  /** Would go negative once this month's committed bills are covered. */
  CashShort = 'cash_short',
  /** Pushes this category past the explicit budget you set for it. */
  OverCategoryBudget = 'over_category_budget',
  /** The month is already forecast to end over budget, before this purchase. */
  MonthAlreadyOver = 'month_already_over',
  /** Well above what you normally spend on this category. */
  AboveCategoryNorm = 'above_category_norm',
  /** Pushes a savings goal's finish date out. */
  DelaysGoal = 'delays_goal',
  /** A large slice of a single month's income in one purchase. */
  LargeIncomeShare = 'large_income_share',
  /** Much bigger than a typical purchase in this category. */
  UnusualForCategory = 'unusual_for_category',
  /** Affordable, but leaves less than the safety cushion. */
  ThinBuffer = 'thin_buffer',
  /** Fits comfortably on every axis. */
  Healthy = 'healthy',
}

/**
 * How badly it's needed. Optional: unset means the axis is simply not used, the
 * same way the category and income axes already work. Never overrides the cash
 * test — calling something a `Need` cannot conjure money that isn't there.
 */
export enum AffordNecessity {
  Need = 'need',
  Want = 'want',
  Later = 'later',
}

/** Optional category context — drives the "way you spend" reasoning. */
export type AffordCategoryContext = {
  name: string;
  /** My share already spent in this category *this month* (paise). */
  spentThisMonth: number;
  /** My typical monthly spend here, e.g. last-30-day total (paise). */
  norm: number;
  /** Explicit monthly budget for this category, if one is set (paise, > 0). */
  budget?: number;
  /** Median single purchase here over the history window (paise, > 0 to engage). */
  typicalBasket?: number;
  /** Fraction of recent months this category ran over its budget (0..1). */
  overshootRate?: number;
};

/** Where the month is heading before this purchase, from `lib/forecast`. */
export type AffordProjection = {
  /** Projected month-end spend (paise). */
  projectedMonthEnd: number;
  /** Budget the projection is measured against (paise, > 0 to engage). */
  budget: number;
};

/** The goal a purchase would set back, and by how much. */
export type AffordGoalImpact = {
  name: string;
  /** Months added to the goal's finish date by spending this instead of saving it. */
  monthsDelayed: number;
};

export type AffordContext = {
  /** Prospective purchase (paise). */
  amount: number;
  /** Spendable cash right now (paise). */
  available: number;
  /** Bills already committed for the rest of this month (paise, clamped ≥ 0). */
  upcomingBills: number;
  /** Typical monthly income (paise, > 0 to engage the income-share axis). */
  monthlyIncome?: number;
  category?: AffordCategoryContext;
  necessity?: AffordNecessity;
  projection?: AffordProjection;
  goalImpact?: AffordGoalImpact;
};

export type AffordResult = {
  verdict: AffordVerdict;
  /** Cash left once this month's known bills are set aside. */
  freeToSpend: number;
  /** What remains after the prospective purchase. */
  remaining: number;
  /** Every reason that applied, most-severe first. */
  reasons: AffordReason[];
  /** The safety cushion we want to keep (paise). */
  bufferTarget: number;
  /** Category spend after this purchase (paise) — present iff category given. */
  categoryAfter?: number;
  /** The ceiling we judged the category against: budget, else norm-with-tolerance. */
  categoryCap?: number;
  /** Fraction of monthly income this purchase represents (0..1), iff income given. */
  incomeShare?: number;
  /** Projected month-end spend *including* this purchase (paise), iff projection given. */
  projectedAfter?: number;
  /** Echoed through so the UI can name the goal without re-deriving it. */
  goalImpact?: AffordGoalImpact;
};

/** Keep this fraction of current cash as an untouched cushion. */
export const SAFETY_BUFFER_RATIO = 0.15;
/** Spending up to 15% over your own category norm still counts as "normal". */
export const NORM_TOLERANCE = 1.15;
/** A single purchase above this fraction of monthly income is worth flagging. */
export const INCOME_SHARE_WARN = 0.1;
/** Delaying a goal by less than this is rounding error, not a trade-off. */
export const GOAL_DELAY_WARN_MONTHS = 0.5;
/** A purchase this many times a typical basket is out of character for the category. */
export const UNUSUAL_BASKET_MULTIPLE = 3;
/** History window for basket size / overshoot rate. */
export const HISTORY_DAYS = 90;

/**
 * Income share for display, capped at ">999%" — past that the denominator can't be
 * an income, so the digits are noise. Callers should hide the row entirely when
 * `AffordSnapshot.incomeSource` is `'none'`.
 */
export function incomeSharePct(share: number | undefined): string {
  if (share === undefined || !Number.isFinite(share) || share <= 0) return '—';
  const pct = Math.round(share * 100);
  return pct > 999 ? '>999%' : `${pct}%`;
}

export function evaluateAfford(ctx: AffordContext): AffordResult {
  const amount = Math.max(0, ctx.amount);
  const available = ctx.available;
  const upcomingBills = Math.max(0, ctx.upcomingBills);

  const freeToSpend = available - upcomingBills;
  const remaining = freeToSpend - amount;
  const bufferTarget = Math.max(0, available * SAFETY_BUFFER_RATIO);

  const reasons: AffordReason[] = [];

  // 1) Hard cash gate.
  const cashShort = remaining < 0;
  if (cashShort) reasons.push(AffordReason.CashShort);

  // 2) Category — explicit budget wins; otherwise judge against your own norm.
  let categoryAfter: number | undefined;
  let categoryCap: number | undefined;
  if (ctx.category) {
    categoryAfter = ctx.category.spentThisMonth + amount;
    if (ctx.category.budget && ctx.category.budget > 0) {
      categoryCap = ctx.category.budget;
      if (categoryAfter > categoryCap) reasons.push(AffordReason.OverCategoryBudget);
    } else if (ctx.category.norm > 0) {
      categoryCap = Math.round(ctx.category.norm * NORM_TOLERANCE);
      if (categoryAfter > categoryCap) reasons.push(AffordReason.AboveCategoryNorm);
    }
  }

  // 3) Income share.
  let incomeShare: number | undefined;
  if (ctx.monthlyIncome && ctx.monthlyIncome > 0) {
    incomeShare = amount / ctx.monthlyIncome;
    if (incomeShare > INCOME_SHARE_WARN) reasons.push(AffordReason.LargeIncomeShare);
  }

  // 4) Where the month is already heading, before this purchase is added.
  let projectedAfter: number | undefined;
  if (ctx.projection && ctx.projection.budget > 0) {
    projectedAfter = ctx.projection.projectedMonthEnd + amount;
    if (projectedAfter > ctx.projection.budget) reasons.push(AffordReason.MonthAlreadyOver);
  }

  // 5) Cost to a savings goal. Phrased as a delay, never as a transfer: the
  //    overspend raid that would actually move the money is still silent for
  //    unlocked goals (V2-10), so promising it here would be dishonest.
  if (ctx.goalImpact && ctx.goalImpact.monthsDelayed >= GOAL_DELAY_WARN_MONTHS) {
    reasons.push(AffordReason.DelaysGoal);
  }

  // 6) Unusual for this category, judged against a typical *single* purchase
  //    rather than the monthly norm — a ₹8k restaurant bill can sit inside a
  //    ₹10k monthly norm and still be nothing like how you normally spend.
  if (ctx.category?.typicalBasket && ctx.category.typicalBasket > 0
      && amount > ctx.category.typicalBasket * UNUSUAL_BASKET_MULTIPLE) {
    reasons.push(AffordReason.UnusualForCategory);
  }

  // 7) Thin buffer (only meaningful when the purchase is otherwise affordable).
  if (!cashShort && remaining < bufferTarget) reasons.push(AffordReason.ThinBuffer);

  // Verdict: cash is still the only hard "no".
  //
  // Necessity modulates the soft axes only. A `Need` that is merely
  // buffer-strained stays comfortable — telling someone their rent is "tight"
  // because it dents a cushion is noise they can't act on. Anything a user
  // themselves marked `Later` is held to the strictest reading, since they have
  // already said it can wait.
  let verdict: AffordVerdict;
  const softReasons = reasons.filter(r => r !== AffordReason.CashShort);
  const onlyThinBuffer = softReasons.length === 1 && softReasons[0] === AffordReason.ThinBuffer;

  if (cashShort) {
    verdict = AffordVerdict.No;
  } else if (softReasons.length === 0) {
    verdict = AffordVerdict.Comfortable;
    reasons.push(AffordReason.Healthy);
  } else if (ctx.necessity === AffordNecessity.Need && onlyThinBuffer) {
    verdict = AffordVerdict.Comfortable;
  } else {
    verdict = AffordVerdict.Tight;
  }

  return {
    verdict, freeToSpend, remaining, reasons, bufferTarget,
    categoryAfter, categoryCap, incomeShare, projectedAfter,
    goalImpact: ctx.goalImpact,
  };
}
