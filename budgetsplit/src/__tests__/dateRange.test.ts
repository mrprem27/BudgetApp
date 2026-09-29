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
