import { detectPayMethod } from '../lib/payMethodDetect';

describe('detectPayMethod', () => {
  it('detects UPI from VPA handles, "UPI" and "you paid"', () => {
    expect(detectPayMethod('You paid ₹450 to bigbasket@okhdfcbank via UPI')).toBe('upi');
    expect(detectPayMethod('Rs 200 debited via UPI Ref 123')).toBe('upi');
    expect(detectPayMethod('Payment to swiggy@ybl successful')).toBe('upi');
  });

  it('detects card from "card ending", credit/debit card', () => {
    expect(detectPayMethod('Rs 1200 spent on your Credit Card ending 4321')).toBe('card');
    expect(detectPayMethod('Debit card transaction of INR 500 at Store')).toBe('card');
  });

  it('detects bank rails: NEFT / IMPS / RTGS / net banking', () => {
    expect(detectPayMethod('INR 50,000 transferred via NEFT')).toBe('bank');
    expect(detectPayMethod('IMPS transfer of Rs 2000 successful')).toBe('bank');
    expect(detectPayMethod('Paid using Net Banking')).toBe('bank');
  });

  it('detects wallets', () => {
    expect(detectPayMethod('Rs 99 paid from your Paytm balance')).toBe('wallet');
    expect(detectPayMethod('Amazon Pay balance debited by Rs 250')).toBe('wallet');
    expect(detectPayMethod('MobiKwik wallet used')).toBe('wallet');
  });

  it('detects autopay/mandate and prefers it over the instrument named', () => {
    expect(detectPayMethod('E-mandate debit of Rs 499 for Netflix')).toBe('autopay');
    // Autopay wins even when a card is named — the defining fact is the mandate.
    expect(detectPayMethod('Autopay on your credit card: Rs 199')).toBe('autopay');
  });

  it('returns null when nothing matches (Review lets the user set it)', () => {
    expect(detectPayMethod('Rs 100 debited towards Parking')).toBeNull();
    expect(detectPayMethod('')).toBeNull();
    expect(detectPayMethod(null)).toBeNull();
    expect(detectPayMethod(undefined)).toBeNull();
  });
});
