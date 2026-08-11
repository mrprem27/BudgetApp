import { generateInsights, type InsightContext } from '../lib/savingsInsights';

const z = () => 0; // deterministic: no jitter

const goal = (over: Partial<InsightContext['goals'][0]> = {}) => ({
  id: 'g1', name: 'Headphones', saved: 0, target: 10000, remaining: 10000,
  priority: 'high' as const, allocation: 0, frequency: 'none' as const, ...over,
});

describe('generateInsights', () => {
  it('returns nothing without goals', () => {
    expect(generateInsights({ goals: [], spend: [{ category: 'Food', amount: 5000 }] }, 3, z)).toEqual([]);
  });

  it('surfaces a fully-fundable opportunity-cost warning', () => {
    const ctx: InsightContext = {
      goals: [goal({ saved: 2000, remaining: 8000 })],
      spend: [{ category: 'Food Delivery', amount: 9000 }],
    };
    const out = generateInsights(ctx, 3, z);
    const warn = out.find(i => i.tone === 'warn');
    expect(warn?.text).toContain('Food Delivery');
    expect(warn?.text).toContain('fully fund');
  });

  it('shows a near-complete progress nudge', () => {
    const ctx: InsightContext = { goals: [goal({ saved: 8000, remaining: 2000 })], spend: [] };
    const out = generateInsights(ctx, 3, z);
    expect(out.some(i => i.tone === 'progress' && i.text.includes('closer than you think'))).toBe(true);
  });

  it('celebrates a completed goal', () => {
    const ctx: InsightContext = { goals: [goal({ saved: 10000, remaining: 0 })], spend: [] };
    const out = generateInsights(ctx, 3, z);
    expect(out[0].icon).toBe('check-circle');
  });

  it('does not repeat the same tone while variety is available', () => {
    const ctx: InsightContext = {
      goals: [
        goal({ id: 'a', name: 'Phone', saved: 8000, target: 10000, remaining: 2000 }),
        goal({ id: 'b', name: 'Trip', saved: 1000, target: 50000, remaining: 49000, priority: 'low' }),
      ],
      spend: [{ category: 'Coffee', amount: 6000 }, { category: 'Shopping', amount: 4000 }],
    };
    const out = generateInsights(ctx, 3, z);
    const tones = out.map(i => i.tone);
    expect(new Set(tones).size).toBe(tones.length); // all distinct tones
  });
});

/**
 * Determinism. The jitter used to be `Math.random`, so the same data produced a
 * different set on every pull-to-refresh.
 */
describe('generateInsights is stable across refreshes', () => {
  const ctx: InsightContext = {
    goals: [
      { id: 'a', name: 'Laptop', target: 100000, saved: 75000, remaining: 25000, allocation: 5000, frequency: 'monthly', priority: 'high' },
      { id: 'b', name: 'Trip', target: 200000, saved: 20000, remaining: 180000, allocation: 4000, frequency: 'monthly', priority: 'medium' },
      { id: 'c', name: 'Phone', target: 60000, saved: 60000, remaining: 0, allocation: 0, frequency: 'none', priority: 'low' },
    ] as InsightContext['goals'],
    spend: [
      { category: 'Food', amount: 30000 },
      { category: 'Travel', amount: 22000 },
      { category: 'Shopping', amount: 9000 },
    ],
  };

  it('returns the identical set on repeated calls', () => {
    const a = generateInsights(ctx);
    const b = generateInsights(ctx);
    const c = generateInsights(ctx);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('is pinned by the seed, so a given day always agrees with itself', () => {
    expect(generateInsights(ctx, 3, 20000)).toEqual(generateInsights(ctx, 3, 20000));
  });

  it('still rotates when the day changes', () => {
    // Not an equality assertion on *which* insights: only that the seed is live,
    // so freshness is preserved rather than traded away for stability.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map(s => JSON.stringify(generateInsights(ctx, 3, s)));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
});
