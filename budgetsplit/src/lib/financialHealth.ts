/**
 * A simple, on-device financial-health score (0–100) from three signals the app
 * already tracks: budget adherence, savings rate, and what you owe. Pure +
 * testable. Not advice — a friendly gauge.
 */
export type HealthBand = 'great' | 'good' | 'fair' | 'poor';

export type HealthInputs = {
  /** Spent ÷ budget, as a %. null when no budget is set. */
  budgetUtilizationPct: number | null;
  /** (income − expense) ÷ income, as a %. null when no income this period. */
  savingsRatePct: number | null;
  /** Net you owe others (positive = you owe), in paise. */
  netOwed: number;
  /** Income this period, in paise — scales how much `netOwed` matters. */
  income: number;
};

export type HealthResult = { score: number; band: HealthBand; factors: { label: string; points: number; max: number }[] };

function budgetPoints(util: number | null): number {
  if (util === null) return 28; // no budget set — neutral-positive
  if (util <= 80) return 40;
  if (util <= 100) return 32;
  if (util <= 120) return 18;
  return 6;
}

function savingsPoints(rate: number | null): number {
  if (rate === null) return 12;
  if (rate >= 20) return 35;
  if (rate >= 10) return 26;
  if (rate >= 0) return 16;
  return 4;
}

function debtPoints(netOwed: number, income: number): number {
  if (netOwed <= 0) return 25; // owed nothing / others owe you
  const ratio = income > 0 ? netOwed / income : 1;
  if (ratio <= 0.1) return 18;
  if (ratio <= 0.3) return 10;
  return 4;
}

export function computeHealthScore(input: HealthInputs): HealthResult {
  const factors = [
    { label: 'Budget adherence', points: budgetPoints(input.budgetUtilizationPct), max: 40 },
    { label: 'Savings rate', points: savingsPoints(input.savingsRatePct), max: 35 },
    { label: 'What you owe', points: debtPoints(input.netOwed, input.income), max: 25 },
  ];
  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  const band: HealthBand = score >= 80 ? 'great' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor';
  return { score, band, factors };
}
