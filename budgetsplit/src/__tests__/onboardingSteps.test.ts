import { NUMBERED_STEPS, stepPosition } from '../lib/onboardingSteps';

/**
 * The step counter has to agree with the flow it is counting.
 *
 * "Step 4 of 7" is read as a promise about how much is left, and it is derived
 * from one list — so a stage added to the machine but not to that list silently
 * makes the count wrong for every screen after it. Adding `pay` was exactly that
 * kind of change.
 */
describe('the numbered flow', () => {
  it('asks how you pay, right after asking where your money is', () => {
    // Not an arbitrary position: the previous screen asks where the money IS,
    // and this is the same subject one step on.
    const i = NUMBERED_STEPS.indexOf('pay');
    expect(i).toBeGreaterThan(-1);
    expect(NUMBERED_STEPS[i - 1]).toBe('money');
  });

  it('counts every stage it shows, and no stage it does not', () => {
    for (const stage of NUMBERED_STEPS) {
      const pos = stepPosition(stage);
      expect(pos).not.toBeNull();
      expect(pos!.total).toBe(NUMBERED_STEPS.length);
    }
    // `hero`, `welcome`, `signin` and `summary` are not questions, so they
    // carry no number.
    expect(stepPosition('hero')).toBeNull();
    expect(stepPosition('welcome')).toBeNull();
    expect(stepPosition('signin')).toBeNull();
    expect(stepPosition('summary')).toBeNull();
  });

  it('numbers run 1..total with no gap or repeat', () => {
    const seen = NUMBERED_STEPS.map(s => stepPosition(s)!.step);
    expect(seen).toEqual(Array.from({ length: NUMBERED_STEPS.length }, (_, i) => i + 1));
  });

  it('never asks who you split with — that question moved to Friends', () => {
    // SPEC-2026-09-FEEDBACK.md §2 O6: the people step is gone for every persona, not filtered
    // per-persona. Friends is where "who do you split with" is answered now.
    expect(NUMBERED_STEPS).not.toContain('people');
    // ...and pay is still here, because everyone pays for things.
    expect(NUMBERED_STEPS).toContain('pay');
  });

  it('asks when the next payment lands right after asking how much', () => {
    // SPEC-2026-09-FEEDBACK.md §2 O4 — the two questions about income sit next to each other.
    const i = NUMBERED_STEPS.indexOf('payday');
    expect(i).toBeGreaterThan(-1);
    expect(NUMBERED_STEPS[i - 1]).toBe('income');
  });
});
