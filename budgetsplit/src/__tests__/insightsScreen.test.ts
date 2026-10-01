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
const SCREEN = join(__dirname, '..', '..', 'app', '(tabs)', 'insights.tsx');
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

describe('the sections are tiles that open a sheet, built from the design system (U-91)', () => {
  it('every section is an InsightTile in one grid, and none is a collapsed row', () => {
    // A column of collapsed `SectionCard`s gave nine sections the same weight and no figure.
    expect(code).toContain('<InsightGrid>');
    // Six sections with a figure. The preferences are a button of their own, Reports is the
    // header's action, and Export all data is on Profile.
    expect((code.match(/<InsightTile/g) ?? []).length).toBe(6);
    expect(code).toMatch(/<PressableScale style=\{styles\.prefs\} onPress=\{\(\) => setSheet\('prefs'\)\}/);
    expect(code).not.toMatch(/<SectionCard|styles\.secLabel|styles\.secCard|styles\.chartCard/);
  });

  it('holds one sheet at a time, each named once and opening on an explanation', () => {
    expect(code).toMatch(/useState<Sheet>\(null\)/);
    // One wrapper: the title is the tile's (`TITLE`), and the (i) line is not optional.
    expect((code.match(/<InsightSheet id="/g) ?? []).length).toBe(7);
    expect((code.match(/<SheetModal /g) ?? []).length).toBe(1);
    expect(code).toMatch(/title=\{TITLE\[id\]\}/);
    // Six tiles, and the preferences button names itself from the same list.
    expect((code.match(/title=\{TITLE\.\w+\}/g) ?? []).length).toBe(6);
    expect(code).toMatch(/\{TITLE\.prefs\}/);
  });

  it('the preferences sheet steps aside while one of its pickers is up', () => {
    // A sheet rendered inside another sheet's content is unmounted with it (`lib/sheetStage`), so
    // the pickers are siblings of this sheet and it is hidden while one is open.
    expect(code).toMatch(/<InsightSheet id="prefs" sheet=\{sheet\} hidden=\{pickerOpen\}/);
    expect(code).toMatch(/visible=\{sheet === id && !hidden\}/);
    const prefs = readFileSync(join(__dirname, '..', 'components', 'finance', 'settings', 'MoneyPreferences.tsx'), 'utf8');
    expect(prefs).toMatch(/\{wrap\(sections, showPayMethod \|\| showCadence \|\| money\.open\)\}/);
    expect(prefs).toMatch(/\{money\.sheets\}/);
  });

  it('every tile is one size, and nothing in one is cut off', () => {
    const tile = readFileSync(join(__dirname, '..', 'components', 'finance', 'insights', 'InsightTile.tsx'), 'utf8');
    // A fixed height (a minimum let a short tile sit lower than its neighbour), a title that
    // shrinks before it truncates, and two lines for the sentence under the figure.
    expect(tile).toMatch(/tile: \{[^}]*height: 148/);
    expect(tile).not.toMatch(/minHeight/);
    expect(tile).toMatch(/styles\.title\} numberOfLines=\{1\} adjustsFontSizeToFit/);
    expect(tile).toMatch(/styles\.line\} numberOfLines=\{2\}/);
    // The names are keywords short enough for half a row.
    for (const [, name] of code.matchAll(/^\s+(?:outlook|attention|forecast|shifts|whatif|savings): '([^']+)'/gm)) {
      expect({ name, fits: name.length <= 16 }).toEqual({ name, fits: true });
    }
  });

  it('the headline says its verdict once, with the working behind an (i)', () => {
    expect((code.match(/<InfoLabel/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(code).not.toMatch(/<SampleNote|styles\.pace\}>\s*You're averaging/);
  });

  it('says the month-end figure the way Home does', () => {
    // One projection, two tiles: Home said "₹X over budget", this one "projected by month-end".
    expect(code).toMatch(/forecastTile\(\{ projected, budget \}\)/);
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
    // Reading flags is fine when the value is used (the Reports row is gated on `flags.reports`).
    if (code.includes('useFeatureFlags')) expect(code).toMatch(/flags\.\w+/);
  });

  it('does not send "what to cut" to the ledger', () => {
    // The CTA pushed `/personal`, which opens on the Activity tab — the ledger,
    // not a budget. What to cut is the section immediately below it.
    expect(code).not.toContain("router.push('/personal')");
  });
});
