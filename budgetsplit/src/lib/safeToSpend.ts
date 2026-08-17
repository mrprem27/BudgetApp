/**
 * Safe-to-Spend — the headline number: what you can spend before month-end
 * without touching bills, goals, or money that isn't yours.
 *
 *   StS = liquid cash
 *       − committed bills still due this cycle (my share)
 *       − goal contributions still due this cycle (unfunded portion)
 *       − what I owe people, net of settlements
 *
 * The formula is Simple Bank's proven Safe-to-Spend, plus the settlement-
 * exposure term a split app can and should subtract (money in my account that
 * is really someone else's). Each input has exactly one source:
 *
 * - `available`     — `getCashPosition` (already net of money set aside in
 *                     goals, so funded contributions are not re-subtracted).
 * - `upcomingBills` — `expandUpcoming` my-share occurrences + logged future
 *                     one-offs, the same basis Afford's committed-bills uses.
 * - `goalRemaining` — monthly goal commitment minus what's already been
 *                     allocated this month, floored at zero per goal.
 * - `netIOwe`       — `getMyExposure().owe` (owed-to-me is deliberately NOT
 *                     added back: it isn't liquid until it's settled).
 *
 * Horizon is month-end. Pure; assembly lives in `db/queries/spendPower.ts`.
 * The amount may be negative — that is the honest answer, not an error.
 */

export type SafeToSpendParts = {
  /** Liquid cash right now (paise). */
  available: number;
  /** My share of bills still due before the horizon (paise). */
  upcomingBills: number;
  /** Goal contributions still due this cycle, unfunded portion (paise). */
  goalRemaining: number;
  /** What I owe others, net of settlements (paise, ≥ 0). */
  netIOwe: number;
};

export type SafeToSpend = SafeToSpendParts & {
  /** The headline figure. Negative means already over-committed. */
  amount: number;
};

export function computeSafeToSpend(parts: SafeToSpendParts): SafeToSpend {
  const clean = (n: number) => (Number.isFinite(n) ? n : 0);
  const available = clean(parts.available);
  const upcomingBills = Math.max(0, clean(parts.upcomingBills));
  const goalRemaining = Math.max(0, clean(parts.goalRemaining));
  const netIOwe = Math.max(0, clean(parts.netIOwe));
  return {
    available, upcomingBills, goalRemaining, netIOwe,
    amount: available - upcomingBills - goalRemaining - netIOwe,
  };
}

/**
 * The unfunded remainder of this cycle's goal commitments. Funded allocations
 * have already left `available` (cash math subtracts goal balances), so only
 * the not-yet-funded remainder is still a claim on today's cash.
 */
export function goalRemainingThisCycle(
  goals: Array<{ id: string; monthlyRate: number; saved: number; target: number }>,
  allocatedThisMonth: Record<string, number>,
): number {
  let sum = 0;
  for (const g of goals) {
    if (g.monthlyRate <= 0) continue;
    if (g.saved >= g.target) continue; // completed goals claim nothing
    sum += Math.max(0, g.monthlyRate - (allocatedThisMonth[g.id] ?? 0));
  }
  return sum;
}
