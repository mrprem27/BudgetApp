import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Insights had seven sections at identical weight, all always open, and its only
 * headline rendered **when you were overspending** — so a good month opened on a
 * chart with no answer to "how am I doing". A screen whose headline exists only
 * when things are bad has no headline; it has an alarm.
 *
 * Two of those sections were built from the same over-budget categories, so every
 * overrun printed twice in two shapes.
 *
 * Rendering isn't reachable here (node environment, no React renderer), so this
 * reads the real source — the same mechanism as `screenLoading` and `touchTargets`.
 */
const SCREEN = join(__dirname, '..', '..', 'app', 'insights.tsx');
const src = readFileSync(SCREEN, 'utf8');
/** Comments stripped: prose describing the old screen is not the old screen. */
const code = src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the headline is unconditional', () => {
  it('is not gated on overspending', () => {
    // `{overspend && (` around the hero is the exact defect.
    expect(code).not.toMatch(/\{\s*overspend\s*&&/);
  });

  it('says something useful when there is no budget at all', () => {
    // Otherwise the card is a bare number with nothing to measure it against.
    expect(code).toMatch(/hasBudget \?/);
    expect(code).toContain('Set a budget');
  });

  it('states both outcomes, not just the bad one', () => {
    expect(src).toContain('over by month-end');
    expect(src).toContain('to spare');
  });
});

describe('the progress bar is not inverted', () => {
  it('uses the shared BudgetBar', () => {
    // The bespoke bar filled `budget / projected` in accent, so the FILLED part
    // was your budget and the empty part was the overspend — backwards from
    // `BudgetBar` and Home's `ForecastCard`, where the fill is spend.
    expect(code).toContain('<BudgetBar');
    expect(code).not.toMatch(/velocityBarFill|velocityBarTrack|velocityLegend/);
  });

  it('measures spend against budget, not budget against a projection', () => {
    expect(code).toMatch(/pctUsed = hasBudget \? Math\.round\(\(monthSpend \/ budget\)/);
  });
});

describe('nothing is said twice', () => {
  it('drops the recommendations that repeat a section or the headline', () => {
    expect(code).toMatch(/isDuplicateRec/);
    for (const id of ["'over-'", "'projected'", "'ontrack'"]) expect(code).toContain(id);
  });

  it('filters on the rule id, not on a parsed key', () => {
    // `key` is `${groupId}:${ruleId}`, and splitting it on ':' breaks on a
    // category name containing one. The id is carried through instead.
    expect(code).toContain('isDuplicateRec(r.id)');
    expect(code).not.toMatch(/key\.split/);
  });

  it('has one section where there were two', () => {
    expect(code).toContain('Needs attention');
    expect(code).not.toContain('DRIVING OVERSPEND');
    expect(code).not.toContain('RECOMMENDATIONS');
  });
});

describe('the sections are collapsible and built from the design system', () => {
  it('every section is a SectionCard', () => {
    // `SectionCard` already animates with `Collapse`, honours Reduce Motion and
    // sets accessibilityState={{ expanded }} — none of which a hand-rolled
    // uppercase label above a bare View does.
    expect((code.match(/<SectionCard/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(code).not.toMatch(/styles\.secLabel|styles\.secCard|styles\.chartCard/);
  });

  it('opens exactly one section by default', () => {
    expect(code).toMatch(/DEFAULT_OPEN = 'attention'/);
    expect(code).toMatch(/useState<Set<string>>\(new Set\(\[DEFAULT_OPEN\]\)\)/);
  });

  it('uses the shared primitives rather than hand-rolled ones', () => {
    for (const primitive of ['IconCircle', 'Chip', 'Divider', 'Card', 'ListRow', 'Badge']) {
      expect({ primitive, used: code.includes(`<${primitive}`) }).toEqual({ primitive, used: true });
    }
    // The hand-rolled versions: 34px radius-9 tiles, a bespoke pill, a bespoke button.
    expect(code).not.toMatch(/driverIcon|shiftEmoji|whatIfChip|velocityCta|recPill/);
  });
});

describe('no dead wiring', () => {
  it('does not read a feature flag it never uses', () => {
    // `savingsInsights` stopped being a flag key (featureFlags.ts records the
    // removal); the destructure was left behind, reading a value and discarding it.
    expect(code).not.toContain('useFeatureFlags');
  });

  it('does not send "what to cut" to the ledger', () => {
    // The CTA pushed `/personal`, which opens on the Activity tab — the ledger,
    // not a budget. What to cut is the section immediately below it.
    expect(code).not.toContain("router.push('/personal')");
  });
});
