import type { OnboardingIntent } from './personaDefaults';

/**
 * The onboarding flow as data: which stages exist, which are questions, and where
 * each one sits.
 *
 * Pure and React-free so it can be tested. It lived in `useOnboardingForm`, which
 * imports `expo-sqlite` — so the step counter, the one piece of this most likely
 * to drift, was the piece nothing could reach.
 */

export type OnboardingStage =
  | 'hero' | 'intent' | 'name' | 'income' | 'money' | 'pay' | 'budget'
  | 'people' | 'permissions' | 'summary';

/**
 * The numbered flow, intent onward. `summary` is a result, not a question.
 *
 * `pay` follows `money` deliberately: the previous screen asks where your money
 * IS, and "how do you usually pay" is the same subject one step on. It was
 * already being written at the end of onboarding — defaulted to UPI and never
 * asked — which is a preference set on the user's behalf and then attributed to
 * them on every transaction.
 */
export const NUMBERED_STEPS: OnboardingStage[] = ['intent', 'name', 'income', 'money', 'pay', 'budget', 'people', 'permissions'];

/**
 * Someone who told us they only track their own spending is never asked who they
 * split with — the step can only produce contacts they'd never use, and the dots
 * shouldn't count a screen they'll never see.
 */
export function numberedSteps(intent: OnboardingIntent): OnboardingStage[] {
  return intent === 'personal' ? NUMBERED_STEPS.filter(s => s !== 'people') : NUMBERED_STEPS;
}

/**
 * Where a step sits in the flow, 1-based. Known from the FIRST question — the
 * old flow showed no count until three screens had gone by, and the total
 * changed under the user when the persona shifted mid-flow.
 */
export function stepPosition(stage: OnboardingStage, intent: OnboardingIntent): { step: number; total: number } | null {
  const steps = numberedSteps(intent);
  const idx = steps.indexOf(stage);
  if (idx < 0) return null;
  return { step: idx + 1, total: steps.length };
}

