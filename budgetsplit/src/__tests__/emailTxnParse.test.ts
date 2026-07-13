import { isTransactionAlert, parseTransactionEmail } from '../lib/emailTxnParse';

const NOW = new Date(2026, 5, 15, 10, 0, 0).getTime(); // 15 Jun 2026, fixed

const ymd = (ms: number) => {
  const d = new Date(ms);
  return [d.getFullYear(), d.getMonth(), d.getDate()];
};

describe('isTransactionAlert', () => {
  it('accepts text with money + a direction word', () => {
    expect(isTransactionAlert('Rs. 950 has been debited from your account')).toBe(true);
    expect(isTransactionAlert('INR 1,200 credited to your a/c')).toBe(true);
  });
  it('rejects text without money or without a direction word', () => {
    expect(isTransactionAlert('Your statement is ready to view')).toBe(false);
    expect(isTransactionAlert('Rs. 950 balance available')).toBe(false); // money but no debit/credit
    expect(isTransactionAlert('')).toBe(false);
  });
});

describe('parseTransactionEmail', () => {
  it('parses a debit alert (amount, expense, merchant, date)', () => {
    const { rows } = parseTransactionEmail(
      'Dear Customer, Rs. 950.00 has been debited from your A/c XX1234 on 01-Jun-2026 to Swiggy. Ref 12345.',
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 95000, kind: 'expense', direction: 'debit', description: 'Swiggy' });
    expect(ymd(rows[0].date)).toEqual([2026, 5, 1]);
  });

  it('parses a credit alert as income with the payer from "from X"', () => {
    const { rows } = parseTransactionEmail(
      'INR 85,000.00 credited to your account on 02/06/2026 from ACME PAYROLL.',
      NOW,
    );
    expect(rows[0]).toMatchObject({ amount: 8500000, kind: 'income', direction: 'credit', description: 'ACME PAYROLL' });
    expect(ymd(rows[0].date)).toEqual([2026, 5, 2]);
  });

  it('parses a UPI "paid to … via UPI" spend', () => {
    const { rows } = parseTransactionEmail("You've paid ₹450 to BigBasket via UPI on 3 Jun 2026", NOW);
    expect(rows[0]).toMatchObject({ amount: 45000, kind: 'expense', description: 'BigBasket' });
    expect(ymd(rows[0].date)).toEqual([2026, 5, 3]);
  });

  it('defaults an ambiguous (debit+credit) alert to expense, correctable in Review', () => {
    const { rows } = parseTransactionEmail('Rs 2,499 debited from your a/c and credited to Netflix on 05-06-26', NOW);
    expect(rows[0]).toMatchObject({ amount: 249900, kind: 'expense' });
    expect(ymd(rows[0].date)).toEqual([2026, 5, 5]);
  });

  it('falls back to now when no date is present', () => {
    const { rows } = parseTransactionEmail('Rs 120 debited towards Parking', NOW);
    expect(rows[0].date).toBe(NOW);
    expect(rows[0].description).toBe('Parking');
  });

  it('skips text with no parseable amount', () => {
    const r = parseTransactionEmail('Your monthly statement is now available to download.', NOW);
    expect(r.rows).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });

  it('rejects an impossible date and falls back to now', () => {
    const { rows } = parseTransactionEmail('Rs 100 debited on 32/13/2026 at Store', NOW);
    expect(rows[0].date).toBe(NOW);
  });
});
