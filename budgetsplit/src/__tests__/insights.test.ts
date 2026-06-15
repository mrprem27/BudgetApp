import { rankInsights } from '../lib/analytics';
import type { BudgetAnalytics, Recommendation } from '../lib/analytics';

// Minimal analytics builder — only the fields rankInsights reads matter.
const analytics = (recommendations: Recommendation[], totalAllocated = 100000): BudgetAnalytics => ({
  totalAllocated, totalSpent: 0, remaining: totalAllocated, utilizationPct: null,
  overBudget: [], nearLimit: [], underBudget: [], onTrackCount: 0,
  topCategories: [], highest: null, lowest: null, biggestIncrease: null, biggestDecrease: null,
  projectedMonthEnd: 0, monthlyBudgetTotal: 0, recommendations,
});

const group = (id: string, name: string) => ({ id, name } as any);

const rec = (id: string, severity: Recommendation['severity']): Recommendation =>
  ({ id, severity, icon: 'alert-triangle', text: `${id} text` });

describe('rankInsights', () => {
  it('orders warnings before info before good', () => {
    const out = rankInsights([
      { group: group('g1', 'A'), analytics: analytics([rec('good1', 'good'), rec('info1', 'info')]) },
      { group: group('g2', 'B'), analytics: analytics([rec('warn1', 'warn')]) },
    ]);
    expect(out.map(i => i.severity)).toEqual(['warn', 'info', 'good']);
  });

  it('caps at the requested limit', () => {
    const recs = [rec('a', 'warn'), rec('b', 'warn'), rec('c', 'warn'), rec('d', 'warn')];
    const out = rankInsights([{ group: group('g1', 'A'), analytics: analytics(recs) }], 3);
    expect(out).toHaveLength(3);
  });

  it('drops per-group "ontrack" filler', () => {
    const out = rankInsights([
      { group: group('g1', 'A'), analytics: analytics([rec('ontrack', 'good'), rec('warn1', 'warn')]) },
    ]);
    expect(out.map(i => i.id)).toEqual(['warn1']);
  });

  it('synthesizes one reassurance when budgets exist but nothing is noteworthy', () => {
    const out = rankInsights([
      { group: group('g1', 'A'), analytics: analytics([rec('ontrack', 'good')], 100000) },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('ontrack');
    expect(out[0].severity).toBe('good');
  });

  it('returns nothing when no budgets are set', () => {
    const out = rankInsights([
      { group: group('g1', 'A'), analytics: analytics([], 0) },
    ]);
    expect(out).toEqual([]);
  });

  it('carries the origin group on each insight', () => {
    const out = rankInsights([
      { group: group('g7', 'Trip'), analytics: analytics([rec('warn1', 'warn')]) },
    ]);
    expect(out[0].groupId).toBe('g7');
    expect(out[0].groupName).toBe('Trip');
  });
});
