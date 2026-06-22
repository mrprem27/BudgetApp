import { computeDonutWedges, type DonutSeg } from '../lib/donut';

const seg = (name: string, paise: number, color = '#fff'): DonutSeg => ({ name, paise, color });

// Angular span a wedge actually occupies including its share of the gaps.
// Consecutive wedges are laid out head-to-tail, so the slot width is the
// distance between successive start angles (or to 360 for the last).
function slots(wedges: { a0: number; a1: number }[]): number[] {
  return wedges.map((w, i) => {
    const nextStart = i + 1 < wedges.length ? wedges[i + 1].a0 : 360 + wedges[0].a0;
    return nextStart - w.a0;
  });
}

describe('computeDonutWedges', () => {
  it('returns nothing for empty data', () => {
    expect(computeDonutWedges([], 1000)).toEqual([]);
  });

  it('returns nothing when total is zero or negative', () => {
    expect(computeDonutWedges([seg('Food', 500)], 0)).toEqual([]);
    expect(computeDonutWedges([seg('Food', 500)], -100)).toEqual([]);
  });

  it('returns nothing when every value is zero or negative', () => {
    expect(computeDonutWedges([seg('A', 0), seg('B', -50)], 1000)).toEqual([]);
  });

  it('drops negative/zero categories but keeps positive ones', () => {
    const w = computeDonutWedges([seg('A', 1000), seg('B', -50), seg('C', 0)], 1000);
    expect(w.map(s => s.name)).toEqual(['A']);
  });

  it('never emits NaN angles', () => {
    const w = computeDonutWedges([seg('A', 333), seg('B', 666), seg('C', 1)], 1000);
    for (const s of w) {
      expect(Number.isFinite(s.a0)).toBe(true);
      expect(Number.isFinite(s.a1)).toBe(true);
      expect(Number.isFinite(s.mid)).toBe(true);
      expect(s.a1).toBeGreaterThan(s.a0); // every wedge is drawable
    }
  });

  it('keeps a tiny category visible instead of dropping it', () => {
    // 0.1% slice would vanish under naive (frac*360 - gap) math.
    const w = computeDonutWedges([seg('Big', 99900), seg('Tiny', 100)], 100000, { minSpan: 10 });
    const tiny = w.find(s => s.name === 'Tiny');
    expect(tiny).toBeDefined();
    expect(tiny!.a1).toBeGreaterThan(tiny!.a0);
    // Its slot is widened to at least the minimum span.
    const tinyIdx = w.findIndex(s => s.name === 'Tiny');
    expect(slots(w)[tinyIdx]).toBeGreaterThanOrEqual(10 - 1e-6);
  });

  it('still sums slots to a full circle after widening', () => {
    const w = computeDonutWedges([seg('A', 9800), seg('B', 100), seg('C', 100)], 10000, { minSpan: 30 });
    const total = slots(w).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(360, 4);
  });

  it('falls back to equal slots when the floor cannot fit', () => {
    // 40 categories × 10° = 400° > 360° → equal spans of 9° each.
    const data = Array.from({ length: 40 }, (_, i) => seg(`c${i}`, i === 0 ? 10000 : 1));
    const w = computeDonutWedges(data, data.reduce((s, d) => s + d.paise, 0), { minSpan: 10 });
    expect(w).toHaveLength(40);
    for (const s of w) expect(s.a1).toBeGreaterThan(s.a0);
    const total = slots(w).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(360, 4);
  });

  it('renders a single category as a near-full ring', () => {
    const w = computeDonutWedges([seg('Only', 5000)], 5000);
    expect(w).toHaveLength(1);
    expect(w[0].pct).toBe(100);
    expect(w[0].a1 - w[0].a0).toBeGreaterThan(180); // large-arc wedge
  });

  it('reports pct relative to the passed total', () => {
    const w = computeDonutWedges([seg('A', 2500), seg('B', 2500)], 10000);
    // Each is 25% of the 10000 total even though they sum to 5000.
    expect(w.every(s => s.pct === 25)).toBe(true);
  });
});
