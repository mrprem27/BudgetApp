/**
 * The onboarding flow as data: which stages exist, which are questions, and where
 * each one sits.
 *
 * Pure and React-free so it can be tested. It lived in `useOnboardingForm`, which
 * imports `expo-sqlite` — so the step counter, the one piece of this most likely
 * to drift, was the piece nothing could reach.
 */

export type OnboardingStage =
  | 'hero' | 'welcome' | 'signin' | 'intent' | 'name' | 'income' | 'payday' | 'money' | 'pay'
  | 'budget' | 'permissions' | 'summary';

/**
 * The numbered flow, intent onward. `hero`, `welcome`, `signin` and `summary`
 * carry no number: the first three ask nothing a numbered question answers —
 * `welcome` is a fork (new vs. existing user), `signin` is only reached down
 * one branch of it and isn't part of the questionnaire either — and the last
 * is a result, not a question.
 *
 * `who do you split with` used to sit here (`people`), filtered out for anyone
 * who said they track only their own spending. It's gone for everyone now
 * (`SPEC-2026-09-FEEDBACK.md` §2 O6) — Friends is where that question belongs, so there is
 * nothing left in this list that varies by persona, and `stepPosition` no
 * longer takes one. If a future step needs to vary by intent, that's the
 * moment to bring a parameter back — not before.
 *
 * `pay` follows `money` deliberately: the previous screen asks where your money
 * IS, and "how do you usually pay" is the same subject one step on. It was
 * already being written at the end of onboarding — defaulted to UPI and never
 * asked — which is a preference set on the user's behalf and then attributed to
 * them on every transaction.
 *
 * `payday` sits unconditionally between `income` and `money`, always counted
 * here — but it is skipped at runtime (`Onboarding.tsx`, not this file) when no
 * take-home was given, since there is nothing left to ask "when does it land?"
 * about. That means the numbers a user actually SEES can skip one (3, then 5),
 * which is the deliberate trade: the alternative is a `total` that changes
 * under them mid-flow, which this list stayed unconditional once already
 * (`people`, removed in `SPEC-2026-09-FEEDBACK.md` §2 O6) specifically to avoid.
 */
export const NUMBERED_STEPS: OnboardingStage[] = ['intent', 'name', 'income', 'payday', 'money', 'pay', 'budget', 'permissions'];

/**
 * Where a step sits in the flow, 1-based. Known from the FIRST question — the
 * old flow showed no count until three screens had gone by, and the total
 * changed under the user when the persona shifted mid-flow.
 */
export function stepPosition(stage: OnboardingStage): { step: number; total: number } | null {
  const idx = NUMBERED_STEPS.indexOf(stage);
  if (idx < 0) return null;
  return { step: idx + 1, total: NUMBERED_STEPS.length };
}
