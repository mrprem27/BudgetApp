import { parseStatement } from '../lib/importParse';

describe('parseStatement', () => {
  it('parses a simple comma CSV with signed amount', () => {
    const { rows, skipped } = parseStatement('2026-06-01,Swiggy order,-450\n2026-06-02,Salary,85000');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amount: 45000, kind: 'expense', direction: 'debit' });
    expect(rows[0].description).toBe('Swiggy order');
    expect(rows[1]).toMatchObject({ amount: 8500000, kind: 'income' });
  });

  it('skips a header row and counts it', () => {
    const { rows, skipped } = parseStatement('Date,Description,Amount\n01/06/2026,Uber,-200');
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
    expect(rows[0].description).toBe('Uber');
  });

  it('handles ₹, commas and Dr/Cr markers', () => {
    const { rows } = parseStatement('01/06/2026 | Rent | ₹12,500 Dr\n02/06/2026 | Refund | ₹1,200 Cr');
    expect(rows[0]).toMatchObject({ amount: 1250000, kind: 'expense', direction: 'debit' });
    expect(rows[1]).toMatchObject({ amount: 120000, kind: 'income', direction: 'credit' });
  });

  it('handles separate debit/credit/balance columns', () => {
    // Date, Narration, Debit, Credit, Balance
    const { rows } = parseStatement('05/06/2026,ATM withdrawal,2000.00,0.00,18000.00\n06/06/2026,Interest,0.00,150.00,18150.00');
    expect(rows[0]).toMatchObject({ amount: 200000, kind: 'expense' });
    expect(rows[1]).toMatchObject({ amount: 15000, kind: 'income' });
  });

  it('handles parenthesis negatives and dd-mm-yyyy', () => {
    const { rows } = parseStatement('10-06-2026,Grocery,(₹999.50)');
    expect(rows[0]).toMatchObject({ amount: 99950, kind: 'expense', direction: 'debit' });
    expect(new Date(rows[0].date).getMonth()).toBe(5); // June
  });

  it('skips junk lines with no amount and never throws', () => {
    const { rows, skipped } = parseStatement('--- Statement for June ---\nthank you for banking\n2026-06-01,Coffee,-120');
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('returns empty for blank input', () => {
    expect(parseStatement('')).toEqual({ rows: [], skipped: 0 });
    expect(parseStatement('   \n  ')).toEqual({ rows: [], skipped: 0 });
  });
});
