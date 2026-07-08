import { parseGpayStatement, isGpayStatement } from '../lib/gpayParse';

// Verbatim slices from a real Google Pay statement PDF.
const HEADER = `Google Pay
Transaction statement
8299337536, sanvikabasnet25@gmail.com
Transaction statement period
01 June 2026 - 30 June 2026
Sent
₹88,635.01
Received
₹38,400
Date & time Transaction details Amount`;

const EXPENSE = `01 Jun, 2026
09:46 AM
Paid to Sandeep Malik
UPI Transaction ID: 651859540084
Paid by ICICI Bank 6607
₹950`;

const INCOME = `01 Jun, 2026
01:11 PM
Received from PREM PURUSHOTTAM BHATI
UPI Transaction ID: 615238194216
Paid to ICICI Bank 6607
₹1,000`;

const PAISE = `03 Jun, 2026
04:37 PM
Paid to SUBHAM KUMAR NIRALA
UPI Transaction ID: 652087423028
Paid by ICICI Bank 6607
₹948.60`;

describe('isGpayStatement', () => {
  it('accepts a GPay statement', () => {
    expect(isGpayStatement(`${HEADER}\n${EXPENSE}`)).toBe(true);
  });
  it('rejects a non-GPay blob', () => {
    expect(isGpayStatement('Date,Amount,Note\n01/06/2026,500,Coffee')).toBe(false);
  });
});

describe('parseGpayStatement', () => {
  it('parses a "Paid to" row as an expense in paise', () => {
    const { rows, skipped } = parseGpayStatement(`${HEADER}\n${EXPENSE}`);
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 95000, description: 'Sandeep Malik', direction: 'debit', kind: 'expense',
    });
  });

  it('parses a "Received from" row as income, using the counterparty (not the bank line)', () => {
    const { rows } = parseGpayStatement(`${HEADER}\n${INCOME}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 100000, description: 'PREM PURUSHOTTAM BHATI', direction: 'credit', kind: 'income',
    });
  });

  it('handles paise decimals and thousands commas', () => {
    const { rows } = parseGpayStatement(`${HEADER}\n${PAISE}`);
    expect(rows[0].amount).toBe(94860);
    const big = parseGpayStatement(`${HEADER}\n01 Jun, 2026\n10:00 AM\nPaid to X\nUPI Transaction ID: 1\nPaid by ICICI Bank 6607\n₹88,635.01`);
    expect(big.rows[0].amount).toBe(8863501);
  });

  it('skips the summary/period/header and parses only real rows', () => {
    const { rows } = parseGpayStatement(`${HEADER}\n${EXPENSE}\n${INCOME}\n${PAISE}`);
    expect(rows).toHaveLength(3);
    // The ₹88,635.01 "Sent" summary line must NOT become a row.
    expect(rows.every(r => r.description !== '')).toBe(true);
  });

  it('parses the date+time into a real timestamp', () => {
    const { rows } = parseGpayStatement(`${HEADER}\n${EXPENSE}`);
    const d = new Date(rows[0].date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(1);
  });

  it('ignores page-header junk between rows across pages', () => {
    const pageBreak = `${EXPENSE}
Transaction statement
8299337536, sanvikabasnet25@gmail.com
Note: This statement reflects payments made by you on the Google Pay app.
Page 2 of 13
Date & time Transaction details Amount
${INCOME}`;
    const { rows } = parseGpayStatement(`${HEADER}\n${pageBreak}`);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('expense');
    expect(rows[1].kind).toBe('income');
  });

  it('never throws on empty / junk input', () => {
    expect(parseGpayStatement('').rows).toHaveLength(0);
    expect(parseGpayStatement('random text\nno dates here').rows).toHaveLength(0);
  });
});
