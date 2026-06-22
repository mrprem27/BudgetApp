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
  /** Well above what you normally spend on this category. */
  AboveCategoryNorm = 'above_category_norm',
  /** A large slice of a single month's income in one purchase. */
  LargeIncomeShare = 'large_income_share',
  /** Affordable, but leaves less than the safety cushion. */
  ThinBuffer = 'thin_buffer',
  /** Fits comfortably on every axis. */
  Healthy = 'healthy',
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
};

/** Keep this fraction of current cash as an untouched cushion. */
export const SAFETY_BUFFER_RATIO = 0.15;
/** Spending up to 15% over your own category norm still counts as "normal". */
export const NORM_TOLERANCE = 1.15;
/** A single purchase above this fraction of monthly income is worth flagging. */
export const INCOME_SHARE_WARN = 0.1;

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

  // 4) Thin buffer (only meaningful when the purchase is otherwise affordable).
  if (!cashShort && remaining < bufferTarget) reasons.push(AffordReason.ThinBuffer);

  // Verdict: cash is the only hard "no"; any soft strain makes it "tight".
  let verdict: AffordVerdict;
  if (cashShort) {
    verdict = AffordVerdict.No;
  } else if (reasons.length > 0) {
    verdict = AffordVerdict.Tight;
  } else {
    verdict = AffordVerdict.Comfortable;
    reasons.push(AffordReason.Healthy);
  }

  return { verdict, freeToSpend, remaining, reasons, bufferTarget, categoryAfter, categoryCap, incomeShare };
}
