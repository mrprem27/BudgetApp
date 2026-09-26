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
   * Per person I have a receivable or payable with: their past person-to-person
   * settlements (approved only, most recent first) — the raw material E2's
   * repayment model (Beta-binomial, §4 E2) is built from. No likelihood is
   * computed here; E1 only gathers facts.
   */
  receivables: Array<{ personId: string; settlements: Array<{ date: number; amountPaise: number }> }>;

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
  /** One week of essential (Need-category) spend — the floor E3 protects
   *  (§4 E3). 0 below its own minimum ("cold start"), never a guess either. */
  essentialFloorPaise: number;
};

/** Income's own consistency reading (§4 E2): drives both the known-event shape (E3) and the safety horizon (`EN5`'s "payday horizon"). */
export type IncomeConsistency = 'regular' | 'variable' | 'irregular';

/**
 * E2's income model (`EN5`). `nextDate`/`eventAmountPaise` are what E3's known
 * event actually uses (the rule's own amount when regular, a conservative P20
 * of recent amounts when variable) — `medianRecentPaise` is display-only
 * ("what you typically get paid"), never fed into the projection.
 */
export type IncomeModel = {
  consistency: IncomeConsistency;
  nextDate: number | null;
  eventAmountPaise: number | null;
  medianRecentPaise: number | null;
};

/** E2's per-friend repayment-likelihood model (`EN5`, Beta-binomial, §4 E2). Never synced, never shown as a score. */
export type RepaymentModel = {
  probability: number;
  delayDays: number;
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

/** One day's simulated balance spread, P10/P50/P90 across all 500 paths (§4 E3). */
export type PercentileDay = {
  date: number;
  p10: number;
  p50: number;
  p90: number;
};

/**
 * E3, second slice (`EN3`): the uncertainty band around the deterministic
 * path — 500 bootstrapped futures over the same known events, differing only
 * in the everyday-spend draw for each day.
 *
 * **Thin data** (`sample.length === 0`, matching `Behaviour.everydayRatePaise
 * === null`): no simulation runs. The band collapses onto the known path
 * exactly — `paths` is 0 and every day's P10/P50/P90 equal that day's
 * deterministic balance — and `cautiousLowPoint` equals the known path's own
 * low point (§4 E3 "Thin data").
 */
export type UncertaintyBand = {
  /** 500 normally, 0 when there wasn't enough history to simulate at all. */
  paths: number;
  days: PercentileDay[];
  /** The 20th percentile of each path's own low point — "four in five
   *  simulated futures do better than this" (§4 E3). */
  cautiousLowPoint: number;
  /** `Behaviour.essentialFloorPaise`, carried alongside the band because every
   *  caller that reads one reads the other in the same breath (§4 E4). */
  floor: number;
};

/**
 * E4, first slice (`EN4`): a prospective purchase (§4 E4, §5). `necessity`
 * left unset takes the Afford screen's own pre-fill (`behaviour.ts`'s
 * `defaultNecessity`) — a caller building its own scenario (tests, a future
 * screen) can always override it.
 *
 * `when: 'can-wait'` doesn't change how the purchase itself is judged — it
 * only asks `afford()` to additionally search forward for the earliest date
 * it would be Comfortable (§5: "the engine also finds the earliest Comfortable
 * date").
 */
export type Purchase = {
  amountPaise: number;
  category?: string;
  necessity?: 'need' | 'want';
  when: 'now' | 'can-wait';
  /** Absent = one-time. `EN6`'s 12-month sinking-fund view (yearly true
   *  expenses, "unfundable" months) isn't built yet, so a yearly recurrence
   *  here behaves like a one-time purchase within the 30-day safety horizon —
   *  only `weekly`/`monthly` land more than once inside it. */
  recurrence?: 'weekly' | 'monthly' | 'yearly';
};

/** One reason the verdict landed where it did, ranked by `amountPaise` (§4 E4: "reasons, ranked by rupee effect, each carrying its number"). */
export type AffordReason = {
  code: 'cash_short' | 'below_floor' | 'over_budget';
  /** The rupee effect this reason is ranked by (always positive). */
  amountPaise: number;
  label: string;
};

export type AffordVerdict = 'not-affordable' | 'tight' | 'comfortable';

/** §4 E4: "receivables called out when they tip the answer" (`EN5`). Named as a conditional, not a promise — `probability`/`delayDays` are `RepaymentModel`'s own numbers, never shown as a bare score (§4 E2). */
export type TippingReceivable = {
  personId: string;
  amountPaise: number;
  probability: number;
  delayDays: number;
};

export type AffordResult = {
  verdict: AffordVerdict;
  headline: string;
  lowPointBefore: { amount: number; date: number };
  lowPointAfter: { amount: number; date: number };
  /** `UncertaintyBand.cautiousLowPoint`, before and after the purchase — the
   *  number the verdict is actually judged on, not the deterministic low point
   *  above (which is what the headline quotes, matching `safeToSpendV2`). */
  cautiousLowPointBefore: number;
  cautiousLowPointAfter: number;
  floor: number;
  reasons: AffordReason[];
  /** The largest amount of this same kind of purchase (same category,
   *  recurrence, necessity) that would still be Comfortable. */
  largestComfortableAmount: number;
  /** Set only for `when: 'can-wait'`, and only when today's verdict isn't
   *  already Comfortable. `undefined` if no day within the horizon works. */
  earliestComfortableDate?: number;
  /** Always `[]` unless `withIncome` is set — receivables aren't in the
   *  projection at all otherwise. */
  tippingReceivables: TippingReceivable[];
};
