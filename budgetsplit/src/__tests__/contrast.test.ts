import { colors } from '../theme';

/**
 * WCAG AA contrast for the text tokens, computed from the palette itself.
 *
 * `V2-09` / `N1`: `textMuted` sat at **2.98:1** on `bgCard` — the app-wide caption,
 * placeholder and disabled-label token, so the failure was everywhere at once. It was
 * deferred once as "a design decision, not a cleanup", which was true and also why it
 * needed a decision rather than another deferral.
 *
 * This test is the decision, made permanent: change a text or surface token and the
 * suite says whether it still passes, instead of someone re-measuring by eye.
 */

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const [a, b] = [relativeLuminance(fg), relativeLuminance(bg)];
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const AA_SMALL = 4.5;

/**
 * The surfaces text is actually rendered on. `bgMuted` and `bgElevated` are absent by
 * design and by inspection: they back pills, chips, progress tracks and ring strokes,
 * and the text that sits on them uses `textSecondary`, which is checked below.
 */
const TEXT_SURFACES: [string, string][] = [
  ['bg', colors.bg],
  ['bgCard', colors.bgCard],
  ['bgInput', colors.bgInput],
];

describe('contrastRatio — the maths itself', () => {
  it('is 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#13201F', '#13201F')).toBeCloseTo(1, 5);
  });

  it('is symmetric — order of arguments cannot change the answer', () => {
    expect(contrastRatio(colors.textMuted, colors.bgCard))
      .toBeCloseTo(contrastRatio(colors.bgCard, colors.textMuted), 6);
  });
});

describe('text tokens clear WCAG AA on every surface they render on', () => {
  for (const [name, bg] of TEXT_SURFACES) {
    it(`textMuted on ${name}`, () => {
      expect(contrastRatio(colors.textMuted, bg)).toBeGreaterThanOrEqual(AA_SMALL);
    });

    it(`textSecondary on ${name}`, () => {
      expect(contrastRatio(colors.textSecondary, bg)).toBeGreaterThanOrEqual(AA_SMALL);
    });

    it(`textPrimary on ${name}`, () => {
      expect(contrastRatio(colors.textPrimary, bg)).toBeGreaterThanOrEqual(AA_SMALL);
    });
  }
});

describe('the text hierarchy survives the fix', () => {
  // The cheap way to pass the tests above is to lighten textMuted until it *is*
  // textSecondary. That trades an accessibility failure for a legibility one — three
  // tiers of text that all look the same — so the distance is asserted too.
  it('keeps muted visibly dimmer than secondary, which stays dimmer than primary', () => {
    const [muted, secondary, primary] = [colors.textMuted, colors.textSecondary, colors.textPrimary]
      .map(c => contrastRatio(c, colors.bgCard));
    expect(muted).toBeLessThan(secondary);
    expect(secondary).toBeLessThan(primary);
  });

  it('keeps a perceptible gap between muted and secondary', () => {
    const gap = contrastRatio(colors.textSecondary, colors.bgCard) - contrastRatio(colors.textMuted, colors.bgCard);
    expect(gap).toBeGreaterThan(0.75);
  });
});
