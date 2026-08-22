import { NUMBERED_STEPS, numberedSteps, stepPosition } from '../lib/onboardingSteps';

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
      const pos = stepPosition(stage, 'split');
      expect(pos).not.toBeNull();
      expect(pos!.total).toBe(NUMBERED_STEPS.length);
    }
    // `hero` and `summary` are not questions, so they carry no number.
    expect(stepPosition('hero', 'split')).toBeNull();
    expect(stepPosition('summary', 'split')).toBeNull();
  });

  it('numbers run 1..total with no gap or repeat', () => {
    const seen = NUMBERED_STEPS.map(s => stepPosition(s, 'split')!.step);
    expect(seen).toEqual(Array.from({ length: NUMBERED_STEPS.length }, (_, i) => i + 1));
  });

  it('drops “who do you split with” for someone who does not split — and renumbers', () => {
    const personal = numberedSteps('personal');
    expect(personal).not.toContain('people');
    // The count has to shrink with it, or the last screen claims a step that
    // will never come.
    expect(stepPosition('permissions', 'personal')!.total).toBe(personal.length);
    expect(stepPosition('permissions', 'personal')!.step).toBe(personal.length);
    // ...and pay survives the filter, because everyone pays for things.
    expect(personal).toContain('pay');
  });
});
