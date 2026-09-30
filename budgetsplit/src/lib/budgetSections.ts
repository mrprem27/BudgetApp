import type { BudgetCadence } from '../constants/enums';

type Line = { cadence: BudgetCadence; spent: number; allocated: number; health: 'green' | 'amber' | 'red' | 'none' };

/** What a collapsed budget section shows in its header (`U-55`). All paise. */
export type SectionSummary = {
  /** The cadence the figures are in — monthly whenever the section has a monthly line. */
  cadence: BudgetCadence;
  spent: number;
  allocated: number;
  pct: number | null;
  health: 'green' | 'amber' | 'red' | 'none';
  /** Lines on another cadence, left out of the sum rather than mixed into it. */
  otherCount: number;
  /** Lines over their own limit — named even when the section's sum is under. */
  overCount: number;
};

/**
 * One header's worth of a budget section, so a collapsed section still answers "how is this
 * going". Pure.
 *
 * Lines are summed only within one cadence: a yearly trip budget and a monthly groceries budget
 * are measured over different windows, and adding them would produce a figure that is neither.
 * Monthly wins when present (it is the period the overview reads in); the rest are counted, not
 * summed. `overCount` stops a section whose total is fine from hiding the one line that is not.
 */
export function sectionSummary(lines: readonly Line[]): SectionSummary {
  const cadence: BudgetCadence = lines.some(l => l.cadence === 'monthly') ? 'monthly' : (lines[0]?.cadence ?? 'monthly');
  let spent = 0, allocated = 0, otherCount = 0, overCount = 0;
  for (const l of lines) {
    if (l.health === 'red') overCount++;
    if (l.cadence !== cadence) { otherCount++; continue; }
    spent += l.spent;
    allocated += l.allocated;
  }
  const pct = allocated > 0 ? Math.round((spent / allocated) * 100) : null;
  const health = pct === null ? 'none' : pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'green';
  return { cadence, spent, allocated, pct, health, otherCount, overCount };
}
