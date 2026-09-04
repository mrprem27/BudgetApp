import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Onboarding is the first screen anyone sees, and it is the one furthest from the
 * rest of the app — ten stages, no shared route chrome, its own scaffold. That
 * distance is why it quietly grew a private design system: an accent-filled
 * `TouchableOpacity` for "add person" (the shape AGENTS §5 prints as its WRONG
 * example), three bare `TextInput`s while `ui/Input` existed, and a hand-rolled
 * person row whose 40pt disc did not match the 32pt one `layout.dividerIndent`
 * assumes — so its hairline stopped 8pt short of the label it should have met.
 *
 * None of that is visible from a screenshot and none of it is caught by tsc, so it
 * gets a source guard — the same shape as `emptyState.test.ts`, `payMethod.test.ts`
 * and `trustCopy.test.ts`. The rule those three share: **the collapse is worth less
 * than the mechanism that keeps it collapsed.**
 */

const ROOT = join(__dirname, '..', '..');
const ONBOARDING = [
  join(ROOT, 'src', 'components', 'system', 'Onboarding.tsx'),
  ...(() => {
    const dir = join(ROOT, 'src', 'components', 'system', 'onboarding');
    return readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => join(dir, f));
  })(),
];

const label = (f: string) => f.split('/').slice(-1)[0];
const read = (f: string) => readFileSync(f, 'utf8');

it('finds the onboarding source to scan', () => {
  // A guard that silently scans nothing passes forever. This is the canary.
  expect(ONBOARDING.length).toBeGreaterThanOrEqual(6);
  expect(ONBOARDING.map(label)).toContain('Onboarding.tsx');
});

