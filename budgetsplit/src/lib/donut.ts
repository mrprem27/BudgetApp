// Pure geometry for the dashboard category donut. Kept free of React Native so
// it can be unit-tested directly. The component (CategoryDonut) renders these
// wedges with react-native-svg.

export type DonutSeg = { name: string; paise: number; color: string };

export type DonutWedge = DonutSeg & {
  /** Arc start angle in degrees (0° = 12 o'clock, clockwise). */
  a0: number;
  /** Arc end angle in degrees. */
  a1: number;
  /** Midpoint angle — used to translate the wedge outward on selection. */
  mid: number;
  /** Share of `total`, rounded to a whole percent. */
  pct: number;
};

const FULL = 360;

export type DonutOptions = {
  /** Gap between wedges, in degrees. */
  gap?: number;
  /** Minimum angular span per wedge so tiny slices stay visible+tappable. */
  minSpan?: number;
};

/**
 * Turn category amounts into ring wedges.
 *
 * Edge cases handled deliberately (the dashboard donut must never silently drop
 * a category or emit NaN path coordinates):
 * - `total <= 0`, empty data, or all-zero/negative values → `[]` (caller shows
 *   an empty state).
 * - Negative paise are floored to 0 and thus excluded.
 * - A category too small to clear `minSpan` is widened to `minSpan`, stealing
 *   proportionally from larger wedges so the ring still sums to 360° and no
 *   slice disappears.
 * - If there are so many categories that even `minSpan` each won't fit, every
 *   wedge falls back to an equal span.
 * - `pct` is reported relative to the passed `total` (what the centre shows).
 */
export function computeDonutWedges(
  data: DonutSeg[],
  total: number,
  opts: DonutOptions = {},
): DonutWedge[] {
  const gap = opts.gap ?? 2.2;
  const minSpan = opts.minSpan ?? 10;
  if (!(total > 0) || !data.length) return [];

  const items = data
    .map(d => ({ seg: d, value: Math.max(0, d.paise) }))
    .filter(d => d.value > 0);
  if (!items.length) return [];

  const sumValues = items.reduce((s, d) => s + d.value, 0);
  if (!(sumValues > 0)) return [];

  const n = items.length;
  let spans = items.map(d => (d.value / sumValues) * FULL);

  // Enforce a minimum span, stealing proportionally from the larger wedges.
  if (n * minSpan <= FULL) {
    let deficit = 0;
    let surplus = 0;
    for (const v of spans) {
      if (v < minSpan) deficit += minSpan - v;
      else surplus += v - minSpan;
    }
    if (deficit > 0 && surplus >= deficit) {
      const scale = (surplus - deficit) / surplus;
      spans = spans.map(v => (v < minSpan ? minSpan : minSpan + (v - minSpan) * scale));
    } else if (deficit > 0) {
      // Can't honour the floor without going negative — distribute equally.
      spans = spans.map(() => FULL / n);
    }
  } else {
    spans = spans.map(() => FULL / n);
  }

  const out: DonutWedge[] = [];
  let cursor = 0;
  for (let i = 0; i < items.length; i++) {
    const span = spans[i];
    // Inset each side by half the gap, but never consume more than half the
    // wedge — guarantees a1 > a0 for every slice, however thin.
    const inset = Math.min(gap / 2, span / 4);
    const a0 = cursor + inset;
    const a1 = cursor + span - inset;
    out.push({
      ...items[i].seg,
      a0,
      a1,
      mid: (a0 + a1) / 2,
      pct: Math.round((items[i].value / total) * 100),
    });
    cursor += span;
  }
  return out;
}
