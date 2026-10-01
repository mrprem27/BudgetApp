import { nextRange, inRange } from '../lib/dateRange';

const D = (n: number) => new Date(2026, 5, n).getTime(); // n June 2026, start of day

describe('nextRange — the range calendar tap rules', () => {
  it('the first tap starts a range', () => {
    expect(nextRange({ from: null, to: null }, D(10))).toEqual({ from: D(10), to: null });
  });
  it('a second tap on a later day closes it', () => {
    expect(nextRange({ from: D(10), to: null }, D(20))).toEqual({ from: D(10), to: D(20) });
  });
  it('a second tap on the same day is a one-day range', () => {
    expect(nextRange({ from: D(10), to: null }, D(10))).toEqual({ from: D(10), to: D(10) });
  });
  it('a second tap on an earlier day swaps the ends — order never matters', () => {
    expect(nextRange({ from: D(20), to: null }, D(10))).toEqual({ from: D(10), to: D(20) });
  });
  it('a tap once a full range is set starts over — the old "to" is not kept', () => {
    expect(nextRange({ from: D(10), to: D(20) }, D(15))).toEqual({ from: D(15), to: null });
  });
});

describe('inRange', () => {
  it('is false with nothing chosen', () => {
    expect(inRange({ from: null, to: null }, D(5))).toBe(false);
  });
  it('is only the start while the end is still open', () => {
    expect(inRange({ from: D(10), to: null }, D(10))).toBe(true);
    expect(inRange({ from: D(10), to: null }, D(11))).toBe(false);
  });
  it('includes both ends and everything between, nothing outside', () => {
    const r = { from: D(10), to: D(12) };
    expect([9, 10, 11, 12, 13].map(n => inRange(r, D(n)))).toEqual([false, true, true, true, false]);
  });
});

describe('comparisonRange: what a report is measured against', () => {
  const { comparisonRange } = jest.requireActual('../lib/dateRange') as typeof import('../lib/dateRange');
  const at = (y: number, m: number, d: number, h = 0) => new Date(y, m, d, h).getTime();

  it('a finished month is measured against the whole month before it', () => {
    const r = comparisonRange(new Date(2026, 8, 15), undefined, at(2026, 9, 10));
    expect(r).toEqual({ from: at(2026, 7, 1), to: at(2026, 8, 1) - 1 });
  });

  it('a month still running is measured against the same stretch of the one before', () => {
    // Ten days into October: 1 to 10 September, not all thirty days of it.
    const r = comparisonRange(new Date(2026, 9, 5), undefined, at(2026, 9, 10, 12));
    expect(r.from).toBe(at(2026, 8, 1));
    // To the END of the 10th: the period so far counts all of today, whatever the hour.
    expect(r.to).toBe(at(2026, 8, 11) - 1);
    expect(comparisonRange(new Date(2026, 9, 5), undefined, at(2026, 9, 10, 1)).to).toBe(r.to);
  });

  it('on the 1st it is the whole of the 1st, not the hours so far', () => {
    // At 09:00 on 1 October the comparison was 1 September 00:00 to 09:00: nothing, so "new".
    expect(comparisonRange(new Date(2026, 9, 1), undefined, at(2026, 9, 1, 9)).to).toBe(at(2026, 8, 2) - 1);
  });

  it('says when a period is still running, so its comparison can say "to date"', () => {
    const { periodRunning } = jest.requireActual('../lib/dateRange') as typeof import('../lib/dateRange');
    expect(periodRunning(new Date(2026, 9, 5), undefined, at(2026, 9, 10))).toBe(true);
    expect(periodRunning(new Date(2026, 8, 5), undefined, at(2026, 9, 10))).toBe(false);
    expect(periodRunning(new Date(2026, 10, 5), undefined, at(2026, 9, 10))).toBe(false); // not started
  });

  it('a custom period is measured against the equal span before it', () => {
    const range = { from: at(2026, 8, 10), to: at(2026, 8, 20) - 1 };
    const r = comparisonRange(new Date(2026, 8, 15), range, at(2026, 9, 10));
    expect(r.to).toBe(range.from - 1);
    expect(r.to - r.from).toBe(range.to - range.from);
  });

  it('never runs past the end of the month before (the 31st against a 30-day month)', () => {
    const r = comparisonRange(new Date(2026, 9, 31), undefined, at(2026, 9, 31, 18));
    expect(r.to).toBe(at(2026, 9, 1) - 1);
  });
});