describe('onboarding uses the design system, not a copy of it', () => {
  /** Allowed a bare `TextInput`, with the reason it is not a missing `Input`. */
  const RAW_INPUT_OK: Record<string, string> = {
    // A large number over a rule, not a bordered box: `Input` is a 48pt field with
    // a border, and the whole argument in this file is that a box reads as
    // paperwork where these steps are stating a value. A legitimate third weight.
    'StepAmountField.tsx': 'the hero rupee figure is deliberately not a boxed field',
    // AGENTS §4 forbids a bordered field inside a card row outright, and `Input`
    // is exactly that. The row itself is a `ListRow`; only its value slot is raw.
    'MoneyRow.tsx': 'an inline amount inside a card row must not have its own box',
  };

  it('has no bare TextInput where ui/Input belongs', () => {
    const offenders = ONBOARDING
      .filter(f => /<TextInput\b/.test(read(f)))
      .map(label)
      .filter(n => !RAW_INPUT_OK[n]);
    expect(offenders).toEqual([]);
  });

  /**
   * `TouchableOpacity` is not banned — it is the right primitive for a bare icon
   * button. What is banned is building something the design system already owns:
   * a CTA (`PrimaryButton` / `SecondaryButton`, §5) or a row (`ListRow`, §4).
   */
  const TOUCHABLE_OK: Record<string, string> = {
    'StepBack.tsx': 'a bare back chevron; ScreenHeader is not available off-route',
    'StepFooter.tsx': 'the quiet skip is deliberately lighter than a ghost button',
  };

  it('hand-rolls no button or row out of TouchableOpacity', () => {
    const offenders = ONBOARDING
      .filter(f => /<TouchableOpacity\b/.test(read(f)))
      .map(label)
      .filter(n => !TOUCHABLE_OK[n] && n !== 'Onboarding.tsx');
    expect(offenders).toEqual([]);
  });

  /**
   * `Onboarding.tsx` is exempted above **by shape, not by name**, because a blanket
   * pass on the biggest file in the flow would gut the rule it is enforcing.
   *
   * The one control it is allowed is an icon-only button: the remove ✕ on a person
   * row. That has to be its own target — the press was briefly on the `ListRow`
   * itself, so tapping anywhere on a 64pt row showing a name over an email deleted
   * the contact with no confirm and no undo. §6 blesses an icon button with
   * `hitSlop`; §5 is about hand-rolling a CTA, which needs a label.
   *
   * So: a `TouchableOpacity` here may contain an icon and must not contain text.
   * The moment one wraps a `<Text>`, it is a button the design system already owns.
   */
  it('allows onboarding only icon-only TouchableOpacitys', () => {
    const src = read(ONBOARDING.find(f => label(f) === 'Onboarding.tsx')!);
    const blocks = src.match(/<TouchableOpacity[\s\S]*?<\/TouchableOpacity>/g) ?? [];
    for (const b of blocks) {
      expect({ hasIcon: /<Feather\b/.test(b), hasText: /<Text\b/.test(b) })
        .toEqual({ hasIcon: true, hasText: false });
    }
    // And it stays a handful, not a habit.
    expect(blocks.length).toBeLessThanOrEqual(2);
  });

  /**
   * The specific regression that produced misaligned dividers.
   *
   * `Divider indent="text"` is `layout.dividerIndent` — 64 = 16 gutter + 32 disc +
   * 16 gap. A divided row that leads with the 40pt `layout.avatarSize` disc instead
   * pushes its label to 72 while the hairline stays at 64, so the divider stops 8pt
   * short of the text it is supposed to line up with. The old people list did
   * exactly that. (`MoneyRow` did not — its disc was always `layout.iconCircle`.)
   *
   * Hand-rolled rows are already gone (the guard above), so the only remaining way
   * in is a `ListRow`'s own `leading` slot — which is the caller's node and the
   * caller's size. A 40pt disc elsewhere is fine and stays fine: the permissions
   * step's `OptionRow`s are separate bordered cards with no divider between them.
   */
  it('gives every ListRow leading node the row-sized disc', () => {
    const offenders: string[] = [];
    for (const f of ONBOARDING) {
      for (const row of read(f).match(/<ListRow[\s\S]*?\/>/g) ?? []) {
        if (/size=\{layout\.avatarSize\}/.test(row)) offenders.push(label(f));
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * `OV-29`. The money step and the pay step rendered `<PayMethodSelector …/>` with
 * identical props, one screen apart, under the identical heading — for a whole
 * commit after the *first* collapse of this duplication, which had deleted a
 * hand-rolled list and left two identical call sites behind.
 *
 * That is the failure mode worth guarding: collapsing N implementations into one
 * component does nothing about calling that component twice.
 */
describe('each question is asked exactly once', () => {
  const src = read(ONBOARDING.find(f => label(f) === 'Onboarding.tsx')!);

  it('renders the pay-method picker on one step only', () => {
    expect(src.match(/<PayMethodSelector\b/g) ?? []).toHaveLength(1);
  });

  it('asks "how do you usually pay" once', () => {
    expect(src.match(/How do you usually pay\?/g) ?? []).toHaveLength(1);
  });
});

/**
 * A step must not throw away something the user typed into it.
 *
 * The people step has a draft (name + email) that only becomes a contact when
 * `addPerson` runs. Someone who types a name and taps **Continue** plainly means
 * "and this one" — but `onPrimary` advanced the stage and the draft went with it,
 * silently, on a button that was simultaneously counting the people who had made
 * it ("Continue with 2"). Nothing rendered, so nothing could catch it.
 *
 * Source-scanned because the alternative is rendering a component, which this
 * suite never does. It asserts the wiring, not the behaviour — but the wiring is
 * where it went wrong.
 */
describe('no step discards a draft on the way out', () => {
  const src = read(ONBOARDING.find(f => label(f) === 'Onboarding.tsx')!);

  it('flushes the person draft before leaving the people step', () => {
    const step = src.slice(src.indexOf("stage === 'people'"), src.indexOf("stage === 'permissions'"));
    const onPrimary = /onPrimary=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/.exec(step);
    expect(onPrimary).toBeTruthy();
    expect(onPrimary![1]).toContain('addPerson');
  });

  it('still lets the draft be added by return, not only by the button', () => {
    // `returnKeyType="next"` with no `onSubmitEditing` shipped once: a key that
    // named an action, did nothing, and could not move focus either — `ui/Input`
    // exposes no ref.
    const step = src.slice(src.indexOf("stage === 'people'"), src.indexOf("stage === 'permissions'"));
    expect(step.match(/onSubmitEditing=\{addPerson\}/g) ?? []).toHaveLength(2);
    expect(step).not.toContain('returnKeyType="next"');
  });
});

/**
 * The hero's `FadeIn` delays are the one part of the animation that may be changed
 * (`LogoAssembly` itself is off limits — AGENTS §11), and they have been wrong
 * repeatedly because the numbers were literals in the JSX while the reasoning lived
 * in comments nobody updated with them. **Six sets have shipped**, and the prose
 * beside them has been out of date for most of that.
 *
 * So this does not check a number against another number. It reads the animation's
 * own constants out of `LogoAssembly.tsx` and checks the reveal against the time
 * the mark is actually finished — which is the thing the comment was getting wrong.
 */
describe('the hero reveal is stated once', () => {
  const src = read(ONBOARDING.find(f => label(f) === 'Onboarding.tsx')!);

  it('drives every hero FadeIn from the named constant', () => {
    const delays = src.match(/<FadeIn\s+delay=\{([^}]+)\}/g) ?? [];
    expect(delays.length).toBeGreaterThanOrEqual(3);
    for (const d of delays) expect(d).toMatch(/HERO_REVEAL_MS/);
  });

  it('waits for the mark to actually finish, per LogoAssembly itself', () => {
    // Derived, not copied. `startDelay` is when the physics loop begins, TENSION_S
    // is when the wedges START snapping to centre, and the loop runs on to
    // TENSION_S + SNAP_S before hard-setting the final positions. The mark is
    // formed at the END of that, and reading the snap as the finish is precisely
    // how a reveal 350ms too early got written down as correct.
    const logo = readFileSync(join(ROOT, 'src', 'components', 'system', 'LogoAssembly.tsx'), 'utf8');
    const num = (re: RegExp) => {
      const m = logo.match(re);
      expect(m).toBeTruthy();
      return Number(m![1]);
    };
    const formedAt =
      num(/const startDelay = (\d+)/) +
      num(/const TENSION_S = ([\d.]+)/) * 1000 +
      num(/const SNAP_S = ([\d.]+)/) * 1000;

    const m = src.match(/const HERO_REVEAL_MS = (\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(formedAt);
  });

  // Deliberately NOT asserted: that the superseded numbers appear nowhere in the
  // file. `HERO_REVEAL_MS` lists them on purpose — "these were tried, and here is
  // why each was wrong" is the most useful thing that comment can say. The
  // invariant is that no delay is *driven* by a literal, which the tests above
  // hold, not that the history goes unmentioned.
});
