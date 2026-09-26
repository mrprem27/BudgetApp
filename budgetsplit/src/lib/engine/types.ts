import type { TxnWithSplits } from '../../db/queries/transactions';
import type { SavingsGoal } from '../../db/queries/savings';
import type { GoalFundingStatus } from '../../db/queries/spendPower';
import type { MyExposure } from '../../db/queries/balances';
import type { CategoryBudget } from '../../db/queries/categoryBudgets';

/**
 * `FinanceSnapshot` (`SPEC-ENGINE.md` §4, module E1) — every input the engine
 * reads, gathered from one place, in one plain object. Everything after E1 is
 * pure: no module past this one touches the database.
 *
 * Each field has exactly one source (see `db/queries/engineSnapshot.ts`), reusing
 * today's queries rather than re-deriving them — the spec's own accept criterion
 * is that a snapshot's parts equal what `getSafeToSpend` already computes from the
 * same ledger.
 */
export type FinanceSnapshot = {
  asOf: number;
  meId: string;

  cash: {
    /** Spendable right now: cash only (`getCashPosition().available`). */
    available: number;
    /** `computeTotalMoney().creditUsed` — debt, never subtracted from `available` itself. */
    creditUsed: number;
    creditLimit: number;
    /**
     * The day of the month the card bill is due. `null` (unset) means the whole
     * balance is treated as due inside the safety horizon — today's conservative
     * assumption (§4 E1, §12 open question 1). Not asked anywhere in the UI yet.
     */
    cardDueDay: number | null;
  };

  recurring: {
    /** Every group's recurring rules (bills and income), my share carried on each. */
    rules: TxnWithSplits[];
    /** Rule id → its skipped occurrence dates. */
    skips: Record<string, number[]>;
  };

  goals: {
    list: SavingsGoal[];
    /** Goal id → saved so far (paise). */
    savedByGoal: Record<string, number>;
    funding: GoalFundingStatus;
  };

  /** My owe/owed exposure, including the per-person breakdown. */
  exposure: MyExposure;

  /**
   * Per person I have a receivable or payable with: their past settlement dates
   * (approved only, most recent first) — the raw material E2's repayment model
   * (Beta-binomial, §4 E2) is built from. No likelihood is computed here; E1 only
   * gathers facts.
   */
  receivables: Array<{ personId: string; settlementDates: number[] }>;

  /** My Budget — the personal category lines I set for myself, resolved. */
  budgets: CategoryBudget[];

  /**
   * My-share expense and income rows, ≤ 24 months, oldest first. Settlements are
   * excluded (analysis, not ledger — AGENTS.md §12). `isRecurringLinked` marks a
   * materialized occurrence of a confirmed recurring rule, so E2 can tell fixed
   * spend from variable without re-deriving it.
   */
  history: Array<{
    id: string;
    date: number;
    kind: 'expense' | 'income';
    category: string;
    amountPaise: number;
    isRecurringLinked: boolean;
  }>;

  /**
   * Already-logged future one-offs (not yet due), oldest first — disjoint from
   * `recurring.rules`' occurrences, which are expanded rather than materialized
   * ahead of now (the same basis `getSafeToSpend`'s `upcomingBills` uses).
   */
  futureOneOffs: Array<{
    id: string;
    date: number;
    kind: 'expense' | 'income';
    category: string;
    amountPaise: number;
  }>;
};

/**
 * E2 — statistics over this person's own history (`SPEC-ENGINE.md` §4). This
 * first slice (`EN2`) carries only the everyday rate; the rest of the table
 * (income, seasonality, category, repayment, …) arrives with EN5/EN9.
 */
export type Behaviour = {
  /** Trimmed-mean daily non-recurring expense (paise), or `null` below 30 days
   *  of qualifying history — never a guess (§4 E2). */
  everydayRatePaise: number | null;
};

/** One deterministic, dated claim on cash between now and the horizon (§4 E3). */
export type KnownEvent = {
  date: number;
  /** Negative = money out, positive = money in. */
  amountPaise: number;
  label: string;
};

export type ProjectedDay = {
  date: number;
  /** Running balance at the END of this day, after its events and the everyday rate. */
  balance: number;
  events: KnownEvent[];
};

/**
 * E3, first slice: the deterministic path only — known events plus the everyday
 * rate, day by day to the horizon. No uncertainty band yet (`EN3`), so the "low
 * point" here is exactly the path's minimum, not a percentile.
 */
export type Projection = {
  horizonDays: number;
  dailyRate: number | null;
  days: ProjectedDay[];
  lowPoint: { amount: number; date: number; events: string[] };
};
