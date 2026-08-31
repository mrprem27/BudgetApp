import { parseAnyText, parseAnyWorkbook } from '../lib/importDetect';
import { GROUP_EXPORT_HEADER } from '../lib/importParse';
import type { Sheet } from '../lib/xlsx';

/** Detection is what makes picking a file need no format question, so each
 *  supported export must be recognised without help from the picker. */

const PAYTM_CSV = [
  'Date,Time,Transaction Details,Other Transaction Details (UPI ID or A/c No),Your Account,Amount,UPI Ref No.,Order ID,Remarks,Tags,Comment',
  '24/07/2026,20:33:55,Paid to Corner Store,q391947193@ybl,ICICI Bank - 21,-68.00,311049826294,,,#🛒 Groceries,',
].join('\n');

const PAYTM_PDF = `Paytm Statement for 10 JUN'26 - 24 JUL'26 Passbook Payments History
  23 Jul 7:52 PM Paid to Corner Store UPI ID:  q391947193@ybl   on UPI Ref No: 620438986166   Tag: # Groceries State Bank Of India - 43 - Rs.75`;

const GPAY = `Google Pay transaction statement
01 Jun, 2026
09:46 AM
Paid to Sandeep Malik
UPI Transaction ID: 651859540084
₹950`;

const OUR_EXPORT = `${GROUP_EXPORT_HEADER}\n2026-06-01,Flat,Groceries,expense,debit,450,Milk`;

describe('parseAnyText', () => {
  it('recognises a Paytm CSV without the picker', () => {
    const d = parseAnyText(PAYTM_CSV);
    expect(d.source).toBe('paytm');
    expect(d.format).toMatch(/paytm/i);
    expect(d.result.rows).toHaveLength(1);
  });

  it('recognises Paytm PDF text without the picker', () => {
    const d = parseAnyText(PAYTM_PDF);
    expect(d.source).toBe('paytm');
    expect(d.result.rows[0]).toMatchObject({ description: 'Corner Store', category: 'Groceries' });
  });

  it('recognises a Google Pay statement without the picker', () => {
    const d = parseAnyText(GPAY);
    expect(d.source).toBe('gpay');
    expect(d.result.rows).toHaveLength(1);
  });

  it('recognises our own export and keeps its category and kind', () => {
    const d = parseAnyText(OUR_EXPORT);
    expect(d.source).toBe('bank_csv');
    expect(d.result.rows[0]).toMatchObject({ category: 'Groceries', kind: 'expense' });
  });

  it('lets a detected format beat the picker', () => {
    // Picker says "email", but the content is unmistakably Paytm.
    expect(parseAnyText(PAYTM_CSV, 'email').source).toBe('paytm');
    expect(parseAnyText(GPAY, 'email').source).toBe('gpay');
  });

  it('falls back to the picker only for unrecognised text', () => {
    const alert = 'Rs.450.00 debited from A/c XX1234 on 01-06-26 to SWIGGY. UPI Ref 123456789012';
    expect(parseAnyText(alert, 'email').source).toBe('email');
    expect(parseAnyText('2026-06-01, Swiggy, -450', 'other').source).toBe('bank_csv');
  });

  it('never throws on empty input', () => {
    expect(parseAnyText('').result.rows).toEqual([]);
  });
});

describe('parseAnyWorkbook', () => {
  const paytmSheets: Sheet[] = [
    { name: 'Summary', rows: [['Paytm Statement for :', "10 JUN'26 - 24 JUL'26"]] },
    {
      name: 'Passbook Payment History',
      rows: [
        ['Date', 'Time', 'Transaction Details', 'Other Transaction Details (UPI ID or A/c No)', 'Your Account', 'Amount', 'UPI Ref No.', 'Order ID', 'Remarks', 'Tags', 'Comment'],
        ['24/07/2026', '20:33:55', 'Paid to Corner Store', 'q@ybl', 'ICICI Bank - 21', '-68.00', '311', '', '', '#🛒 Groceries', ''],
      ],
    },
  ];

  it('recognises a Paytm workbook and reads its history sheet', () => {
    const d = parseAnyWorkbook(paytmSheets);
    expect(d.source).toBe('paytm');
    expect(d.format).toMatch(/excel/i);
    expect(d.result.rows).toHaveLength(1);
  });

  it('falls back to the tolerant parser for an unknown spreadsheet', () => {
    const unknown: Sheet[] = [{
      name: 'Sheet1',
      rows: [
        ['Txn Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance'],
        ['01/06/2026', 'SWIGGY', '450.00', '0.00', '12000.00'],
      ],
    }];
    const d = parseAnyWorkbook(unknown);
    expect(d.source).toBe('bank_csv');
    expect(d.result.rows).toHaveLength(1);
    expect(d.result.rows[0]).toMatchObject({ amount: 45000, direction: 'debit' });
  });

  it('never throws on an empty workbook', () => {
    expect(parseAnyWorkbook([]).result.rows).toEqual([]);
  });
});
