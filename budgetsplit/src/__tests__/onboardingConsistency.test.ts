import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Onboarding is the first screen anyone sees, and it is the one furthest from the
 * rest of the app — nine stages, no shared route chrome, its own scaffold. That
 * distance is why it quietly grew a private design system: an accent-filled
 * `TouchableOpacity` for "add person" (AGENTS §5's literal WRONG example), three
 * bare `TextInput`s while `ui/Input` existed, a hand-rolled row whose icon disc was
 * 8pt wider than `layout.dividerIndent` so its dividers started under the discs.
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
      .filter(n => !TOUCHABLE_OK[n]);
    expect(offenders).toEqual([]);
  });

  /**
   * The specific regression that produced misaligned dividers.
   *
   * `Divider indent="text"` is `layout.dividerIndent` — 64 = 16 gutter + 32 disc +
   * 16 gap. A divided row that leads with the 40pt `layout.avatarSize` disc instead
   * is 8pt out, so the hairline starts *under* the discs rather than clearing them.
   * The old people list did exactly that.
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
 * The hero's `FadeIn` delays are the one part of the animation that may be
 * changed (`LogoAssembly` itself is off limits — AGENTS §11), and they have been
 * wrong three separate times because the numbers were literals in the JSX while
 * the reasoning lived in comments that nobody updated with them. Four different
 * sets have been asserted in this codebase; only one ever ran.
 */
describe('the hero reveal is stated once', () => {
  const src = read(ONBOARDING.find(f => label(f) === 'Onboarding.tsx')!);

  it('drives every hero FadeIn from the named constant', () => {
    const delays = src.match(/<FadeIn\s+delay=\{([^}]+)\}/g) ?? [];
    expect(delays.length).toBeGreaterThanOrEqual(3);
    for (const d of delays) expect(d).toMatch(/HERO_REVEAL_MS/);
  });

  it('waits for the mark to form', () => {
    // LogoAssembly: startDelay 1850 + TENSION_S 1000 = the snap, at ~2850ms. A
    // reveal before that lands the brand name on a logo still flying — which is
    // exactly what shipped when the delays were dropped to 1400 and no comment
    // moved with them.
    const m = src.match(/const HERO_REVEAL_MS = (\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(2850);
  });

  // Deliberately NOT asserted: that the old numbers appear nowhere in the file.
  // `HERO_REVEAL_MS` quotes all three superseded sets, because "these values were
  // tried and here is why they were wrong" is the most useful thing that comment
  // can say. The invariant is that no delay is *driven* by a literal — which the
  // two tests above already hold — not that history goes unmentioned.
});
