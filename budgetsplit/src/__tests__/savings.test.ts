import { goalProgress, estimatedCompletion, monthlyContribution } from '../lib/savings';

describe('goalProgress', () => {
  it('computes pct and remaining', () => {
    expect(goalProgress(2500, 10000)).toEqual({ saved: 2500, target: 10000, remaining: 7500, pct: 25, done: false });
  });
  it('clamps at 100% and marks done when over-funded', () => {
    const p = goalProgress(12000, 10000);
    expect(p.pct).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.done).toBe(true);
  });
  it('handles zero target and negatives', () => {
    expect(goalProgress(0, 0)).toEqual({ saved: 0, target: 0, remaining: 0, pct: 0, done: false });
    expect(goalProgress(-500, 1000).saved).toBe(0);
  });
});

describe('estimatedCompletion', () => {
  it('projects periods/days for a fixed monthly allocation', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const est = estimatedCompletion(10000, 2500, 'monthly', from);
    expect(est?.periods).toBe(4);
    expect(est?.days).toBe(120);
  });
  it('returns null when already funded or no cadence', () => {
    expect(estimatedCompletion(0, 2500, 'monthly')).toBeNull();
    expect(estimatedCompletion(10000, 0, 'monthly')).toBeNull();
    expect(estimatedCompletion(10000, 2500, 'none')).toBeNull();
  });
});

describe('monthlyContribution', () => {
  it('normalizes cadences to a monthly figure', () => {
    expect(monthlyContribution(100, 'daily')).toBe(3000);
    expect(monthlyContribution(1200, 'monthly')).toBe(1200);
    expect(monthlyContribution(12000, 'yearly')).toBe(1000);
    expect(monthlyContribution(1000, 'none')).toBe(0);
  });
});
