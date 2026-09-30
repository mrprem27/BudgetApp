import { detectPayMethod, detectPayFrom } from '../lib/payMethodDetect';

describe('detectPayMethod', () => {
  it('detects UPI from VPA handles, "UPI" and "you paid"', () => {
    expect(detectPayMethod('You paid ₹450 to bigbasket@okhdfcbank via UPI')).toBe('upi');
    expect(detectPayMethod('Rs 200 debited via UPI Ref 123')).toBe('upi');
    expect(detectPayMethod('Payment to swiggy@ybl successful')).toBe('upi');
  });

  it('detects a credit card from "credit card" / "card ending"', () => {
    expect(detectPayMethod('Rs 1200 spent on your Credit Card ending 4321')).toBe('card');
  });

  it('reads a debit card as the bank, never as card debt (W1-06)', () => {
    expect(detectPayMethod('Debit card transaction of INR 500 at Store')).toBe('bank');
    expect(detectPayMethod('Rs 800 spent using your HDFC Debit Card ending 1234')).toBe('bank');
    expect(detectPayMethod('Rs 800 spent using debit-card xx1234')).toBe('bank');
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

describe('detectPayFrom (U-48)', () => {
  it('a UPI payment naming a credit card is From the card', () => {
    expect(detectPayFrom('Rs 450 paid via UPI using your RuPay Credit Card xx12')).toBe('credit');
  });
  it('says nothing when it is the usual', () => {
    expect(detectPayFrom('Rs 200 debited via UPI Ref 123')).toBeUndefined();
    expect(detectPayFrom('Rs 1200 spent on your Credit Card ending 4321')).toBeUndefined();
  });
});
