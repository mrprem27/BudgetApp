import { localPayMethod } from '../lib/sync/rowMap';

/**
 * A server not reset since How and From were merged may still hold 'upi' or 'autopay' (`U-66`).
 * What comes down must be something the phone can draw and sum: those two were the bank.
 */
describe('a pulled Paid from is normalised (U-66)', () => {
  it('reads the old How values as the bank', () => {
    expect(localPayMethod('upi')).toBe('bank');
    expect(localPayMethod('autopay')).toBe('bank');
  });
  it('keeps every current value and drops anything unknown to "not recorded"', () => {
    for (const v of ['bank', 'card', 'cash', 'wallet', 'other']) expect(localPayMethod(v)).toBe(v);
    expect(localPayMethod(null)).toBeNull();
    expect(localPayMethod('crypto')).toBeNull();
  });
});
