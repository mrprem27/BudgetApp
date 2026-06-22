import { forecastMonthEnd, projectedAtDay, FORECAST_MIN_DAYS } from '../lib/forecast';

describe('forecastMonthEnd', () => {
  it('is not ready before the minimum days of data', () => {
    const f = forecastMonthEnd(100000, FORECAST_MIN_DAYS - 1, 30, 0);
    expect(f.ready).toBe(false);
    expect(f.basis).toBe('insufficient');
  });

  it('is not ready when nothing has been spent', () => {
    expect(forecastMonthEnd(0, 10, 30, 50000).ready).toBe(false);
  });

  it('uses pure run-rate when there is no prior month', () => {
    // ₹6000 over 6 of 30 days → run-rate projects ₹30000.
    const f = forecastMonthEnd(600000, 6, 30, 0);
    expect(f.ready).toBe(true);
    expect(f.basis).toBe('run-rate');
    expect(f.projected).toBe(3000000);
  });

  it('blends with last month early, dampening a spiky run-rate', () => {
    // Day 3 of 30, big early spend → run-rate would be huge; prior month anchors it.
    const spiky = forecastMonthEnd(900000, 3, 30, 1000000); // run-rate = 9,000,000
    const pureRunRate = (900000 / 3) * 30; // 9,000,000
    expect(spiky.basis).toBe('blended');
    // Blended must sit between the run-rate and the prior month — i.e. much lower.
    expect(spiky.projected).toBeLessThan(pureRunRate);
    expect(spiky.projected).toBeGreaterThan(900000);
  });

  it('trusts the run-rate more as the month progresses', () => {
    // Same run-rate (₹30,000) both times, prior month ₹20,000. Later in the month
    // the projection should sit closer to the run-rate, i.e. higher.
    const early = forecastMonthEnd(300000, 3, 30, 2000000);  // run-rate 3,000,000
    const late = forecastMonthEnd(2700000, 27, 30, 2000000); // run-rate 3,000,000
    expect(early.basis).toBe('blended');
    expect(late.basis).toBe('blended');
    expect(late.projected).toBeGreaterThan(early.projected);
  });

  it('never projects below what is already spent', () => {
    // Tiny remaining run-rate but a low prior month — floor at spentSoFar.
    const f = forecastMonthEnd(5000000, 28, 30, 100000);
    expect(f.projected).toBeGreaterThanOrEqual(5000000);
  });

  it('uses Bühlmann credibility z = n/(n+K), K=7', () => {
    // Day 7 → z = 7/(7+7) = 0.5: an exact 50/50 of run-rate and prior.
    const runRate = (700000 / 7) * 30; // 3,000,000
    const prior = 2000000;
    const f = forecastMonthEnd(700000, 7, 30, prior);
    expect(f.credibility).toBeCloseTo(0.5, 6);
    expect(f.projected).toBe(Math.round(0.5 * runRate + 0.5 * prior)); // 2,500,000
  });

  it('reports zero credibility with no prior (pure run-rate)', () => {
    expect(forecastMonthEnd(600000, 6, 30, 0).credibility).toBe(0);
  });
});

describe('projectedAtDay', () => {
  it('returns the running total for days at/before today', () => {
    expect(projectedAtDay(600000, 6, 30, 3000000, 6)).toBe(600000);
    expect(projectedAtDay(600000, 6, 30, 3000000, 3)).toBe(600000);
  });

  it('interpolates linearly toward the month-end projection', () => {
    // Halfway between day 6 and day 30 (day 18) → halfway between 600000 and 3000000.
    expect(projectedAtDay(600000, 6, 30, 3000000, 18)).toBe(1800000);
  });

  it('reaches the projection on the last day', () => {
    expect(projectedAtDay(600000, 6, 30, 3000000, 30)).toBe(3000000);
  });
});
