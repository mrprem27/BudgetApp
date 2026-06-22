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
