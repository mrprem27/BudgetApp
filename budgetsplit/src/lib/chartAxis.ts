/**
 * X-axis spacing for `react-native-gifted-charts` line charts.
 *
 * The library renders every x-label inside a `View` exactly `spacing` wide at
 * `numberOfLines={1}`, so `spacing` is not a cosmetic gap — it *is* the label's
 * width budget. Insights set it to `Math.max(8, 300 / len)`, where `300` was a
 * magic constant the chart never measured: a 31-day month gave 9.68px per label,
 * one digit fitted and two did not, and the axis read `"1…" "2…" "3…"`.
 *
 * Lives here rather than inline in the screen so it can be tested without
 * rendering — the suite never mounts components.
 */

/** Width gifted-charts reserves for y-axis labels; not part of the plot area. */
export const CHART_Y_AXIS_W = 36;

/** Floor below which a label cannot render at all; keeps the chart drawable. */
export const MIN_SPACING = 8;

/**
 * Usable plot width inside a measured container.
 *
 * `containerW` is the card's own `onLayout` width, so its horizontal padding and
 * the y-axis gutter both have to come off before the points are divided into it.
 * Returns 0 for an unmeasured container so the caller can hold its fallback.
 */
export function plotWidth(containerW: number, horizontalPadding: number): number {
  if (containerW <= 0) return 0;
  return Math.max(0, containerW - horizontalPadding * 2 - CHART_Y_AXIS_W);
}

/**
 * Per-point spacing for `pointCount` points across `plotW`.
 *
 * Never returns less than `MIN_SPACING`: at that floor labels genuinely cannot
 * fit, which is a signal to label fewer days (Insights already labels only day 1
 * and multiples of 5) rather than to squeeze further.
 */
export function axisSpacing(plotW: number, pointCount: number): number {
  return Math.max(MIN_SPACING, plotW / Math.max(pointCount, 1));
}
