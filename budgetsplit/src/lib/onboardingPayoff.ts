import { formatRupees } from './money';

/**
 * How the payoff reads: good news, a caution, or a plain statement. A semantic tone
 * rather than a colour, so this file stays free of theme (and therefore React Native)
 * imports and can be unit-tested — the jest setup transforms `src/lib` only.
 */
export type PayoffTone = 'good' | 'warn' | 'neutral';

export type Payoff = {
  icon: 'trending-up' | 'target' | 'arrow-down-circle';
  tone: PayoffTone;
  /** The one figure, in integer paise. */
  amountPaise: number;
  headline: string;
  body: string;
};

/**
 * What to say back to the user, given what they actually filled in during onboarding.
 *
 * Both income and budget are skippable, so every combination below is reachable in
 * practice. Returns `null` when there's nothing to reflect — with no numbers at all a
 * payoff screen would be an empty congratulation, so the stage is skipped rather than
 * shown blank.
 *
 * The predecessor of this logic (the budget step's "that's X% of your take-home") shipped
 * a bug where a zero income rendered "that's — of your take-home". Guarding *both*
 * operands, and never printing a figure derived from a missing one, is the whole point.
 *
 * Inputs are whole rupees (that's what the onboarding fields collect); the returned
 * amount is integer paise, per the money rule in AGENTS.md.
 */
export function payoffFor(incomeRupees: number, budgetRupees: number): Payoff | null {
  // Defensive clamp: the fields strip non-digits, but a negative headline figure would
  // be a visible failure rather than a silent one.
  const income = Math.max(0, Math.round(incomeRupees)) * 100;
  const budget = Math.max(0, Math.round(budgetRupees)) * 100;

  if (income > 0 && budget > 0) {
    if (income > budget) {
      return {
        icon: 'trending-up',
        tone: 'good',
        amountPaise: income - budget,
        headline: 'a month left over',
        body: `After the ${formatRupees(budget)} you've capped spending at. That's what can go towards savings and goals.`,
      };
    }
    // A budget at or above take-home isn't a mistake worth blocking — plenty of people
    // genuinely spend to the rupee — but it must not be reported as headroom.
    return {
      icon: 'arrow-down-circle',
      tone: 'warn',
      amountPaise: budget,
      headline: 'is your monthly cap',
      body: income === budget
        ? "That's exactly your take-home, so there's nothing spare. Lower the cap any time to start building a buffer."
        : `That's above your ${formatRupees(income)} take-home, so you'd be dipping into savings. Worth a second look.`,
    };
  }

  if (budget > 0) {
    return {
      icon: 'target',
      tone: 'neutral',
      amountPaise: budget,
      headline: 'a month is your ceiling',
      body: 'You skipped income, which is fine — the budget alone is enough to track against. Add income later in Settings and you\'ll get headroom figures too.',
    };
  }

  if (income > 0) {
    return {
      icon: 'trending-up',
      tone: 'neutral',
      amountPaise: income,
      headline: 'a month coming in',
      body: 'No budget yet, so nothing is capped. You can set one per category, or one overall, whenever you like.',
    };
  }

  return null;
}
