import { plotWidth, axisSpacing, CHART_Y_AXIS_W, MIN_SPACING } from '../lib/chartAxis';
import { TXN_SOURCE, TXN_SOURCE_LABEL, TXN_SOURCE_LABEL_SHORT } from '../constants/enums';

/**
 * `spacing` is the x-label's width budget in gifted-charts, not a cosmetic gap.
 * Insights divided a hardcoded 300 by the point count, so a 31-day month gave
 * 9.68px per label and the axis read "1…", "2…", "3…".
 */
describe('plotWidth', () => {
  it('takes the card padding off both sides and the y-axis gutter off once', () => {
    expect(plotWidth(393, 16)).toBe(393 - 32 - CHART_Y_AXIS_W);
  });

  it('returns 0 for an unmeasured container so the caller can hold a fallback', () => {
    expect(plotWidth(0, 16)).toBe(0);
  });

  it('never goes negative on a container narrower than its own chrome', () => {
    expect(plotWidth(20, 16)).toBe(0);
  });
});

describe('axisSpacing', () => {
  /**
   * Measuring is correct but was never sufficient, and this is the arithmetic that
   * proves it — 31 daily labels cannot fit however accurately the container is
   * measured, which is why the series is now bucketed weekly (see `insightsData`).
   */
  it('cannot fit 31 daily labels even when measured exactly', () => {
    const daily = axisSpacing(plotWidth(393, 16), 31);
    const magic300 = Math.max(8, 300 / 31); // 9.68 — what shipped
    expect(daily).toBeGreaterThan(magic300);   // measuring does help...
    expect(daily).toBeLessThan(12);            // ...and still truncates two digits
  });

  it('fits comfortably once the series is bucketed weekly', () => {
    // 5 weekly marks for a 31-day month: 1, 8, 15, 22, 29 (+31 as the endpoint).
    const weekly = axisSpacing(plotWidth(393, 16), 6);
    expect(weekly).toBeGreaterThan(40);
  });

  it('holds up on the narrowest phone we target', () => {
    expect(axisSpacing(plotWidth(320, 16), 6)).toBeGreaterThan(30);
  });

  it('scales with the container instead of ignoring it', () => {
    const narrow = axisSpacing(plotWidth(320, 16), 31);
    const wide = axisSpacing(plotWidth(430, 16), 31);
    expect(wide).toBeGreaterThan(narrow);
  });

  it('holds the floor rather than collapsing to zero', () => {
    expect(axisSpacing(10, 365)).toBe(MIN_SPACING);
  });

  it('does not divide by zero on an empty series', () => {
    expect(Number.isFinite(axisSpacing(300, 0))).toBe(true);
  });
});

/**
 * `ReviewSourceTabs` used to build `${LABEL} ${count}` and hand it to `TabPills`,
 * which is fixed equal-flex — so the count, being last in the string, was the
 * first thing cut. The count is now a separate `badge`, and the label is short
 * enough that it is not the thing under pressure either.
 */
describe('TXN_SOURCE_LABEL_SHORT', () => {
  it('covers every source, so no tab can fall back to undefined', () => {
    for (const src of TXN_SOURCE) {
      expect(typeof TXN_SOURCE_LABEL_SHORT[src]).toBe('string');
      expect(TXN_SOURCE_LABEL_SHORT[src].length).toBeGreaterThan(0);
    }
  });

  it('fits a quarter-width pill — 4 pills on a 393pt screen is ~89pt each', () => {
    for (const src of TXN_SOURCE) {
      // ~8 chars at 13px SemiBold stays inside 89pt with room for the badge.
      expect(TXN_SOURCE_LABEL_SHORT[src].length).toBeLessThanOrEqual(8);
    }
  });

  it('is never longer than the full label it stands in for', () => {
    for (const src of TXN_SOURCE) {
      expect(TXN_SOURCE_LABEL_SHORT[src].length).toBeLessThanOrEqual(TXN_SOURCE_LABEL[src].length);
    }
  });
});
