import { detectPayMethod } from '../lib/payMethodDetect';

describe('detectPayMethod', () => {
  it('reads UPI (VPA handles, "UPI") as the bank — From, not How (U-49)', () => {
    expect(detectPayMethod('You paid ₹450 to bigbasket@okhdfcbank via UPI')).toBe('bank');
    expect(detectPayMethod('Rs 200 debited via UPI Ref 123')).toBe('bank');
    expect(detectPayMethod('Payment to swiggy@ybl successful')).toBe('bank');
  });

  it('reads UPI on a RuPay credit card as the card: card debt, not the bank', () => {
    expect(detectPayMethod('Rs 450 paid via UPI using your RuPay Credit Card xx12')).toBe('card');
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

  it('reads an autopay mandate as the bank, unless it names a credit card', () => {
    expect(detectPayMethod('E-mandate debit of Rs 499 for Netflix')).toBe('bank');
    expect(detectPayMethod('Autopay on your credit card: Rs 199')).toBe('card');
  });

  it('returns null when nothing matches (Review lets the user set it)', () => {
    expect(detectPayMethod('Rs 100 debited towards Parking')).toBeNull();
    expect(detectPayMethod('')).toBeNull();
    expect(detectPayMethod(null)).toBeNull();
    expect(detectPayMethod(undefined)).toBeNull();
  });
});
