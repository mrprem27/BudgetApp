/**
 * "Can I afford this?" — a small, on-device engine. Goes beyond raw cash by
 * subtracting the bills you've already committed to this month (upcoming
 * recurring / future-dated expenses) before deciding. Pure + testable.
 */
export type AffordVerdict = 'comfortable' | 'tight' | 'no';

export type AffordResult = {
  verdict: AffordVerdict;
  /** Cash left once this month's known upcoming bills are set aside. */
  freeToSpend: number;
  /** What remains after the prospective purchase. */
  remaining: number;
};

export function evaluateAfford(amount: number, available: number, upcomingBills: number): AffordResult {
  const freeToSpend = available - Math.max(0, upcomingBills);
  const remaining = freeToSpend - amount;
  // Comfortable keeps a ~20%-of-cash buffer; tight is still affordable but lean.
  const buffer = Math.max(available * 0.2, 0);
  const verdict: AffordVerdict = remaining < 0 ? 'no' : remaining >= buffer ? 'comfortable' : 'tight';
  return { verdict, freeToSpend, remaining };
}
